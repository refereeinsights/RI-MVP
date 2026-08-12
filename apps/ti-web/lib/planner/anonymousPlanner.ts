import type { PlannerEventCreateBody, PlannerEventRow, PlannerVenueContext } from "./types";
import type { PlannerSessionContext } from "./plannerSession";

const STORAGE_PREFIX = "ti:anonymous-planner:v1:";
const CLAIMED_PREFIX = "ti:anonymous-planner-claimed:v1:";
const ACTIVE_KEY = `${STORAGE_PREFIX}active`;
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

type AnonymousPlannerSnapshot = {
  plannerSessionId: string;
  tournamentId: string | null;
  expiresAt: string;
  events: PlannerEventRow[];
};

function nowIso() {
  return new Date().toISOString();
}

function plannerSessionSnapshotKey(plannerSessionId: string | null | undefined) {
  const normalized = String(plannerSessionId ?? "").trim();
  return normalized ? `${STORAGE_PREFIX}${normalized}` : null;
}

function tournamentSnapshotKey(tournamentId: string | null | undefined) {
  const normalized = String(tournamentId ?? "").trim();
  return normalized ? `${STORAGE_PREFIX}tournament:${normalized}` : null;
}

function snapshotKeysForContext(context: PlannerSessionContext | null | undefined) {
  const keys: string[] = [];
  const seen = new Set<string>();
  const add = (key: string | null) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  };
  add(plannerSessionSnapshotKey(context?.planner_session_id));
  add(tournamentSnapshotKey(context?.tournament_id));
  add(ACTIVE_KEY);
  return keys;
}

function persistableAnonymousEvents(events: PlannerEventRow[]) {
  // Tournament rows are derived display context, not user-authored planner data.
  // Persisting them through the global active alias leaks stale tournament cards
  // into later tournament sessions and creates false schedule conflicts.
  return events.filter((event) => String(event.source_type ?? "").trim() !== "tournament");
}

function readSnapshotAtKey(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AnonymousPlannerSnapshot;
    const expiresAt = new Date(String(parsed?.expiresAt ?? ""));
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      window.localStorage.removeItem(key);
      return null;
    }
    return {
      ...parsed,
      // Sanitize legacy snapshots on read. The next normal save rewrites all
      // aliases without the previously persisted tournament context rows.
      events: persistableAnonymousEvents(Array.isArray(parsed.events) ? parsed.events : []),
    };
  } catch {
    return null;
  }
}

export function loadAnonymousPlannerSnapshot(context: PlannerSessionContext | null | undefined) {
  if (typeof window === "undefined") return null;
  const candidateKeys = snapshotKeysForContext(context);
  for (const key of candidateKeys) {
    const parsed = readSnapshotAtKey(key);
    if (parsed) return parsed;
  }
  return null;
}

function safeWriteSnapshot(context: PlannerSessionContext | null | undefined, events: PlannerEventRow[]) {
  if (typeof window === "undefined") return false;
  const keys = snapshotKeysForContext(context);
  if (!keys.length) return false;
  try {
    const snapshot: AnonymousPlannerSnapshot = {
      plannerSessionId: String(context?.planner_session_id ?? "").trim(),
      tournamentId: String(context?.tournament_id ?? "").trim() || null,
      expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
      events: persistableAnonymousEvents(events),
    };
    const raw = JSON.stringify(snapshot);
    for (const key of keys) window.localStorage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

export function loadAnonymousPlannerEvents(context: PlannerSessionContext | null | undefined) {
  return loadAnonymousPlannerSnapshot(context)?.events ?? [];
}

export function saveAnonymousPlannerEvents(context: PlannerSessionContext | null | undefined, events: PlannerEventRow[]) {
  return safeWriteSnapshot(context, events);
}

export function clearAnonymousPlannerSnapshot(context: PlannerSessionContext | null | undefined) {
  if (typeof window === "undefined") return;
  const loadedSnapshot = loadAnonymousPlannerSnapshot(context);
  try {
    for (const key of snapshotKeysForContext(context)) {
      window.localStorage.removeItem(key);
    }
    if (loadedSnapshot) {
      const loadedSessionKey = plannerSessionSnapshotKey(loadedSnapshot.plannerSessionId);
      const loadedTournamentKey = tournamentSnapshotKey(loadedSnapshot.tournamentId);
      if (loadedSessionKey) window.localStorage.removeItem(loadedSessionKey);
      if (loadedTournamentKey) window.localStorage.removeItem(loadedTournamentKey);
    }
  } catch {
    // ignore
  }
}

function claimedKey(plannerSessionId: string | null | undefined) {
  const normalized = String(plannerSessionId ?? "").trim();
  return normalized ? `${CLAIMED_PREFIX}${normalized}` : null;
}

export function wasAnonymousPlannerClaimed(plannerSessionId: string | null | undefined) {
  if (typeof window === "undefined") return false;
  const key = claimedKey(plannerSessionId);
  if (!key) return false;
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function markAnonymousPlannerClaimed(plannerSessionId: string | null | undefined) {
  if (typeof window === "undefined") return;
  const key = claimedKey(plannerSessionId);
  if (!key) return;
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // ignore
  }
}

export function buildSeededTournamentPlannerEvent(
  context: PlannerSessionContext | null | undefined,
  venueContext?: PlannerVenueContext | null,
): PlannerEventRow | null {
  const plannerSessionId = String(context?.planner_session_id ?? "").trim();
  const tournamentId = String(context?.tournament_id ?? "").trim();
  const tournamentName = String(context?.tournament_name ?? "").trim();
  const startDate = String(context?.tournament_start_date ?? "").trim();
  if (!plannerSessionId || !tournamentId || !tournamentName || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;

  const endDate = String(context?.tournament_end_date ?? "").trim();
  const endsAt = /^\d{4}-\d{2}-\d{2}$/.test(endDate)
    ? `${endDate}T18:00:00.000Z`
    : `${startDate}T18:00:00.000Z`;

  return {
    id: `seeded-tournament:${tournamentId}`,
    user_id: "anonymous",
    weekend_id: null,
    title: tournamentName,
    event_type: "other",
    team_name: null,
    opponent_name: null,
    tournament_id: tournamentId,
    venue_id: venueContext?.id ?? null,
    field_label: null,
    address_text: venueContext?.address ?? null,
    city: venueContext?.city ?? null,
    state: venueContext?.state ?? null,
    starts_at: `${startDate}T09:00:00.000Z`,
    ends_at: endsAt,
    timezone: venueContext?.timezone ?? "UTC",
    notes: "Tournament context added from your selected event.",
    child_profile_id: null,
    team_profile_id: null,
    source_type: "tournament",
    source_id: null,
    source_event_uid: null,
    linkedVenue: venueContext
      ? {
          id: venueContext.id,
          name: venueContext.name,
          address: venueContext.address,
          city: venueContext.city,
          state: venueContext.state,
          seo_slug: null,
        }
      : null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

export function buildAnonymousPlannerEvent(body: PlannerEventCreateBody): PlannerEventRow {
  const createdAt = nowIso();
  return {
    id: `anon-event:${crypto.randomUUID()}`,
    user_id: "anonymous",
    weekend_id: null,
    title: body.title,
    event_type: body.event_type,
    team_name: null,
    opponent_name: null,
    tournament_id: body.tournament_id ?? null,
    venue_id: body.venue_id ?? null,
    field_label: body.field_label ?? null,
    address_text: body.address_text ?? null,
    city: body.city ?? null,
    state: body.state ?? null,
    starts_at: body.starts_at,
    ends_at: body.ends_at ?? null,
    timezone: body.timezone ?? null,
    notes: body.notes ?? null,
    child_profile_id: body.child_profile_id ?? null,
    team_profile_id: body.team_profile_id ?? null,
    source_type: "manual",
    source_id: null,
    source_event_uid: null,
    linkedVenue: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

export function updateAnonymousPlannerEvent(existing: PlannerEventRow, body: PlannerEventUpdateBodyLike): PlannerEventRow {
  return {
    ...existing,
    title: body.title ?? existing.title,
    event_type: body.event_type ?? existing.event_type,
    starts_at: body.starts_at ?? existing.starts_at,
    ends_at: body.ends_at === undefined ? existing.ends_at : body.ends_at,
    timezone: body.timezone === undefined ? existing.timezone : body.timezone,
    field_label: body.field_label === undefined ? existing.field_label : body.field_label,
    child_profile_id: body.child_profile_id === undefined ? existing.child_profile_id : body.child_profile_id,
    team_profile_id: body.team_profile_id === undefined ? existing.team_profile_id : body.team_profile_id,
    tournament_id: body.tournament_id === undefined ? existing.tournament_id : body.tournament_id,
    venue_id: body.venue_id === undefined ? existing.venue_id : body.venue_id,
    address_text: body.address_text === undefined ? existing.address_text : body.address_text,
    city: body.city === undefined ? existing.city : body.city,
    state: body.state === undefined ? existing.state : body.state,
    notes: body.notes === undefined ? existing.notes : body.notes,
    updated_at: nowIso(),
  };
}

type PlannerEventUpdateBodyLike = Partial<PlannerEventCreateBody>;
