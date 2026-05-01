import PremiumInterestForm from "@/components/PremiumInterestForm";
import VenueIndexBadge from "@/components/VenueIndexBadge";
import OwlsEyeVenueCard, { type NearbyPlace } from "@/components/venues/OwlsEyeVenueCard";
import UpgradeWeekendProButton from "@/components/UpgradeWeekendProButton";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  DEMO_STARFIRE_VENUE_ID,
  buildOwlsEyeDemoScores,
  type OwlsEyeDemoScores,
  type VenueReviewChoiceRow,
} from "@/lib/owlsEyeScores";
import { WEEKEND_PRO_FOUNDING_DISCLAIMER, WEEKEND_PRO_FOUNDING_PRICE_LINE } from "@/lib/weekendProPricing";
import "../tournaments/tournaments.css";

export const metadata = {
  title: "Weekend Pro",
  description:
    "Upgrade to Weekend Pro to unlock Owl’s Eye™ venue intelligence: nearby hotels, rentals, coffee, food, and mobile-friendly directions around tournament venues.",
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
  player_parking_fee?: string | null;
  parking_notes?: string | null;
  bring_field_chairs?: boolean | null;
  seating_notes?: string | null;
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
      player_parking_fee?: string | null;
      parking_notes?: string | null;
      bring_field_chairs?: boolean | null;
      seating_notes?: string | null;
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
          "id,slug,tournament_venues(is_inferred,venues(id,name,address,city,state,zip,venue_url,restroom_cleanliness_avg,shade_score_avg,vendor_score_avg,parking_convenience_score_avg,review_count,reviews_last_updated_at))"
        )
        .eq("slug", DEMO_TOURNAMENT_SLUG)
        .maybeSingle<DemoTournamentRow>();

    const demoVenues = (demoTournament?.tournament_venues ?? [])
      .filter((tv) => !(tv as any)?.is_inferred)
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
  let nearbyCounts = { food: 0, coffee: 0, hotels: 0, sporting_goods: 0 };
  let premiumNearby:
    | { food: NearbyPlace[]; coffee: NearbyPlace[]; hotels: NearbyPlace[]; sporting_goods: NearbyPlace[]; captured_at: string | null }
    | null = null;
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

      const food = rows
        .filter((row) => {
          const category = (row.category ?? "food").toLowerCase();
          return (
            category !== "coffee" &&
            category !== "hotel" &&
            category !== "hotels" &&
            category !== "sporting_goods" &&
            category !== "big_box_fallback"
          );
        })
        .map(toPlace);
      const coffee = rows.filter((row) => (row.category ?? "").toLowerCase() === "coffee").map(toPlace);
      const hotels = rows
        .filter((row) => {
          const category = (row.category ?? "").toLowerCase();
          return category === "hotel" || category === "hotels";
        })
        .map(toPlace);
      const sportingGoods = rows
        .filter((row) => {
          const category = (row.category ?? "").toLowerCase();
          return category === "sporting_goods" || category === "big_box_fallback";
        })
        .map(toPlace);

      nearbyCounts = { food: food.length, coffee: coffee.length, hotels: hotels.length, sporting_goods: sportingGoods.length };
      premiumNearby = {
        food,
        coffee,
        hotels,
        sporting_goods: sportingGoods,
        captured_at: latestRun?.updated_at ?? latestRun?.created_at ?? null,
      };
      hasOwlsEye = nearbyCounts.food + nearbyCounts.coffee + nearbyCounts.hotels + nearbyCounts.sporting_goods > 0;
      previewUnavailable = false;
    }

    const venueInsightsExtra = await supabaseAdmin
      .from("venues" as any)
      .select("id,player_parking_fee,parking_notes,bring_field_chairs,seating_notes")
      .eq("id", demoVenue.id)
      .maybeSingle<{
        id: string;
        player_parking_fee: string | null;
        parking_notes: string | null;
        bring_field_chairs: boolean | null;
        seating_notes: string | null;
      }>();
    const extraCode = (venueInsightsExtra as any)?.error?.code;
    const resolvedVenueInsights =
      // TODO(ti-db): if these optional venue intelligence columns are unavailable, keep rendering "—" fallbacks.
      !venueInsightsExtra.error || extraCode === "42703" || extraCode === "PGRST204"
        ? venueInsightsExtra.data
        : null;

    const reviewChoicesPrimary = await supabaseAdmin
      .from("venue_reviews" as any)
      .select("restrooms,parking_distance,parking_convenience_score,food_vendors,coffee_vendors,bring_field_chairs,player_parking_fee,parking_notes,seating_notes,created_at,updated_at")
      .eq("venue_id", demoVenue.id)
      .eq("status", "active");
    const reviewChoicesCode = (reviewChoicesPrimary as any)?.error?.code;
    const reviewChoicesFallback =
      reviewChoicesPrimary.error && (reviewChoicesCode === "42703" || reviewChoicesCode === "PGRST204")
        ? await supabaseAdmin
            .from("venue_reviews" as any)
            .select("restrooms,parking_distance,parking_convenience_score,food_vendors,coffee_vendors,bring_field_chairs,player_parking_fee,created_at,updated_at")
            .eq("venue_id", demoVenue.id)
            .eq("status", "active")
        : null;
    const reviewChoiceRows =
      (reviewChoicesPrimary.data as VenueReviewChoiceRow[] | null) ??
      (reviewChoicesFallback?.data as VenueReviewChoiceRow[] | null) ??
      [];

    demoScores = buildOwlsEyeDemoScores({
      nearbyCounts,
      vendor_score_avg: demoVenue.vendor_score_avg,
      restroom_cleanliness_avg: demoVenue.restroom_cleanliness_avg,
      shade_score_avg: demoVenue.shade_score_avg,
      parking_convenience_score_avg: demoVenue.parking_convenience_score_avg,
      venue_player_parking_fee: resolvedVenueInsights?.player_parking_fee ?? null,
      parking_notes: resolvedVenueInsights?.parking_notes ?? null,
      venue_bring_field_chairs: resolvedVenueInsights?.bring_field_chairs ?? null,
      seating_notes: resolvedVenueInsights?.seating_notes ?? null,
      review_count: demoVenue.review_count,
      reviews_last_updated_at: demoVenue.reviews_last_updated_at,
      reviewChoices: reviewChoiceRows,
    });
  }

  const mapQuery = demoVenue
    ? [demoVenue.name, demoVenue.address, demoVenue.city, demoVenue.state, demoVenue.zip].filter(Boolean).join(", ")
    : "";
  const mapLinks = mapQuery ? buildMapLinks(mapQuery) : null;

  return (
    <main className="page">
      <div className="shell">
        <section className="hero" aria-labelledby="premium-title">
          <h1 id="premium-title">Weekend Pro</h1>
          <p className="muted heroCopy" style={{ marginTop: 0 }}>
            Plan your tournament weekend without guesswork. Weekend Pro unlocks Owl&apos;s Eye™ venue intelligence: nearby hotels, rentals, coffee, food, and mobile-friendly directions around where games are played.
          </p>
          <div style={{ display: "grid", gap: 6, justifyItems: "center", marginTop: 10 }}>
            <div style={{ fontWeight: 900 }}>{WEEKEND_PRO_FOUNDING_PRICE_LINE}</div>
            <div className="muted" style={{ fontSize: 13 }}>{WEEKEND_PRO_FOUNDING_DISCLAIMER}</div>
          </div>
          <div style={{ marginTop: 14, display: "grid", justifyItems: "center" }}>
            <UpgradeWeekendProButton
              className="primaryLink"
              source_page="premium"
              source_context="premium_hero"
              cta_label="Upgrade to Weekend Pro"
            />
          </div>
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
            <li>Upgrade to Weekend Pro.</li>
            <li>Unlock Owl&apos;s Eye™ planning details on supported venues.</li>
            <li>Use venue-level nearby lists and directions to plan faster on travel day.</li>
          </ol>
        </section>

        <section className="bodyCard" aria-labelledby="starfire-preview">
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 4, textAlign: "center", justifyItems: "center" }}>
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
                        mapQuery={mapQuery || null}
                        demoScores={demoScores}
                        demoScoresIsDemo
                        defaultNearbyAllCollapsed
                      />
                    </div>
                  )}
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="bodyCard bodyCardCenteredList" aria-labelledby="premium-updates">
          <h2 id="premium-updates">Get product updates</h2>
          <p className="muted" style={{ marginTop: 0, marginLeft: "auto", marginRight: "auto", textAlign: "center" }}>
            Want occasional updates as we expand venue coverage and planning features? Join the list.
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
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>What does Weekend Pro unlock?</summary>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Weekend Pro unlocks Owl&apos;s Eye™ venue intelligence: nearby hotels, rentals, coffee, food, and directions around tournament venues.
              </p>
            </details>
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>Can I cancel?</summary>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Yes. You can manage billing or cancel through the Stripe customer portal in your account settings.
              </p>
            </details>
          </div>
        </section>
      </div>
    </main>
  );
}
