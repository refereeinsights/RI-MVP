import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
const connectedSourceUi = readFileSync(
  new URL("../../app/components/ConnectedScheduleList.tsx", import.meta.url),
  "utf8",
);

test("ordinary connected-source payloads contain safe metadata but never source_url", () => {
  const sourceSelect = pageSource.match(/\.from\("corralio_schedule_sources"\)[\s\S]*?\.select\("([^"]+)"\)/)?.[1];
  assert.ok(sourceSelect, "expected an explicit schedule-source select");
  assert.match(sourceSelect, /\bsport\b/);
  assert.doesNotMatch(sourceSelect, /source_url/i);
  assert.doesNotMatch(connectedSourceUi, /sourceUrl:\s*string/);
  assert.match(connectedSourceUi, /defaultValue=\{source\.sport \?\? ""\}/);
  assert.doesNotMatch(connectedSourceUi, /defaultValue=\{source\.(?:source)?url/i);
});
