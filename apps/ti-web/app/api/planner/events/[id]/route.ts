import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { isUuid } from "@/lib/venues/isUuid";
import type { PlannerEventUpdateBody } from "@/lib/planner/types";

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

  const { id } = await ctx.params;
  const eventId = String(id ?? "").trim();
  if (!eventId) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as PlannerEventUpdateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

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
      "id,user_id,weekend_id,title,event_type,team_name,opponent_name,tournament_id,venue_id,field_label,address_text,city,state,starts_at,ends_at,timezone,notes,source_type,source_id,created_at,updated_at"
    )
    .single();

  if (error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true, event: data });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

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
