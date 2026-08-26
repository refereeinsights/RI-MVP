import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../../../supabase/migrations/20260826_corralio_slice46_what_fits.sql", import.meta.url), "utf8");
const server = readFileSync(new URL("./whatFits.server.ts", import.meta.url), "utf8");
const policy = readFileSync(new URL("./whatFits.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../app/components/WhatFitsPanel.tsx", import.meta.url), "utf8");

test("Slice 4.6 keeps analytics private and routing server-only", () => {
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on table public\.corralio_what_fits_events from public, anon, authenticated/);
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog, public/);
  assert.match(server, /^import "server-only";/);
  assert.doesNotMatch(panel, /OPENROUTESERVICE|service_role|corralio_overture_candidates/);
});

test("Slice 4.6 remains bounded, deterministic, and free of excluded product scope", () => {
  assert.match(policy, /WHAT_FITS_ROUTED_CANDIDATES_PER_MODE = 6/);
  assert.match(policy, /WHAT_FITS_ROUTE_CONCURRENCY = 3/);
  assert.match(policy, /WHAT_FITS_MAX_ROUTE_CALLS_PER_GAP = WHAT_FITS_ROUTED_CANDIDATES_PER_MODE \* 2/);
  assert.match(policy, /WHAT_FITS_MAX_RESULTS = 10/);
  assert.doesNotMatch(`${policy}\n${server}\n${panel}`, /mapbox|live traffic api|machine learning|free-text search|hotelplanner/i);
  assert.doesNotMatch(panel, /Brewer(?:y|ies)|Nearby|Essentials|Search/);
});

test("typed schedule arrival and team preference are narrow nullable additions", () => {
  assert.match(migration, /arrival_buffer_minutes smallint null/);
  assert.match(migration, /schedule_arrival_at timestamptz null/);
  assert.match(migration, /schedule_arrival_at >= starts_at - interval '180 minutes'/);
  assert.match(migration, /schedule_arrival_at = excluded\.schedule_arrival_at/);
});

test("parent-facing expansion and no-fit semantics match the approved packet", () => {
  assert.match(panel, /slice\(0, expanded \? 10 : 3\)/);
  assert.match(panel, /See \{recommendations\.length - 3\} more that fit/);
  assert.match(panel, /Nothing nearby comfortably fits this window\./);
  assert.match(panel, /No \$\{mode === "food" \? "Food" : "Coffee"\} options comfortably fit this window\./);
  assert.match(server, /corralio_overture_refresh_scopes/);
  assert.match(server, /\.eq\("status", "active"\)/);
});
