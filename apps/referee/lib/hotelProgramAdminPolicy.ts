import {
  HOTEL_PROGRAM_RATES,
  HOTEL_PROGRAM_STATUSES,
  STORED_HOTEL_PROGRAM_TYPES,
  resolveEffectiveHotelProgram,
  type EffectiveHotelProgram,
  type HotelPlannerFeeConfigurationKey,
  type HotelProgramRateCents,
  type HotelProgramStatus,
  type StoredHotelProgramType,
  type StoredTournamentHotelProgram,
} from "../../../packages/lib/hotel-program";

export type HotelProgramAdminRequest = {
  programType: "standard" | StoredHotelProgramType;
  status: "not_enrolled" | HotelProgramStatus;
  rateCents: HotelProgramRateCents | null;
  confirmEconomicChange: boolean;
};

export type HotelProgramMutationPlan =
  | { kind: "invalid"; message: string }
  | { kind: "noop"; currentEffective: EffectiveHotelProgram }
  | {
      kind: "confirmation_required";
      message: string;
      currentEffective: EffectiveHotelProgram;
      proposedEffective: EffectiveHotelProgram;
    }
  | {
      kind: "delete";
      currentEffective: EffectiveHotelProgram;
      proposedEffective: EffectiveHotelProgram;
    }
  | {
      kind: "save";
      configuration: Omit<StoredTournamentHotelProgram, "configurationVersion">;
      currentEffective: EffectiveHotelProgram;
      proposedEffective: EffectiveHotelProgram;
    };

function storedFieldsEqual(
  current: StoredTournamentHotelProgram | null,
  requested: Omit<StoredTournamentHotelProgram, "configurationVersion"> | null
) {
  if (!current || !requested) return current === null && requested === null;
  return (
    current.tournamentId === requested.tournamentId &&
    current.programType === requested.programType &&
    current.rateCents === requested.rateCents &&
    current.status === requested.status
  );
}

function economicsKey(value: EffectiveHotelProgram) {
  return [value.programType, value.rateCents, value.beneficiaryType, value.beneficiaryId].join("|");
}

export function planHotelProgramMutation(input: {
  tournamentId: string;
  current: StoredTournamentHotelProgram | null;
  request: HotelProgramAdminRequest;
  availability: Record<HotelPlannerFeeConfigurationKey, boolean>;
  hasApprovedTournamentSupportEnrollment?: boolean;
}): HotelProgramMutationPlan {
  const available = (key: HotelPlannerFeeConfigurationKey) => Boolean(input.availability[key]);
  const currentEffective = resolveEffectiveHotelProgram({
    tournamentId: input.tournamentId,
    trustedContext: true,
    configuration: input.current,
    isFeeConfigurationAvailable: available,
  });

  if (
    input.request.programType !== "standard" &&
    !STORED_HOTEL_PROGRAM_TYPES.includes(input.request.programType as StoredHotelProgramType)
  ) {
    return { kind: "invalid", message: "Choose Standard, TI Revenue, or Tournament Support." };
  }

  if (input.request.programType === "standard") {
    if (input.request.status !== "not_enrolled") {
      return { kind: "invalid", message: "Standard must use Not enrolled status." };
    }
    if (input.request.rateCents !== null) {
      return { kind: "invalid", message: "Standard must not include a fee rate." };
    }
    if (!input.current) return { kind: "noop", currentEffective };
    const proposedEffective = resolveEffectiveHotelProgram({
      tournamentId: input.tournamentId,
      trustedContext: true,
      configuration: null,
      isFeeConfigurationAvailable: available,
    });
    if (economicsKey(currentEffective) !== economicsKey(proposedEffective) && !input.request.confirmEconomicChange) {
      return {
        kind: "confirmation_required",
        message: "Confirm the change from fee-enabled routing to Standard / no fee.",
        currentEffective,
        proposedEffective,
      };
    }
    return { kind: "delete", currentEffective, proposedEffective };
  }

  if (!HOTEL_PROGRAM_STATUSES.includes(input.request.status as HotelProgramStatus)) {
    return { kind: "invalid", message: "Choose Pending, Active, or Paused for a fee program." };
  }
  if (input.request.rateCents === null || !HOTEL_PROGRAM_RATES.includes(input.request.rateCents)) {
    return { kind: "invalid", message: "Choose a supported $5 or $10 rate." };
  }

  const requested: Omit<StoredTournamentHotelProgram, "configurationVersion"> = {
    tournamentId: input.tournamentId,
    programType: input.request.programType,
    rateCents: input.request.rateCents,
    status: input.request.status as HotelProgramStatus,
  };
  const preservesExistingActiveTournamentSupport =
    requested.programType === "tournament_support" &&
    requested.status === "active" &&
    input.current?.programType === "tournament_support" &&
    input.current.status === "active" &&
    input.current.rateCents === requested.rateCents;
  if (
    requested.programType === "tournament_support" &&
    requested.status === "active" &&
    !preservesExistingActiveTournamentSupport &&
    !input.hasApprovedTournamentSupportEnrollment
  ) {
    return {
      kind: "invalid",
      message: "Active Tournament Support requires an approved director enrollment for this tournament and exact rate.",
    };
  }
  const requestedConfigurationKey = `${requested.programType}_${requested.rateCents}` as HotelPlannerFeeConfigurationKey;
  if (requested.status === "active" && !available(requestedConfigurationKey)) {
    return { kind: "invalid", message: "Active fee routing requires a trusted server-side HotelPlanner configuration." };
  }
  if (storedFieldsEqual(input.current, requested)) return { kind: "noop", currentEffective };

  const proposedWithVersion: StoredTournamentHotelProgram = {
    ...requested,
    configurationVersion: input.current?.configurationVersion ?? "11111111-1111-4111-8111-111111111111",
  };
  const proposedEffective = resolveEffectiveHotelProgram({
    tournamentId: input.tournamentId,
    trustedContext: true,
    configuration: proposedWithVersion,
    isFeeConfigurationAvailable: available,
  });
  if (economicsKey(currentEffective) !== economicsKey(proposedEffective) && !input.request.confirmEconomicChange) {
    return {
      kind: "confirmation_required",
      message: "Confirm this change to effective hotel booking economics.",
      currentEffective,
      proposedEffective,
    };
  }
  return { kind: "save", configuration: requested, currentEffective, proposedEffective };
}
