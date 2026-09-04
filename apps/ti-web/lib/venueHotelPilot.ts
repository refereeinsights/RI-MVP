import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Pilot cohort: top-75 venues by linked tournament count (last 24 months),
// tie-broken by seo_slug asc. These are the only venues indexed by search engines.
// All venues with seo_slug + coords + city + state still get a hotels page,
// but ineligible ones receive noindex metadata.
export const VENUE_HOTEL_PILOT_MONTHS = 24;
export const VENUE_HOTEL_PILOT_MIN_TOURNAMENTS = 6; // count at rank 75 boundary
export const VENUE_HOTEL_PILOT_MAX_COHORT = 75;

/** Returns true if the seo_slug follows a legacy address-only pattern (not indexable). */
export function isAddressPatternSlug(slug: string | null | undefined): boolean {
  return /^\d+[-]/.test(slug ?? "");
}

/** Returns true if the venue name looks like garbage or test data. */
export function isVenueNameSane(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  if (n.length < 3) return false;
  if (/MEDICAL|EMS|IMPORTANT|Lorem|fixture/i.test(n)) return false;
  if (/^[0-9\s]+$/.test(n)) return false;
  return true;
}

/** Returns true if the venue meets basic data requirements for a hotels page to exist. */
export function isVenueHotelPageEligible(venue: {
  seo_slug?: string | null;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
}): boolean {
  if (!venue.seo_slug) return false;
  if (isAddressPatternSlug(venue.seo_slug)) return false;
  if (!venue.city || !venue.state) return false;
  const lat = Number(venue.latitude);
  const lng = Number(venue.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (!isVenueNameSane(venue.name)) return false;
  return true;
}

/** Returns true if the venue should be indexed by search engines (pilot cohort member). */
export function isVenueHotelPilotIndexable(
  venue: { seo_slug?: string | null; name?: string | null; city?: string | null; state?: string | null; latitude?: number | string | null; longitude?: number | string | null },
  tournamentCount24mo: number
): boolean {
  return isVenueHotelPageEligible(venue) && tournamentCount24mo >= VENUE_HOTEL_PILOT_MIN_TOURNAMENTS;
}

/** Counts tournaments linked to the venue that started in the last VENUE_HOTEL_PILOT_MONTHS months. */
export async function getVenueTournamentCount24mo(venueId: string): Promise<number> {
  const cutoff = new Date(Date.now() - VENUE_HOTEL_PILOT_MONTHS * 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data: links } = await (supabaseAdmin as any)
    .from("tournament_venues")
    .select("tournament_id")
    .eq("venue_id", venueId);

  if (!links?.length) return 0;

  const tournamentIds = (links as Array<{ tournament_id: string }>).map((l) => l.tournament_id);

  const CHUNK = 200;
  let count = 0;
  for (let i = 0; i < tournamentIds.length; i += CHUNK) {
    const chunk = tournamentIds.slice(i, i + CHUNK);
    const { count: chunkCount } = await (supabaseAdmin as any)
      .from("tournaments")
      .select("id", { count: "exact", head: true })
      .in("id", chunk)
      .gte("start_date", cutoff);
    count += chunkCount ?? 0;
  }
  return count;
}

// ─── Sitemap helpers ─────────────────────────────────────────────────────────

/** Loads the ordered pilot cohort for the venue-hotel sitemap shard. */
export async function loadVenueHotelPilotCohort(): Promise<Array<{ seo_slug: string }>> {
  const cutoff = new Date(Date.now() - VENUE_HOTEL_PILOT_MONTHS * 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Step 1: candidate venues
  const { data: venues } = await (supabaseAdmin as any)
    .from("venues")
    .select("id,seo_slug,name,city,state,latitude,longitude")
    .not("seo_slug", "is", null)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .not("city", "is", null)
    .not("state", "is", null)
    .limit(3000);

  const candidates: Array<{ id: string; seo_slug: string }> = (venues ?? []).filter(
    (v: { id: string; seo_slug: string | null; name: string | null; city: string | null; state: string | null; latitude: number | null; longitude: number | null }) =>
      isVenueHotelPageEligible(v)
  );

  if (!candidates.length) return [];

  // Step 2: fetch all tournament_venues in chunks
  const candidateIds = candidates.map((v) => v.id);
  const CHUNK = 200;
  const allLinks: Array<{ venue_id: string; tournament_id: string }> = [];
  for (let i = 0; i < candidateIds.length; i += CHUNK) {
    const chunk = candidateIds.slice(i, i + CHUNK);
    const { data: links } = await (supabaseAdmin as any)
      .from("tournament_venues")
      .select("venue_id,tournament_id")
      .in("venue_id", chunk);
    allLinks.push(...(links ?? []));
  }

  // Step 3: fetch tournament dates in chunks
  const allTournamentIds = [...new Set(allLinks.map((l) => l.tournament_id))];
  const recentIds = new Set<string>();
  for (let i = 0; i < allTournamentIds.length; i += CHUNK) {
    const chunk = allTournamentIds.slice(i, i + CHUNK);
    const { data: ts } = await (supabaseAdmin as any)
      .from("tournaments")
      .select("id")
      .in("id", chunk)
      .gte("start_date", cutoff);
    for (const t of ts ?? []) recentIds.add(t.id);
  }

  // Step 4: count per venue, sort, take top 75
  const countByVenue = new Map<string, number>();
  for (const link of allLinks) {
    if (recentIds.has(link.tournament_id)) {
      countByVenue.set(link.venue_id, (countByVenue.get(link.venue_id) ?? 0) + 1);
    }
  }

  return candidates
    .filter((v) => (countByVenue.get(v.id) ?? 0) >= VENUE_HOTEL_PILOT_MIN_TOURNAMENTS)
    .sort((a, b) => {
      const diff = (countByVenue.get(b.id) ?? 0) - (countByVenue.get(a.id) ?? 0);
      return diff !== 0 ? diff : a.seo_slug.localeCompare(b.seo_slug);
    })
    .slice(0, VENUE_HOTEL_PILOT_MAX_COHORT)
    .map((v) => ({ seo_slug: v.seo_slug }));
}
