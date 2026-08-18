import test from "node:test";
import assert from "node:assert/strict";

import {
  STANDARD_HOTEL_PROGRAM_SNAPSHOT,
  hotelProgramSnapshotColumns,
  resolveHotelProgramSnapshot,
  resolveHotelProgramSnapshotSafely,
  selectHotelHandoffMode,
  validateHotelProgramSnapshot,
  type HotelProgramRepository,
  type HotelProgramSnapshot,
} from "./tournamentHotelProgram";

const tournamentId = "11111111-1111-4111-8111-111111111111";
const venueId = "22222222-2222-4222-8222-222222222222";
const configurationVersion = "33333333-3333-4333-8333-333333333333";

function repository(overrides: Partial<HotelProgramRepository> = {}): HotelProgramRepository {
  return {
    async findConfiguration() {
      return { data: null, error: null };
    },
    async hasConfirmedVenueAssociation() {
      return { trusted: true, error: null };
    },
    ...overrides,
  };
}

test("exports one frozen canonical standard snapshot", async () => {
  assert.equal(Object.isFrozen(STANDARD_HOTEL_PROGRAM_SNAPSHOT), true);
  assert.deepEqual(STANDARD_HOTEL_PROGRAM_SNAPSHOT, {
    programType: "standard",
    rateCents: 0,
    beneficiaryType: "none",
    beneficiaryId: null,
    version: "hp_standard_v1",
  });
  const result = await resolveHotelProgramSnapshot({ tournamentId: null, venueId: null, sourcePageType: "book_travel" });
  assert.equal(result.snapshot, STANDARD_HOTEL_PROGRAM_SNAPSHOT);
  assert.equal(result.fallbackReason, "untrusted_context");
});

test("validates every supported snapshot shape and rejects mixed economics", () => {
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
    beneficiaryId: tournamentId,
    version: "hp_tournament_1000_v1",
  };
  assert.equal(validateHotelProgramSnapshot(ti), ti);
  assert.equal(validateHotelProgramSnapshot(tournament), tournament);
  assert.throws(() => validateHotelProgramSnapshot({ ...ti, beneficiaryType: "none" }));
  assert.throws(() => validateHotelProgramSnapshot({ ...tournament, beneficiaryId: null }));
  assert.throws(() => validateHotelProgramSnapshot({ ...STANDARD_HOTEL_PROGRAM_SNAPSHOT, version: " " }));
});

test("resolves an active fee program only for a confirmed tournament venue and trusted fee target", async () => {
  const result = await resolveHotelProgramSnapshot(
    { tournamentId, venueId, sourcePageType: "tournament_hotels" },
    {
      repository: repository({
        async findConfiguration() {
          return {
            data: { tournamentId, programType: "tournament_support", rateCents: 500, status: "active", configurationVersion },
            error: null,
          };
        },
      }),
      getFeeTarget: () => "https://www.hotelplanner.com/fee",
    }
  );
  assert.deepEqual(result.snapshot, {
    programType: "tournament_support",
    rateCents: 500,
    beneficiaryType: "tournament",
    beneficiaryId: tournamentId,
    version: "hp_cfg_33333333333343338333333333333333",
  });
  assert.equal(result.showTournamentSupportDisclosure, true);
  assert.equal(result.feeTargetAvailable, true);
});

test("resolves a tournament-only program only with verified server context", async () => {
  const activeConfiguration = {
    tournamentId,
    programType: "tournament_support" as const,
    rateCents: 500 as const,
    status: "active" as const,
    configurationVersion,
  };
  const trusted = await resolveHotelProgramSnapshot(
    { tournamentId, venueId: null, sourcePageType: "tournament_hotels", tournamentContextTrusted: true },
    {
      repository: repository({
        async findConfiguration() { return { data: activeConfiguration, error: null }; },
        async hasConfirmedVenueAssociation() { throw new Error("venue lookup must not run"); },
      }),
      getFeeTarget: () => "https://www.hotelplanner.com/fee",
    }
  );
  assert.equal(trusted.snapshot.programType, "tournament_support");

  const untrusted = await resolveHotelProgramSnapshot(
    { tournamentId, venueId: null, sourcePageType: "tournament_hotels" },
    {
      repository: repository({ async findConfiguration() { return { data: activeConfiguration, error: null }; } }),
      getFeeTarget: () => "https://www.hotelplanner.com/fee",
    }
  );
  assert.equal(untrusted.snapshot, STANDARD_HOTEL_PROGRAM_SNAPSHOT);
  assert.equal(untrusted.fallbackReason, "untrusted_context");
});

test("tournament support remains eligible through the event and becomes standard after completion", async () => {
  const dependencies = {
    repository: repository({
      async findConfiguration() {
        return {
          data: { tournamentId, programType: "tournament_support" as const, rateCents: 500 as const, status: "active" as const, configurationVersion },
          error: null,
        };
      },
    }),
    getFeeTarget: () => "https://www.hotelplanner.com/fee",
  };
  const during = await resolveHotelProgramSnapshot(
    { tournamentId, venueId: null, sourcePageType: "tournament_hotels", tournamentContextTrusted: true, tournamentCompleted: false },
    dependencies
  );
  assert.equal(during.snapshot.programType, "tournament_support");

  const after = await resolveHotelProgramSnapshot(
    { tournamentId, venueId: null, sourcePageType: "tournament_hotels", tournamentContextTrusted: true, tournamentCompleted: true },
    dependencies
  );
  assert.deepEqual(after.snapshot, STANDARD_HOTEL_PROGRAM_SNAPSHOT);
  assert.equal(after.fallbackReason, "tournament_completed");
});

test("falls back to standard for unconfirmed context, inactive config, or missing fee target", async () => {
  const configuration = {
    tournamentId,
    programType: "ti_revenue" as const,
    rateCents: 1000 as const,
    status: "active" as const,
    configurationVersion,
  };
  const untrusted = await resolveHotelProgramSnapshot(
    { tournamentId, venueId, sourcePageType: "venue" },
    {
      repository: repository({
        async findConfiguration() { return { data: configuration, error: null }; },
        async hasConfirmedVenueAssociation() { return { trusted: false, error: null }; },
      }),
      getFeeTarget: () => "https://www.hotelplanner.com/fee",
    }
  );
  assert.deepEqual(untrusted.snapshot, STANDARD_HOTEL_PROGRAM_SNAPSHOT);
  assert.equal(untrusted.fallbackReason, "untrusted_context");

  const missingTarget = await resolveHotelProgramSnapshot(
    { tournamentId, venueId, sourcePageType: "venue" },
    { repository: repository({ async findConfiguration() { return { data: configuration, error: null }; } }), getFeeTarget: () => null }
  );
  assert.deepEqual(missingTarget.snapshot, STANDARD_HOTEL_PROGRAM_SNAPSHOT);
  assert.equal(missingTarget.fallbackReason, "missing_fee_configuration");
});

test("uses canonical standard snapshot when the resolver throws", async () => {
  const previousWarn = console.warn;
  console.warn = () => undefined;
  try {
    const result = await resolveHotelProgramSnapshotSafely(
      { tournamentId, venueId, sourcePageType: "other" },
      async () => { throw new Error("resolver unavailable"); }
    );
    assert.equal(result.fallbackReason, "resolver_failure");
    assert.equal(result.snapshot, STANDARD_HOTEL_PROGRAM_SNAPSHOT);
  } finally {
    console.warn = previousWarn;
  }
});

test("requires persisted attribution and a trusted target for fee handoffs while standard stays fail-open", () => {
  const fee: HotelProgramSnapshot = {
    programType: "ti_revenue",
    rateCents: 500,
    beneficiaryType: "ti",
    beneficiaryId: null,
    version: "hp_ti_500_v1",
  };
  assert.equal(selectHotelHandoffMode({ snapshot: STANDARD_HOTEL_PROGRAM_SNAPSHOT, persistenceSucceeded: false, standardTargetAvailable: true, feeTargetAvailable: false }), "standard_redirect");
  assert.equal(selectHotelHandoffMode({ snapshot: fee, persistenceSucceeded: true, standardTargetAvailable: true, feeTargetAvailable: true }), "fee_redirect");
  assert.equal(selectHotelHandoffMode({ snapshot: fee, persistenceSucceeded: false, standardTargetAvailable: true, feeTargetAvailable: true }), "standard_redirect");
  assert.equal(selectHotelHandoffMode({ snapshot: fee, persistenceSucceeded: true, standardTargetAvailable: true, feeTargetAvailable: false }), "standard_redirect");
  assert.equal(selectHotelHandoffMode({ snapshot: fee, persistenceSucceeded: false, standardTargetAvailable: false, feeTargetAvailable: true }), "retryable_error");
  assert.deepEqual(hotelProgramSnapshotColumns(STANDARD_HOTEL_PROGRAM_SNAPSHOT), {
    hotel_program_type: "standard",
    hotel_program_rate_cents: 0,
    hotel_program_beneficiary_type: "none",
    hotel_program_beneficiary_id: null,
    hotel_program_version: "hp_standard_v1",
  });
});
