import Link from "next/link";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
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

type PaidTournamentDetails = {
  travel_lodging: string | null;
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
};

type NearbyPlace = {
  name: string;
  distance_meters: number | null;
  address: string | null;
  maps_url: string | null;
  is_sponsor: boolean;
};

export const revalidate = 300;

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://tournamentinsights.com").replace(/\/+$/, "");
const DEMO_TOURNAMENT_SLUG = "refereeinsights-demo-tournament";

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

function resolvePaidEntitlement() {
  // Stub entitlement until TI subscriptions are wired.
  return process.env.TI_FORCE_PAID_TOURNAMENT_DETAILS === "true";
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
  return `${miles < 10 ? miles.toFixed(1) : miles.toFixed(0)} mi`;
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
      alternates: { canonical: buildCanonicalUrl(params.slug) },
    };
  }

  const year = data.start_date ? new Date(`${data.start_date}T00:00:00`).getFullYear() : null;
  const locationLabel = buildLocationLabel(data.city ?? null, data.state ?? null);
  const titlePrefix = year ? `${year} ` : "";
  const monthYear =
    data.start_date && !Number.isNaN(new Date(`${data.start_date}T00:00:00`).getTime())
      ? new Date(`${data.start_date}T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : "";
  const title = `${data.name}${locationLabel ? ` | ${locationLabel}` : ""}${monthYear ? ` | ${monthYear}` : ""} Youth ${data.sport ?? ""} Tournament`.trim();
  const description = `Dates and location for ${data.name}${locationLabel ? ` in ${locationLabel}` : ""}. View official event details and planning information.`;

  return {
    title,
    description,
    alternates: { canonical: buildCanonicalUrl(data.slug ?? params.slug) },
    openGraph: {
      title: `${data.name}${locationLabel ? ` | ${locationLabel}` : ""}`,
      description,
      type: "article",
      url: buildCanonicalUrl(data.slug ?? params.slug),
      siteName: "TournamentInsights",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function TournamentDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const isPaid = resolvePaidEntitlement();
  const { data, error } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select(
      "id,slug,name,city,state,zip,start_date,end_date,summary,source_url,official_website_url,sport,level,venue,address,tournament_venues(venues(id,name,address,city,state,zip,latitude,longitude,venue_url))"
    )
    .eq("slug", params.slug)
    .maybeSingle<TournamentDetailRow>();

  if (error || !data) {
    return (
      <main className="pitchWrap tournamentsWrap">
        <section className="field tournamentsField">
          <div className="headerBlock">
            <h1 className="title">Tournament not found</h1>
            <p className="subtitle">We couldn’t find that tournament.</p>
            <Link href="/tournaments" className="primaryLink">
              Back to directory
            </Link>
          </div>
        </section>
      </main>
    );
  }

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
  const isDemoTournament = (data.slug ?? params.slug) === DEMO_TOURNAMENT_SLUG;
  const canViewPremiumDetails = isPaid || isDemoTournament;

  let paidTournamentDetails: PaidTournamentDetails | null = null;
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
  let hasOwlsEyeByVenueId = new Map<string, boolean>();

  if (canViewPremiumDetails) {
    const [{ data: tournamentPaidData }, { data: venuePaidRows }, runRows] = await Promise.all([
      supabaseAdmin
        .from("tournaments" as any)
        .select("travel_lodging")
        .eq("id", data.id)
        .maybeSingle<PaidTournamentDetails>(),
      linkedVenueIds.length
        ? supabaseAdmin
            .from("tournament_venues" as any)
            .select(
              "venue_id,venues(id,food_vendors,coffee_vendors,tournament_vendors,restrooms,amenities,player_parking,parking_notes,notes,spectator_seating,bring_field_chairs,seating_notes)"
            )
            .eq("tournament_id", data.id)
            .in("venue_id", linkedVenueIds)
        : Promise.resolve({ data: [] as PaidVenueDetailsRow[] }),
      fetchLatestOwlsEyeRuns(linkedVenueIds),
    ]);

    paidTournamentDetails = tournamentPaidData ?? null;
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
      const { data: nearbyRows } = await supabaseAdmin
        .from("owls_eye_nearby_food" as any)
        .select("run_id,category,name,distance_meters,address,maps_url,is_sponsor")
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
          });
          return [
            venueId,
            {
              food: places.filter((p) => (p.category ?? "food") === "food").map(toPlace),
              coffee: places.filter((p) => p.category === "coffee").map(toPlace),
              hotels: places.filter((p) => p.category === "hotel").map(toPlace),
              captured_at: run.updated_at ?? run.created_at ?? null,
            },
          ];
        })
      );
      hasOwlsEyeByVenueId = new Map(
        Array.from(nearbyByVenueId.entries()).map(([venueId, nearby]) => [
          venueId,
          nearby.food.length + nearby.coffee.length + nearby.hotels.length > 0,
        ])
      );
    }
  }

  if (!hasOwlsEyeByVenueId.size && linkedVenueIds.length) {
    const runRows = await fetchLatestOwlsEyeRuns(linkedVenueIds);
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
      const { data: nearbyRows } = await supabaseAdmin
        .from("owls_eye_nearby_food" as any)
        .select("run_id")
        .in("run_id", runIds);
      const nearbyRunIds = new Set(((nearbyRows as Array<{ run_id: string }> | null) ?? []).map((row) => row.run_id));
      hasOwlsEyeByVenueId = new Map(
        Array.from(latestRunByVenue.entries()).map(([venueId, run]) => [venueId, nearbyRunIds.has((run.run_id ?? run.id) as string)])
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
              const streetLine = venue.address?.trim() || "";
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
                    {!canViewPremiumDetails ? (
                      <div className="detailVenuePremiumLock">
                        <span>Premium planning details</span>
                        <Link className="secondaryLink" href="/pricing">
                          Upgrade
                        </Link>
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
                                  <span className="premiumDetailLabel">Travel/Lodging Notes</span>
                                  <span>{paidTournamentDetails?.travel_lodging?.trim() || "Not provided yet."}</span>
                                </div>
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
                                  <span className="premiumDetailLabel">Owl&apos;s Eye nearby</span>
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
                                {nearby ? (
                                  <>
                                    {([
                                      { label: "Food", items: nearby.food },
                                      { label: "Coffee", items: nearby.coffee },
                                      { label: "Hotels", items: nearby.hotels },
                                    ] as Array<{ label: string; items: NearbyPlace[] }>).map((group) =>
                                      group.items.length ? (
                                        <div className="premiumNearbyGroup" key={`${venue.id}-${group.label}`}>
                                          <div className="premiumNearbyGroup__title">{group.label}</div>
                                          <div className="premiumNearbyGroup__list">
                                            {group.items.map((item, idx) => (
                                              <a
                                                key={`${group.label}-${item.name}-${idx}`}
                                                className="premiumNearbyLink"
                                                href={item.maps_url || "#"}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                              >
                                                <span>{item.name}</span>
                                                <span className="premiumNearbyLink__meta">
                                                  {metersToMilesLabel(item.distance_meters) || "Directions"}
                                                </span>
                                              </a>
                                            ))}
                                          </div>
                                        </div>
                                      ) : null
                                    )}
                                  </>
                                ) : null}
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
                <div className="detailLinksRow">
                  <Link className="secondaryLink" href="/pricing">
                    Upgrade
                  </Link>
                </div>
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
