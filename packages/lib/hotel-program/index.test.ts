import test from "node:test";
import assert from "node:assert/strict";

import {
  getHotelPlannerFeeTarget,
  hotelPlannerFeeConfigurationAvailability,
  resolveEffectiveHotelProgram,
  type StoredTournamentHotelProgram,
} from "./index";

const tournamentId = "11111111-1111-4111-8111-111111111111";
const configurationVersion = "22222222-2222-4222-8222-222222222222";
const configuration = (overrides: Partial<StoredTournamentHotelProgram> = {}): StoredTournamentHotelProgram => ({
  tournamentId,
  programType: "ti_revenue",
  rateCents: 500,
  status: "active",
  configurationVersion,
  ...overrides,
});

test("accepts only trusted HTTPS HotelPlanner fee targets", () => {
  const env = { HOTELPLANNER_TI_REVENUE_500_BASE_URL: "https://ti-five.hotelplanner.com/" };
  assert.equal(getHotelPlannerFeeTarget("ti_revenue_500", env), "https://ti-five.hotelplanner.com");
  assert.equal(getHotelPlannerFeeTarget("ti_revenue_500", { HOTELPLANNER_TI_REVENUE_500_BASE_URL: "http://hotelplanner.com" }), null);
  assert.equal(getHotelPlannerFeeTarget("ti_revenue_500", { HOTELPLANNER_TI_REVENUE_500_BASE_URL: "https://example.com" }), null);
  assert.equal(getHotelPlannerFeeTarget("ti_revenue_500", { HOTELPLANNER_TI_REVENUE_500_BASE_URL: "https://user:pass@hotelplanner.com" }), null);
  assert.equal(hotelPlannerFeeConfigurationAvailability(env).ti_revenue_500, true);
});

test("uses standard for absent, pending, paused, untrusted, and unavailable configurations", () => {
  const available = () => true;
  assert.equal(resolveEffectiveHotelProgram({ tournamentId, trustedContext: true, configuration: null, isFeeConfigurationAvailable: available }).programType, "standard");
  assert.equal(resolveEffectiveHotelProgram({ tournamentId, trustedContext: true, configuration: configuration({ status: "pending" }), isFeeConfigurationAvailable: available }).fallbackReason, "pending");
  assert.equal(resolveEffectiveHotelProgram({ tournamentId, trustedContext: true, configuration: configuration({ status: "paused" }), isFeeConfigurationAvailable: available }).fallbackReason, "paused");
  assert.equal(resolveEffectiveHotelProgram({ tournamentId, trustedContext: false, configuration: configuration(), isFeeConfigurationAvailable: available }).fallbackReason, "untrusted_context");
  assert.equal(resolveEffectiveHotelProgram({ tournamentId, trustedContext: true, configuration: configuration(), isFeeConfigurationAvailable: () => false }).fallbackReason, "missing_fee_configuration");
});

test("derives TI and tournament economics only for active trusted available configurations", () => {
  const available = () => true;
  const ti = resolveEffectiveHotelProgram({ tournamentId, trustedContext: true, configuration: configuration(), isFeeConfigurationAvailable: available });
  assert.deepEqual(
    { type: ti.programType, rate: ti.rateCents, beneficiary: ti.beneficiaryType, id: ti.beneficiaryId, disclosure: ti.showTournamentSupportDisclosure },
    { type: "ti_revenue", rate: 500, beneficiary: "ti", id: null, disclosure: false }
  );
  const tournament = resolveEffectiveHotelProgram({
    tournamentId,
    trustedContext: true,
    configuration: configuration({ programType: "tournament_support", rateCents: 1000 }),
    isFeeConfigurationAvailable: available,
  });
  assert.deepEqual(
    { type: tournament.programType, rate: tournament.rateCents, beneficiary: tournament.beneficiaryType, id: tournament.beneficiaryId, disclosure: tournament.showTournamentSupportDisclosure },
    { type: "tournament_support", rate: 1000, beneficiary: "tournament", id: tournamentId, disclosure: true }
  );
  assert.equal(tournament.version, "hp_cfg_22222222222242228222222222222222");
});
