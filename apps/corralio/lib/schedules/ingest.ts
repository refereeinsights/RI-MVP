import type { NormalizedScheduleEvent } from "../../../../packages/lib/sports-schedule";
import { normalizeIcsSchedule } from "../../../../packages/lib/sports-schedule";
import {
  fetchIcsSchedule,
  type ScheduleFetchError,
} from "../../../../packages/lib/sports-schedule/server";
import type { CorralioSport } from "./sport";

export type CorralioOwnerContext = { userId: string; householdId: string };
export type CorralioExistingSource = { sourceId: string; refreshPaused: boolean };

export type PersistedScheduleEvent = {
  title: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  source_event_uid: string;
  source_location_text: string | null;
  display_location_text: string | null;
  field_label: string | null;
  notes: string | null;
  schedule_arrival_at: string | null;
};

export type CorralioScheduleStore = {
  resolveOwnerContext(): Promise<CorralioOwnerContext | null>;
  findSourceByUrl(householdId: string, sourceUrl: string): Promise<CorralioExistingSource | null>;
  createSource(input: {
    householdId: string;
    displayName: string;
    sourceUrl: string;
    sport: CorralioSport | null;
    childId: string | null;
    teamId: string | null;
  }): Promise<string>;
  updateSourceSport(sourceId: string, sport: CorralioSport | null): Promise<void>;
  persistIngestion(input: {
    householdId: string;
    sourceId: string;
    events: PersistedScheduleEvent[];
    canceledSourceEventUids: string[];
  }): Promise<void>;
  replaceSourceAndPersist(input: {
    householdId: string;
    sourceId: string;
    sourceUrl: string;
    events: PersistedScheduleEvent[];
    canceledSourceEventUids: string[];
  }): Promise<void>;
  matchPersistedEvents(input: {
    householdId: string;
    sourceId: string;
    sourceEventUids: string[];
    forceRematch?: boolean;
  }): Promise<void>;
  markSourceError(sourceId: string, householdId: string): Promise<void>;
};

type FetchResult = Awaited<ReturnType<typeof fetchIcsSchedule>>;

type IngestionDependencies = {
  fetchSchedule?: (url: string) => Promise<FetchResult>;
  normalizeSchedule?: typeof normalizeIcsSchedule;
};

export type CorralioScheduleIngestionResult =
  | { ok: true; sourceId: string; imported: number }
  | { ok: false; error: string; errorKind: ScheduleConnectionErrorKind };

export type ScheduleConnectionErrorKind =
  | ScheduleFetchError
  | "already_connected"
  | "no_events"
  | "unauthorized"
  | "persistence"
  | "needs_replacement";

async function runBestEffortVenueMatching(store: CorralioScheduleStore, input: {
  householdId: string;
  sourceId: string;
  sourceEventUids: string[];
}) {
  try {
    await store.matchPersistedEvents(input);
  } catch {
    // The schedule is already safely persisted. Never include location or
    // candidate data in this deliberately constant failure signal.
    console.warn("[corralio][venue-matching] post-persistence evaluation failed");
  }
}

function userSafeError(errorKind: ScheduleConnectionErrorKind): Extract<CorralioScheduleIngestionResult, { ok: false }> {
  let error = "We couldn’t save that schedule right now. Please try again.";
  if (errorKind === "invalid_url") error = "Enter a valid iCal/ICS calendar URL.";
  if (errorKind === "unsupported_protocol") error = "Calendar links must start with http:// or https://.";
  if (errorKind === "private_url") error = "This looks like a private or local address, not a public calendar link.";
  if (errorKind === "fetch_failed") error = "That calendar link could not be reached. Check the link and try again.";
  if (errorKind === "not_ics") error = "This link doesn’t appear to be an iCal/ICS calendar.";
  if (errorKind === "too_large") error = "That calendar is too large to import right now.";
  if (errorKind === "no_events") error = "No upcoming events were found in that calendar.";
  if (errorKind === "unauthorized") error = "Sign in to connect a schedule.";
  if (errorKind === "needs_replacement") error = "This schedule needs attention. Use Replace calendar link on the connected schedule to reconnect updates.";
  if (errorKind === "already_connected") error = "This calendar is already connected. Use Change assignment on the connected schedule to move it to this team.";
  return { ok: false, error, errorKind };
}

export function normalizeSubmittedScheduleUrl(rawUrl: string) {
  const trimmed = String(rawUrl ?? "").trim();
  if (/^webcal:\/\//i.test(trimmed)) return `https://${trimmed.slice("webcal://".length)}`;
  return trimmed;
}

export function toPersistedScheduleEvent(event: NormalizedScheduleEvent): PersistedScheduleEvent {
  return {
    title: event.title,
    starts_at: event.startsAt,
    ends_at: event.endsAt,
    timezone: event.timezone,
    source_event_uid: event.sourceEventUid,
    source_location_text: event.rawLocation,
    display_location_text: event.location,
    field_label: event.fieldLabel,
    notes: event.notes,
    schedule_arrival_at: event.scheduleArrivalAt,
  };
}

export async function ingestCorralioSchedule(
  store: CorralioScheduleStore,
  input: {
    sourceUrl: string;
    displayName?: string | null;
    sport?: CorralioSport | null;
    assignment?: { childId: string; teamId: string | null };
  },
  dependencies: IngestionDependencies = {},
): Promise<CorralioScheduleIngestionResult> {
  const owner = await store.resolveOwnerContext();
  if (!owner) return userSafeError("unauthorized");

  const sourceUrl = normalizeSubmittedScheduleUrl(input.sourceUrl);
  const fetchSchedule = dependencies.fetchSchedule ?? fetchIcsSchedule;
  const fetched = await fetchSchedule(sourceUrl);
  if (!fetched.ok) return userSafeError(fetched.error);

  const normalizeSchedule = dependencies.normalizeSchedule ?? normalizeIcsSchedule;
  const normalized = normalizeSchedule({ icsText: fetched.text, sourceUrl: fetched.finalUrl });
  if (normalized.errors.length) return userSafeError("not_ics");

  const displayName = String(input.displayName ?? "").trim().slice(0, 100) || "Sports schedule";
  let sourceId: string | null = null;
  try {
    const existingSource = await store.findSourceByUrl(owner.householdId, sourceUrl);
    if (existingSource?.refreshPaused) {
      return userSafeError("needs_replacement");
    }
    if (existingSource && input.assignment) {
      return userSafeError("already_connected");
    }
    sourceId = existingSource?.sourceId ?? null;
    if (!sourceId) {
      sourceId = await store.createSource({
        householdId: owner.householdId,
        displayName,
        sourceUrl,
        sport: input.sport ?? null,
        childId: input.assignment?.childId ?? null,
        teamId: input.assignment?.teamId ?? null,
      });
    } else if (input.sport) {
      await store.updateSourceSport(sourceId, input.sport);
    }
    await store.persistIngestion({
      householdId: owner.householdId,
      sourceId,
      events: normalized.events.map(toPersistedScheduleEvent),
      canceledSourceEventUids: normalized.canceledSourceEventUids,
    });
    await runBestEffortVenueMatching(store, {
      householdId: owner.householdId,
      sourceId,
      sourceEventUids: normalized.events.map((event) => event.sourceEventUid),
    });
    return { ok: true, sourceId, imported: normalized.events.length };
  } catch {
    if (sourceId) await store.markSourceError(sourceId, owner.householdId).catch(() => undefined);
    return userSafeError("persistence");
  }
}

export async function replaceCorralioSchedule(
  store: CorralioScheduleStore,
  input: { sourceId: string; sourceUrl: string },
  dependencies: IngestionDependencies = {},
): Promise<CorralioScheduleIngestionResult> {
  const owner = await store.resolveOwnerContext();
  if (!owner) return userSafeError("unauthorized");

  const sourceUrl = normalizeSubmittedScheduleUrl(input.sourceUrl);
  const fetchSchedule = dependencies.fetchSchedule ?? fetchIcsSchedule;
  const fetched = await fetchSchedule(sourceUrl);
  if (!fetched.ok) return userSafeError(fetched.error);

  const normalizeSchedule = dependencies.normalizeSchedule ?? normalizeIcsSchedule;
  const normalized = normalizeSchedule({ icsText: fetched.text, sourceUrl: fetched.finalUrl });
  if (normalized.errors.length) return userSafeError("not_ics");
  // Intentional pilot constraint: do not replace a working connection unless
  // the submitted feed currently proves it contains usable events.
  if (!normalized.events.length) return userSafeError("no_events");

  try {
    await store.replaceSourceAndPersist({
      householdId: owner.householdId,
      sourceId: input.sourceId,
      sourceUrl,
      events: normalized.events.map(toPersistedScheduleEvent),
      canceledSourceEventUids: normalized.canceledSourceEventUids,
    });
    await runBestEffortVenueMatching(store, {
      householdId: owner.householdId,
      sourceId: input.sourceId,
      sourceEventUids: normalized.events.map((event) => event.sourceEventUid),
    });
    return { ok: true, sourceId: input.sourceId, imported: normalized.events.length };
  } catch {
    return userSafeError("persistence");
  }
}
