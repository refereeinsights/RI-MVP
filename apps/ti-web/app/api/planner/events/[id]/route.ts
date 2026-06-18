import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { isUuid } from "@/lib/venues/isUuid";
import type { PlannerEventUpdateBody } from "@/lib/planner/types";
import { enrichPlannerEventsWithLinkedVenue } from "@/lib/planner/enrichVenueMetadata";
import { parseOptionalPlannerProfileId, validatePlannerAssignment } from "@/lib/planner/assignmentServer";
import { getTiTierServer } from "@/lib/entitlementsServer";

export const runtime = "nodejs";

const EVENT_TYPES = new Set([
  "game",
  "practice",
  "travel",
  "hotel",
  "meal",
  "check_in",
  "referee_assignment",
  "other",
] as const);

function asString(value: unknown) {
  const s = String(value ?? "").trim();
  return s || null;
}

function isIsoDateTime(value: string) {
  const d = new Date(value);
  return Number.isFinite(d.getTime());
}

function clamp(value: string | null, maxLen: number) {
  if (!value) return null;
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

function normalizeState(value: string | null) {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (!v) return null;
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

function normalizeTimeZone(value: string | null) {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (v.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v }).format(new Date());
    return v;
  } catch {
    return null;
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const tierInfo = await getTiTierServer(user);
  if (tierInfo.unverified || tierInfo.tier === "explorer") {
    if (tierInfo.unverified) {
      return NextResponse.json({ ok: false, error: "email_verification_required" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const eventId = String(id ?? "").trim();
  if (!eventId) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as PlannerEventUpdateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const { data: existingEvent, error: existingEventError } = await (supabase.from("planner_events" as any) as any)
    .select("id,user_id,source_type,child_profile_id,team_profile_id")
    .eq("id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingEventError) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  if (!existingEvent) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  let patchedStartsAt: string | null = null;

  if ("title" in (body as any)) {
    const title = asString((body as any).title);
    if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
    patch.title = clamp(title, 140);
  }

  if ("event_type" in (body as any)) {
    const eventType = asString((body as any).event_type);
    if (!eventType) return NextResponse.json({ ok: false, error: "event_type_required" }, { status: 400 });
    if (!EVENT_TYPES.has(eventType as any)) {
      return NextResponse.json({ ok: false, error: "invalid_event_type" }, { status: 400 });
    }
    patch.event_type = eventType;
  }

  if ("starts_at" in (body as any)) {
    const startsAt = asString((body as any).starts_at);
    if (!startsAt || !isIsoDateTime(startsAt)) {
      return NextResponse.json({ ok: false, error: "starts_at_required" }, { status: 400 });
    }
    patch.starts_at = startsAt;
    patchedStartsAt = startsAt;
  }

  if ("ends_at" in (body as any)) {
    const endsAtRaw = asString((body as any).ends_at);
    const endsAt = endsAtRaw && isIsoDateTime(endsAtRaw) ? endsAtRaw : null;
    patch.ends_at = endsAt;
    if (endsAt) {
      const startMs = new Date(patchedStartsAt ?? "").getTime();
      const endMs = new Date(endsAt).getTime();
      if (patchedStartsAt && Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
        return NextResponse.json({ ok: false, error: "ends_before_starts" }, { status: 400 });
      }
    }
  }

  if ("timezone" in (body as any)) patch.timezone = normalizeTimeZone(asString((body as any).timezone));

  const childProfileInput = parseOptionalPlannerProfileId((body as any).child_profile_id);
  if (childProfileInput.invalid) {
    return NextResponse.json({ ok: false, error: "invalid_child_profile_id" }, { status: 400 });
  }

  const teamProfileInput = parseOptionalPlannerProfileId((body as any).team_profile_id);
  if (teamProfileInput.invalid) {
    return NextResponse.json({ ok: false, error: "invalid_team_profile_id" }, { status: 400 });
  }

  const assignmentRequested = childProfileInput.provided || teamProfileInput.provided;
  const isManualEvent = String(existingEvent.source_type ?? "") === "manual";
  if (assignmentRequested && !isManualEvent) {
    return NextResponse.json({ ok: false, error: "assignment_not_supported_for_imported_events" }, { status: 409 });
  }

  if (assignmentRequested) {
    const assignmentValidation = await validatePlannerAssignment({
      supabase,
      userId: user.id,
      childProfileId: childProfileInput.provided ? childProfileInput.value : (existingEvent.child_profile_id ?? null),
      teamProfileId: teamProfileInput.provided ? teamProfileInput.value : (existingEvent.team_profile_id ?? null),
    });

    if (!assignmentValidation.ok) {
      return NextResponse.json(
        { ok: false, error: assignmentValidation.error },
        { status: assignmentValidation.status }
      );
    }

    patch.child_profile_id = assignmentValidation.childProfileId;
    patch.team_profile_id = assignmentValidation.teamProfileId;
  }

  if ("venue_id" in (body as any)) {
    const venueIdRaw = asString((body as any).venue_id);
    const venueId = venueIdRaw && isUuid(venueIdRaw) ? venueIdRaw : null;
    if (venueIdRaw && !venueId) {
      return NextResponse.json({ ok: false, error: "invalid_venue_id" }, { status: 400 });
    }
    patch.venue_id = venueId;
  }

  if ("tournament_id" in (body as any)) {
    const tournamentIdRaw = asString((body as any).tournament_id);
    const tournamentId = tournamentIdRaw && isUuid(tournamentIdRaw) ? tournamentIdRaw : null;
    if (tournamentIdRaw && !tournamentId) {
      return NextResponse.json({ ok: false, error: "invalid_tournament_id" }, { status: 400 });
    }
    patch.tournament_id = tournamentId;
  }

  if ("address_text" in (body as any)) patch.address_text = clamp(asString((body as any).address_text), 200);
  if ("city" in (body as any)) patch.city = clamp(asString((body as any).city), 80);
  if ("state" in (body as any)) {
    const state = normalizeState(asString((body as any).state));
    if ((body as any).state && !state) {
      return NextResponse.json({ ok: false, error: "invalid_state" }, { status: 400 });
    }
    patch.state = state;
  }
  if ("notes" in (body as any)) patch.notes = clamp(asString((body as any).notes), 2000);

  const { data, error } = await (supabase.from("planner_events" as any) as any)
    .update(patch)
    .eq("id", eventId)
    .eq("user_id", user.id)
    .select(
      "id,user_id,weekend_id,title,event_type,team_name,opponent_name,tournament_id,venue_id,field_label,address_text,city,state,starts_at,ends_at,timezone,notes,child_profile_id,team_profile_id,source_type,source_id,source_event_uid,created_at,updated_at"
    )
    .single();

  if (error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  const [event] = await enrichPlannerEventsWithLinkedVenue(supabase, [data as any]);
  return NextResponse.json({ ok: true, event });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const tierInfo = await getTiTierServer(user);
  if (tierInfo.unverified || tierInfo.tier === "explorer") {
    if (tierInfo.unverified) {
      return NextResponse.json({ ok: false, error: "email_verification_required" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const eventId = String(id ?? "").trim();
  if (!eventId) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const { error } = await (supabase.from("planner_events" as any) as any)
    .delete()
    .eq("id", eventId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
