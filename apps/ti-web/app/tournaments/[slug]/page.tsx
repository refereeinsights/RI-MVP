import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { BRAND_OWL } from "@/lib/brand";
import { canAccessWeekendPro, getTier } from "@/lib/entitlements";
import PremiumInterestForm from "@/components/PremiumInterestForm";
import "../tournaments.css";

type TournamentDetailRow = {
  id: string;
  slug: string | null;
  name: string;
  city: string | null;
  state: string | null;
  zip?: string | null;
  start_date: string | null;
  end_date: string | null;
  summary: string | null;
  source_url: string | null;
  official_website_url?: string | null;
  sport: string | null;
  level: string | null;
  venue: string | null;
  address: string | null;
  venue_url?: string | null;
  tournament_venues?: {
    venues?: {
      id: string;
      name: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      latitude: number | null;
      longitude: number | null;
      venue_url: string | null;
    } | null;
  }[] | null;
};

type PaidVenueDetailsRow = {
  venue_id: string;
  venues:
    | {
        id: string;
        food_vendors: boolean | null;
        coffee_vendors: boolean | null;
        tournament_vendors: boolean | null;
        restrooms: string | null;
        amenities: string | null;
        player_parking: string | null;
        parking_notes: string | null;
        notes: string | null;
        spectator_seating: string | null;
        bring_field_chairs: boolean | null;
        seating_notes: string | null;
      }
    | null;
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
  address: string | null;
  maps_url: string | null;
  is_sponsor: boolean | null;
  sponsor_click_url?: string | null;
};

type NearbyPlace = {
  name: string;
  distance_meters: number | null;
  address: string | null;
  maps_url: string | null;
  is_sponsor: boolean;
  sponsor_click_url: string | null;
};

export const revalidate = 300;

const SITE_ORIGIN = "https://www.tournamentinsights.com";
const DEMO_TOURNAMENT_SLUG = "refereeinsights-demo-tournament";
const PREMIUM_PREVIEW_SLUGS = new Set(["refereeinsights-demo-tournament", "hooptown-championship"]);
const PREMIUM_PREVIEW_NAMES = new Set(["hooptown championship"]);
const PREMIUM_PREVIEW_VENUE_NAMES = new Set(["the hub"]);

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function buildLocationLabel(city: string | null, state: string | null) {
  const parts = [city, state].filter(Boolean);
  if (!parts.length) return "";
  return parts.join(", ");
}

function buildMapLinks(query: string) {
  const encoded = encodeURIComponent(query);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    apple: `https://maps.apple.com/?q=${encoded}`,
    waze: `https://waze.com/ul?q=${encoded}&navigate=yes`,
  };
}

function buildCanonicalUrl(slug: string) {
  return `${SITE_ORIGIN}/tournaments/${slug}`;
}

function cardVariant(sport: string | null) {
  const normalized = (sport ?? "").toLowerCase();
  if (normalized === "basketball") return "card-basketball";
  return "card-grass";
}

function getSportCardClass(sport: string | null) {
  const normalized = (sport ?? "").toLowerCase();
  const map: Record<string, string> = {
    soccer: "bg-sport-soccer",
    lacrosse: "bg-sport-soccer",
    basketball: "bg-sport-basketball",
    football: "bg-sport-football",
    baseball: "bg-sport-baseball",
    softball: "bg-sport-softball",
  };
  return map[normalized] ?? "bg-sport-default";
}

function boolLabel(value: boolean | null | undefined) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Not provided";
}

function sentenceLabel(value: string | null | undefined) {
  if (!value) return "Not provided";
  const cleaned = value.replace(/_/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function metersToMilesLabel(meters: number | null | undefined) {
  if (typeof meters !== "number" || !Number.isFinite(meters)) return null;
  const miles = meters / 1609.344;
  return `${miles.toFixed(1)} mi`;
}

async function fetchLatestOwlsEyeRuns(venueIds: string[]) {
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

  // Backward compatibility for environments where updated_at is missing.
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

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  type TournamentMeta = {
    name: string | null;
    city: string | null;
    state: string | null;
    start_date: string | null;
    end_date: string | null;
    sport: string | null;
    slug: string | null;
  };
  const { data } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("name,city,state,start_date,end_date,sport,slug")
    .eq("slug", params.slug)
    .maybeSingle<TournamentMeta>();

  if (!data) {
    return {
      title: "Tournament Not Found",
      description: "We could not find that tournament listing.",
      robots: { index: false, follow: false },
    };
  }

  const locationLabel = buildLocationLabel(data.city ?? null, data.state ?? null);
  const title = locationLabel ? `${data.name} | ${locationLabel}` : `${data.name}`;
  const description = `Dates and location for ${data.name}${locationLabel ? ` in ${locationLabel}` : ""}. View official site and event details.`;
  const canonicalPath = `/tournaments/${data.slug ?? params.slug}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description,
      type: "website",
      url: buildCanonicalUrl(data.slug ?? params.slug),
      siteName: "TournamentInsights",
      images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-default.png"],
    },
  };
}

export default async function TournamentDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: entitlementProfile } = user
    ? await supabase
        .from("ti_users" as any)
        .select("plan,subscription_status")
        .eq("id", user.id)
        .maybeSingle<{ plan: string | null; subscription_status: string | null }>()
    : { data: null as { plan: string | null; subscription_status: string | null } | null };
  const tier = getTier(user, entitlementProfile ?? null);
  const isPaid = canAccessWeekendPro(user, entitlementProfile ?? null);
  const viewerEmail = user?.email ?? "";
  const needsEmailVerification = Boolean(user && !user.email_confirmed_at);
  const { data, error } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select(
      "id,slug,name,city,state,zip,start_date,end_date,summary,source_url,official_website_url,sport,level,venue,address,tournament_venues(venues(id,name,address,city,state,zip,latitude,longitude,venue_url))"
    )
    .eq("slug", params.slug)
    .maybeSingle<TournamentDetailRow>();

  if (error || !data) notFound();

  const locationLabel = buildLocationLabel(data.city, data.state) || "Location TBA";
  const start = formatDate(data.start_date);
  const end = formatDate(data.end_date);
  const dateLabel = start && end && start !== end ? `${start} – ${end}` : start || end || "Dates TBA";
  const hasMapAddress = (data.address || data.venue) && data.city && data.state;
  const mapQuery = hasMapAddress ? [data.venue, data.address, data.city, data.state, data.zip].filter(Boolean).join(", ") : "";
  const mapLinks = mapQuery ? buildMapLinks(mapQuery) : null;
  const venueInfo = data.venue || data.address || mapQuery;
  const venueAddress = [data.address, buildLocationLabel(data.city, data.state)].filter(Boolean).join(", ");
  const sportSurfaceClass = getSportCardClass(data.sport);
  const linkedVenues =
    data.tournament_venues
      ?.map((tv) => tv.venues)
      .filter((v): v is NonNullable<(typeof data.tournament_venues)[number]["venues"]> => Boolean(v)) ?? [];
  const linkedVenueIds = linkedVenues.map((v) => v.id).filter(Boolean);
  const resolvedSlug = (data.slug ?? params.slug ?? "").toLowerCase();
  const resolvedName = (data.name ?? "").trim().toLowerCase();
  const isDemoTournament = resolvedSlug === DEMO_TOURNAMENT_SLUG;
  const hasPremiumPreviewVenue = linkedVenues.some((venue) =>
    PREMIUM_PREVIEW_VENUE_NAMES.has((venue.name ?? "").trim().toLowerCase())
  );
  const hasPremiumPreview =
    PREMIUM_PREVIEW_SLUGS.has(resolvedSlug) ||
    PREMIUM_PREVIEW_NAMES.has(resolvedName) ||
    resolvedSlug.includes("hooptown") ||
    resolvedName.includes("hooptown") ||
    hasPremiumPreviewVenue;
  const canViewPremiumDetails = isPaid || hasPremiumPreview;

  let paidVenueDetailsById = new Map<
    string,
    {
      food_vendors: boolean | null;
      coffee_vendors: boolean | null;
      tournament_vendors: boolean | null;
      restrooms: string | null;
      amenities: string | null;
      player_parking: string | null;
      parking_notes: string | null;
      notes: string | null;
      spectator_seating: string | null;
      bring_field_chairs: boolean | null;
      seating_notes: string | null;
    }
  >();
  let nearbyByVenueId = new Map<
    string,
    {
      food: NearbyPlace[];
      coffee: NearbyPlace[];
      hotels: NearbyPlace[];
      captured_at: string | null;
    }
  >();
  let nearbyCountsByVenueId = new Map<
    string,
    {
      food: number;
      coffee: number;
      hotels: number;
      captured_at: string | null;
    }
  >();
  let hasOwlsEyeByVenueId = new Map<string, boolean>();

  const runRows = await fetchLatestOwlsEyeRuns(linkedVenueIds);
  if (canViewPremiumDetails) {
    const { data: venuePaidRows } = await (linkedVenueIds.length
      ? supabaseAdmin
          .from("tournament_venues" as any)
          .select(
            "venue_id,venues(id,food_vendors,coffee_vendors,tournament_vendors,restrooms,amenities,player_parking,parking_notes,notes,spectator_seating,bring_field_chairs,seating_notes)"
          )
          .eq("tournament_id", data.id)
          .in("venue_id", linkedVenueIds)
      : Promise.resolve({ data: [] as PaidVenueDetailsRow[] }));
    paidVenueDetailsById = new Map(
      ((venuePaidRows as PaidVenueDetailsRow[] | null) ?? [])
        .filter((row) => row?.venues?.id)
        .map((row) => [
          row.venues!.id,
          {
            food_vendors: row.venues!.food_vendors,
            coffee_vendors: row.venues!.coffee_vendors,
            tournament_vendors: row.venues!.tournament_vendors,
            restrooms: row.venues!.restrooms,
            amenities: row.venues!.amenities,
            player_parking: row.venues!.player_parking,
            parking_notes: row.venues!.parking_notes,
            notes: row.venues!.notes,
            spectator_seating: row.venues!.spectator_seating,
            bring_field_chairs: row.venues!.bring_field_chairs,
            seating_notes: row.venues!.seating_notes,
          },
        ])
    );

  }

  const latestRunByVenue = new Map<string, OwlsEyeRunRow>();
  for (const row of runRows) {
    if (!row?.venue_id) continue;
    if (latestRunByVenue.has(row.venue_id)) continue;
    latestRunByVenue.set(row.venue_id, row);
  }
  const runIds = Array.from(latestRunByVenue.values())
    .map((row) => row.run_id ?? row.id)
    .filter((value): value is string => Boolean(value));

  if (runIds.length) {
    if (canViewPremiumDetails) {
      const { data: nearbyRows } = await supabaseAdmin
        .from("owls_eye_nearby_food" as any)
        .select("run_id,category,name,distance_meters,address,maps_url,is_sponsor,sponsor_click_url")
        .in("run_id", runIds)
        .order("is_sponsor", { ascending: false })
        .order("distance_meters", { ascending: true })
        .order("name", { ascending: true });

      const nearbyByRunId = new Map<string, NearbyPlaceRow[]>();
      for (const row of ((nearbyRows as NearbyPlaceRow[] | null) ?? [])) {
        const runId = row.run_id;
        if (!runId) continue;
        const list = nearbyByRunId.get(runId) ?? [];
        list.push(row);
        nearbyByRunId.set(runId, list);
      }

      nearbyByVenueId = new Map(
        Array.from(latestRunByVenue.entries()).map(([venueId, run]) => {
          const runId = run.run_id ?? run.id;
          const places = nearbyByRunId.get(runId) ?? [];
          const toPlace = (row: NearbyPlaceRow): NearbyPlace => ({
            name: row.name,
            distance_meters: row.distance_meters,
            address: row.address,
            maps_url: row.maps_url,
            is_sponsor: Boolean(row.is_sponsor),
            sponsor_click_url: row.sponsor_click_url ?? null,
          });
          const food = places.filter((p) => (p.category ?? "food") === "food").map(toPlace);
          const coffee = places.filter((p) => p.category === "coffee").map(toPlace);
          const hotels = places.filter((p) => (p.category ?? "").toLowerCase() === "hotel" || (p.category ?? "").toLowerCase() === "hotels").map(toPlace);
          return [
            venueId,
            {
              food,
              coffee,
              hotels,
              captured_at: run.updated_at ?? run.created_at ?? null,
            },
          ];
        })
      );
      nearbyCountsByVenueId = new Map(
        Array.from(nearbyByVenueId.entries()).map(([venueId, nearby]) => [
          venueId,
          {
            food: nearby.food.length,
            coffee: nearby.coffee.length,
            hotels: nearby.hotels.length,
            captured_at: nearby.captured_at,
          },
        ])
      );
      hasOwlsEyeByVenueId = new Map(
        Array.from(nearbyByVenueId.entries()).map(([venueId, nearby]) => [
          venueId,
          nearby.food.length + nearby.coffee.length + nearby.hotels.length > 0,
        ])
      );
    } else {
      const { data: nearbyRows } = await supabaseAdmin
        .from("owls_eye_nearby_food" as any)
        .select("run_id,category")
        .in("run_id", runIds);

      const countsByRunId = new Map<string, { food: number; coffee: number; hotels: number }>();
      for (const row of ((nearbyRows as Array<{ run_id: string; category: string | null }> | null) ?? [])) {
        const runId = row.run_id;
        if (!runId) continue;
        const normalizedCategory = (row.category ?? "food").toLowerCase();
        const current = countsByRunId.get(runId) ?? { food: 0, coffee: 0, hotels: 0 };
        if (normalizedCategory === "coffee") current.coffee += 1;
        else if (normalizedCategory === "hotel" || normalizedCategory === "hotels") current.hotels += 1;
        else current.food += 1;
        countsByRunId.set(runId, current);
      }

      nearbyCountsByVenueId = new Map(
        Array.from(latestRunByVenue.entries()).map(([venueId, run]) => {
          const runId = (run.run_id ?? run.id) as string;
          const counts = countsByRunId.get(runId) ?? { food: 0, coffee: 0, hotels: 0 };
          return [
            venueId,
            {
              ...counts,
              captured_at: run.updated_at ?? run.created_at ?? null,
            },
          ];
        })
      );
      hasOwlsEyeByVenueId = new Map(
        Array.from(nearbyCountsByVenueId.entries()).map(([venueId, counts]) => [
          venueId,
          counts.food + counts.coffee + counts.hotels > 0,
        ])
      );
    }
  }

  const canonicalUrl = buildCanonicalUrl(data.slug ?? params.slug);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: data.name,
    startDate: data.start_date || undefined,
    endDate: data.end_date || undefined,
    url: canonicalUrl,
    location: {
      "@type": "Place",
      name: linkedVenues[0]?.name || data.venue || locationLabel || "Tournament venue",
      address: {
        "@type": "PostalAddress",
        addressLocality: data.city || undefined,
        addressRegion: data.state || undefined,
        postalCode: data.zip || undefined,
        addressCountry: "US",
      },
    },
    sameAs: data.official_website_url || data.source_url || undefined,
  };

  return (
    <main className="pitchWrap tournamentsWrap">
      <section className={`detailHero ${sportSurfaceClass}`}>
        <div className="detailHero__overlay">
          <script
            type="application/ld+json"
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
          />
          <Link href="/tournaments" className="detailBackLink">
            ← Back to directory
          </Link>
          <h1 className="detailTitle">{data.name}</h1>
          <div className="detailMeta">
            <strong>{(data.sport || "Tournament").toString()}</strong>
            {data.level ? ` • ${data.level}` : ""}
          </div>
          <div className="detailMeta">{dateLabel}</div>
          <div className="detailMeta">{locationLabel}</div>

          {data.official_website_url && !isDemoTournament ? (
            <div className="detailLinksRow">
              <a className="secondaryLink" href={data.official_website_url} target="_blank" rel="noopener noreferrer">
                Official site
              </a>
            </div>
          ) : null}

          {linkedVenues.length > 0 ? (
            linkedVenues.map((venue) => {
              const streetLine =
                venue.address?.trim() ||
                (linkedVenues.length === 1 ? data.address?.trim() || "" : "");
              const cityStateZipLine = [venue.city, venue.state, venue.zip].filter(Boolean).join(", ");
              const hasVenueMap = (venue.address || venue.name) && venue.city && venue.state;
              const venueQuery = hasVenueMap
                ? [venue.name, venue.address, venue.city, venue.state, venue.zip].filter(Boolean).join(", ")
                : "";
              const venueMapLinks = venueQuery ? buildMapLinks(venueQuery) : null;

              return (
                <div className={`detailCard ${hasOwlsEyeByVenueId.get(venue.id) ? "detailCard--withOwl" : ""}`} key={venue.id}>
                  <div className="detailCard__title">Venue</div>
                  <div className="detailCard__body">
                    {hasOwlsEyeByVenueId.get(venue.id) ? (
                      <img
                        className="detailVenueOwlBadgeFloat"
                        src="/svg/ri/owls_eye_badge.svg"
                        alt="Owl's Eye insights available for this venue"
                      />
                    ) : null}
                    <div className="detailVenueRow">
                      <div className="detailVenueIdentity">
                        <div className="detailVenueText">
                        <div className="detailVenueName">{venue.name || "Venue TBA"}</div>
                        {streetLine ? <div className="detailVenueAddress">{streetLine}</div> : null}
                        {cityStateZipLine ? <div className="detailVenueAddress">{cityStateZipLine}</div> : null}
                        <div className="detailLinksRow detailVenueUrlRow">
                          {venue.venue_url ? (
                            <a
                              className="secondaryLink"
                              href={venue.venue_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Venue URL/Map
                            </a>
                          ) : null}
                        </div>
                        </div>
                      </div>
                      {venueMapLinks ? (
                        <div className="detailLinksRow">
                          <a className="secondaryLink" href={venueMapLinks.google} target="_blank" rel="noopener noreferrer">
                            Google Maps
                          </a>
                          <a className="secondaryLink" href={venueMapLinks.apple} target="_blank" rel="noopener noreferrer">
                            Apple Maps
                          </a>
                          <a className="secondaryLink" href={venueMapLinks.waze} target="_blank" rel="noopener noreferrer">
                            Waze
                          </a>
                        </div>
                      ) : null}
                    </div>
                    {(() => {
                      const nearbyCounts = nearbyCountsByVenueId.get(venue.id);
                      if (!nearbyCounts || nearbyCounts.food + nearbyCounts.coffee + nearbyCounts.hotels === 0) return null;

                      if (!canViewPremiumDetails) {
                        return (
                          <div className="detailVenueNearbyPreview">
                            <div className="detailVenueNearbyPreview__title">Nearby Options ({BRAND_OWL})</div>
                            <div className="detailVenueNearbyPreview__counts">
                              <div>☕ {nearbyCounts.coffee} coffee nearby</div>
                              <div>🍔 {nearbyCounts.food} food options nearby</div>
                              <div>🏨 {nearbyCounts.hotels} hotels nearby</div>
                            </div>
                            <div className="detailVenueNearbyPreview__teaser">Unlock full list and one-tap directions.</div>
                            <div className="detailLinksRow">
                              <Link className="secondaryLink" href="/pricing">
                                Unlock Weekend Pro
                              </Link>
                            </div>
                            <PremiumInterestForm initialEmail={viewerEmail} compact />
                          </div>
                        );
                      }

                      const nearby = nearbyByVenueId.get(venue.id);
                      if (!nearby) return null;
                      const grouped = [
                        { label: "Coffee", items: nearby.coffee.slice(0, 10) },
                        { label: "Food", items: nearby.food.slice(0, 10) },
                        { label: "Hotels", items: nearby.hotels.slice(0, 10) },
                      ] as Array<{ label: string; items: NearbyPlace[] }>;

                      return (
                        <div className="detailVenueNearbyGuide">
                          <div className="detailVenueNearbyGuide__title">{BRAND_OWL} Weekend Guide</div>
                          {grouped.map((group) =>
                            group.items.length ? (
                              <div className="premiumNearbyGroup" key={`${venue.id}-${group.label}-guide`}>
                                <div className="premiumNearbyGroup__title">{group.label}</div>
                                <div className="premiumNearbyGroup__list">
                                  {group.items.map((item, idx) => {
                                    const primaryLink =
                                      item.is_sponsor && item.sponsor_click_url ? item.sponsor_click_url : item.maps_url;
                                    return (
                                      <div className="premiumNearbyLink premiumNearbyLink--row" key={`${group.label}-${item.name}-${idx}`}>
                                        <div className="premiumNearbyLink__content">
                                          <span>{item.name}</span>
                                          <span className="premiumNearbyLink__meta">
                                            {metersToMilesLabel(item.distance_meters) || "Distance unavailable"}
                                            {item.is_sponsor && item.sponsor_click_url ? " • Sponsored" : ""}
                                          </span>
                                        </div>
                                        {primaryLink ? (
                                          <a
                                            className="secondaryLink premiumNearbyLink__cta"
                                            href={primaryLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                          >
                                            Directions
                                          </a>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null
                          )}
                        </div>
                      );
                    })()}
                    {!canViewPremiumDetails ? (
                      <div className="detailVenuePremiumLock">
                        <span>Premium planning details</span>
                        <Link className="secondaryLink" href="/pricing">
                          Upgrade
                        </Link>
                        <PremiumInterestForm initialEmail={viewerEmail} compact />
                      </div>
                    ) : (
                      <details className="detailVenuePremium">
                        <summary className="detailVenuePremium__summary">Premium planning details</summary>
                        <div className="detailVenuePremium__body">
                          {(() => {
                            const premium = paidVenueDetailsById.get(venue.id);
                            const nearby = nearbyByVenueId.get(venue.id);
                            return (
                              <>
                                <div className="premiumDetailRow">
                                  <span className="premiumDetailLabel">Food vendors</span>
                                  <span>{boolLabel(premium?.food_vendors)}</span>
                                </div>
                                <div className="premiumDetailRow">
                                  <span className="premiumDetailLabel">Coffee vendors</span>
                                  <span>{boolLabel(premium?.coffee_vendors)}</span>
                                </div>
                                <div className="premiumDetailRow">
                                  <span className="premiumDetailLabel">Tournament vendors</span>
                                  <span>{boolLabel(premium?.tournament_vendors)}</span>
                                </div>
                                <div className="premiumDetailRow">
                                  <span className="premiumDetailLabel">Restrooms</span>
                                  <span>{premium?.restrooms?.trim() || "Not provided"}</span>
                                </div>
                                <div className="premiumDetailRow">
                                  <span className="premiumDetailLabel">Amenities</span>
                                  <span>{premium?.amenities?.trim() || "Not provided"}</span>
                                </div>
                                <div className="premiumDetailRow">
                                  <span className="premiumDetailLabel">Player parking</span>
                                  <span>{premium?.player_parking?.trim() || "Not provided"}</span>
                                </div>
                                <div className="premiumDetailRow">
                                  <span className="premiumDetailLabel">Parking notes</span>
                                  <span>{premium?.parking_notes?.trim() || "Not provided"}</span>
                                </div>
                                <div className="premiumDetailRow">
                                  <span className="premiumDetailLabel">Venue notes</span>
                                  <span>{premium?.notes?.trim() || "Not provided"}</span>
                                </div>
                                <div className="premiumDetailRow">
                                  <span className="premiumDetailLabel">Spectator seating</span>
                                  <span>{sentenceLabel(premium?.spectator_seating)}</span>
                                </div>
                                <div className="premiumDetailRow">
                                  <span className="premiumDetailLabel">Bring field chairs</span>
                                  <span>{boolLabel(premium?.bring_field_chairs)}</span>
                                </div>
                                <div className="premiumDetailRow">
                                  <span className="premiumDetailLabel">Seating notes</span>
                                  <span>{premium?.seating_notes?.trim() || "Not provided"}</span>
                                </div>
                                <div className="premiumDetailRow">
                                  <span className="premiumDetailLabel">{BRAND_OWL} nearby</span>
                                  <span>
                                    {nearby
                                      ? `Food: ${nearby.food.length} • Coffee: ${nearby.coffee.length} • Hotels: ${nearby.hotels.length}${
                                          nearby.captured_at
                                            ? ` (updated ${new Date(nearby.captured_at).toLocaleDateString()})`
                                            : ""
                                        }`
                                      : "No nearby results captured yet."}
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              );
            })
          ) : venueInfo ? (
            <div className="detailCard">
              <div className="detailCard__title">Venue</div>
              <div className="detailCard__body">
                <div className="detailVenueRow">
                  <div className="detailVenueText">
                    <div className="detailVenueName">{data.venue || "Venue TBA"}</div>
                    {venueAddress ? <div className="detailVenueAddress">{venueAddress}</div> : null}
                  </div>
                  {mapLinks ? (
                    <div className="detailLinksRow detailLinksRow--inline">
                      <a className="secondaryLink" href={mapLinks.google} target="_blank" rel="noopener noreferrer">
                        Google Maps
                      </a>
                      <a className="secondaryLink" href={mapLinks.apple} target="_blank" rel="noopener noreferrer">
                        Apple Maps
                      </a>
                      <a className="secondaryLink" href={mapLinks.waze} target="_blank" rel="noopener noreferrer">
                        Waze
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {data.summary ? <p className="detailSummary">{data.summary}</p> : null}
          <p className="detailLegalNote">
            Information may change. Verify critical details directly with organizers and venues.{" "}
            <Link href="/terms">Terms</Link> • <Link href="/disclaimer">Disclaimer</Link>
          </p>

          <div className="detailCard premiumDetailCard">
            <div className="detailCard__title premiumDetailCard__title">
              <span aria-hidden="true">🔒</span>
              <span>Premium Planning Details</span>
            </div>
            {!canViewPremiumDetails ? (
              <div className="detailCard__body premiumDetailCard__body">
                <p className="premiumDetailCard__copy">
                  Locked — Upgrade to view vendor, parking, restroom, seating, and travel/lodging details.
                </p>
                {needsEmailVerification ? (
                  <p className="premiumDetailCard__copy" style={{ marginTop: 6 }}>
                    Verify your email to unlock Insider access first. <Link href="/verify-email">Verify email</Link>
                  </p>
                ) : tier === "explorer" ? (
                  <p className="premiumDetailCard__copy" style={{ marginTop: 6 }}>
                    Log in for Insider access. <Link href="/login">Log in</Link> or <Link href="/signup">sign up</Link>.
                  </p>
                ) : null}
                <div className="detailLinksRow">
                  <Link className="secondaryLink" href="/pricing">
                    Upgrade
                  </Link>
                </div>
                <PremiumInterestForm initialEmail={viewerEmail} />
              </div>
            ) : (
              <div className="detailCard__body premiumDetailCard__body">
                <div className="premiumDetailRow">
                  <span className="premiumDetailLabel">Venue-level premium details</span>
                  <span>Use the “Premium planning details” button on each venue card above.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
