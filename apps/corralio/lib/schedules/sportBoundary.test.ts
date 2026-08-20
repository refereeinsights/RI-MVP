import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const appRoot = new URL("../../", import.meta.url);
const migrationSource = readFileSync(
  new URL("../../../../supabase/migrations/20260820_corralio_slice40a1_broader_sports_taxonomy.sql", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
const weekendSource = readFileSync(new URL("../../app/components/ThisWeekend.tsx", import.meta.url), "utf8");
const connectFormSource = readFileSync(new URL("../../app/components/ConnectScheduleForm.tsx", import.meta.url), "utf8");
const connectedListSource = readFileSync(new URL("../../app/components/ConnectedScheduleList.tsx", import.meta.url), "utf8");
const familySource = readFileSync(new URL("../../app/components/FamilySection.tsx", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../../app/actions.ts", import.meta.url), "utf8");

const canonicalSports = [
  "baseball", "softball", "soccer", "basketball", "volleyball",
  "hockey", "lacrosse", "football", "tennis", "swimming",
  "gymnastics", "track_field", "golf", "wrestling", "cheer",
  "dance", "other",
];

function applicationSources(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const child = join(path, entry);
    if (statSync(child).isDirectory()) return applicationSources(child);
    return /\.(?:ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts") ? [readFileSync(child, "utf8")] : [];
  });
}

test("all four database boundaries use the exact broader Corralio taxonomy", () => {
  for (const sport of canonicalSports) {
    assert.equal(migrationSource.match(new RegExp(`'${sport}'`, "g"))?.length, 5);
  }
  assert.match(migrationSource, /corralio_schedule_sources_sport_check/);
  assert.match(migrationSource, /corralio_teams_sport_check/);
  assert.match(migrationSource, /create or replace function public\.corralio_create_schedule_source_v2/);
  assert.match(migrationSource, /create or replace function public\.corralio_update_schedule_source_sport_v1/);
  assert.doesNotMatch(migrationSource, /alter table public\.corralio_events[\s\S]*?add column[\s\S]*?sport/i);
  assert.doesNotMatch(migrationSource, /[🎾🏊🤸🏃⛳🤼📣💃]/u);
});

test("Corralio sport presentation remains local and shared by every selector", () => {
  for (const source of [connectFormSource, connectedListSource, familySource]) {
    assert.match(source, /CORRALIO_SPORTS\.map/);
  }
  assert.match(actionsSource, /CORRALIO_SPORTS\.includes/);
  assert.match(weekendSource, /corralioSportLabel/);
  assert.match(weekendSource, /corralioSportIcon/);
  assert.match(weekendSource, /event\.location/);

  for (const source of applicationSources(appRoot.pathname)) {
    assert.doesNotMatch(source, /from\s+["'][^"']*(?:apps\/ti-web|ti-web\/|tournament[^"']*sport)/i);
  }
});

test("imported events still derive sport through schedule source identity", () => {
  const eventType = pageSource.match(/type EventRow = \{[\s\S]*?\n\};/)?.[0] ?? "";
  assert.doesNotMatch(eventType, /\bsport:/);
  assert.match(pageSource, /schedule_source_id/);
  assert.match(pageSource, /sourceSports\.get\(event\.schedule_source_id\)/);
});
