import type { NormalizedScheduleEvent } from "../../../../packages/lib/sports-schedule";
import { normalizeIcsSchedule } from "../../../../packages/lib/sports-schedule";
import {
  fetchIcsSchedule,
  type ScheduleFetchError,
} from "../../../../packages/lib/sports-schedule/server";
import { toPersistedScheduleEvent, type PersistedScheduleEvent } from "./ingest";

export const CORRALIO_REFRESH_BATCH_LIMIT = 10;
export const CORRALIO_REFRESH_FRESHNESS_HOURS = 3;
export const CORRALIO_REFRESH_CLAIM_TIMEOUT_MINUTES = 10;
export const CORRALIO_REFRESH_FAILURE_THRESHOLD = 3;
export const CORRALIO_REFRESH_FAILURE_MINIMUM_HOURS = 24;
export const CORRALIO_MANUAL_REFRESH_COOLDOWN_MINUTES = 5;

export type CorralioRefreshFailureCode = ScheduleFetchError | "event_limit" | "persistence";

export type CorralioRefreshClaim = {
  sourceId: string;
  householdId: string;
  sourceUrl: string;
  claimToken: string;
};

export type CorralioRefreshStore = {
  claimBatch(limit: number): Promise<CorralioRefreshClaim[]>;
  persistClaimed(input: {
    sourceId: string;
    claimToken: string;
    events: PersistedScheduleEvent[];
    canceledSourceEventUids: string[];
  }): Promise<void>;
  matchPersistedEvents(input: {
    householdId: string;
    sourceId: string;
    sourceEventUids: string[];
  }): Promise<void>;
  failClaimed(input: {
    sourceId: string;
    claimToken: string;
    failureCode: CorralioRefreshFailureCode;
  }): Promise<boolean>;
};

export type CorralioRefreshResult = {
  ok: true;
  claimed: number;
  refreshed: number;
  valid_empty: number;
  failed: number;
  skipped: number;
  batch_full: boolean;
  duration_ms: number;
};

type RefreshDependencies = {
  fetchSchedule?: typeof fetchIcsSchedule;
  normalizeSchedule?: typeof normalizeIcsSchedule;
  nowMs?: () => number;
};

export type CorralioSingleRefreshResult =
  | { status: "success"; eventCount: number }
  | { status: "failed"; finalized: boolean | null };

function normalizationFailure(events: NormalizedScheduleEvent[], errors: string[]) {
  if (errors.length) return "not_ics" as const;
  if (events.length > 500) return "event_limit" as const;
  return null;
}

export async function refreshCorralioClaim(
  store: CorralioRefreshStore,
  claim: CorralioRefreshClaim,
  dependencies: RefreshDependencies = {},
): Promise<CorralioSingleRefreshResult> {
  const fetchSchedule = dependencies.fetchSchedule ?? fetchIcsSchedule;
  const normalizeSchedule = dependencies.normalizeSchedule ?? normalizeIcsSchedule;
  let failureCode: CorralioRefreshFailureCode | null = null;
  try {
    const fetched = await fetchSchedule(claim.sourceUrl);
    if (!fetched.ok) {
      failureCode = fetched.error;
    } else {
      const normalized = normalizeSchedule({
        icsText: fetched.text,
        sourceUrl: fetched.finalUrl,
      });
      failureCode = normalizationFailure(normalized.events, normalized.errors);
      if (!failureCode) {
        await store.persistClaimed({
          sourceId: claim.sourceId,
          claimToken: claim.claimToken,
          events: normalized.events.map(toPersistedScheduleEvent),
          canceledSourceEventUids: normalized.canceledSourceEventUids,
        });
        try {
          await store.matchPersistedEvents({
            householdId: claim.householdId,
            sourceId: claim.sourceId,
            sourceEventUids: normalized.events.map((event) => event.sourceEventUid),
          });
        } catch {
          // Persistence has succeeded and finalized the refresh claim. Venue
          // intelligence is best-effort and must not alter refresh health.
          console.warn("[corralio][venue-matching] post-persistence evaluation failed");
        }
        return { status: "success", eventCount: normalized.events.length };
      }
    }
  } catch {
    failureCode = "persistence";
  }

  try {
    const finalized = await store.failClaimed({
      sourceId: claim.sourceId,
      claimToken: claim.claimToken,
      failureCode: failureCode ?? "persistence",
    });
    return { status: "failed", finalized };
  } catch {
    // The source attempt failed operationally, but no persisted failure count
    // is assumed when finalization itself cannot be confirmed.
    return { status: "failed", finalized: null };
  }
}

export async function runCorralioScheduledRefresh(
  store: CorralioRefreshStore,
  dependencies: RefreshDependencies = {},
): Promise<CorralioRefreshResult> {
  const startedAt = (dependencies.nowMs ?? Date.now)();
  const claims = await store.claimBatch(CORRALIO_REFRESH_BATCH_LIMIT);
  let refreshed = 0;
  let validEmpty = 0;
  let failed = 0;
  let skipped = 0;

  for (const claim of claims) {
    const result = await refreshCorralioClaim(store, claim, dependencies);
    if (result.status === "success") {
      if (result.eventCount === 0) validEmpty += 1;
      else refreshed += 1;
    } else if (result.finalized !== false) {
      failed += 1;
    } else {
      skipped += 1;
    }
  }

  return {
    ok: true,
    claimed: claims.length,
    refreshed,
    valid_empty: validEmpty,
    failed,
    skipped,
    batch_full: claims.length === CORRALIO_REFRESH_BATCH_LIMIT,
    duration_ms: Math.max(0, (dependencies.nowMs ?? Date.now)() - startedAt),
  };
}
