import assert from "node:assert/strict";
import test from "node:test";

import { isCorralioCronAuthorized } from "./cronAuth";

test("cron authentication requires the exact bearer secret", () => {
  const request = new Request("https://corralio.test/api/cron/schedule-refresh", {
    headers: { authorization: "Bearer expected-secret" },
  });
  assert.equal(isCorralioCronAuthorized(request, "expected-secret"), true);
  assert.equal(isCorralioCronAuthorized(request, "wrong-secret"), false);
  assert.equal(isCorralioCronAuthorized(request, ""), false);
});

test("query parameters and Vercel-like headers do not bypass bearer authentication", () => {
  const request = new Request("https://corralio.test/api/cron/schedule-refresh?token=expected-secret", {
    headers: { "x-vercel-cron": "1" },
  });
  assert.equal(isCorralioCronAuthorized(request, "expected-secret"), false);
});
