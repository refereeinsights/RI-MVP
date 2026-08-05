export type SharedVenueTournamentSummary = {
  id: string;
  slug: string | null;
  name: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type SharedVenueTournamentJoinRow = {
  is_inferred?: boolean | null;
  tournaments?: {
    id: string;
    slug?: string | null;
    name?: string | null;
    sport?: string | null;
    city?: string | null;
    state?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  } | null;
};

export type SharedVenueSourceRow = {
  id: string;
  seo_slug?: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notes: string | null;
  venue_url: string | null;
  sport: string | null;
  restroom_cleanliness_avg: number | null;
  shade_score_avg: number | null;
  vendor_score_avg: number | null;
  parking_convenience_score_avg: number | null;
  review_count: number | null;
  reviews_last_updated_at: string | null;
  tournament_venues?: SharedVenueTournamentJoinRow[] | null;
};

export type SharedVenue = {
  id: string;
  routeKey: string;
  seoSlug: string | null;
  name: string | null;
  address: {
    line1: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    formatted: string | null;
  };
  coordinates: {
    latitude: number | null;
    longitude: number | null;
    valid: boolean;
  };
  notes: string | null;
  venueUrl: string | null;
  sport: string | null;
  reviewAverages: {
    restroomCleanliness: number | null;
    shade: number | null;
    vendors: number | null;
    parkingConvenience: number | null;
  };
  reviewCount: number | null;
  reviewsLastUpdatedAt: string | null;
  tournaments: SharedVenueTournamentSummary[];
  directions: {
    destinationLabel: string;
    destinationAddress: string | null;
    destinationLatitude: number | null;
    destinationLongitude: number | null;
  };
  readiness: {
    addressReady: boolean;
    mapReady: boolean;
    hotelSearchReady: boolean;
    nearbyEnrichmentReady: boolean | null;
  };
};

export type SharedVenueResolution = {
  venue: SharedVenue | null;
  sourceRow: SharedVenueSourceRow | null;
  canonicalParam: string | null;
};

export type SharedVenueServiceOptions = {
  allowLegacyAddressSlugLookup?: boolean;
};

export type SharedVenueDbClient = {
  from(table: string): {
    select(select: string): any;
  };
};
