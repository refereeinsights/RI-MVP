import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../../");

test("all HotelPlanner handoff routes use snapshot persistence and handoff policy", () => {
  const routes = [
    "apps/ti-web/app/go/hotels/route.ts",
    "apps/ti-web/app/go/hotels/property/route.ts",
    "apps/ti-web/app/go/hotels/checkout/route.ts",
  ];
  for (const route of routes) {
    const source = readFileSync(resolve(repoRoot, route), "utf8");
    assert.match(source, /persistHotelOutboundWithSnapshot/);
    assert.match(source, /resolveHotelProgramSnapshotSafely/);
    assert.match(source, /selectHotelHandoffMode/);
    assert.doesNotMatch(source, /\.from\("ti_outbound_clicks"/);
  }
});

test("migration makes snapshots nullable, valid, immutable, and deletion-safe", () => {
  const source = readFileSync(
    resolve(repoRoot, "supabase/migrations/20260814_ti_hotel_program_snapshot_foundation.sql"),
    "utf8"
  ).toLowerCase();
  for (const column of [
    "hotel_program_type",
    "hotel_program_rate_cents",
    "hotel_program_beneficiary_type",
    "hotel_program_beneficiary_id",
    "hotel_program_version",
  ]) assert.match(source, new RegExp(`add column if not exists ${column}`));
  assert.match(source, /hotel_program_type is null[\s\S]*hotel_program_version is null/);
  assert.match(source, /before update of[\s\S]*hotel_program_version/);
  assert.match(source, /before delete on public\.tournaments/);
  assert.match(source, /destination_type = 'hotels'/);
  assert.match(source, /set tournament_id = null/);
});
