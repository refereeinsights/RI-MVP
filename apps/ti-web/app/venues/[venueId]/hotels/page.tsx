import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SITE_ORIGIN } from "@/lib/sitemaps";
import { getVenueHref } from "@/lib/venues/getVenueHref";
import { resolveSharedVenueByParam } from "../../../../../../packages/lib/venue";
import type { SharedVenueSourceRow, SharedVenue, SharedVenueTournamentSummary } from "../../../../../../packages/lib/venue";
import {
  isVenueHotelPageEligible,
  isVenueHotelPilotIndexable,
  getVenueTournamentCount24mo,
} from "@/lib/venueHotelPilot";
import VenueHotelSearchForm from "./VenueHotelSearchForm";
import "../../tournaments/tournaments.css";

export const revalidate = 3600;

// ─── Venue resolver ───────────────────────────────────────────────────────────

async function fetchVenueByParam(param: string): Promise<{
  venue: SharedVenueSourceRow | null;
  sharedVenue: SharedVenue | null;
  redirectTo: string | null;
}> {
  const resolved = await resolveSharedVenueByParam(supabaseAdmin, param, {
    allowLegacyAddressSlugLookup: true,
  });
  const canonicalSlug = resolved.canonicalParam;
  const sourceRow = resolved.sourceRow;
  const redirectTo =
    canonicalSlug && sourceRow
      ? `/venues/${encodeURIComponent(canonicalSlug)}/hotels`
      : null;
  return { venue: sourceRow, sharedVenue: resolved.venue, redirectTo };
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: { venueId: string } }): Promise<Metadata> {
  const { venue, redirectTo } = await fetchVenueByParam(params.venueId);

  if (redirectTo) {
    return { alternates: { canonical: `${SITE_ORIGIN}${redirectTo}` } };
  }
  if (!venue?.seo_slug) {
    return { robots: { index: false, follow: false } };
  }

  if (!isVenueHotelPageEligible(venue)) {
    return { robots: { index: false, follow: false } };
  }

  const name = venue.name ?? "Tournament venue";
  const location = [venue.city, venue.state].filter(Boolean).join(", ");
  const title = location
    ? `Hotels near ${name} | ${location} | TournamentInsights`
    : `Hotels near ${name} | TournamentInsights`;
  const description = `Find hotels near ${name}${location ? ` in ${location}` : ""}. Browse options and search availability for your tournament stay.`;
  const canonicalUrl = `${SITE_ORIGIN}/venues/${encodeURIComponent(venue.seo_slug)}/hotels`;

  const tournamentCount = await getVenueTournamentCount24mo(venue.id);
  const indexable = isVenueHotelPilotIndexable(venue, tournamentCount);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, url: canonicalUrl },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function VenueHotelsPage({ params }: { params: { venueId: string } }) {
  const { venue, sharedVenue, redirectTo } = await fetchVenueByParam(params.venueId);

  if (redirectTo) permanentRedirect(redirectTo);
  if (!venue?.seo_slug) notFound();
  if (!isVenueHotelPageEligible(venue)) notFound();

  const venueName = venue.name ?? "Venue";
  const city = venue.city ?? "";
  const state = venue.state ?? "";
  const address = venue.address;
  const locationLine = [city, state].filter(Boolean).join(", ");

  const venueHref = getVenueHref({ id: venue.id, seo_slug: venue.seo_slug });
  const canonicalUrl = `${SITE_ORIGIN}/venues/${encodeURIComponent(venue.seo_slug)}/hotels`;

  const lat = typeof venue.latitude === "number" ? venue.latitude : null;
  const lng = typeof venue.longitude === "number" ? venue.longitude : null;

  const now = new Date().toISOString().slice(0, 10);
  const upcomingTournaments: SharedVenueTournamentSummary[] = (sharedVenue?.tournaments ?? [])
    .filter((t: SharedVenueTournamentSummary) => (t.startDate ?? "") >= now)
    .slice(0, 5);

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_ORIGIN },
      { "@type": "ListItem", position: 2, name: "Venues", item: `${SITE_ORIGIN}/venues` },
      { "@type": "ListItem", position: 3, name: venueName, item: `${SITE_ORIGIN}${venueHref}` },
      { "@type": "ListItem", position: 4, name: "Hotels", item: canonicalUrl },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <div style={{ maxWidth: "820px", margin: "0 auto", padding: "24px 16px 48px" }}>
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" style={{ fontSize: "0.8125rem", color: "#6b7280", marginBottom: "20px" }}>
          <Link href="/" style={{ color: "#6b7280", textDecoration: "none" }}>
            Home
          </Link>
          {" / "}
          <Link href="/venues" style={{ color: "#6b7280", textDecoration: "none" }}>
            Venues
          </Link>
          {" / "}
          <Link href={venueHref} style={{ color: "#6b7280", textDecoration: "none" }}>
            {venueName}
          </Link>
          {" / "}
          <span aria-current="page">Hotels</span>
        </nav>

        {/* Header */}
        <h1
          style={{
            fontSize: "clamp(1.375rem, 4vw, 1.875rem)",
            fontWeight: 700,
            margin: "0 0 4px",
            lineHeight: 1.2,
            color: "var(--text-primary, #111)",
          }}
        >
          Hotels near {venueName}
        </h1>

        {locationLine && (
          <p style={{ margin: "0 0 4px", color: "#6b7280", fontSize: "1rem" }}>{locationLine}</p>
        )}
        {address && (
          <p style={{ margin: "0 0 20px", color: "#9ca3af", fontSize: "0.875rem" }}>{address}</p>
        )}

        {/* Search form */}
        <div
          style={{
            background: "var(--card-bg, #f9fafb)",
            border: "1px solid var(--border-color, #e5e7eb)",
            borderRadius: "10px",
            padding: "20px",
            marginBottom: "28px",
          }}
        >
          <p style={{ margin: "0 0 14px", fontSize: "0.9375rem", color: "var(--text-secondary, #374151)" }}>
            Choose your stay dates to search hotel availability near this venue.
          </p>
          <VenueHotelSearchForm
            venueId={venue.id}
            venueName={venueName}
            latitude={lat}
            longitude={lng}
          />
        </div>

        {/* Team travel secondary CTA */}
        <div
          style={{
            borderTop: "1px solid var(--border-color, #e5e7eb)",
            paddingTop: "20px",
            marginBottom: "32px",
          }}
        >
          <p style={{ margin: "0 0 8px", fontSize: "0.9375rem", color: "var(--text-secondary, #374151)" }}>
            Traveling with a team?{" "}
            <Link
              href="/book-travel#team-hotel-blocks"
              style={{ color: "#1a6c3f", fontWeight: 600, textDecoration: "none" }}
            >
              Request team hotel options
            </Link>{" "}
            for groups of 5+ rooms.
          </p>
        </div>

        {/* Upcoming tournaments */}
        {upcomingTournaments.length > 0 && (
          <section aria-label="Upcoming tournaments at this venue">
            <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, margin: "0 0 12px", color: "var(--text-primary, #111)" }}>
              Upcoming tournaments at {venueName}
            </h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
              {upcomingTournaments.map((t) => (
                <li
                  key={t.id}
                  style={{
                    background: "var(--card-bg, #f9fafb)",
                    border: "1px solid var(--border-color, #e5e7eb)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: "6px",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--text-primary, #111)" }}>
                      {t.slug ? (
                        <Link href={`/tournaments/${t.slug}`} style={{ color: "inherit", textDecoration: "none" }}>
                          {t.name ?? "Tournament"}
                        </Link>
                      ) : (
                        (t.name ?? "Tournament")
                      )}
                    </div>
                    {t.sport && (
                      <div style={{ fontSize: "0.8125rem", color: "#6b7280", marginTop: "2px" }}>{t.sport}</div>
                    )}
                  </div>
                  {t.startDate && (
                    <div style={{ fontSize: "0.8125rem", color: "#6b7280", whiteSpace: "nowrap" }}>
                      {t.startDate}
                      {t.endDate && t.endDate !== t.startDate ? ` – ${t.endDate}` : ""}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Back to venue link */}
        <div style={{ marginTop: "32px", paddingTop: "20px", borderTop: "1px solid var(--border-color, #e5e7eb)" }}>
          <Link href={venueHref} style={{ color: "#1a6c3f", fontSize: "0.9375rem", textDecoration: "none" }}>
            ← Back to {venueName}
          </Link>
        </div>
      </div>
    </>
  );
}
