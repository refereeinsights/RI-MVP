import type { PlannerEventCreateBody, PlannerEventRow } from "./types";
import type { PlannerSessionContext } from "./plannerSession";

const STORAGE_PREFIX = "ti:anonymous-planner:v1:";
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

function snapshotKey(context: PlannerSessionContext | null | undefined) {
  const plannerSessionId = String(context?.planner_session_id ?? "").trim();
  if (plannerSessionId) return `${STORAGE_PREFIX}${plannerSessionId}`;
  const tournamentId = String(context?.tournament_id ?? "").trim();
  if (tournamentId) return `${STORAGE_PREFIX}tournament:${tournamentId}`;
  return null;
}

function safeReadSnapshot(context: PlannerSessionContext | null | undefined) {
  if (typeof window === "undefined") return null;
  const key = snapshotKey(context);
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AnonymousPlannerSnapshot;
    const expiresAt = new Date(String(parsed?.expiresAt ?? ""));
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function safeWriteSnapshot(context: PlannerSessionContext | null | undefined, events: PlannerEventRow[]) {
  if (typeof window === "undefined") return;
  const key = snapshotKey(context);
  if (!key) return;
  try {
    const snapshot: AnonymousPlannerSnapshot = {
      plannerSessionId: String(context?.planner_session_id ?? "").trim(),
      tournamentId: String(context?.tournament_id ?? "").trim() || null,
      expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
      events,
    };
    window.localStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // ignore storage failures
  }
}

export function loadAnonymousPlannerEvents(context: PlannerSessionContext | null | undefined) {
  return safeReadSnapshot(context)?.events ?? [];
}

export function saveAnonymousPlannerEvents(context: PlannerSessionContext | null | undefined, events: PlannerEventRow[]) {
  safeWriteSnapshot(context, events);
}

export function buildSeededTournamentPlannerEvent(context: PlannerSessionContext | null | undefined): PlannerEventRow | null {
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
    venue_id: String(context?.venue_id ?? "").trim() || null,
    field_label: null,
    address_text: null,
    city: null,
    state: null,
    starts_at: `${startDate}T09:00:00.000Z`,
    ends_at: endsAt,
    timezone: "UTC",
    notes: "Tournament context added from your selected event.",
    child_profile_id: null,
    team_profile_id: null,
    source_type: "tournament",
    source_id: null,
    source_event_uid: null,
    linkedVenue: null,
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
    field_label: null,
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
