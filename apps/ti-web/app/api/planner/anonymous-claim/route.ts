import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTiTierServer } from "@/lib/entitlementsServer";
import { canUseCorePrivatePlanner } from "@/lib/entitlements";
import { enrichPlannerEventsWithLinkedVenue } from "@/lib/planner/enrichVenueMetadata";
import type { PlannerEventRow, PlannerEventType } from "@/lib/planner/types";
import { filterAnonymousClaimablePlannerEvents, buildPlannerEventDedupSignature } from "@/lib/planner/anonymousClaim";
import { getWeekendPlanForTournament, saveWeekendPlanForTournament } from "@/lib/weekendPlans";
import { normalizePlannerSessionId } from "@/lib/planner/plannerSession";
import { isUuid } from "@/lib/venues/isUuid";
import { parseOptionalPlannerProfileId, validatePlannerAssignment } from "@/lib/planner/assignmentServer";

export const runtime = "nodejs";
const ANONYMOUS_CLAIM_SOURCE = "anonymous_local";

const EVENT_TYPES = new Set<PlannerEventType>([
  "game",
  "practice",
  "travel",
  "hotel",
  "meal",
  "check_in",
  "referee_assignment",
  "other",
]);

function asString(value: unknown) {
  const s = String(value ?? "").trim();
  return s || null;
}

function clamp(value: string | null, maxLen: number) {
  if (!value) return null;
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

function normalizeState(value: string | null) {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

function normalizeTimeZone(value: string | null) {
  if (!value) return null;
  const v = value.trim();
  if (!v || v.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v }).format(new Date());
    return v;
  } catch {
    return null;
  }
}

function isIsoDateTime(value: string | null | undefined) {
  if (!value) return false;
  const d = new Date(value);
  return Number.isFinite(d.getTime());
}

type ClaimRequestBody = {
  planner_session_id?: unknown;
  tournament_id?: unknown;
  venue_id?: unknown;
  events?: unknown;
};

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const tierInfo = await getTiTierServer(user);
  const canUseCorePlanner = canUseCorePrivatePlanner({
    tier: tierInfo.tier,
    unverified: tierInfo.unverified,
    isAuthenticated: true,
  });
  if (!canUseCorePlanner) {
    if (tierInfo.unverified) {
      return NextResponse.json({ ok: false, error: "email_verification_required" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as ClaimRequestBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const plannerSessionId = normalizePlannerSessionId(asString(body.planner_session_id));
  if (!plannerSessionId) {
    return NextResponse.json({ ok: false, error: "invalid_planner_session_id" }, { status: 400 });
  }

  const requestTournamentIdRaw = asString(body.tournament_id);
  const requestTournamentId = requestTournamentIdRaw && isUuid(requestTournamentIdRaw) ? requestTournamentIdRaw : null;
  if (requestTournamentIdRaw && !requestTournamentId) {
    return NextResponse.json({ ok: false, error: "invalid_tournament_id" }, { status: 400 });
  }

  const requestVenueIdRaw = asString(body.venue_id);
  const requestVenueId = requestVenueIdRaw && isUuid(requestVenueIdRaw) ? requestVenueIdRaw : null;
  if (requestVenueIdRaw && !requestVenueId) {
    return NextResponse.json({ ok: false, error: "invalid_venue_id" }, { status: 400 });
  }

  const { data: alreadyClaimedRows, error: alreadyClaimedRowsError } = await (supabase.from("planner_events" as any) as any)
    .select(
      "id,user_id,weekend_id,title,event_type,team_name,opponent_name,tournament_id,venue_id,field_label,address_text,city,state,starts_at,ends_at,timezone,notes,child_profile_id,team_profile_id,source_type,source_id,source_event_uid,created_at,updated_at"
    )
    .eq("user_id", user.id)
    .eq("planner_session_id", plannerSessionId)
    .eq("claim_source", ANONYMOUS_CLAIM_SOURCE)
    .limit(250);
  if (alreadyClaimedRowsError) {
    return NextResponse.json({ ok: false, error: "could_not_check_existing_claim" }, { status: 500 });
  }
  if ((alreadyClaimedRows ?? []).length > 0) {
    const enrichedClaimed = await enrichPlannerEventsWithLinkedVenue(supabase, ((alreadyClaimedRows ?? []) as PlannerEventRow[]) ?? []);
    return NextResponse.json({
      ok: true,
      imported_count: 0,
      skipped_duplicate_count: 0,
      had_existing_weekend_plan: true,
      events: enrichedClaimed,
      already_claimed: true,
    });
  }

  const claimableEvents = filterAnonymousClaimablePlannerEvents(Array.isArray(body.events) ? (body.events as PlannerEventRow[]) : []);
  const normalizedEvents: Array<{
    title: string;
    event_type: PlannerEventType;
    starts_at: string;
    ends_at: string | null;
    timezone: string | null;
    child_profile_id: string | null;
    team_profile_id: string | null;
    tournament_id: string | null;
    venue_id: string | null;
    address_text: string | null;
    city: string | null;
    state: string | null;
    notes: string | null;
  }> = [];

  for (const event of claimableEvents) {
    const title = clamp(asString(event.title), 140);
    const eventType = asString(event.event_type) as PlannerEventType | null;
    const startsAt = asString(event.starts_at);
    if (!title || !eventType || !EVENT_TYPES.has(eventType) || !startsAt || !isIsoDateTime(startsAt)) continue;

    const endsAtRaw = asString(event.ends_at);
    const endsAt = endsAtRaw && isIsoDateTime(endsAtRaw) ? endsAtRaw : null;
    if (endsAt) {
      const startMs = new Date(startsAt).getTime();
      const endMs = new Date(endsAt).getTime();
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) continue;
    }

    const tournamentIdRaw = asString(event.tournament_id) ?? requestTournamentId;
    const tournamentId = tournamentIdRaw && isUuid(tournamentIdRaw) ? tournamentIdRaw : null;
    const venueIdRaw = asString(event.venue_id) ?? requestVenueId;
    const venueId = venueIdRaw && isUuid(venueIdRaw) ? venueIdRaw : null;

    const childProfileInput = parseOptionalPlannerProfileId(event.child_profile_id);
    if (childProfileInput.invalid) continue;
    const teamProfileInput = parseOptionalPlannerProfileId(event.team_profile_id);
    if (teamProfileInput.invalid) continue;
    const assignmentValidation = await validatePlannerAssignment({
      supabase,
      userId: user.id,
      childProfileId: childProfileInput.value,
      teamProfileId: teamProfileInput.value,
    });
    if (!assignmentValidation.ok) continue;

    normalizedEvents.push({
      title,
      event_type: eventType,
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: normalizeTimeZone(asString(event.timezone)),
      child_profile_id: assignmentValidation.childProfileId,
      team_profile_id: assignmentValidation.teamProfileId,
      tournament_id: tournamentId,
      venue_id: venueId,
      address_text: clamp(asString(event.address_text), 200),
      city: clamp(asString(event.city), 80),
      state: normalizeState(asString(event.state)),
      notes: clamp(asString(event.notes), 2000),
    });
  }

  const contextualTournamentId =
    requestTournamentId ??
    normalizedEvents.map((event) => event.tournament_id).find((value): value is string => Boolean(value)) ??
    null;

  const existingPlanRes = contextualTournamentId
    ? await getWeekendPlanForTournament({ userId: user.id, tournamentId: contextualTournamentId })
    : { ok: true as const, plan: null, error: null as string | null };
  if (!existingPlanRes.ok) {
    return NextResponse.json({ ok: false, error: "could_not_load_weekend_plan" }, { status: 500 });
  }
  const hadExistingWeekendPlan = Boolean(existingPlanRes.plan?.id);

  if (contextualTournamentId) {
    const venueIdForAnchor =
      requestVenueId ?? normalizedEvents.map((event) => event.venue_id).find((value): value is string => Boolean(value)) ?? null;
    const saveRes = await saveWeekendPlanForTournament({
      userId: user.id,
      tournamentId: contextualTournamentId,
      selectedVenueId: venueIdForAnchor,
    });
    if (!saveRes.ok) {
      return NextResponse.json({ ok: false, error: "could_not_save_weekend_plan" }, { status: 500 });
    }
  }

  if (!normalizedEvents.length) {
    return NextResponse.json({
      ok: true,
      imported_count: 0,
      skipped_duplicate_count: 0,
      had_existing_weekend_plan: hadExistingWeekendPlan,
      events: [],
    });
  }

  let existingQuery = (supabase.from("planner_events" as any) as any)
    .select(
      "id,user_id,weekend_id,title,event_type,team_name,opponent_name,tournament_id,venue_id,field_label,address_text,city,state,starts_at,ends_at,timezone,notes,child_profile_id,team_profile_id,source_type,source_id,source_event_uid,created_at,updated_at"
    )
    .eq("user_id", user.id)
    .limit(500);
  if (contextualTournamentId) {
    existingQuery = existingQuery.eq("tournament_id", contextualTournamentId);
  }
  const { data: existingRows, error: existingRowsError } = await existingQuery;
  if (existingRowsError) {
    return NextResponse.json({ ok: false, error: "could_not_load_existing_events" }, { status: 500 });
  }

  const seenSignatures = new Set<string>(((existingRows ?? []) as PlannerEventRow[]).map((event) => buildPlannerEventDedupSignature(event)));
  const inserts: Record<string, unknown>[] = [];
  let skippedDuplicateCount = 0;

  for (const event of normalizedEvents) {
    const signature = buildPlannerEventDedupSignature(event);
    if (seenSignatures.has(signature)) {
      skippedDuplicateCount += 1;
      continue;
    }
    seenSignatures.add(signature);
    inserts.push({
      user_id: user.id,
      title: event.title,
      event_type: event.event_type,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      timezone: event.timezone,
      child_profile_id: event.child_profile_id,
      team_profile_id: event.team_profile_id,
      tournament_id: event.tournament_id,
      venue_id: event.venue_id,
      address_text: event.address_text,
      city: event.city,
      state: event.state,
      notes: event.notes,
      source_type: "manual",
      planner_session_id: plannerSessionId,
      claim_source: ANONYMOUS_CLAIM_SOURCE,
    });
  }

  if (!inserts.length) {
    return NextResponse.json({
      ok: true,
      imported_count: 0,
      skipped_duplicate_count: skippedDuplicateCount,
      had_existing_weekend_plan: hadExistingWeekendPlan,
      events: [],
    });
  }

  const { data: insertedRows, error: insertError } = await (supabase.from("planner_events" as any) as any)
    .insert(inserts)
    .select(
      "id,user_id,weekend_id,title,event_type,team_name,opponent_name,tournament_id,venue_id,field_label,address_text,city,state,starts_at,ends_at,timezone,notes,child_profile_id,team_profile_id,source_type,source_id,source_event_uid,created_at,updated_at"
    );
  if (insertError) {
    return NextResponse.json({ ok: false, error: "could_not_import_events" }, { status: 500 });
  }

  const enriched = await enrichPlannerEventsWithLinkedVenue(supabase, ((insertedRows ?? []) as PlannerEventRow[]) ?? []);
  return NextResponse.json({
    ok: true,
    imported_count: enriched.length,
    skipped_duplicate_count: skippedDuplicateCount,
    had_existing_weekend_plan: hadExistingWeekendPlan,
    events: enriched,
  });
}
