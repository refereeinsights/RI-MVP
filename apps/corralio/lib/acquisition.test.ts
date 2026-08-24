import assert from "node:assert/strict";
import test from "node:test";

import {
  TI_WEEKEND_PLANNER_PROVENANCE,
  resolveAcquisitionProvenanceCookie,
} from "./acquisition";

test("recognizes only the TI Weekend Planner acquisition cookie", () => {
  assert.equal(
    resolveAcquisitionProvenanceCookie(TI_WEEKEND_PLANNER_PROVENANCE),
    TI_WEEKEND_PLANNER_PROVENANCE,
  );
  assert.equal(resolveAcquisitionProvenanceCookie("direct"), null);
  assert.equal(resolveAcquisitionProvenanceCookie("TI_WEEKEND_PLANNER_OPT_IN"), null);
  assert.equal(resolveAcquisitionProvenanceCookie(""), null);
  assert.equal(resolveAcquisitionProvenanceCookie(null), null);
  assert.equal(resolveAcquisitionProvenanceCookie(undefined), null);
});
