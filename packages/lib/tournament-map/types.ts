export type TournamentMapFilters = {
  q?: string;
  state?: string[];
  month?: string;
  sports?: string[];
  reviewed?: boolean;
  includePast?: boolean;
  city?: string;
  sourcePage?: string;
};

export type TournamentMapVenueSummary = {
  id: string | null;
  slug: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type TournamentMapItem = {
  id: string;
  tournamentId: string;
  tournamentSlug: string;
  tournamentName: string;
  sport: string | null;
  city: string | null;
  state: string | null;
  startDate: string | null;
  endDate: string | null;
  venue: TournamentMapVenueSummary | null;
};

export type TournamentMapFeatureProperties = {
  id: string;
  tournamentId: string;
  tournamentSlug: string;
  tournamentName: string;
  sport: string | null;
  city: string | null;
  state: string | null;
  venueId: string | null;
  venueSlug: string | null;
  venueName: string | null;
};
