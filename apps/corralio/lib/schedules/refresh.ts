import type { NormalizedScheduleEvent } from "../../../../packages/lib/sports-schedule";
import { normalizeIcsSchedule } from "../../../../packages/lib/sports-schedule";
import {
  fetchIcsSchedule,
  type ScheduleFetchError,
} from "../../../../packages/lib/sports-schedule/server";
import { toPersistedScheduleEvent, type PersistedScheduleEvent } from "./ingest";

export const CORRALIO_REFRESH_BATCH_LIMIT = 10;
export const CORRALIO_REFRESH_FRESHNESS_HOURS = 23;
export const CORRALIO_REFRESH_CLAIM_TIMEOUT_MINUTES = 10;

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
  failClaimed(input: {
    sourceId: string;
    claimToken: string;
    failureCode: CorralioRefreshFailureCode;
  }): Promise<void>;
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

function normalizationFailure(events: NormalizedScheduleEvent[], errors: string[]) {
  if (errors.length) return "not_ics" as const;
  if (events.length > 500) return "event_limit" as const;
  return null;
}

export async function runCorralioScheduledRefresh(
  store: CorralioRefreshStore,
  dependencies: RefreshDependencies = {},
): Promise<CorralioRefreshResult> {
  const startedAt = (dependencies.nowMs ?? Date.now)();
  const fetchSchedule = dependencies.fetchSchedule ?? fetchIcsSchedule;
  const normalizeSchedule = dependencies.normalizeSchedule ?? normalizeIcsSchedule;
  const claims = await store.claimBatch(CORRALIO_REFRESH_BATCH_LIMIT);
  let refreshed = 0;
  let validEmpty = 0;
  let failed = 0;

  for (const claim of claims) {
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
          if (normalized.events.length === 0) validEmpty += 1;
          else refreshed += 1;
        }
      }
    } catch {
      failureCode = "persistence";
    }

    if (failureCode) {
      failed += 1;
      await store.failClaimed({
        sourceId: claim.sourceId,
        claimToken: claim.claimToken,
        failureCode,
      }).catch(() => undefined);
    }
  }

  return {
    ok: true,
    claimed: claims.length,
    refreshed,
    valid_empty: validEmpty,
    failed,
    skipped: 0,
    batch_full: claims.length === CORRALIO_REFRESH_BATCH_LIMIT,
    duration_ms: Math.max(0, (dependencies.nowMs ?? Date.now)() - startedAt),
  };
}
