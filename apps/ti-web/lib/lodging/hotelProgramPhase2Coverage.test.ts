import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Phase 2 migration is service-role-only and stores no fee destination URLs", () => {
  const migration = read("supabase/migrations/20260814_ti_tournament_hotel_program_phase2.sql");
  assert.match(migration, /tournament_id uuid primary key/);
  assert.match(migration, /on delete cascade/);
  assert.match(migration, /configuration_version uuid not null default gen_random_uuid\(\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all .* public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete .* service_role/);
  assert.doesNotMatch(migration, /destination_url|fee_url|base_url/i);
});

test("admin mutations use existing authorization and optimistic version checks", () => {
  const admin = read("apps/referee/lib/hotelProgramAdmin.ts");
  const page = read("apps/referee/app/admin/page.tsx");
  assert.match(admin, /await requireAdmin\(\)/);
  assert.match(admin, /expectedConfigurationVersion/);
  assert.match(admin, /crypto\.randomUUID\(\)/);
  assert.match(admin, /\.eq\("configuration_version", currentVersion/);
  assert.match(page, /HotelProgramAdminSection/);
  assert.match(page, /confirm_economic_change/);
});

test("fee destinations are resolved only from opaque server-side configuration keys", () => {
  const registry = read("packages/lib/hotel-program/index.ts");
  const migration = read("supabase/migrations/20260814_ti_tournament_hotel_program_phase2.sql");
  assert.match(registry, /HOTELPLANNER_TI_REVENUE_500_BASE_URL/);
  assert.match(registry, /HOTELPLANNER_TOURNAMENT_SUPPORT_1000_BASE_URL/);
  assert.match(registry, /hostname !== "hotelplanner\.com"/);
  assert.doesNotMatch(migration, /HOTELPLANNER_|hotelplanner\.com/i);
});
