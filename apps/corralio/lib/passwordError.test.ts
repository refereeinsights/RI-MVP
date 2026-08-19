import assert from "node:assert/strict";
import test from "node:test";

import { getCorralioPasswordUpdateError } from "./passwordError";

test("maps reauthentication and password-policy failures without returning raw errors", () => {
  assert.match(getCorralioPasswordUpdateError({ code: "reauthentication_needed" }), /session is no longer recent/i);
  assert.match(getCorralioPasswordUpdateError({ code: "weak_password" }), /stronger password/i);
  assert.equal(
    getCorralioPasswordUpdateError({ message: "sensitive provider detail" }),
    "We couldn’t update your password. Please try again.",
  );
});
