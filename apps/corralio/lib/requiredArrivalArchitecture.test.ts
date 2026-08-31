import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20260831_corralio_slice36b_required_arrival.sql", import.meta.url),
  "utf8",
);
const catalogVerifier = readFileSync(
  new URL("../../../scripts/analysis/corralio_slice36b_phase1_catalog_verification.sql", import.meta.url),
  "utf8",
);
const behavioralVerifier = readFileSync(
  new URL("../../../scripts/analysis/corralio_slice36b_phase1_behavioral_verification.sql", import.meta.url),
  "utf8",
);
const productData = readFileSync(new URL("../app/_lib/productData.ts", import.meta.url), "utf8");
const whatFits = readFileSync(new URL("./whatFits.ts", import.meta.url), "utf8");
const whatFitsServer = readFileSync(new URL("./whatFits.server.ts", import.meta.url), "utf8");
const sourceUi = readFileSync(new URL("../app/components/ConnectedScheduleList.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");

test("source preference migration is nullable, bounded, forced-RLS, and RPC-only", () => {
  assert.match(migration, /arrival_buffer_minutes smallint null/);
  assert.match(migration, /arrival_buffer_minutes between 0 and 120/);
  assert.match(migration, /arrival_buffer_minutes % 5 = 0/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog, public/);
  assert.match(migration, /member\.role = 'owner'[\s\S]*member\.status = 'active'/);
  assert.doesNotMatch(migration, /grant update[\s\S]*corralio_schedule_sources to authenticated/i);
  assert.doesNotMatch(migration, /update public\.corralio_events|update public\.corralio_teams|update public\.venues/);
});

test("connected-source UI gets bounded metadata and writes through the narrow action", () => {
  const connectedScheduleType = sourceUi.slice(
    sourceUi.indexOf("export type ConnectedSchedule"),
    sourceUi.indexOf("function statusLabel"),
  );
  assert.match(sourceUi, /arrivalBufferMinutes: number \| null/);
  assert.match(sourceUi, /updateScheduleArrivalPreference/);
  assert.match(actions, /\.rpc\("corralio_update_schedule_source_arrival_v1"/);
  assert.doesNotMatch(connectedScheduleType, /source_url|sourceUrl/);
  assert.doesNotMatch(productData, /select\("[^\"]*source_url/);
});

test("What Fits and This Weekend converge on the shared resolver", () => {
  assert.match(whatFits, /return resolveRequiredArrival\(event\)/);
  assert.match(productData, /resolveRequiredArrival\(\{/);
  assert.match(productData, /estimatedLeaveByIso\(requiredArrival\.requiredArrivalAt/);
  assert.match(whatFitsServer, /sourceArrivalMinutes:/);
  assert.match(whatFitsServer, /corralio_schedule_sources[\s\S]*arrival_buffer_minutes/);
});

test("verifiers prove narrow grants, cross-household denial, immutability, and cleanup zero", () => {
  assert.match(catalogVerifier, /source_url', 'SELECT'/);
  assert.match(catalogVerifier, /arrival_buffer_minutes', 'UPDATE'/);
  assert.match(behavioralVerifier, /cross-household update unexpectedly succeeded/);
  assert.match(behavioralVerifier, /direct authenticated update unexpectedly succeeded/);
  assert.equal(
    behavioralVerifier.match(/::smallint/g)?.length,
    5,
    "every narrow RPC fixture argument must resolve explicitly as smallint",
  );
  assert.match(behavioralVerifier, /source preference mutated the team/);
  assert.match(behavioralVerifier, /source preference mutated feed-derived arrival/);
  assert.match(behavioralVerifier, /ROLLBACK CLEANUP ZERO/);
});
