function cleanCityState(args: { city: string | null; state: string | null }) {
  const city = String(args.city ?? "").trim();
  const state = String(args.state ?? "").trim().toUpperCase();
  const stateOk = /^[A-Z]{2}$/.test(state);
  return {
    city: city || null,
    state: stateOk ? state : null,
  };
}

export function buildTournamentHotelsHref(args: {
  source: "tournament_directory" | "tournament_detail";
  tournamentId: string;
  city: string | null;
  state: string | null;
}) {
  const { city, state } = cleanCityState({ city: args.city, state: args.state });
  const ss = city && state ? `${city}, ${state}` : state ? state : city ? city : null;
  const qp = new URLSearchParams({
    source: args.source,
    tournamentId: args.tournamentId,
  });
  if (ss) qp.set("ss", ss);
  return `/go/hotels?${qp.toString()}`;
}

export function buildTournamentVrboHref(args: {
  source: "tournament_directory" | "tournament_detail";
  tournamentId: string;
  city: string | null;
  state: string | null;
}) {
  const { city, state } = cleanCityState({ city: args.city, state: args.state });
  const destination =
    city && state ? `${city}, ${state}, United States` : state ? `${state}, United States` : city ? `${city}, United States` : null;
  const qp = new URLSearchParams({
    source: args.source,
    tournamentId: args.tournamentId,
  });
  if (destination) qp.set("destination", destination);
  return `/go/vrbo?${qp.toString()}`;
}

