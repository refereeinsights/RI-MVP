import assert from "node:assert/strict";
import test from "node:test";

import { buildRiAuthEmailRedirect } from "./authEmailRedirect";

test("builds a query-bearing RI auth-email callback without credentials", () => {
  for (const origin of ["http://localhost:3000", "https://www.refereeinsights.com"]) {
    const redirect = new URL(buildRiAuthEmailRedirect(origin));
    assert.equal(redirect.origin, origin);
    assert.equal(redirect.pathname, "/auth/confirm");
    assert.equal(redirect.searchParams.get("auth_callback"), "1");
    assert.equal(redirect.searchParams.has("token_hash"), false);
    assert.equal(redirect.searchParams.has("code"), false);
  }
});
