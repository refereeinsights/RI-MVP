import { RI_SOURCE_APP, getRiDeviceType, getRiTrafficSource } from "./riAnalytics";

type PayloadInput = {
  sourcePage: string | null;
  mapListState: string;
  resultCount: number;
  sport: string | null;
  state: string | null;
  city: string | null;
  month: string | null;
  tournamentId?: string | null;
  tournamentSlug?: string | null;
  venueId?: string | null;
};

export { getRiDeviceType as getRiMapDeviceType, getRiTrafficSource as getRiMapTrafficSource };

export function buildRiTournamentMapEventPayload(input: PayloadInput) {
  return {
    source_app: RI_SOURCE_APP,
    source_page: input.sourcePage ?? "unknown",
    map_list_state: input.mapListState,
    result_count: input.resultCount,
    sport: input.sport,
    state: input.state,
    city: input.city,
    month: input.month,
    tournament_id: input.tournamentId ?? null,
    tournament_slug: input.tournamentSlug ?? null,
    venue_id: input.venueId ?? null,
  };
}
