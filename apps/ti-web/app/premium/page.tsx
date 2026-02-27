import PremiumInterestForm from "@/components/PremiumInterestForm";
import VenueIndexBadge from "@/components/VenueIndexBadge";
import OwlsEyeVenueCard, { type NearbyPlace } from "@/components/venues/OwlsEyeVenueCard";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  DEMO_STARFIRE_VENUE_ID,
  buildOwlsEyeDemoScores,
  type OwlsEyeDemoScores,
  type VenueReviewChoiceRow,
} from "@/lib/owlsEyeScores";
import "../tournaments/tournaments.css";

export const metadata = {
  title: "Premium Access",
  description:
    "Request TournamentInsights Premium access to unlock Owl’s Eye venue intel, nearby essentials, and planning-focused venue details.",
  alternates: { canonical: "/premium" },
};

export const revalidate = 3600;

const DEMO_TOURNAMENT_SLUG = "refereeinsights-demo-tournament";
const DEMO_VENUE_NAME_HINT = "starfire";

type DemoVenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  venue_url: string | null;
  restroom_cleanliness_avg: number | null;
  shade_score_avg: number | null;
  vendor_score_avg: number | null;
  parking_convenience_score_avg: number | null;
  review_count: number | null;
  reviews_last_updated_at: string | null;
};

type DemoTournamentRow = {
  id: string;
  slug: string | null;
  tournament_venues?: {
    venues?: {
      id: string;
      name: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      venue_url: string | null;
      restroom_cleanliness_avg: number | null;
      shade_score_avg: number | null;
      vendor_score_avg: number | null;
      parking_convenience_score_avg: number | null;
      review_count: number | null;
      reviews_last_updated_at: string | null;
    } | null;
  }[] | null;
};

type OwlsEyeRunRow = {
  id: string;
  run_id?: string | null;
  venue_id: string;
  status: string | null;
  updated_at?: string | null;
  created_at?: string | null;
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

function buildMapLinks(query: string) {
  const encoded = encodeURIComponent(query);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    apple: `https://maps.apple.com/?q=${encoded}`,
    waze: `https://waze.com/ul?q=${encoded}&navigate=yes`,
  };
}

async function fetchLatestOwlsEyeRuns(
  venueIds: string[]
) {
  if (!venueIds.length) return [] as OwlsEyeRunRow[];

  const primary = await supabaseAdmin
    .from("owls_eye_runs" as any)
    .select("id,run_id,venue_id,status,updated_at,created_at")
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
      .select("id,run_id,venue_id,status,created_at")
      .in("venue_id", venueIds)
      .order("created_at", { ascending: false });
    return (fallback.data as OwlsEyeRunRow[] | null) ?? [];
  }

  return [];
}

export default async function PremiumPage() {
  const supabase = createSupabaseServerClient();
  let demoVenue: DemoVenueRow | null = null;

  const directVenue = await supabaseAdmin
    .from("venues" as any)
    .select(
      "id,name,address,city,state,zip,venue_url,restroom_cleanliness_avg,shade_score_avg,vendor_score_avg,parking_convenience_score_avg,review_count,reviews_last_updated_at"
    )
    .eq("id", DEMO_STARFIRE_VENUE_ID)
    .maybeSingle<DemoVenueRow>();
  demoVenue = directVenue.data ?? null;

  if (!demoVenue) {
    const { data: demoTournament } = await supabaseAdmin
      .from("tournaments_public" as any)
      .select(
        "id,slug,tournament_venues(venues(id,name,address,city,state,zip,venue_url,restroom_cleanliness_avg,shade_score_avg,vendor_score_avg,parking_convenience_score_avg,review_count,reviews_last_updated_at))"
      )
      .eq("slug", DEMO_TOURNAMENT_SLUG)
      .maybeSingle<DemoTournamentRow>();

    const demoVenues = (demoTournament?.tournament_venues ?? [])
      .map((tv) => tv?.venues ?? null)
      .filter(
        (venue): venue is NonNullable<NonNullable<DemoTournamentRow["tournament_venues"]>[number]["venues"]> =>
          Boolean(venue?.id)
      );

    demoVenue =
      demoVenues.find((venue) => (venue.name ?? "").toLowerCase().includes(DEMO_VENUE_NAME_HINT)) ?? null;
  }

  let previewUnavailable = !demoVenue;
  let hasOwlsEye = false;
  let nearbyCounts = { food: 0, coffee: 0, hotels: 0 };
  let premiumNearby: { food: NearbyPlace[]; coffee: NearbyPlace[]; hotels: NearbyPlace[]; captured_at: string | null } | null = null;
  let demoScores: OwlsEyeDemoScores | null = null;

  if (demoVenue) {
    previewUnavailable = false;
    const runRows = await fetchLatestOwlsEyeRuns([demoVenue.id]);
    const latestRun = runRows.find((row) => row.venue_id === demoVenue.id) ?? null;
    const latestRunId = latestRun ? (latestRun.run_id ?? latestRun.id) : null;

    if (latestRunId) {
      const { data: nearbyRows } = await supabaseAdmin
        .from("owls_eye_nearby_food" as any)
        .select("run_id,category,name,distance_meters,maps_url,is_sponsor,sponsor_click_url")
        .eq("run_id", latestRunId)
        .order("is_sponsor", { ascending: false })
        .order("distance_meters", { ascending: true })
        .order("name", { ascending: true });

      const rows = (nearbyRows as NearbyPlaceRow[] | null) ?? [];
      const toPlace = (row: NearbyPlaceRow): NearbyPlace => ({
        name: row.name,
        distance_meters: row.distance_meters,
        maps_url: row.maps_url,
        is_sponsor: Boolean(row.is_sponsor),
        sponsor_click_url: row.sponsor_click_url ?? null,
      });

      const food = rows.filter((row) => (row.category ?? "food") === "food").map(toPlace);
      const coffee = rows.filter((row) => row.category === "coffee").map(toPlace);
      const hotels = rows
        .filter((row) => {
          const category = (row.category ?? "").toLowerCase();
          return category === "hotel" || category === "hotels";
        })
        .map(toPlace);

      nearbyCounts = { food: food.length, coffee: coffee.length, hotels: hotels.length };
      premiumNearby = {
        food,
        coffee,
        hotels,
        captured_at: latestRun?.updated_at ?? latestRun?.created_at ?? null,
      };
      hasOwlsEye = nearbyCounts.food + nearbyCounts.coffee + nearbyCounts.hotels > 0;
      previewUnavailable = false;
    }

    if (demoVenue.id === DEMO_STARFIRE_VENUE_ID) {
      const { data: reviewChoiceRows } = await supabaseAdmin
        .from("venue_reviews" as any)
        .select("restrooms,parking_distance,parking_convenience_score")
        .eq("venue_id", demoVenue.id)
        .eq("status", "active");

      demoScores = buildOwlsEyeDemoScores({
        nearbyCounts,
        vendor_score_avg: demoVenue.vendor_score_avg,
        restroom_cleanliness_avg: demoVenue.restroom_cleanliness_avg,
        shade_score_avg: demoVenue.shade_score_avg,
        parking_convenience_score_avg: demoVenue.parking_convenience_score_avg,
        review_count: demoVenue.review_count,
        reviews_last_updated_at: demoVenue.reviews_last_updated_at,
        reviewChoices: (reviewChoiceRows as VenueReviewChoiceRow[] | null) ?? [],
      });
    }
  }

  const mapQuery = demoVenue
    ? [demoVenue.name, demoVenue.address, demoVenue.city, demoVenue.state, demoVenue.zip].filter(Boolean).join(", ")
    : "";
  const mapLinks = mapQuery ? buildMapLinks(mapQuery) : null;

  return (
    <main className="page">
      <div className="shell">
        <section className="hero" aria-labelledby="premium-title">
          <h1 id="premium-title">Premium Access</h1>
          <p className="muted heroCopy" style={{ marginTop: 0 }}>
            Unlock Owl&apos;s Eye venue intel and planning details families actually need: restrooms, shade, food,
            parking, and nearby essentials — verified and kept fresh.
          </p>
          <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
            Premium is limited during Public Beta. Request access below.
          </p>
        </section>

        <section className="bodyCard bodyCardCenteredList" aria-labelledby="premium-what-you-get">
          <h2 id="premium-what-you-get">What you get</h2>
          <ul className="list">
            <li>Full Owl&apos;s Eye venue details: restrooms, shade, vendors, and parking.</li>
            <li>Nearby essentials: coffee, food, and hotels with quick directions.</li>
            <li>Freshness signal: last updated + review volume context.</li>
            <li>Saved venues and tournaments: coming soon.</li>
          </ul>
        </section>

        <section className="bodyCard bodyCardCenteredList" aria-labelledby="premium-how">
          <h2 id="premium-how">How it works</h2>
          <ol className="list" style={{ textAlign: "left", maxWidth: 560, margin: "10px auto 0" }}>
            <li>Request Premium Access (email).</li>
            <li>We confirm access as we expand coverage.</li>
            <li>Premium unlocks Owl&apos;s Eye details across venues (with demo exception).</li>
          </ol>
        </section>

        <section className="bodyCard" aria-labelledby="starfire-preview">
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 4 }}>
              <h2 id="starfire-preview" style={{ margin: 0 }}>
                Preview: Starfire Field (Demo)
              </h2>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                Demo preview powered by the same Owl&apos;s Eye UI used on venue pages.
              </p>
            </div>

            <div className="detailHero bg-sport-soccer" style={{ borderRadius: 14, overflow: "hidden" }}>
              <div className="detailHero__overlay">
                <article
                  className="detailPanel"
                  style={{ maxWidth: "100%", paddingTop: "1.25rem" }}
                >
                  {previewUnavailable || !demoVenue ? (
                    <div className="detailVenuePremiumLock">
                      <p style={{ margin: 0 }}>Demo preview currently unavailable.</p>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      <VenueIndexBadge
                        restroom_cleanliness_avg={demoVenue.restroom_cleanliness_avg}
                        shade_score_avg={demoVenue.shade_score_avg}
                        vendor_score_avg={demoVenue.vendor_score_avg}
                        parking_convenience_score_avg={demoVenue.parking_convenience_score_avg}
                        review_count={demoVenue.review_count}
                        reviews_last_updated_at={demoVenue.reviews_last_updated_at}
                      />

                      <OwlsEyeVenueCard
                        venue={{
                          id: demoVenue.id,
                          name: demoVenue.name,
                          address: demoVenue.address,
                          city: demoVenue.city,
                          state: demoVenue.state,
                          zip: demoVenue.zip,
                          venue_url: demoVenue.venue_url,
                        }}
                        hasOwlsEye={hasOwlsEye}
                        canViewPremiumDetails
                        nearbyCounts={nearbyCounts}
                        premiumNearby={premiumNearby}
                        tier="explorer"
                        mapLinks={mapLinks}
                        demoScores={demoScores}
                      />
                    </div>
                  )}
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="bodyCard bodyCardCenteredList" aria-labelledby="premium-request">
          <h2 id="premium-request">Request Premium Access</h2>
          <p className="muted" style={{ marginTop: 0, marginLeft: "auto", marginRight: "auto", textAlign: "center" }}>
            We&apos;ll email you as we expand Premium access and Owl&apos;s Eye coverage.
          </p>
          <div style={{ display: "grid", justifyItems: "center" }}>
            <PremiumInterestForm compact />
          </div>
        </section>

        <section className="bodyCard" aria-labelledby="premium-faq">
          <h2 id="premium-faq" style={{ marginTop: 0 }}>
            FAQ
          </h2>
          <div style={{ display: "grid", gap: 10 }}>
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>Is Insider free?</summary>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Yes. Insider is free and account-gated.
              </p>
            </details>
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>What does Premium unlock?</summary>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Owl&apos;s Eye venue details and deeper planning intel across supported venues.
              </p>
            </details>
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>When will I get access?</summary>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Access is rolling out during Public Beta based on coverage and onboarding capacity.
              </p>
            </details>
          </div>
        </section>
      </div>
    </main>
  );
}
