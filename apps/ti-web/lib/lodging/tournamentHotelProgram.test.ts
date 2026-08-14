import test from "node:test";
import assert from "node:assert/strict";

import {
  STANDARD_HOTEL_PROGRAM_SNAPSHOT,
  hotelProgramSnapshotColumns,
  resolveHotelProgramSnapshot,
  resolveHotelProgramSnapshotSafely,
  selectHotelHandoffMode,
  validateHotelProgramSnapshot,
  type HotelProgramSnapshot,
} from "./tournamentHotelProgram";

test("exports one frozen canonical standard snapshot", async () => {
  assert.equal(Object.isFrozen(STANDARD_HOTEL_PROGRAM_SNAPSHOT), true);
  assert.deepEqual(STANDARD_HOTEL_PROGRAM_SNAPSHOT, {
    programType: "standard",
    rateCents: 0,
    beneficiaryType: "none",
    beneficiaryId: null,
    version: "hp_standard_v1",
  });
  assert.equal(
    await resolveHotelProgramSnapshot({ tournamentId: null, sourcePageType: "book_travel" }),
    STANDARD_HOTEL_PROGRAM_SNAPSHOT
  );
});

test("validates every supported program shape and rejects mixed economics", () => {
  const ti: HotelProgramSnapshot = {
    programType: "ti_revenue",
    rateCents: 500,
    beneficiaryType: "ti",
    beneficiaryId: null,
    version: "hp_ti_500_v1",
  };
  const tournament: HotelProgramSnapshot = {
    programType: "tournament_support",
    rateCents: 1000,
    beneficiaryType: "tournament",
    beneficiaryId: "11111111-1111-4111-8111-111111111111",
    version: "hp_tournament_1000_v1",
  };
  assert.equal(validateHotelProgramSnapshot(ti), ti);
  assert.equal(validateHotelProgramSnapshot(tournament), tournament);
  assert.throws(() => validateHotelProgramSnapshot({ ...ti, beneficiaryType: "none" }));
  assert.throws(() => validateHotelProgramSnapshot({ ...tournament, beneficiaryId: null }));
  assert.throws(() => validateHotelProgramSnapshot({ ...STANDARD_HOTEL_PROGRAM_SNAPSHOT, version: " " }));
});

test("uses canonical standard snapshot when the resolver throws", async () => {
  const previousWarn = console.warn;
  console.warn = () => undefined;
  try {
    const result = await resolveHotelProgramSnapshotSafely(
      { tournamentId: null, sourcePageType: "other" },
      async () => {
        throw new Error("resolver unavailable");
      }
    );
    assert.equal(result.usedFallback, true);
    assert.equal(result.snapshot, STANDARD_HOTEL_PROGRAM_SNAPSHOT);
  } finally {
    console.warn = previousWarn;
  }
});

test("requires persisted attribution for fee handoffs while standard traffic stays fail-open", () => {
  const fee: HotelProgramSnapshot = {
    programType: "ti_revenue",
    rateCents: 500,
    beneficiaryType: "ti",
    beneficiaryId: null,
    version: "hp_ti_500_v1",
  };
  assert.equal(selectHotelHandoffMode({ snapshot: STANDARD_HOTEL_PROGRAM_SNAPSHOT, persistenceSucceeded: false, standardTargetAvailable: true }), "standard_redirect");
  assert.equal(selectHotelHandoffMode({ snapshot: fee, persistenceSucceeded: true, standardTargetAvailable: true }), "fee_redirect");
  assert.equal(selectHotelHandoffMode({ snapshot: fee, persistenceSucceeded: false, standardTargetAvailable: true }), "standard_redirect");
  assert.equal(selectHotelHandoffMode({ snapshot: fee, persistenceSucceeded: false, standardTargetAvailable: false }), "retryable_error");
  assert.deepEqual(hotelProgramSnapshotColumns(STANDARD_HOTEL_PROGRAM_SNAPSHOT), {
    hotel_program_type: "standard",
    hotel_program_rate_cents: 0,
    hotel_program_beneficiary_type: "none",
    hotel_program_beneficiary_id: null,
    hotel_program_version: "hp_standard_v1",
  });
});
