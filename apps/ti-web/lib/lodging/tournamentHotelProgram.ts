import type { HotelPlannerSourcePageType } from "@/lib/hotelPlannerAttribution";
import {
  getHotelPlannerFeeTarget,
  resolveEffectiveHotelProgram,
  type EffectiveHotelProgram,
  type HotelPlannerFeeConfigurationKey,
  type StoredTournamentHotelProgram,
} from "../../../../packages/lib/hotel-program";

export type HotelProgramSnapshot = {
  programType: "standard" | "ti_revenue" | "tournament_support";
  rateCents: 0 | 500 | 1000;
  beneficiaryType: "none" | "ti" | "tournament";
  beneficiaryId: string | null;
  version: string;
};

export const STANDARD_HOTEL_PROGRAM_SNAPSHOT = Object.freeze({
  programType: "standard",
  rateCents: 0,
  beneficiaryType: "none",
  beneficiaryId: null,
  version: "hp_standard_v1",
} as const satisfies HotelProgramSnapshot);

export type ResolvedHotelProgram = {
  snapshot: HotelProgramSnapshot;
  storedStatus: EffectiveHotelProgram["storedStatus"];
  configurationIdentity: HotelPlannerFeeConfigurationKey | null;
  feeTargetAvailable: boolean;
  showTournamentSupportDisclosure: boolean;
  fallbackReason: EffectiveHotelProgram["fallbackReason"];
};

export type HotelProgramRepository = {
  findConfiguration(tournamentId: string): Promise<{
    data: StoredTournamentHotelProgram | null;
    error: { code?: string | null; message?: string | null } | null;
  }>;
  hasConfirmedVenueAssociation(tournamentId: string, venueId: string): Promise<{
    trusted: boolean;
    error: { code?: string | null; message?: string | null } | null;
  }>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateHotelProgramSnapshot(snapshot: HotelProgramSnapshot): HotelProgramSnapshot {
  const version = String(snapshot.version ?? "").trim();
  if (!version) throw new Error("Hotel program version is required.");
  if (
    snapshot.programType === "standard" &&
    snapshot.rateCents === 0 &&
    snapshot.beneficiaryType === "none" &&
    snapshot.beneficiaryId === null
  ) return snapshot;
  if (
    snapshot.programType === "ti_revenue" &&
    (snapshot.rateCents === 500 || snapshot.rateCents === 1000) &&
    snapshot.beneficiaryType === "ti" &&
    snapshot.beneficiaryId === null
  ) return snapshot;
  if (
    snapshot.programType === "tournament_support" &&
    (snapshot.rateCents === 500 || snapshot.rateCents === 1000) &&
    snapshot.beneficiaryType === "tournament" &&
    UUID_RE.test(String(snapshot.beneficiaryId ?? ""))
  ) return snapshot;
  throw new Error("Invalid hotel program snapshot.");
}

function standardResolved(
  fallbackReason: ResolvedHotelProgram["fallbackReason"] = "resolver_failure"
): ResolvedHotelProgram {
  return {
    snapshot: STANDARD_HOTEL_PROGRAM_SNAPSHOT,
    storedStatus: "not_enrolled",
    configurationIdentity: null,
    feeTargetAvailable: false,
    showTournamentSupportDisclosure: false,
    fallbackReason,
  };
}

function createSupabaseRepository(): HotelProgramRepository {
  return {
    async findConfiguration(tournamentId) {
      const { supabaseAdmin } = await import("../supabaseAdmin");
      const { data, error } = await supabaseAdmin
        .from("ti_tournament_hotel_programs" as any)
        .select("tournament_id,program_type,rate_cents,status,configuration_version")
        .eq("tournament_id", tournamentId)
        .maybeSingle();
      const row = data as Record<string, unknown> | null;
      return {
        data: row
          ? {
              tournamentId: String(row.tournament_id),
              programType: row.program_type as StoredTournamentHotelProgram["programType"],
              rateCents: Number(row.rate_cents) as StoredTournamentHotelProgram["rateCents"],
              status: row.status as StoredTournamentHotelProgram["status"],
              configurationVersion: String(row.configuration_version),
            }
          : null,
        error: error ? { code: error.code, message: error.message } : null,
      };
    },
    async hasConfirmedVenueAssociation(tournamentId, venueId) {
      const { supabaseAdmin } = await import("../supabaseAdmin");
      const { data, error } = await supabaseAdmin
        .from("tournament_venues" as any)
        .select("tournament_id")
        .eq("tournament_id", tournamentId)
        .eq("venue_id", venueId)
        .eq("is_inferred", false)
        .limit(1)
        .maybeSingle();
      return { trusted: Boolean(data), error: error ? { code: error.code, message: error.message } : null };
    },
  };
}

function fromEffective(value: EffectiveHotelProgram): ResolvedHotelProgram {
  const snapshot = validateHotelProgramSnapshot({
    programType: value.programType,
    rateCents: value.rateCents,
    beneficiaryType: value.beneficiaryType,
    beneficiaryId: value.beneficiaryId,
    version: value.version,
  });
  return {
    snapshot,
    storedStatus: value.storedStatus,
    configurationIdentity: value.configurationIdentity,
    feeTargetAvailable: value.feeTargetAvailable,
    showTournamentSupportDisclosure: value.showTournamentSupportDisclosure,
    fallbackReason: value.fallbackReason,
  };
}

export async function resolveHotelProgramSnapshot(
  input: {
    tournamentId: string | null;
    venueId: string | null;
    sourcePageType: HotelPlannerSourcePageType;
  },
  dependencies: {
    repository?: HotelProgramRepository;
    getFeeTarget?: typeof getHotelPlannerFeeTarget;
  } = {}
): Promise<ResolvedHotelProgram> {
  if (!input.tournamentId || !input.venueId || !UUID_RE.test(input.tournamentId) || !UUID_RE.test(input.venueId)) {
    return standardResolved("untrusted_context");
  }
  const repository = dependencies.repository ?? createSupabaseRepository();
  const [association, configuration] = await Promise.all([
    repository.hasConfirmedVenueAssociation(input.tournamentId, input.venueId),
    repository.findConfiguration(input.tournamentId),
  ]);
  if (association.error || configuration.error) {
    throw new Error("Hotel program context could not be resolved.");
  }
  return fromEffective(resolveEffectiveHotelProgram({
    tournamentId: input.tournamentId,
    trustedContext: association.trusted,
    configuration: configuration.data,
    isFeeConfigurationAvailable: (key) => Boolean((dependencies.getFeeTarget ?? getHotelPlannerFeeTarget)(key)),
  }));
}

export async function resolveHotelProgramSnapshotSafely(
  input: { tournamentId: string | null; venueId: string | null; sourcePageType: HotelPlannerSourcePageType },
  resolver: typeof resolveHotelProgramSnapshot = resolveHotelProgramSnapshot
): Promise<ResolvedHotelProgram> {
  try {
    return await resolver(input);
  } catch (error) {
    console.warn("[hotel-program] resolver failed; using standard non-fee fallback", {
      source_page_type: input.sourcePageType,
      tournament_id: input.tournamentId,
      venue_id: input.venueId,
      error: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
    return standardResolved("resolver_failure");
  }
}

export async function getTournamentHotelProgram(tournamentId: string, venueId: string | null) {
  return resolveHotelProgramSnapshotSafely({ tournamentId, venueId, sourcePageType: "tournament_hotels" });
}

export function getResolvedHotelProgramFeeTarget(program: ResolvedHotelProgram) {
  if (!program.feeTargetAvailable || !program.configurationIdentity) return null;
  return getHotelPlannerFeeTarget(program.configurationIdentity);
}

export type HotelHandoffMode = "standard_redirect" | "fee_redirect" | "retryable_error";

export function selectHotelHandoffMode(input: {
  snapshot: HotelProgramSnapshot;
  persistenceSucceeded: boolean;
  standardTargetAvailable: boolean;
  feeTargetAvailable: boolean;
}): HotelHandoffMode {
  validateHotelProgramSnapshot(input.snapshot);
  if (input.snapshot.programType === "standard") {
    return input.standardTargetAvailable ? "standard_redirect" : "retryable_error";
  }
  if (input.persistenceSucceeded && input.feeTargetAvailable) return "fee_redirect";
  return input.standardTargetAvailable ? "standard_redirect" : "retryable_error";
}

export function hotelProgramSnapshotColumns(snapshot: HotelProgramSnapshot) {
  validateHotelProgramSnapshot(snapshot);
  return {
    hotel_program_type: snapshot.programType,
    hotel_program_rate_cents: snapshot.rateCents,
    hotel_program_beneficiary_type: snapshot.beneficiaryType,
    hotel_program_beneficiary_id: snapshot.beneficiaryId,
    hotel_program_version: snapshot.version.trim(),
  } as const;
}
