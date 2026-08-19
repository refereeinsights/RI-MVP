import assert from "node:assert/strict";
import test from "node:test";

import { buildCorralioRecoveryRedirect, parseCorralioSiteOrigin } from "./siteOrigin";

test("accepts only configured HTTP(S) origins", () => {
  assert.equal(parseCorralioSiteOrigin("http://localhost:3002/"), "http://localhost:3002");
  assert.equal(parseCorralioSiteOrigin("https://corralio.com"), "https://corralio.com");
  for (const invalid of [undefined, "", "corralio.com", "https://corralio.com/path", "https://corralio.com?x=1", "ftp://corralio.com"]) {
    assert.throws(() => parseCorralioSiteOrigin(invalid));
  }
});

test("builds the trusted Corralio recovery callback without credentials", () => {
  const redirect = new URL(buildCorralioRecoveryRedirect("https://corralio.com"));
  assert.equal(redirect.origin, "https://corralio.com");
  assert.equal(redirect.pathname, "/auth/confirm");
  assert.equal(redirect.searchParams.get("brand"), "corralio");
  assert.equal(redirect.searchParams.get("flow"), "recovery");
  assert.equal(redirect.searchParams.has("token_hash"), false);
  assert.equal(redirect.searchParams.has("code"), false);
});
