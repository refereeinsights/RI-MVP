import Link from "next/link";
import { notFound } from "next/navigation";
import VenueIndexBadge from "@/components/VenueIndexBadge";
import OwlsEyeVenueCard, { type AirportSummary, type NearbyPlace } from "@/components/venues/OwlsEyeVenueCard";
import MobileMapLink from "@/components/venues/MobileMapLink";
import { buildOwlsEyeDemoScores, type VenueReviewChoiceRow } from "@/lib/owlsEyeScores";
import { getSportCardClass } from "@/lib/ui/sportBackground";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import "../../tournaments/tournaments.css";

type LinkedTournament = {
  id: string;
  slug: string | null;
  name: string | null;
  sport: string | null;
  start_date: string | null;
  end_date: string | null;
};

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  venue_url: string | null;
  sport: string | null;
  restroom_cleanliness_avg: number | null;
  shade_score_avg: number | null;
  vendor_score_avg: number | null;
  parking_convenience_score_avg: number | null;
  player_parking_fee?: string | null;
  parking_notes?: string | null;
  bring_field_chairs?: boolean | null;
  seating_notes?: string | null;
  review_count: number | null;
  reviews_last_updated_at: string | null;
  tournament_venues?: { tournaments?: LinkedTournament | null }[] | null;
};

type OwlsEyeRunRow = {
  id: string;
  run_id?: string | null;
  venue_id: string;
  status: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  outputs?: {
    airports?: {
      nearest_airport?: AirportSummary | null;
      nearest_major_airport?: AirportSummary | null;
    };
  } | null;
};

type NearbyPlaceRow = {
  run_id: string;
  category: string | null;
  name: string;
  distance_meters: number | null;
  maps_url: string | null;
  is_sponsor: boolean | null;
  sponsor_click_url?: string | null;
};

function canonicalSport(sport: string | null | undefined) {
  const key = (sport ?? "").trim().toLowerCase();
  return key || "unknown";
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function buildMapLinks(query: string) {
  const encoded = encodeURIComponent(query);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    apple: `https://maps.apple.com/?q=${encoded}`,
    waze: `https://waze.com/ul?q=${encoded}&navigate=yes`,
  };
}

async function fetchLatestOwlsEyeRuns(venueIds: string[]) {
  if (!venueIds.length) return [] as OwlsEyeRunRow[];

  const primary = await supabaseAdmin
    .from("owls_eye_runs" as any)
    .select("id,run_id,venue_id,status,updated_at,created_at,outputs")
    .in("venue_id", venueIds)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  const primaryErrCode = (primary as any)?.error?.code;
  if (!primary.error) {
    return (primary.data as OwlsEyeRunRow[] | null) ?? [];
  }

  if (primaryErrCode === "42703" || primaryErrCode === "PGRST204") {
    const fallback = await supabaseAdmin
      .from("owls_eye_runs" as any)
      .select("id,run_id,venue_id,status,created_at,outputs")
      .in("venue_id", venueIds)
      .order("created_at", { ascending: false });
    return (fallback.data as OwlsEyeRunRow[] | null) ?? [];
  }

  return [];
}

function getVenueCardClassFromSports(sports: string[]) {
  const priority = ["lacrosse", "soccer", "basketball", "baseball", "softball", "football", "hockey", "volleyball"];
  const chosen = priority.find((sport) => sports.includes(sport)) ?? sports[0] ?? null;
  return getSportCardClass(chosen);
}

export const revalidate = 300;

export default async function VenueDetailsPage({ params }: { params: { venueId: string } }) {
  const { data, error } = await supabaseAdmin
    .from("venues" as any)
    .select(
      "id,name,address,city,state,zip,notes,venue_url,sport,restroom_cleanliness_avg,shade_score_avg,vendor_score_avg,parking_convenience_score_avg,review_count,reviews_last_updated_at,tournament_venues(tournaments(id,slug,name,sport,start_date,end_date))"
    )
    .eq("id", params.venueId)
    .maybeSingle<VenueRow>();

  if (error || !data?.id) notFound();

  const venueInsightsExtra = await supabaseAdmin
    .from("venues" as any)
    .select("id,player_parking_fee,parking_notes,bring_field_chairs,seating_notes")
    .eq("id", params.venueId)
    .maybeSingle<{
      id: string;
      player_parking_fee: string | null;
      parking_notes: string | null;
      bring_field_chairs: boolean | null;
      seating_notes: string | null;
    }>();
  const extraCode = (venueInsightsExtra as any)?.error?.code;
  const resolvedVenueInsights = !venueInsightsExtra.error || extraCode === "42703" || extraCode === "PGRST204" ? venueInsightsExtra.data : null;

  const linkedTournaments = (data.tournament_venues ?? [])
    .map((tv) => tv?.tournaments)
    .filter((t): t is LinkedTournament => Boolean(t?.id));
  const today = new Date().toISOString().slice(0, 10);
  const upcomingTournaments = linkedTournaments
    .filter((t) => Boolean((t.start_date && t.start_date >= today) || (t.end_date && t.end_date >= today)))
    .sort((a, b) => (a.start_date ?? "9999-12-31").localeCompare(b.start_date ?? "9999-12-31"));

  const sportsFromTournaments = Array.from(new Set(linkedTournaments.map((t) => canonicalSport(t.sport)).filter((sport) => sport !== "unknown")));
  if (sportsFromTournaments.length === 0) {
    const fallback = canonicalSport(data.sport);
    if (fallback !== "unknown") sportsFromTournaments.push(fallback);
  }

  const sportSurfaceClass = getVenueCardClassFromSports(sportsFromTournaments);
  const locationLabel = [data.city, data.state].filter(Boolean).join(", ");
  const addressLabel = [data.address, data.city, data.state, data.zip].filter(Boolean).join(", ");
  const mapLinks = addressLabel ? buildMapLinks(addressLabel) : null;

  const runRows = await fetchLatestOwlsEyeRuns([data.id]);
  const latestRun = runRows.find((row) => row.venue_id === data.id) ?? null;
  const latestRunId = latestRun ? latestRun.run_id ?? latestRun.id : null;

  let nearbyCounts = { food: 0, coffee: 0, hotels: 0 };
  let premiumNearby: { food: NearbyPlace[]; coffee: NearbyPlace[]; hotels: NearbyPlace[]; captured_at: string | null } | null = null;
  const airportSummary = latestRun?.outputs?.airports ?? null;

  if (latestRunId) {
    const { data: nearbyRows } = await supabaseAdmin
      .from("owls_eye_nearby_food" as any)
      .select("run_id,category,name,distance_meters,maps_url,is_sponsor,sponsor_click_url")
      .eq("run_id", latestRunId)
      .order("is_sponsor", { ascending: false })
      .order("distance_meters", { ascending: true })
      .order("name", { ascending: true });

    const toPlace = (row: NearbyPlaceRow): NearbyPlace => ({
      name: row.name,
      distance_meters: row.distance_meters,
      maps_url: row.maps_url,
      is_sponsor: Boolean(row.is_sponsor),
      sponsor_click_url: row.sponsor_click_url ?? null,
    });

    const rows = (nearbyRows as NearbyPlaceRow[] | null) ?? [];
    const food = rows.filter((row) => (row.category ?? "food") === "food").map(toPlace);
    const coffee = rows.filter((row) => row.category === "coffee").map(toPlace);
    const hotels = rows.filter((row) => {
      const category = (row.category ?? "").toLowerCase();
      return category === "hotel" || category === "hotels";
    }).map(toPlace);

    nearbyCounts = { food: food.length, coffee: coffee.length, hotels: hotels.length };
    premiumNearby = {
      food,
      coffee,
      hotels,
      captured_at: latestRun?.updated_at ?? latestRun?.created_at ?? null,
    };
  }

  const hasOwlsEye = nearbyCounts.food + nearbyCounts.coffee + nearbyCounts.hotels > 0;

  const reviewChoicesPrimary = await supabaseAdmin
    .from("venue_reviews" as any)
    .select("restrooms,parking_distance,parking_convenience_score,food_vendors,coffee_vendors,bring_field_chairs,player_parking_fee,parking_notes,seating_notes,created_at,updated_at")
    .eq("venue_id", data.id)
    .eq("status", "active");
  const reviewChoicesCode = (reviewChoicesPrimary as any)?.error?.code;
  const reviewChoicesFallback =
    reviewChoicesPrimary.error && (reviewChoicesCode === "42703" || reviewChoicesCode === "PGRST204")
      ? await supabaseAdmin
          .from("venue_reviews" as any)
          .select("restrooms,parking_distance,parking_convenience_score,food_vendors,coffee_vendors,bring_field_chairs,player_parking_fee,created_at,updated_at")
          .eq("venue_id", data.id)
          .eq("status", "active")
      : null;
  const reviewChoiceRows =
    (reviewChoicesPrimary.data as VenueReviewChoiceRow[] | null) ??
    (reviewChoicesFallback?.data as VenueReviewChoiceRow[] | null) ??
    [];

  const demoScores = buildOwlsEyeDemoScores({
    nearbyCounts,
    vendor_score_avg: data.vendor_score_avg,
    restroom_cleanliness_avg: data.restroom_cleanliness_avg,
    shade_score_avg: data.shade_score_avg,
    parking_convenience_score_avg: data.parking_convenience_score_avg,
    venue_player_parking_fee: resolvedVenueInsights?.player_parking_fee ?? null,
    parking_notes: resolvedVenueInsights?.parking_notes ?? null,
    venue_bring_field_chairs: resolvedVenueInsights?.bring_field_chairs ?? null,
    seating_notes: resolvedVenueInsights?.seating_notes ?? null,
    review_count: data.review_count,
    reviews_last_updated_at: data.reviews_last_updated_at,
    reviewChoices: reviewChoiceRows,
  });

  return (
    <main className="pitchWrap tournamentsWrap">
      <section className={`detailHero ${sportSurfaceClass}`}>
        <div className="detailHero__overlay">
          <article className="detailPanel">
            <div style={{ display: "grid", gap: 10, color: "#fff" }}>
              <h1 className="detailTitle">{data.name || "Venue"}</h1>
              <p className="meta" style={{ margin: 0 }}>
                <strong>Venue</strong>
                {locationLabel ? ` • ${locationLabel}` : ""}
              </p>
              <p className="dates" style={{ margin: 0 }}>{addressLabel || "Address TBA"}</p>

              <VenueIndexBadge
                restroom_cleanliness_avg={data.restroom_cleanliness_avg}
                shade_score_avg={data.shade_score_avg}
                vendor_score_avg={data.vendor_score_avg}
                parking_convenience_score_avg={data.parking_convenience_score_avg}
                review_count={data.review_count}
                reviews_last_updated_at={data.reviews_last_updated_at}
              />

              <div className="cardFooter" style={{ justifyContent: "center" }}>
                <Link href="/venues" className="secondaryLink">
                  Back to venues
                </Link>
                {data.venue_url ? (
                  <a href={data.venue_url} target="_blank" rel="noopener noreferrer" className="secondaryLink">Venue site</a>
                ) : null}
                {mapLinks ? (
                  <MobileMapLink provider="apple" query={addressLabel} fallbackHref={mapLinks.apple} className="primaryLink">
                    View map
                  </MobileMapLink>
                ) : null}
              </div>

              <OwlsEyeVenueCard
                venue={{
                  id: data.id,
                  name: data.name,
                  address: data.address,
                  city: data.city,
                  state: data.state,
                  zip: data.zip,
                  venue_url: data.venue_url,
                }}
                hasOwlsEye={hasOwlsEye}
                nearbyCounts={nearbyCounts}
                airportSummary={airportSummary}
                premiumNearby={premiumNearby}
                mapLinks={mapLinks}
                mapQuery={addressLabel || null}
                demoScores={demoScores}
                defaultNearbyAllCollapsed
              />

              {upcomingTournaments.length > 0 ? (
                <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>Upcoming tournaments at this venue</p>
                  <div style={{ display: "grid", gap: 6 }}>
                    {upcomingTournaments.map((t) => {
                      if (!t.slug || !t.name) return null;
                      const start = formatDate(t.start_date);
                      const end = formatDate(t.end_date);
                      const dateLabel = start && end && start !== end ? `${start} - ${end}` : start || end || "Dates TBA";
                      return (
                        <Link key={t.id} href={`/tournaments/${t.slug}`} className="secondaryLink" style={{ justifyContent: "space-between", width: "100%" }}>
                          <span>{t.name}</span>
                          <span style={{ fontSize: 12, opacity: 0.85 }}>{dateLabel}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, opacity: 0.9 }}>No upcoming tournaments currently linked to this venue.</p>
              )}

              {data.notes ? (
                <div style={{ marginTop: 6 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>Notes</p>
                  <p style={{ margin: "4px 0 0", opacity: 0.95 }}>{data.notes}</p>
                </div>
              ) : null}
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
