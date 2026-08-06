export type TeamTravelIntentLevel = "strong" | "moderate" | "passive" | "none";
export type TeamTravelCtaLevel = "primary" | "secondary" | "link" | "hidden";
export type TeamTravelEligibilityReason =
  | "future_tournament_with_destination"
  | "future_tournament_with_incomplete_dates"
  | "venue_with_selected_future_tournament"
  | "venue_with_upcoming_tournament"
  | "venue_destination_only"
  | "past_event"
  | "missing_destination"
  | "no_future_tournament_context";

export type TeamTravelEligibility = {
  eligible: boolean;
  intentLevel: TeamTravelIntentLevel;
  ctaLevel: TeamTravelCtaLevel;
  reason: TeamTravelEligibilityReason;
  tournamentId?: string | null;
  tournamentName?: string | null;
  venueId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

type TournamentLike = {
  id?: string | null;
  name?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

type TournamentEligibilityInput = {
  tournamentId?: string | null;
  tournamentName?: string | null;
  venueId?: string | null;
  destination?: string | null;
  venueName?: string | null;
  city?: string | null;
  state?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  todayIso?: string;
};

type VenueEligibilityInput = {
  selectedTournament?: TournamentLike | null;
  upcomingTournaments?: TournamentLike[];
  venueId?: string | null;
  destination?: string | null;
  venueName?: string | null;
  city?: string | null;
  state?: string | null;
  todayIso?: string;
};

function cleanText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function cleanIsoDate(value: string | null | undefined) {
  const text = cleanText(value);
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function hasUsableDestination(input: {
  destination?: string | null;
  venueName?: string | null;
  city?: string | null;
  state?: string | null;
}) {
  if (cleanText(input.destination)) return true;
  if (cleanText(input.venueName) && (cleanText(input.city) || cleanText(input.state))) return true;
  if (cleanText(input.city) && cleanText(input.state)) return true;
  return false;
}

function isFutureRange(input: { startDate?: string | null; endDate?: string | null; todayIso: string }) {
  const startDate = cleanIsoDate(input.startDate);
  const endDate = cleanIsoDate(input.endDate);
  if (startDate && startDate >= input.todayIso) return true;
  if (endDate && endDate >= input.todayIso) return true;
  return false;
}

function isMultiDay(input: { startDate?: string | null; endDate?: string | null }) {
  const startDate = cleanIsoDate(input.startDate);
  const endDate = cleanIsoDate(input.endDate);
  return Boolean(startDate && endDate && startDate < endDate);
}

function sortUpcomingTournamentLike<T extends TournamentLike>(tournaments: T[]) {
  return [...tournaments].sort((a, b) => {
    const dateCmp = (cleanIsoDate(a.startDate) ?? "9999-12-31").localeCompare(cleanIsoDate(b.startDate) ?? "9999-12-31");
    if (dateCmp !== 0) return dateCmp;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  });
}

export function evaluateTournamentTeamTravelEligibility(input: TournamentEligibilityInput): TeamTravelEligibility {
  const todayIso = input.todayIso ?? new Date().toISOString().slice(0, 10);
  const startDate = cleanIsoDate(input.startDate);
  const endDate = cleanIsoDate(input.endDate);

  if (!hasUsableDestination(input)) {
    return {
      eligible: false,
      intentLevel: "none",
      ctaLevel: "hidden",
      reason: "missing_destination",
      tournamentId: cleanText(input.tournamentId),
      tournamentName: cleanText(input.tournamentName),
      venueId: cleanText(input.venueId),
      startDate,
      endDate,
    };
  }

  if (!isFutureRange({ startDate, endDate, todayIso })) {
    return {
      eligible: false,
      intentLevel: "none",
      ctaLevel: "hidden",
      reason: "past_event",
      tournamentId: cleanText(input.tournamentId),
      tournamentName: cleanText(input.tournamentName),
      venueId: cleanText(input.venueId),
      startDate,
      endDate,
    };
  }

  return {
    eligible: true,
    intentLevel: isMultiDay({ startDate, endDate }) ? "strong" : "moderate",
    ctaLevel: "secondary",
    reason: startDate && endDate ? "future_tournament_with_destination" : "future_tournament_with_incomplete_dates",
    tournamentId: cleanText(input.tournamentId),
    tournamentName: cleanText(input.tournamentName),
    venueId: cleanText(input.venueId),
    startDate,
    endDate,
  };
}

export function evaluateVenueTeamTravelEligibility(input: VenueEligibilityInput): TeamTravelEligibility {
  const todayIso = input.todayIso ?? new Date().toISOString().slice(0, 10);
  const venueId = cleanText(input.venueId);
  const selectedTournament = input.selectedTournament ?? null;
  const upcomingTournaments = sortUpcomingTournamentLike(
    (input.upcomingTournaments ?? []).filter((t) =>
      isFutureRange({ startDate: t.startDate ?? null, endDate: t.endDate ?? null, todayIso }),
    ),
  );

  if (
    selectedTournament &&
    isFutureRange({ startDate: selectedTournament.startDate ?? null, endDate: selectedTournament.endDate ?? null, todayIso }) &&
    hasUsableDestination(input)
  ) {
    return {
      eligible: true,
      intentLevel: "strong",
      ctaLevel: "secondary",
      reason: "venue_with_selected_future_tournament",
      tournamentId: cleanText(selectedTournament.id),
      tournamentName: cleanText(selectedTournament.name),
      venueId,
      startDate: cleanIsoDate(selectedTournament.startDate),
      endDate: cleanIsoDate(selectedTournament.endDate),
    };
  }

  const fallbackTournament = upcomingTournaments[0] ?? null;
  if (fallbackTournament && hasUsableDestination(input)) {
    return {
      eligible: true,
      intentLevel: upcomingTournaments.length > 1 ? "moderate" : "strong",
      ctaLevel: "secondary",
      reason: "venue_with_upcoming_tournament",
      tournamentId: cleanText(fallbackTournament.id),
      tournamentName: cleanText(fallbackTournament.name),
      venueId,
      startDate: cleanIsoDate(fallbackTournament.startDate),
      endDate: cleanIsoDate(fallbackTournament.endDate),
    };
  }

  if (hasUsableDestination(input)) {
    return {
      eligible: true,
      intentLevel: "passive",
      ctaLevel: "link",
      reason: "venue_destination_only",
      tournamentId: null,
      tournamentName: null,
      venueId,
      startDate: null,
      endDate: null,
    };
  }

  return {
    eligible: false,
    intentLevel: "none",
    ctaLevel: "hidden",
    reason: upcomingTournaments.length > 0 ? "missing_destination" : "no_future_tournament_context",
    tournamentId: null,
    tournamentName: null,
    venueId,
    startDate: null,
    endDate: null,
  };
}
