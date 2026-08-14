import type { HotelPlannerSourcePageType } from "@/lib/hotelPlannerAttribution";

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateHotelProgramSnapshot(snapshot: HotelProgramSnapshot): HotelProgramSnapshot {
  const version = String(snapshot.version ?? "").trim();
  if (!version) throw new Error("Hotel program version is required.");

  if (
    snapshot.programType === "standard" &&
    snapshot.rateCents === 0 &&
    snapshot.beneficiaryType === "none" &&
    snapshot.beneficiaryId === null
  ) {
    return snapshot;
  }

  if (
    snapshot.programType === "ti_revenue" &&
    (snapshot.rateCents === 500 || snapshot.rateCents === 1000) &&
    snapshot.beneficiaryType === "ti" &&
    snapshot.beneficiaryId === null
  ) {
    return snapshot;
  }

  if (
    snapshot.programType === "tournament_support" &&
    (snapshot.rateCents === 500 || snapshot.rateCents === 1000) &&
    snapshot.beneficiaryType === "tournament" &&
    UUID_RE.test(String(snapshot.beneficiaryId ?? ""))
  ) {
    return snapshot;
  }

  throw new Error("Invalid hotel program snapshot.");
}

export async function resolveHotelProgramSnapshot(_input: {
  tournamentId: string | null;
  sourcePageType: HotelPlannerSourcePageType;
}): Promise<HotelProgramSnapshot> {
  // Foundation phase: all live traffic remains on standard HotelPlanner routing.
  return STANDARD_HOTEL_PROGRAM_SNAPSHOT;
}

export async function resolveHotelProgramSnapshotSafely(
  input: { tournamentId: string | null; sourcePageType: HotelPlannerSourcePageType },
  resolver: typeof resolveHotelProgramSnapshot = resolveHotelProgramSnapshot
): Promise<{ snapshot: HotelProgramSnapshot; usedFallback: boolean }> {
  try {
    return { snapshot: validateHotelProgramSnapshot(await resolver(input)), usedFallback: false };
  } catch (error) {
    console.warn("[hotel-program] resolver failed; using standard non-fee fallback", {
      source_page_type: input.sourcePageType,
      tournament_id: input.tournamentId,
      error: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
    return { snapshot: STANDARD_HOTEL_PROGRAM_SNAPSHOT, usedFallback: true };
  }
}

export async function getTournamentHotelProgram(tournamentId: string): Promise<HotelProgramSnapshot> {
  return resolveHotelProgramSnapshot({ tournamentId, sourcePageType: "tournament_hotels" });
}

export type HotelHandoffMode = "standard_redirect" | "fee_redirect" | "retryable_error";

export function selectHotelHandoffMode(input: {
  snapshot: HotelProgramSnapshot;
  persistenceSucceeded: boolean;
  standardTargetAvailable: boolean;
}): HotelHandoffMode {
  validateHotelProgramSnapshot(input.snapshot);
  if (input.snapshot.programType === "standard") {
    return input.standardTargetAvailable ? "standard_redirect" : "retryable_error";
  }
  if (input.persistenceSucceeded) return "fee_redirect";
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
