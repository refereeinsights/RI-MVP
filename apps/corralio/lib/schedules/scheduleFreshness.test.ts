import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { aggregateScheduleFreshness, relativeFreshness, sourceFreshnessLabel } from "./freshness";
import { runManualScheduleRefresh } from "./manualRefresh";
import type { CorralioRefreshClaim } from "./refresh";

const NOW = Date.parse("2026-08-27T20:00:00.000Z");

test("relative freshness uses an injected clock", () => {
  assert.equal(relativeFreshness("2026-08-27T19:59:30.000Z", NOW), "just now");
  assert.equal(relativeFreshness("2026-08-27T18:00:00.000Z", NOW), "2 hours ago");
  assert.equal(relativeFreshness("2026-08-26T19:00:00.000Z", NOW), "yesterday");
});

test("source freshness never treats a recent failed attempt as successful freshness", () => {
  assert.equal(
    sourceFreshnessLabel({ syncStatus: "error", lastSyncedAt: "2026-08-26T19:00:00.000Z" }, NOW),
    "Couldn’t refresh · Last updated yesterday",
  );
  assert.equal(
    sourceFreshnessLabel({ syncStatus: "success", lastSyncedAt: "2026-08-27T18:00:00.000Z" }, NOW),
    "Updated 2 hours ago",
  );
});

test("weekend freshness is conservative across every connected source", () => {
  assert.equal(aggregateScheduleFreshness([
    { syncStatus: "success", lastSyncedAt: "2026-08-27T19:00:00.000Z" },
    { syncStatus: "success", lastSyncedAt: "2026-08-27T16:00:00.000Z" },
  ], NOW), "Schedules last fully updated 4 hours ago");
  assert.equal(aggregateScheduleFreshness([
    { syncStatus: "success", lastSyncedAt: "2026-08-27T19:00:00.000Z" },
    { syncStatus: "error", lastSyncedAt: "2026-08-26T19:00:00.000Z" },
  ], NOW), "One or more schedules couldn’t refresh · Oldest last updated yesterday");
  assert.equal(aggregateScheduleFreshness([
    { syncStatus: "success", lastSyncedAt: "2026-08-27T19:00:00.000Z" },
    { syncStatus: "pending", lastSyncedAt: null },
  ], NOW), "One or more schedules are waiting for a first successful update");
});

test("manual orchestration returns only bounded browser-safe outcomes", async () => {
  const privateClaim: CorralioRefreshClaim = {
    sourceId: "source-1",
    householdId: "household-1",
    sourceUrl: "https://calendar.example/private.ics?secret=hidden",
    claimToken: "private-claim-token",
  };
  const success = await runManualScheduleRefresh({
    claim: async () => ({ outcome: "claimed", claim: privateClaim }),
    refresh: async (claim) => {
      assert.equal(claim, privateClaim);
      return { status: "success", eventCount: 4 };
    },
  }, { householdId: "household-1", sourceId: "source-1" });
  assert.deepEqual(success, { outcome: "success", eventCount: 4 });
  assert.doesNotMatch(JSON.stringify(success), /secret|private\.ics|claim-token/);

  for (const outcome of ["cooldown", "busy", "paused", "unavailable"] as const) {
    const result = await runManualScheduleRefresh({
      claim: async () => ({ outcome }),
      refresh: async () => { throw new Error("refresh should not run"); },
    }, { householdId: "household-1", sourceId: "source-1" });
    assert.deepEqual(result, { outcome });
  }
});

test("manual refresh stays behind a server action and service-only claim boundary", () => {
  const actions = readFileSync(new URL("../../app/actions.ts", import.meta.url), "utf8");
  const connectedSchedules = readFileSync(new URL("../../app/components/ConnectedScheduleList.tsx", import.meta.url), "utf8");
  const store = readFileSync(new URL("./refreshSupabaseStore.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../../../supabase/migrations/20260827_corralio_slice355_schedule_freshness.sql", import.meta.url), "utf8");
  assert.match(actions, /resolveCorralioViewer/);
  assert.match(actions, /householdId: viewer\.householdId, sourceId/);
  assert.match(store, /corralio_claim_ics_refresh_source_v1/);
  assert.match(migration, /revoke all on function public\.corralio_claim_ics_refresh_source_v1\(uuid, uuid\)[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(actions, /isCorralioCronAuthorized|CRON_SECRET/);
  assert.match(actions, /Schedule checked — \$\{result\.eventCount\} upcoming/);
  assert.match(actions, /Couldn’t refresh — try again shortly\./);
  assert.match(connectedSchedules, /pending="Checking…"/);
  assert.match(connectedSchedules, /disabled=\{cooldownActive \|\| refreshPaused\}/);
  assert.doesNotMatch(migration, /daily.*cap|quota|reserve_external_call/i);
});
