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
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { demoPremium?: string };
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
  const demoPreviewEnabled = (searchParams?.demoPremium ?? "") === "1";
  const isDemoTournament = (data.slug ?? params.slug) === DEMO_TOURNAMENT_SLUG;
  const canViewPremiumDetails = isPaid || (isDemoTournament && demoPreviewEnabled);

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

  if (canViewPremiumDetails) {
    const [{ data: tournamentPaidData }, { data: venuePaidRows }] = await Promise.all([
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

          {data.official_website_url ? (
            <div className="detailLinksRow">
              <a className="secondaryLink" href={data.official_website_url} target="_blank" rel="noopener noreferrer">
                Official site
              </a>
            </div>
          ) : null}

          {linkedVenues.length > 0 ? (
            linkedVenues.map((venue) => {
              const venueLoc = buildLocationLabel(venue.city, venue.state);
              const addressLine = [venue.address, venueLoc].filter(Boolean).join(", ");
              const hasVenueMap = (venue.address || venue.name) && venue.city && venue.state;
              const venueQuery = hasVenueMap
                ? [venue.name, venue.address, venue.city, venue.state, venue.zip].filter(Boolean).join(", ")
                : "";
              const venueMapLinks = venueQuery ? buildMapLinks(venueQuery) : null;

              return (
                <div className="detailCard" key={venue.id}>
                  <div className="detailCard__title">Venue</div>
                  <div className="detailCard__body">
                    <div className="detailVenueRow">
                      <div className="detailVenueText">
                        <div className="detailVenueName">{venue.name || "Venue TBA"}</div>
                        {addressLine ? <div className="detailVenueAddress">{addressLine}</div> : null}
                      </div>
                      {venueMapLinks ? (
                        <div className="detailLinksRow detailLinksRow--inline">
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
                  {isDemoTournament ? (
                    <Link className="secondaryLink" href={`/tournaments/${params.slug}?demoPremium=1`}>
                      Preview premium details
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="detailCard__body premiumDetailCard__body">
                {isDemoTournament && !isPaid ? (
                  <div className="detailLinksRow">
                    <Link className="secondaryLink" href={`/tournaments/${params.slug}`}>
                      Hide preview
                    </Link>
                  </div>
                ) : null}
                <div className="premiumDetailRow">
                  <span className="premiumDetailLabel">Travel/Lodging Notes</span>
                  <span>{paidTournamentDetails?.travel_lodging?.trim() || "Not provided yet."}</span>
                </div>
                {linkedVenues.length > 0 ? (
                  linkedVenues.map((venue) => {
                    const premium = paidVenueDetailsById.get(venue.id);
                    return (
                      <div className="premiumVenueBlock" key={`premium-${venue.id}`}>
                        <div className="premiumVenueTitle">{venue.name || "Venue"}</div>
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
                      </div>
                    );
                  })
                ) : (
                  <div className="premiumDetailRow">
                    <span className="premiumDetailLabel">Venue details</span>
                    <span>No linked venues available yet.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
