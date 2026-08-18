import assert from "node:assert/strict";
import test from "node:test";

import { buildCorralioAuthEmailRedirect } from "./authEmailRedirect";

test("builds a query-bearing Corralio auth-email callback", () => {
  for (const origin of ["http://localhost:3002", "https://corralio.com"]) {
    const redirect = new URL(buildCorralioAuthEmailRedirect(origin));
    assert.equal(redirect.origin, origin);
    assert.equal(redirect.pathname, "/auth/confirm");
    assert.equal(redirect.searchParams.get("brand"), "corralio");
    assert.equal(redirect.searchParams.has("token_hash"), false);
    assert.equal(redirect.searchParams.has("code"), false);
  }
});
