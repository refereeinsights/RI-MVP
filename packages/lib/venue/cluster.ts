import type { SharedVenue, SharedVenueTournamentSummary } from "./types";

export type SharedVenueClusterTier = "same_tournament" | "same_city_active";

export type SharedVenueClusterCandidate = {
  venue: SharedVenue;
  tier: SharedVenueClusterTier;
  reason: string;
  upcomingTournamentCount: number;
  sharedUpcomingTournamentCount: number;
  sportOverlapCount: number;
  nearestUpcomingTournament: SharedVenueTournamentSummary | null;
};

function normalizeComparable(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function isUpcomingTournament(tournament: SharedVenueTournamentSummary, todayIso: string) {
  const start = String(tournament.startDate ?? "").trim();
  const end = String(tournament.endDate ?? "").trim();
  return Boolean((start && start >= todayIso) || (end && end >= todayIso));
}

function countUpcomingTournaments(tournaments: SharedVenueTournamentSummary[], todayIso: string) {
  return tournaments.filter((tournament) => isUpcomingTournament(tournament, todayIso)).length;
}

function getNearestUpcomingTournament(tournaments: SharedVenueTournamentSummary[], todayIso: string) {
  return (
    tournaments
      .filter((tournament) => isUpcomingTournament(tournament, todayIso))
      .sort((left, right) => {
        const leftStart = left.startDate ?? left.endDate ?? "9999-12-31";
        const rightStart = right.startDate ?? right.endDate ?? "9999-12-31";
        if (leftStart !== rightStart) return leftStart.localeCompare(rightStart);
        return (left.name ?? "").localeCompare(right.name ?? "");
      })[0] ?? null
  );
}

function buildCurrentVenueSignals(currentVenue: SharedVenue, todayIso: string) {
  const upcomingTournamentIds = new Set(
    currentVenue.tournaments.filter((tournament) => isUpcomingTournament(tournament, todayIso)).map((tournament) => tournament.id)
  );
  const sports = new Set(
    currentVenue.tournaments
      .map((tournament) => normalizeComparable(tournament.sport))
      .filter((sport) => sport.length > 0)
  );
  return { upcomingTournamentIds, sports };
}

export function buildVenueClusterCandidates(args: {
  currentVenue: SharedVenue;
  sameTournamentVenues: SharedVenue[];
  sameCityVenues: SharedVenue[];
  now?: Date;
  maxResults?: number;
  minResults?: number;
}) {
  const now = args.now ?? new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const maxResults = args.maxResults ?? 4;
  const minResults = args.minResults ?? 2;
  const currentVenueId = args.currentVenue.id;
  const currentCity = normalizeComparable(args.currentVenue.address.city);
  const currentState = normalizeComparable(args.currentVenue.address.state);
  const { upcomingTournamentIds, sports: currentSports } = buildCurrentVenueSignals(args.currentVenue, todayIso);

  const deduped = new Map<string, SharedVenueClusterCandidate>();
  const allCandidates = [
    ...args.sameTournamentVenues.map((venue) => ({ venue, source: "same_tournament" as const })),
    ...args.sameCityVenues.map((venue) => ({ venue, source: "same_city_active" as const })),
  ];

  for (const candidate of allCandidates) {
    const venue = candidate.venue;
    if (!venue.id || venue.id === currentVenueId) continue;
    if (!venue.name?.trim()) continue;
    if (!venue.routeKey?.trim()) continue;
    if (!venue.address.city?.trim() || !venue.address.state?.trim()) continue;

    const upcomingTournamentCount = countUpcomingTournaments(venue.tournaments, todayIso);
    const nearestUpcomingTournament = getNearestUpcomingTournament(venue.tournaments, todayIso);
    const sportOverlapCount = new Set(
      venue.tournaments
        .map((tournament) => normalizeComparable(tournament.sport))
        .filter((sport) => sport.length > 0 && currentSports.has(sport))
    ).size;

    let tier: SharedVenueClusterTier | null = null;
    let reason = "";
    let sharedUpcomingTournamentCount = 0;

    if (candidate.source === "same_tournament") {
      sharedUpcomingTournamentCount = venue.tournaments.filter((tournament) => upcomingTournamentIds.has(tournament.id)).length;
      if (sharedUpcomingTournamentCount > 0) {
        tier = "same_tournament";
        reason =
          sharedUpcomingTournamentCount === 1
            ? "Shares the same current or upcoming tournament"
            : `Shares ${String(sharedUpcomingTournamentCount)} current or upcoming tournaments`;
      }
    } else {
      const sameCity =
        normalizeComparable(venue.address.city) === currentCity && normalizeComparable(venue.address.state) === currentState;
      if (sameCity && upcomingTournamentCount > 0) {
        tier = "same_city_active";
        reason =
          upcomingTournamentCount === 1
            ? "Also hosting a current or upcoming tournament in the same city"
            : `Also hosting ${String(upcomingTournamentCount)} current or upcoming tournaments in the same city`;
      }
    }

    if (!tier) continue;

    const nextCandidate: SharedVenueClusterCandidate = {
      venue,
      tier,
      reason,
      upcomingTournamentCount,
      sharedUpcomingTournamentCount,
      sportOverlapCount,
      nearestUpcomingTournament,
    };
    const existing = deduped.get(venue.id);
    if (!existing) {
      deduped.set(venue.id, nextCandidate);
      continue;
    }
    if (existing.tier === "same_tournament") continue;
    if (nextCandidate.tier === "same_tournament") {
      deduped.set(venue.id, nextCandidate);
    }
  }

  const ordered = [...deduped.values()].sort((left, right) => {
    const tierScore = (candidate: SharedVenueClusterCandidate) => (candidate.tier === "same_tournament" ? 0 : 1);
    if (tierScore(left) !== tierScore(right)) return tierScore(left) - tierScore(right);
    if (left.sharedUpcomingTournamentCount !== right.sharedUpcomingTournamentCount) {
      return right.sharedUpcomingTournamentCount - left.sharedUpcomingTournamentCount;
    }
    if (left.sportOverlapCount !== right.sportOverlapCount) return right.sportOverlapCount - left.sportOverlapCount;
    if (left.upcomingTournamentCount !== right.upcomingTournamentCount) {
      return right.upcomingTournamentCount - left.upcomingTournamentCount;
    }
    const leftDate = left.nearestUpcomingTournament?.startDate ?? left.nearestUpcomingTournament?.endDate ?? "9999-12-31";
    const rightDate = right.nearestUpcomingTournament?.startDate ?? right.nearestUpcomingTournament?.endDate ?? "9999-12-31";
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    const leftName = left.venue.name ?? "";
    const rightName = right.venue.name ?? "";
    return leftName.localeCompare(rightName);
  });

  const strong = ordered.slice(0, maxResults);
  return strong.length >= minResults ? strong : [];
}
