"use server";

import crypto from "node:crypto";

import { requireAdmin } from "./admin";
import { supabaseAdmin } from "./supabaseAdmin";
import {
  formatEffectiveHotelRouting,
  hotelPlannerFeeConfigurationAvailability,
  resolveEffectiveHotelProgram,
  type EffectiveHotelProgram,
  type HotelPlannerFeeConfigurationKey,
  type StoredTournamentHotelProgram,
} from "../../../packages/lib/hotel-program";
import { planHotelProgramMutation, type HotelProgramAdminRequest } from "./hotelProgramAdminPolicy";
import { adminHasApprovedHotelSupportEnrollment } from "./hotelSupportEnrollmentAdmin";

type ProgramRow = {
  tournament_id: string;
  program_type: StoredTournamentHotelProgram["programType"];
  rate_cents: StoredTournamentHotelProgram["rateCents"];
  status: StoredTournamentHotelProgram["status"];
  configuration_version: string;
  created_at?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

export type AdminTournamentHotelProgramView = {
  stored: StoredTournamentHotelProgram | null;
  effective: EffectiveHotelProgram;
  effectiveSummary: string;
  availability: Record<HotelPlannerFeeConfigurationKey, boolean>;
};

export type SaveTournamentHotelProgramResult =
  | { status: "saved" | "removed" | "noop"; message: string; configurationVersion: string | null }
  | { status: "confirmation_required" | "invalid" | "stale" | "error"; message: string; configurationVersion: string | null };

function toStored(row: ProgramRow | null): StoredTournamentHotelProgram | null {
  if (!row) return null;
  return {
    tournamentId: row.tournament_id,
    programType: row.program_type,
    rateCents: Number(row.rate_cents) as StoredTournamentHotelProgram["rateCents"],
    status: row.status,
    configurationVersion: row.configuration_version,
  };
}

function relationMissing(error: { code?: string | null } | null | undefined) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export async function adminListTournamentHotelPrograms(
  tournaments: Array<{ id: string; name: string }>
): Promise<Record<string, AdminTournamentHotelProgramView>> {
  await requireAdmin();
  const ids = tournaments.map((tournament) => tournament.id).filter(Boolean);
  const availability = hotelPlannerFeeConfigurationAvailability();
  let rows: ProgramRow[] = [];
  if (ids.length) {
    const response = await supabaseAdmin
      .from("ti_tournament_hotel_programs" as any)
      .select("tournament_id,program_type,rate_cents,status,configuration_version,created_at,updated_at,updated_by")
      .in("tournament_id", ids);
    if (response.error && !relationMissing(response.error)) throw response.error;
    rows = (response.data ?? []) as ProgramRow[];
  }
  const byTournament = new Map(rows.map((row) => [row.tournament_id, toStored(row)]));
  return Object.fromEntries(tournaments.map((tournament) => {
    const stored = byTournament.get(tournament.id) ?? null;
    const effective = resolveEffectiveHotelProgram({
      tournamentId: tournament.id,
      trustedContext: true,
      configuration: stored,
      isFeeConfigurationAvailable: (key) => availability[key],
    });
    return [tournament.id, {
      stored,
      effective,
      effectiveSummary: formatEffectiveHotelRouting(effective, tournament.name),
      availability,
    } satisfies AdminTournamentHotelProgramView];
  }));
}

export async function adminSaveTournamentHotelProgram(input: {
  tournamentId: string;
  expectedConfigurationVersion: string | null;
  request: HotelProgramAdminRequest;
}): Promise<SaveTournamentHotelProgramResult> {
  const admin = await requireAdmin();
  const tournamentResponse = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,name")
    .eq("id", input.tournamentId)
    .maybeSingle();
  if (tournamentResponse.error || !tournamentResponse.data) {
    return { status: "invalid", message: "Tournament not found.", configurationVersion: null };
  }
  const tournamentName = String((tournamentResponse.data as { name?: unknown }).name ?? "Tournament");
  const currentResponse = await supabaseAdmin
    .from("ti_tournament_hotel_programs" as any)
    .select("tournament_id,program_type,rate_cents,status,configuration_version")
    .eq("tournament_id", input.tournamentId)
    .maybeSingle();
  if (currentResponse.error) {
    return { status: "error", message: "Hotel-program configuration is unavailable. Apply the Phase 2 migration first.", configurationVersion: null };
  }
  const current = toStored((currentResponse.data as ProgramRow | null) ?? null);
  const currentVersion = current?.configurationVersion ?? null;
  if (currentVersion !== input.expectedConfigurationVersion) {
    return { status: "stale", message: "Configuration changed. Reload and review it before saving.", configurationVersion: currentVersion };
  }

  const availability = hotelPlannerFeeConfigurationAvailability();
  const requiresEnrollmentCheck =
    input.request.programType === "tournament_support" &&
    input.request.status === "active" &&
    input.request.rateCents !== null &&
    !(
      current?.programType === "tournament_support" &&
      current.status === "active" &&
      current.rateCents === input.request.rateCents
    );
  const hasApprovedTournamentSupportEnrollment = requiresEnrollmentCheck
    ? await adminHasApprovedHotelSupportEnrollment(input.tournamentId, input.request.rateCents as 500 | 1000)
    : false;
  const plan = planHotelProgramMutation({
    tournamentId: input.tournamentId,
    current,
    request: input.request,
    availability,
    hasApprovedTournamentSupportEnrollment,
  });
  if (plan.kind === "invalid") return { status: "invalid", message: plan.message, configurationVersion: currentVersion };
  if (plan.kind === "confirmation_required") {
    return {
      status: "confirmation_required",
      message: `${plan.message} ${formatEffectiveHotelRouting(plan.currentEffective, tournamentName)} → ${formatEffectiveHotelRouting(plan.proposedEffective, tournamentName)}`,
      configurationVersion: currentVersion,
    };
  }
  if (plan.kind === "noop") {
    return { status: "noop", message: "Hotel program is already up to date.", configurationVersion: currentVersion };
  }
  if (plan.kind === "delete") {
    const deletion = await supabaseAdmin
      .from("ti_tournament_hotel_programs" as any)
      .delete()
      .eq("tournament_id", input.tournamentId)
      .eq("configuration_version", currentVersion as string)
      .select("tournament_id");
    if (deletion.error || !deletion.data?.length) {
      return { status: "stale", message: "Configuration changed before removal. Reload and try again.", configurationVersion: currentVersion };
    }
    return { status: "removed", message: "Hotel program returned to Standard / no fee.", configurationVersion: null };
  }

  const nextVersion = crypto.randomUUID();
  const payload = {
    tournament_id: input.tournamentId,
    program_type: plan.configuration.programType,
    rate_cents: plan.configuration.rateCents,
    status: plan.configuration.status,
    configuration_version: nextVersion,
    updated_at: new Date().toISOString(),
    updated_by: admin.id,
  };
  if (!current) {
    const insertion = await supabaseAdmin
      .from("ti_tournament_hotel_programs" as any)
      .insert({ ...payload, created_at: payload.updated_at })
      .select("configuration_version")
      .maybeSingle();
    if (insertion.error) {
      if (insertion.error.code === "23505") {
        return { status: "stale", message: "Configuration was created by another admin. Reload and review it.", configurationVersion: null };
      }
      return { status: "error", message: "Unable to save hotel-program configuration.", configurationVersion: null };
    }
  } else {
    const update = await supabaseAdmin
      .from("ti_tournament_hotel_programs" as any)
      .update(payload)
      .eq("tournament_id", input.tournamentId)
      .eq("configuration_version", currentVersion as string)
      .select("configuration_version");
    if (update.error || !update.data?.length) {
      return { status: "stale", message: "Configuration changed before save. Reload and review it.", configurationVersion: currentVersion };
    }
  }
  return { status: "saved", message: "Hotel-program configuration saved.", configurationVersion: nextVersion };
}
