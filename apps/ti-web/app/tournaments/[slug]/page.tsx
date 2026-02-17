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

export const revalidate = 300;

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://tournamentinsights.com").replace(/\/+$/, "");

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
  const supported = new Set(["soccer", "basketball", "football", "baseball"]);
  return supported.has(normalized) ? `bg-sport-${normalized}` : "bg-sport-default";
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  type TournamentMeta = {
    name: string | null;
    city: string | null;
    state: string | null;
    start_date: string | null;
    slug: string | null;
  };
  const { data } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("name,city,state,start_date,slug")
    .eq("slug", params.slug)
    .maybeSingle<TournamentMeta>();

  if (!data) {
    return {
      title: "Tournament listing | Tournament Insights",
      description: "Tournament listing overview without ratings or reviews.",
      alternates: { canonical: buildCanonicalUrl(params.slug) },
    };
  }

  const year = data.start_date ? new Date(`${data.start_date}T00:00:00`).getFullYear() : null;
  const locationLabel = buildLocationLabel(data.city ?? null, data.state ?? null);
  const titlePrefix = year ? `${year} ` : "";
  const title = `${titlePrefix}${data.name}${locationLabel ? ` (${locationLabel})` : ""} | Tournament Insights`;
  const description = `Tournament overview for ${data.name}${locationLabel ? ` (${locationLabel})` : ""}. Logistics-focused details without ratings or reviews.`;

  return {
    title,
    description,
    alternates: { canonical: buildCanonicalUrl(data.slug ?? params.slug) },
  };
}

export default async function TournamentDetailPage({ params }: { params: { slug: string } }) {
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

  return (
    <main className="pitchWrap tournamentsWrap">
      <section className={`detailHero ${sportSurfaceClass}`}>
        <div className="detailHero__overlay">
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
        </div>
      </section>
    </main>
  );
}
