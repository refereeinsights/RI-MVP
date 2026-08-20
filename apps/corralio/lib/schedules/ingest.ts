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
};

export type CorralioScheduleStore = {
  resolveOwnerContext(): Promise<CorralioOwnerContext | null>;
  findSourceByUrl(householdId: string, sourceUrl: string): Promise<CorralioExistingSource | null>;
  createSource(input: {
    householdId: string;
    displayName: string;
    sourceUrl: string;
    sport: CorralioSport | null;
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
  markSourceError(sourceId: string, householdId: string): Promise<void>;
};

type FetchResult = Awaited<ReturnType<typeof fetchIcsSchedule>>;

type IngestionDependencies = {
  fetchSchedule?: (url: string) => Promise<FetchResult>;
  normalizeSchedule?: typeof normalizeIcsSchedule;
};

export type CorralioScheduleIngestionResult =
  | { ok: true; sourceId: string; imported: number }
  | { ok: false; error: string };

function userSafeError(error: ScheduleFetchError | "no_events" | "unauthorized" | "persistence" | "needs_replacement") {
  if (error === "invalid_url") return "Enter a valid iCal/ICS calendar URL.";
  if (error === "unsupported_protocol") return "Calendar links must start with http:// or https://.";
  if (error === "private_url") return "That calendar link cannot point to a private or local address.";
  if (error === "fetch_failed") return "That calendar link could not be reached. Check the link and try again.";
  if (error === "not_ics") return "That link does not appear to be an iCal/ICS calendar.";
  if (error === "too_large") return "That calendar is too large to import right now.";
  if (error === "no_events") return "No upcoming events were found in that calendar.";
  if (error === "unauthorized") return "Sign in to connect a schedule.";
  if (error === "needs_replacement") return "This schedule needs attention. Use Replace calendar link on the connected schedule to reconnect updates.";
  return "We couldn’t save that schedule right now. Please try again.";
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
  };
}

export async function ingestCorralioSchedule(
  store: CorralioScheduleStore,
  input: { sourceUrl: string; displayName?: string | null; sport?: CorralioSport | null },
  dependencies: IngestionDependencies = {},
): Promise<CorralioScheduleIngestionResult> {
  const owner = await store.resolveOwnerContext();
  if (!owner) return { ok: false, error: userSafeError("unauthorized") };

  const sourceUrl = normalizeSubmittedScheduleUrl(input.sourceUrl);
  const fetchSchedule = dependencies.fetchSchedule ?? fetchIcsSchedule;
  const fetched = await fetchSchedule(sourceUrl);
  if (!fetched.ok) return { ok: false, error: userSafeError(fetched.error) };

  const normalizeSchedule = dependencies.normalizeSchedule ?? normalizeIcsSchedule;
  const normalized = normalizeSchedule({ icsText: fetched.text, sourceUrl: fetched.finalUrl });
  if (normalized.errors.length) return { ok: false, error: userSafeError("not_ics") };
  if (!normalized.events.length) return { ok: false, error: userSafeError("no_events") };

  const displayName = String(input.displayName ?? "").trim().slice(0, 100) || "Sports schedule";
  let sourceId: string | null = null;
  try {
    const existingSource = await store.findSourceByUrl(owner.householdId, sourceUrl);
    if (existingSource?.refreshPaused) {
      return { ok: false, error: userSafeError("needs_replacement") };
    }
    sourceId = existingSource?.sourceId ?? null;
    if (!sourceId) {
      sourceId = await store.createSource({
        householdId: owner.householdId,
        displayName,
        sourceUrl,
        sport: input.sport ?? null,
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
    return { ok: true, sourceId, imported: normalized.events.length };
  } catch {
    if (sourceId) await store.markSourceError(sourceId, owner.householdId).catch(() => undefined);
    return { ok: false, error: userSafeError("persistence") };
  }
}

export async function replaceCorralioSchedule(
  store: CorralioScheduleStore,
  input: { sourceId: string; sourceUrl: string },
  dependencies: IngestionDependencies = {},
): Promise<CorralioScheduleIngestionResult> {
  const owner = await store.resolveOwnerContext();
  if (!owner) return { ok: false, error: userSafeError("unauthorized") };

  const sourceUrl = normalizeSubmittedScheduleUrl(input.sourceUrl);
  const fetchSchedule = dependencies.fetchSchedule ?? fetchIcsSchedule;
  const fetched = await fetchSchedule(sourceUrl);
  if (!fetched.ok) return { ok: false, error: userSafeError(fetched.error) };

  const normalizeSchedule = dependencies.normalizeSchedule ?? normalizeIcsSchedule;
  const normalized = normalizeSchedule({ icsText: fetched.text, sourceUrl: fetched.finalUrl });
  if (normalized.errors.length) return { ok: false, error: userSafeError("not_ics") };
  // Intentional pilot constraint: do not replace a working connection unless
  // the submitted feed currently proves it contains usable events.
  if (!normalized.events.length) return { ok: false, error: userSafeError("no_events") };

  try {
    await store.replaceSourceAndPersist({
      householdId: owner.householdId,
      sourceId: input.sourceId,
      sourceUrl,
      events: normalized.events.map(toPersistedScheduleEvent),
      canceledSourceEventUids: normalized.canceledSourceEventUids,
    });
    return { ok: true, sourceId: input.sourceId, imported: normalized.events.length };
  } catch {
    return { ok: false, error: userSafeError("persistence") };
  }
}
