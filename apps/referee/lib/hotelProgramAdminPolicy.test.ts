import test from "node:test";
import assert from "node:assert/strict";

import type { HotelPlannerFeeConfigurationKey, StoredTournamentHotelProgram } from "../../../packages/lib/hotel-program";
import { planHotelProgramMutation } from "./hotelProgramAdminPolicy";

const tournamentId = "11111111-1111-4111-8111-111111111111";
const currentVersion = "22222222-2222-4222-8222-222222222222";
const unavailable = {
  ti_revenue_500: false,
  ti_revenue_1000: false,
  tournament_support_500: false,
  tournament_support_1000: false,
} satisfies Record<HotelPlannerFeeConfigurationKey, boolean>;
const available = { ...unavailable, ti_revenue_500: true, tournament_support_500: true };

test("standard/not-enrolled with no row is a no-op", () => {
  const plan = planHotelProgramMutation({
    tournamentId,
    current: null,
    request: { programType: "standard", status: "not_enrolled", rateCents: null, confirmEconomicChange: false },
    availability: unavailable,
  });
  assert.equal(plan.kind, "noop");
});

test("rejects an unknown program value at the server policy boundary", () => {
  const plan = planHotelProgramMutation({
    tournamentId,
    current: null,
    request: { programType: "unknown" as never, status: "pending", rateCents: 500, confirmEconomicChange: false },
    availability: unavailable,
  });
  assert.equal(plan.kind, "invalid");
});

test("pending and paused configurations remain standard at runtime", () => {
  for (const status of ["pending", "paused"] as const) {
    const plan = planHotelProgramMutation({
      tournamentId,
      current: null,
      request: { programType: "ti_revenue", status, rateCents: 500, confirmEconomicChange: false },
      availability: unavailable,
    });
    assert.equal(plan.kind, "save");
    if (plan.kind === "save") assert.equal(plan.proposedEffective.programType, "standard");
  }
});

test("active fee configuration requires a trusted configured target", () => {
  const plan = planHotelProgramMutation({
    tournamentId,
    current: null,
    request: { programType: "ti_revenue", status: "active", rateCents: 500, confirmEconomicChange: true },
    availability: unavailable,
  });
  assert.equal(plan.kind, "invalid");
});

test("entering active fee routing requires explicit economic confirmation", () => {
  const first = planHotelProgramMutation({
    tournamentId,
    current: null,
    request: { programType: "tournament_support", status: "active", rateCents: 500, confirmEconomicChange: false },
    availability: available,
    hasApprovedTournamentSupportEnrollment: true,
  });
  assert.equal(first.kind, "confirmation_required");
  const confirmed = planHotelProgramMutation({
    tournamentId,
    current: null,
    request: { programType: "tournament_support", status: "active", rateCents: 500, confirmEconomicChange: true },
    availability: available,
    hasApprovedTournamentSupportEnrollment: true,
  });
  assert.equal(confirmed.kind, "save");
  if (confirmed.kind === "save") {
    assert.equal(confirmed.proposedEffective.beneficiaryId, tournamentId);
    assert.equal(confirmed.proposedEffective.showTournamentSupportDisclosure, true);
  }
});

test("active Tournament Support requires approved same-rate director enrollment", () => {
  const blocked = planHotelProgramMutation({
    tournamentId,
    current: null,
    request: { programType: "tournament_support", status: "active", rateCents: 500, confirmEconomicChange: true },
    availability: available,
    hasApprovedTournamentSupportEnrollment: false,
  });
  assert.equal(blocked.kind, "invalid");

  const grandfathered: StoredTournamentHotelProgram = {
    tournamentId,
    programType: "tournament_support",
    rateCents: 500,
    status: "active",
    configurationVersion: currentVersion,
  };
  const unchanged = planHotelProgramMutation({
    tournamentId,
    current: grandfathered,
    request: { programType: "tournament_support", status: "active", rateCents: 500, confirmEconomicChange: false },
    availability: available,
    hasApprovedTournamentSupportEnrollment: false,
  });
  assert.equal(unchanged.kind, "noop");
});

test("no-op preserves the current configuration identity", () => {
  const current: StoredTournamentHotelProgram = {
    tournamentId,
    programType: "ti_revenue",
    rateCents: 500,
    status: "active",
    configurationVersion: currentVersion,
  };
  const plan = planHotelProgramMutation({
    tournamentId,
    current,
    request: { programType: "ti_revenue", status: "active", rateCents: 500, confirmEconomicChange: false },
    availability: available,
  });
  assert.equal(plan.kind, "noop");
});

test("an active stored row is not accepted as a no-op after its trusted target becomes unavailable", () => {
  const current: StoredTournamentHotelProgram = {
    tournamentId,
    programType: "ti_revenue",
    rateCents: 500,
    status: "active",
    configurationVersion: currentVersion,
  };
  const plan = planHotelProgramMutation({
    tournamentId,
    current,
    request: { programType: "ti_revenue", status: "active", rateCents: 500, confirmEconomicChange: false },
    availability: unavailable,
  });
  assert.equal(plan.kind, "invalid");
});

test("returning active routing to standard also requires confirmation", () => {
  const current: StoredTournamentHotelProgram = {
    tournamentId,
    programType: "ti_revenue",
    rateCents: 500,
    status: "active",
    configurationVersion: currentVersion,
  };
  const plan = planHotelProgramMutation({
    tournamentId,
    current,
    request: { programType: "standard", status: "not_enrolled", rateCents: null, confirmEconomicChange: false },
    availability: available,
  });
  assert.equal(plan.kind, "confirmation_required");
});
