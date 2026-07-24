import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeReturnTo } from "./returnTo";

test("sanitizeReturnTo preserves safe relative urls with query strings", () => {
  assert.equal(
    sanitizeReturnTo("/weekend-planner?planner_session_id=11111111-1111-4111-8111-111111111111&planner_auth=1"),
    "/weekend-planner?planner_session_id=11111111-1111-4111-8111-111111111111&planner_auth=1",
  );
});

test("sanitizeReturnTo rejects external and protocol-relative paths", () => {
  assert.equal(sanitizeReturnTo("https://evil.example/path", "/account"), "/account");
  assert.equal(sanitizeReturnTo("//evil.example/path", "/account"), "/account");
});
