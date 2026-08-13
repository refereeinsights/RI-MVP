import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyAdminEmailSectionError,
  getAdminEmailCompleteDayWindows,
  loadAdminEmailSection,
  renderAdminEmailDegradedSections,
} from "./adminDashboardEmailReliability";

test("classifies PostgreSQL statement timeouts without exposing the message", () => {
  assert.equal(
    classifyAdminEmailSectionError({ code: "57014", message: "canceling statement due to statement timeout" }),
    "statement_timeout",
  );
});

test("isolates a failed report section and logs only its sanitized category", async () => {
  const entries: Array<Record<string, unknown>> = [];
  const result = await loadAdminEmailSection({
    section: "dashboard_tiles",
    requestId: "request-1",
    logger: (entry) => entries.push(entry),
    load: async () => {
      throw { code: "57014", message: "sensitive database detail" };
    },
  });

  assert.equal(result.value, null);
  assert.deepEqual(result.degraded, { section: "dashboard_tiles", category: "statement_timeout" });
  assert.equal(entries.length, 2);
  assert.equal(entries[1]?.error_category, "statement_timeout");
  assert.equal(JSON.stringify(entries).includes("sensitive database detail"), false);
});

test("returns successful values and can flag a returned unavailable summary", async () => {
  const healthy = await loadAdminEmailSection({
    section: "healthy",
    requestId: null,
    load: async () => ({ ok: true as const, count: 4 }),
  });
  const unavailable = await loadAdminEmailSection({
    section: "summary",
    requestId: null,
    load: async () => ({ ok: false as const, error: "statement timeout" }),
    degradedCategory: (value) => (value.ok ? null : classifyAdminEmailSectionError(value.error)),
  });

  assert.deepEqual(healthy.value, { ok: true, count: 4 });
  assert.equal(healthy.degraded, null);
  assert.deepEqual(unavailable.degraded, { section: "summary", category: "statement_timeout" });
});

test("one rejected section does not prevent parallel healthy sections from resolving", async () => {
  const [failed, healthy] = await Promise.all([
    loadAdminEmailSection({
      section: "failed",
      requestId: null,
      load: async () => {
        throw new Error("timeout");
      },
    }),
    loadAdminEmailSection({
      section: "healthy",
      requestId: null,
      load: async () => 42,
    }),
  ]);

  assert.equal(failed.value, null);
  assert.equal(healthy.value, 42);
  assert.equal(healthy.degraded, null);
});

test("renders a sanitized partial-report notice", () => {
  const html = renderAdminEmailDegradedSections([
    { section: "first_game<script>", category: "statement_timeout" },
  ]);
  assert.match(html, /Partial report/);
  assert.match(html, /first_game&lt;script&gt;/);
  assert.doesNotMatch(html, /first_game<script>/);
});

test("complete Pacific day windows remain correct across daylight-saving transitions", () => {
  const spring = getAdminEmailCompleteDayWindows(new Date("2026-03-09T15:00:00Z"), "America/Los_Angeles");
  assert.equal(spring.todayStart.toISOString(), "2026-03-09T07:00:00.000Z");
  assert.equal(spring.yesterdayStart.toISOString(), "2026-03-08T08:00:00.000Z");
  assert.equal(spring.todayStart.getTime() - spring.yesterdayStart.getTime(), 23 * 60 * 60 * 1000);

  const fall = getAdminEmailCompleteDayWindows(new Date("2026-11-02T15:00:00Z"), "America/Los_Angeles");
  assert.equal(fall.todayStart.toISOString(), "2026-11-02T08:00:00.000Z");
  assert.equal(fall.yesterdayStart.toISOString(), "2026-11-01T07:00:00.000Z");
  assert.equal(fall.todayStart.getTime() - fall.yesterdayStart.getTime(), 25 * 60 * 60 * 1000);
});
