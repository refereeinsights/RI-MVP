export const HOTEL_PROGRAM_TYPES = ["standard", "ti_revenue", "tournament_support"] as const;
export type HotelProgramType = (typeof HOTEL_PROGRAM_TYPES)[number];

export const STORED_HOTEL_PROGRAM_TYPES = ["ti_revenue", "tournament_support"] as const;
export type StoredHotelProgramType = (typeof STORED_HOTEL_PROGRAM_TYPES)[number];

export const HOTEL_PROGRAM_STATUSES = ["pending", "active", "paused"] as const;
export type HotelProgramStatus = (typeof HOTEL_PROGRAM_STATUSES)[number];

export const HOTEL_PROGRAM_RATES = [500, 1000] as const;
export type HotelProgramRateCents = (typeof HOTEL_PROGRAM_RATES)[number];

export const HOTELPLANNER_FEE_CONFIGURATION_KEYS = [
  "ti_revenue_500",
  "ti_revenue_1000",
  "tournament_support_500",
  "tournament_support_1000",
] as const;
export type HotelPlannerFeeConfigurationKey = (typeof HOTELPLANNER_FEE_CONFIGURATION_KEYS)[number];

export type StoredTournamentHotelProgram = {
  tournamentId: string;
  programType: StoredHotelProgramType;
  rateCents: HotelProgramRateCents;
  status: HotelProgramStatus;
  configurationVersion: string;
};

export type HotelProgramFallbackReason =
  | "not_enrolled"
  | "pending"
  | "paused"
  | "tournament_completed"
  | "untrusted_context"
  | "invalid_configuration"
  | "missing_fee_configuration"
  | "resolver_failure"
  | null;

export type EffectiveHotelProgram = {
  programType: HotelProgramType;
  rateCents: 0 | HotelProgramRateCents;
  beneficiaryType: "none" | "ti" | "tournament";
  beneficiaryId: string | null;
  version: string;
  storedStatus: HotelProgramStatus | "not_enrolled";
  configurationIdentity: HotelPlannerFeeConfigurationKey | null;
  feeTargetAvailable: boolean;
  showTournamentSupportDisclosure: boolean;
  fallbackReason: HotelProgramFallbackReason;
};

export const STANDARD_EFFECTIVE_HOTEL_PROGRAM = Object.freeze({
  programType: "standard",
  rateCents: 0,
  beneficiaryType: "none",
  beneficiaryId: null,
  version: "hp_standard_v1",
  storedStatus: "not_enrolled",
  configurationIdentity: null,
  feeTargetAvailable: false,
  showTournamentSupportDisclosure: false,
  fallbackReason: "not_enrolled",
} as const satisfies EffectiveHotelProgram);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ENV_BY_CONFIGURATION_KEY: Record<HotelPlannerFeeConfigurationKey, string> = {
  ti_revenue_500: "HOTELPLANNER_TI_REVENUE_500_BASE_URL",
  ti_revenue_1000: "HOTELPLANNER_TI_REVENUE_1000_BASE_URL",
  tournament_support_500: "HOTELPLANNER_TOURNAMENT_SUPPORT_500_BASE_URL",
  tournament_support_1000: "HOTELPLANNER_TOURNAMENT_SUPPORT_1000_BASE_URL",
};

export function hotelPlannerFeeConfigurationKey(
  programType: StoredHotelProgramType,
  rateCents: HotelProgramRateCents
): HotelPlannerFeeConfigurationKey {
  return `${programType}_${rateCents}` as HotelPlannerFeeConfigurationKey;
}

export function isValidStoredHotelProgram(value: StoredTournamentHotelProgram) {
  return (
    UUID_RE.test(value.tournamentId) &&
    STORED_HOTEL_PROGRAM_TYPES.includes(value.programType) &&
    HOTEL_PROGRAM_RATES.includes(value.rateCents) &&
    HOTEL_PROGRAM_STATUSES.includes(value.status) &&
    UUID_RE.test(value.configurationVersion)
  );
}

export function getHotelPlannerFeeTarget(
  key: HotelPlannerFeeConfigurationKey | null,
  env: Record<string, string | undefined> = process.env
): string | null {
  if (!key || !HOTELPLANNER_FEE_CONFIGURATION_KEYS.includes(key)) return null;
  const raw = String(env[ENV_BY_CONFIGURATION_KEY[key]] ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "hotelplanner.com" && !hostname.endsWith(".hotelplanner.com")) return null;
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function hotelPlannerFeeConfigurationAvailability(
  env: Record<string, string | undefined> = process.env
): Record<HotelPlannerFeeConfigurationKey, boolean> {
  return Object.fromEntries(
    HOTELPLANNER_FEE_CONFIGURATION_KEYS.map((key) => [key, Boolean(getHotelPlannerFeeTarget(key, env))])
  ) as Record<HotelPlannerFeeConfigurationKey, boolean>;
}

function standardFallback(
  storedStatus: EffectiveHotelProgram["storedStatus"],
  fallbackReason: Exclude<HotelProgramFallbackReason, null>,
  configurationIdentity: HotelPlannerFeeConfigurationKey | null = null
): EffectiveHotelProgram {
  return {
    ...STANDARD_EFFECTIVE_HOTEL_PROGRAM,
    storedStatus,
    configurationIdentity,
    fallbackReason,
  };
}

export function resolveEffectiveHotelProgram(input: {
  tournamentId: string | null;
  trustedContext: boolean;
  configuration: StoredTournamentHotelProgram | null;
  tournamentCompleted?: boolean;
  isFeeConfigurationAvailable: (key: HotelPlannerFeeConfigurationKey) => boolean;
}): EffectiveHotelProgram {
  if (!input.configuration) return STANDARD_EFFECTIVE_HOTEL_PROGRAM;
  const configuration = input.configuration;
  if (!isValidStoredHotelProgram(configuration) || configuration.tournamentId !== input.tournamentId) {
    return standardFallback(configuration.status ?? "not_enrolled", "invalid_configuration");
  }
  const identity = hotelPlannerFeeConfigurationKey(configuration.programType, configuration.rateCents);
  if (!input.trustedContext) return standardFallback(configuration.status, "untrusted_context", identity);
  if (configuration.status === "pending") return standardFallback("pending", "pending", identity);
  if (configuration.status === "paused") return standardFallback("paused", "paused", identity);
  if (configuration.programType === "tournament_support" && input.tournamentCompleted) {
    return standardFallback("active", "tournament_completed", identity);
  }
  if (!input.isFeeConfigurationAvailable(identity)) {
    return standardFallback("active", "missing_fee_configuration", identity);
  }

  const tournamentSupport = configuration.programType === "tournament_support";
  return {
    programType: configuration.programType,
    rateCents: configuration.rateCents,
    beneficiaryType: tournamentSupport ? "tournament" : "ti",
    beneficiaryId: tournamentSupport ? configuration.tournamentId : null,
    version: `hp_cfg_${configuration.configurationVersion.replace(/-/g, "")}`,
    storedStatus: "active",
    configurationIdentity: identity,
    feeTargetAvailable: true,
    showTournamentSupportDisclosure: tournamentSupport,
    fallbackReason: null,
  };
}

export function formatEffectiveHotelRouting(program: EffectiveHotelProgram, tournamentName?: string | null) {
  if (program.programType === "standard") {
    if (program.fallbackReason === "paused") return "Paused → Standard / no fee";
    if (program.fallbackReason === "pending") return "Pending → Standard / no fee";
    if (program.fallbackReason === "missing_fee_configuration") return "Missing fee configuration → Standard / no fee";
    if (program.fallbackReason === "invalid_configuration") return "Invalid configuration → Standard / no fee";
    if (program.fallbackReason === "untrusted_context") return "Untrusted context → Standard / no fee";
    if (program.fallbackReason === "tournament_completed") return "Tournament completed → Standard / no fee";
    return "Standard / no fee";
  }
  const rate = `$${program.rateCents / 100}`;
  if (program.programType === "ti_revenue") return `TI Revenue / ${rate}`;
  return `Tournament Support / ${rate} / ${String(tournamentName ?? "Tournament").trim() || "Tournament"}`;
}
