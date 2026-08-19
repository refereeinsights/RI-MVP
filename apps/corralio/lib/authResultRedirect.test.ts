import assert from "node:assert/strict";
import test from "node:test";

import { createCorralioAuthResultRedirect } from "./authResultRedirect";

test("auth result redirects stay relative to the browser-facing origin", () => {
  for (const path of [
    "/",
    "/?auth=invalid",
    "/?auth=unavailable",
    "/?auth=expired",
  ] as const) {
    const response = createCorralioAuthResultRedirect(path);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), path);
    assert.doesNotMatch(response.headers.get("location") ?? "", /0\.0\.0\.0|localhost|corralio\.com/);
  }
});

test("auth cookies remain attached to the same redirect response", () => {
  const response = createCorralioAuthResultRedirect("/");
  response.cookies.set("sb-test-auth-token", "session", { httpOnly: true, path: "/" });

  assert.equal(response.headers.get("location"), "/");
  assert.match(response.headers.get("set-cookie") ?? "", /sb-test-auth-token=session/);
  assert.match(response.headers.get("set-cookie") ?? "", /Path=\//);
});
