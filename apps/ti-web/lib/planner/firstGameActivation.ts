import type { PlannerEventRow } from "./types";

export const FIRST_GAME_ACTIVATION_FLOW = "first_game_inline_v1" as const;

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidDateOnly(value: string) {
  if (!DATE_ONLY_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export type FirstGameTournamentContext = {
  tournamentId: string;
  tournamentName: string;
  startDate: string;
  endDate: string;
  isSingleDay: boolean;
};

export function normalizeFirstGameTournamentContext(input: {
  entryPageType?: string | null;
  tournamentId?: string | null;
  tournamentName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}): FirstGameTournamentContext | null {
  const tournamentId = String(input.tournamentId ?? "").trim();
  const tournamentName = String(input.tournamentName ?? "").trim();
  const startDate = String(input.startDate ?? "").trim();
  const rawEndDate = String(input.endDate ?? "").trim();
  const endDate = rawEndDate || startDate;

  if (input.entryPageType !== "tournament" || !UUID_RE.test(tournamentId) || !tournamentName) return null;
  if (!isValidDateOnly(startDate) || !isValidDateOnly(endDate) || endDate < startDate) return null;

  return {
    tournamentId,
    tournamentName,
    startDate,
    endDate,
    isSingleDay: startDate === endDate,
  };
}

export function isFirstGameDateAllowed(context: FirstGameTournamentContext, value: string | null | undefined) {
  const date = String(value ?? "").trim();
  return isValidDateOnly(date) && date >= context.startDate && date <= context.endDate;
}

export function isUserAuthoredTournamentLogisticsEvent(event: PlannerEventRow, tournamentId: string) {
  return (
    String(event.source_type ?? "").trim() === "manual" &&
    String(event.tournament_id ?? "").trim() === String(tournamentId ?? "").trim()
  );
}

export function tournamentUserAuthoredEvents(events: PlannerEventRow[], tournamentId: string) {
  return events.filter((event) => isUserAuthoredTournamentLogisticsEvent(event, tournamentId));
}
