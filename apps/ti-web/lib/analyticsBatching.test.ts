import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ANALYTICS_BATCH_MAX_EVENTS,
  buildAnalyticsDedupeKey,
  createAnalyticsBatcher,
  isRepeatableViewEvent,
  normalizeAnalyticsRequestBody,
} from "../../../packages/lib/analytics-batch";

const repoRoot = process.cwd();
const read = (path: string) => readFileSync(`${repoRoot}/${path}`, "utf8");

test("analytics request normalization remains backward compatible with one event", () => {
  assert.deepEqual(normalizeAnalyticsRequestBody({ event: "page_viewed", properties: { page: "/" } }), [
    { event: "page_viewed", properties: { page: "/" } },
  ]);
});

test("analytics request normalization accepts a bounded batch", () => {
  const events = Array.from({ length: ANALYTICS_BATCH_MAX_EVENTS }, (_, index) => ({
    event: `event_${index}`,
    properties: { index },
  }));
  assert.equal(normalizeAnalyticsRequestBody({ events })?.length, ANALYTICS_BATCH_MAX_EVENTS);
  assert.equal(normalizeAnalyticsRequestBody({ events: [...events, events[0]] }), null);
  assert.equal(normalizeAnalyticsRequestBody({ events: [] }), null);
  assert.equal(normalizeAnalyticsRequestBody({ event: "bad", properties: [] }), null);
});

test("the client batcher sends twenty queued events in one request", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ body?: BodyInit | null }> = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ body: init?.body });
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  try {
    const batcher = createAnalyticsBatcher("/test-analytics");
    for (let index = 0; index < ANALYTICS_BATCH_MAX_EVENTS; index += 1) {
      await batcher.send({ event: `event_${index}`, properties: { index } });
    }
    assert.equal(requests.length, 1);
    const body = JSON.parse(String(requests[0].body)) as { events: unknown[] };
    assert.equal(body.events.length, ANALYTICS_BATCH_MAX_EVENTS);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the client batcher suppresses a repeated contextual event", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ body?: BodyInit | null }> = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ body: init?.body });
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  try {
    const batcher = createAnalyticsBatcher("/test-analytics");
    const event = { event: "page_viewed", properties: { page_path: "/tournaments" } };
    await batcher.send(event, { dedupeKey: "same-context" });
    await batcher.send(event, { dedupeKey: "same-context" });
    await batcher.flush();
    assert.equal(requests.length, 1);
    assert.equal((JSON.parse(String(requests[0].body)) as { event: string }).event, "page_viewed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an immediate conversion flushes an earlier queued funnel event first", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(String(init?.body));
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  try {
    const batcher = createAnalyticsBatcher("/test-analytics");
    await batcher.send({ event: "prompt_viewed", properties: {} });
    await batcher.send({ event: "activation_achieved", properties: {} }, { immediate: true });
    assert.deepEqual(requests.map((body) => (JSON.parse(body) as { event: string }).event), [
      "prompt_viewed",
      "activation_achieved",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("only repeatable view, impression, load, and legacy opened events are dedupe candidates", () => {
  assert.equal(isRepeatableViewEvent("tournament_detail_page_viewed"), true);
  assert.equal(isRepeatableViewEvent("hotel_cta_impression"), true);
  assert.equal(isRepeatableViewEvent("venue_map_loaded"), true);
  assert.equal(isRepeatableViewEvent("Venue Quick Check Opened"), true);
  assert.equal(isRepeatableViewEvent("weekend_planner_activation_achieved"), false);
  assert.equal(isRepeatableViewEvent("hotel_cta_clicked"), false);
});

test("analytics dedupe keys use URL paths without retaining query values", () => {
  const key = buildAnalyticsDedupeKey("ti", "page_viewed", {
    href: "https://www.tournamentinsights.com/weekend/private?token=secret#details",
  });
  assert.match(key, /\/weekend\/private/);
  assert.doesNotMatch(key, /token|secret|details/);
});

test("both analytics clients use the shared batcher and contextual deduplication", () => {
  for (const path of ["apps/ti-web/lib/analytics.ts", "apps/referee/lib/riAnalytics.ts"]) {
    const source = read(path);
    assert.match(source, /createAnalyticsBatcher\(\)/);
    assert.match(source, /buildAnalyticsDedupeKey/);
    assert.match(source, /isRepeatableViewEvent/);
    assert.doesNotMatch(source, /await fetch\("\/api\/analytics"/);
  }
});

test("both analytics APIs accept bounded batches and use multi-row inserts", () => {
  const tiRoute = read("apps/ti-web/app/api/analytics/route.ts");
  const riRoute = read("apps/referee/app/api/analytics/route.ts");
  assert.match(tiRoute, /normalizeAnalyticsRequestBody\(body\)/);
  assert.match(tiRoute, /insert\(mapEventRows\)/);
  assert.match(riRoute, /normalizeAnalyticsRequestBody\(body\)/);
  assert.match(riRoute, /insert\(rows\)/);
});

test("revenue-critical outbound persistence remains outside optional analytics batching", () => {
  for (const path of [
    "apps/ti-web/lib/lodging/hotelOutboundPersistence.ts",
    "apps/ti-web/app/go/camping/route.ts",
    "apps/ti-web/app/go/tournament/[slug]/route.ts",
  ]) {
    const source = read(path);
    assert.match(source, /ti_outbound_clicks/);
    assert.doesNotMatch(source, /analytics-batch/);
  }
});

test("analytics volume and index diagnostics are read-only and timeout bounded", () => {
  const source = read("scripts/analysis/analytics_write_volume_and_index_audit.sql");
  const executable = source.replace(/--.*$/gm, "");
  assert.match(executable, /begin read only;/i);
  assert.match(executable, /set local statement_timeout = '15s';/i);
  assert.match(executable, /set local lock_timeout = '2s';/i);
  assert.match(executable, /rollback;/i);
  assert.match(executable, /ti_map_events/);
  assert.match(executable, /ri_analytics_events/);
  assert.match(executable, /ti_outbound_clicks/);
  assert.doesNotMatch(executable, /\b(create|alter|drop|delete|update|insert|vacuum|analyze|truncate)\b/i);
});
