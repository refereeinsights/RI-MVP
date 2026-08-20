import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actionsSource = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
const familyUiSource = readFileSync(new URL("../app/components/FamilySection.tsx", import.meta.url), "utf8");
const productDataSource = readFileSync(new URL("../app/_lib/productData.ts", import.meta.url), "utf8");
const familyPageSource = readFileSync(new URL("../app/family/page.tsx", import.meta.url), "utf8");
const migrationSource = readFileSync(
  new URL("../../../supabase/migrations/20260820_corralio_slice40a_family_foundation.sql", import.meta.url),
  "utf8",
);
const verificationSource = readFileSync(
  new URL("../../../scripts/analysis/corralio_slice40a_family_verification.sql", import.meta.url),
  "utf8",
);

const familyActionSource = actionsSource.slice(
  actionsSource.indexOf("export async function createChild"),
  actionsSource.indexOf("export async function signOut"),
);

test("family mutations derive the owner household server-side and never use the admin client", () => {
  assert.match(actionsSource, /async function getOwnerContext\(\)/);
  assert.match(actionsSource, /\.rpc\("corralio_ensure_owner_household"/);
  assert.doesNotMatch(familyUiSource, /name="householdId"/);
  assert.doesNotMatch(familyActionSource, /createCorralioSupabaseAdminClient/);
  assert.doesNotMatch(familyActionSource, /corralio_schedule_sources|corralio_events/);
});

test("Slice 4.0A exposes only create and bounded edit controls", () => {
  assert.match(familyUiSource, /Add a child/);
  assert.match(familyUiSource, /Add a team for/);
  assert.match(familyUiSource, /Edit child name/);
  assert.match(familyUiSource, /Edit team/);
  assert.doesNotMatch(familyUiSource, /Delete child|Delete team|Archive|Restore|Reassign/i);
  assert.doesNotMatch(familyActionSource, /\.delete\(|\.update\(\{[^}]*archived_at|child_id:\s*formData/);
});

test("family reads are bounded to active household rows and do not alter schedule reads", () => {
  assert.match(productDataSource, /\.from\("corralio_children"\)[\s\S]*?\.is\("archived_at", null\)/);
  assert.match(productDataSource, /\.from\("corralio_teams"\)[\s\S]*?\.is\("archived_at", null\)/);
  assert.match(familyPageSource, /<FamilySection familyChildren=\{familyChildren\} teams=\{familyTeams\}/);
});

test("the optional migration narrows team sport without changing family cardinality", () => {
  for (const sport of [
    "baseball", "softball", "soccer", "basketball", "volleyball",
    "hockey", "lacrosse", "football", "other",
  ]) assert.match(migrationSource, new RegExp(`'${sport}'`));
  assert.match(migrationSource, /sport is null/);
  assert.match(migrationSource, /preflight failed/i);
  assert.doesNotMatch(migrationSource, /create table|drop table|delete from|update public\.corralio_teams/i);
});

test("the rollback fixture retains cross-household IDs without bypassing RLS", () => {
  assert.match(verificationSource, /set_config\(\s*'corralio\.verification\.household_b'/);
  assert.match(verificationSource, /current_setting\('corralio\.verification\.household_b'\)::uuid/);
  assert.doesNotMatch(
    verificationSource,
    /select household_id into strict v_household_b[\s\S]*?user_id = 'ca410000-0000-4000-8000-000000000002'/,
  );
});
