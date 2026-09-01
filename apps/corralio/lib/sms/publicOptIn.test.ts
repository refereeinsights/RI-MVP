import assert from "node:assert/strict";
import test from "node:test";

import { isPublicSmsOptInEnabled } from "./publicOptIn";

test("public SMS opt-in is fail-closed unless explicitly enabled", () => {
  assert.equal(isPublicSmsOptInEnabled(undefined), false);
  assert.equal(isPublicSmsOptInEnabled(""), false);
  assert.equal(isPublicSmsOptInEnabled("TRUE"), false);
  assert.equal(isPublicSmsOptInEnabled("false"), false);
  assert.equal(isPublicSmsOptInEnabled("true"), true);
});
