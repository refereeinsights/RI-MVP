import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import RiVenueDetailAnalytics, { RiVenueExternalLink, RiVenueInternalLink } from "@/components/analytics/RiVenueAnalytics";
import VenueIndexBadge from "@/components/VenueIndexBadge";
import RiVenueAirportSection from "@/components/venues/RiVenueAirportSection";
import RiVenueNearbySection from "@/components/venues/RiVenueNearbySection";
import RiVenueHotelResultsTracker from "@/components/venues/RiVenueHotelResultsTracker";
import RiVenueMap from "@/components/venues/RiVenueMap";
import MobileMapLink from "@/components/venues/MobileMapLink";
import { getSportCardClass } from "@/lib/ui/sportBackground";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVenueHref } from "@/lib/venues/getVenueHref";
import { buildVenueTitle } from "@/lib/seo/buildTitle";
import {
  selectVenueAirport,
  buildNearbyCounts,
  groupNearbyPlaces,
  resolveSharedVenueByParam,
  type VenueAirportLookup,
  type NearbyPlaceRow,
  type SharedVenueSourceRow,
  type SharedVenueTournamentSummary,
} from "../../../../../packages/lib/venue";
import { buildMapDirectionsLinks, hasValidCoordinates } from "../../../../../packages/lib/tournament-map";
import { formatEntityList, type SemanticListItem, type SemanticListPart } from "../../../../../shared/semantic/formatEntityList";
import "../../tournaments/tournaments.css";

type OwlsEyeRunRow = {
  id: string;
  run_id?: string | null;
  venue_id: string;
  status: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  outputs?: {
    airports?: VenueAirportLookup | null;
  } | null;
};

type RiVenueHotelResult = {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  addressLine1?: string | null;
  distanceMiles?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  thumbnailUrl?: string | null;
  currency?: string | null;
  fromPrice?: number | null;
  hotelIDTypeID?: number | null;
  detailUrl?: string | null;
};

type RiVenueHotelSearchFallback = {
  showHotelFallback: boolean;
  showVrboFallback: boolean;
  reason?: string;
};

type RiVenueHotelSearchResponse = {
  provider?: string;
  hotels?: unknown[];
  fallback?: RiVenueHotelSearchFallback | null;
  resolvedCheckIn?: string | null;
  resolvedCheckOut?: string | null;
  error?: string;
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

function getTiOrigin() {
  const configured = String(process.env.NEXT_PUBLIC_TI_SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "https://www.tournamentinsights.com" : "http://localhost:3001";
}

function formatCurrency(value: number | null | undefined, currency = "USD") {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${Math.round(value)}`;
  }
}

function normalizeHotelResult(value: unknown): RiVenueHotelResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!id || !name) return null;

  const asText = (input: unknown) => (typeof input === "string" && input.trim() ? input.trim() : null);
  const asNumber = (input: unknown) => {
    const n = typeof input === "number" ? input : Number(input);
    return Number.isFinite(n) ? n : null;
  };

  return {
    id,
    name,
    city: asText(row.city),
    state: asText(row.state),
    addressLine1: asText(row.addressLine1),
    distanceMiles: asNumber(row.distanceMiles),
    rating: asNumber(row.rating),
    reviewCount: asNumber(row.reviewCount),
    thumbnailUrl: asText(row.thumbnailUrl),
    currency: asText(row.currency),
    fromPrice: asNumber(row.fromPrice),
    hotelIDTypeID: asNumber(row.hotelIDTypeID),
    detailUrl: asText(row.detailUrl),
  };
}

async function fetchRiVenueHotels(args: { tiOrigin: string; venueId: string; tournamentId: string | null; pagePath: string }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    // RI intentionally reuses TI's provider/search stack over HTTP so HP credentials stay on TI only.
    // TI rate limiting is caller-IP based, so RI SSR traffic shares the server IP. Keep this narrow and fail open.
    const response = await fetch(`${args.tiOrigin}/api/lodging/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        venueId: args.venueId,
        ...(args.tournamentId ? { tournamentId: args.tournamentId } : {}),
        source: "referee_venue_detail",
        page_type: "referee",
        page_url: args.pagePath,
        cta_placement: "ri_venue_detail_hotels",
        flow_type: "referee_travel",
        current_page_type: "referee",
        current_page_path: args.pagePath,
        request_source: "referee_venue_detail",
        custom8: "app:refereeinsights",
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as RiVenueHotelSearchResponse | null;
    if (!response.ok || !payload) {
      return {
        hotels: [] as RiVenueHotelResult[],
        fallback: { showHotelFallback: true, showVrboFallback: true, reason: payload?.error ? "provider_error" : "invalid_response" },
        resolvedCheckIn: payload?.resolvedCheckIn ?? null,
        resolvedCheckOut: payload?.resolvedCheckOut ?? null,
      };
    }

    return {
      hotels: Array.isArray(payload.hotels) ? payload.hotels.map(normalizeHotelResult).filter((item): item is RiVenueHotelResult => Boolean(item)) : [],
      fallback: payload.fallback ?? null,
      resolvedCheckIn: payload.resolvedCheckIn ?? null,
      resolvedCheckOut: payload.resolvedCheckOut ?? null,
    };
  } catch (error) {
    console.warn("[ri venue detail] hotel search fallback", {
      venueId: args.venueId,
      tournamentId: args.tournamentId,
      message: error instanceof Error ? error.message : "unknown error",
    });
    return {
      hotels: [] as RiVenueHotelResult[],
      fallback: { showHotelFallback: true, showVrboFallback: true, reason: "provider_error" },
      resolvedCheckIn: null,
      resolvedCheckOut: null,
    };
  } finally {
    clearTimeout(timeout);
  }
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

export const revalidate = 3600;

function renderSemanticParts(parts: SemanticListPart[]) {
  return parts.map((part, idx) => {
    if (part.type === "text") return <span key={`t-${idx}`}>{part.value}</span>;
    return (
      <Link key={`l-${idx}`} href={part.href} style={{ textDecoration: "underline" }}>
        {part.label}
      </Link>
    );
  });
}

export async function generateMetadata({ params }: { params: { venueId: string } }) {
  const { venue, redirectTo } = await fetchVenueByParam(params.venueId);
  const siteOrigin = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.refereeinsights.com").replace(/\/+$/, "");
  if (redirectTo) {
    return { alternates: { canonical: `${siteOrigin}${redirectTo}` } };
  }
  if (!venue) return {};

  const title = buildVenueTitle(venue.name ?? "Venue", venue.city ?? null, venue.state ?? null);
  const canonical = `${siteOrigin}${getVenueHref(venue)}`;
  const desc = [
    `${venue.name ?? "Venue"} venue guide`,
    venue.city || venue.state ? `for officials working in ${[venue.city, venue.state].filter(Boolean).join(", ")}` : null,
    "with linked tournaments, nearby hotels, coffee, food, and directions.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title,
    description: desc,
    alternates: { canonical },
  };
}

async function fetchVenueByParam(param: string): Promise<{
  venue: SharedVenueSourceRow | null;
  sharedVenue: { tournaments: SharedVenueTournamentSummary[] } | null;
  redirectTo: string | null;
}> {
  const resolved = await resolveSharedVenueByParam(supabaseAdmin, param);
  return {
    venue: resolved.sourceRow,
    sharedVenue: resolved.venue,
    redirectTo: resolved.canonicalParam && resolved.sourceRow ? getVenueHref({ id: resolved.sourceRow.id, seo_slug: resolved.canonicalParam }) : null,
  };
}

export default async function VenueDetailsPage({ params }: { params: { venueId: string } }) {
  const { venue, sharedVenue, redirectTo } = await fetchVenueByParam(params.venueId);
  if (redirectTo) redirect(redirectTo);
  if (!venue?.id) notFound();
  const data = venue;

  const linkedTournaments = sharedVenue?.tournaments ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const upcomingTournaments = linkedTournaments
    .filter((t) => Boolean((t.startDate && t.startDate >= today) || (t.endDate && t.endDate >= today)))
    .sort((a, b) => (a.startDate ?? "9999-12-31").localeCompare(b.startDate ?? "9999-12-31"));

  const tiOrigin = getTiOrigin();
  const venuePath = getVenueHref(data);
  const nearestTournamentId = upcomingTournaments[0]?.id ?? null;
  const nearestTournamentSlug = upcomingTournaments[0]?.slug ?? null;
  const travelHotelsHref = `${tiOrigin}/go/hotels?${new URLSearchParams({
    venueId: data.id,
    ...(nearestTournamentId ? { tournamentId: nearestTournamentId } : {}),
    source: "referee_venue_detail",
    pageType: "referee",
    cta_placement: "ri_venue_detail_hotels",
    flow_type: "referee_travel",
    custom8: "app:refereeinsights",
  }).toString()}`;
  const travelRentalsHref = `${tiOrigin}/go/vrbo?${new URLSearchParams({
    venueId: data.id,
    ...(nearestTournamentId ? { tournamentId: nearestTournamentId } : {}),
    source: "referee_venue_detail",
  }).toString()}`;
  const hotelSearch = await fetchRiVenueHotels({
    tiOrigin,
    venueId: data.id,
    tournamentId: nearestTournamentId,
    pagePath: venuePath,
  });
  const venueHotels = hotelSearch.hotels;
  const venueHotelsFallbackReason = hotelSearch.fallback?.reason ?? null;
  const showVenueHotelResults = venueHotels.length > 0;
  const showVenueHotelFallback = !showVenueHotelResults;

  const semanticLocationSentence = (() => {
    const name = data.name ?? "This venue";
    const city = (data.city ?? "").trim();
    const state = (data.state ?? "").trim();
    if (city && state) return `${name} is a sports venue located in ${city}, ${state}.`;
    if (state) return `${name} is a sports venue located in ${state}.`;
    return `${name} is a sports venue.`;
  })();

  const semanticTournamentCandidates = linkedTournaments
    .filter((t) => {
      const start = (t.startDate ?? "").trim();
      if (!start) return false;
      return start >= cutoffIso;
    })
    .sort((a, b) => {
      const dateCmp = (a.startDate ?? "9999-12-31").localeCompare(b.startDate ?? "9999-12-31");
      if (dateCmp !== 0) return dateCmp;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

  const MAX_TOURNAMENTS_IN_SENTENCE = 8;
  const semanticTournamentUniqueCount = new Set(semanticTournamentCandidates.map((t) => t.id)).size;
  const semanticTournamentItems: SemanticListItem[] = semanticTournamentCandidates
    .slice(0, MAX_TOURNAMENTS_IN_SENTENCE + 1)
    .map((t) => ({
      id: t.id,
      label: t.name ?? "",
      href: t.slug ? `/tournaments/${t.slug}` : null,
    }));
  const semanticTournaments = formatEntityList(semanticTournamentItems, {
    maxItems: MAX_TOURNAMENTS_IN_SENTENCE,
    overflowNoun: "tournaments",
    overflow:
      semanticTournamentUniqueCount > MAX_TOURNAMENTS_IN_SENTENCE
        ? { kind: "known", remainingCount: semanticTournamentUniqueCount - MAX_TOURNAMENTS_IN_SENTENCE }
        : { kind: "none" },
    truncateLabelAt: 120,
  });

  const sportsFromTournaments = Array.from(new Set(linkedTournaments.map((t) => canonicalSport(t.sport)).filter((sport) => sport !== "unknown")));
  if (sportsFromTournaments.length === 0) {
    const fallback = canonicalSport(data.sport);
    if (fallback !== "unknown") sportsFromTournaments.push(fallback);
  }

  const sportSurfaceClass = getVenueCardClassFromSports(sportsFromTournaments);
  const locationLabel = [data.city, data.state].filter(Boolean).join(", ");
  const addressLabel = [data.address, data.city, data.state, data.zip].filter(Boolean).join(", ");
  const mapLinks = buildMapDirectionsLinks({
    latitude: data.latitude,
    longitude: data.longitude,
    label: data.name,
    address: addressLabel,
  });
  if (!hasValidCoordinates(data.latitude, data.longitude)) {
    console.warn("[ri venue detail] missing venue coordinates", { venueId: data.id, venueSlug: data.seo_slug ?? null });
  }

  const runRows = await fetchLatestOwlsEyeRuns([data.id]);
  const latestRun = runRows.find((row) => row.venue_id === data.id) ?? null;
  const latestRunId = latestRun ? latestRun.run_id ?? latestRun.id : null;
  const airportSelection = selectVenueAirport(latestRun?.outputs?.airports ?? null);

  let nearbyCounts = { food: 0, coffee: 0, hotels: 0, sporting_goods: 0 };
  let nearbyGroups = null as ReturnType<typeof groupNearbyPlaces> | null;

  if (latestRunId) {
    const { data: nearbyRows } = await supabaseAdmin
      .from("owls_eye_nearby_food" as any)
      .select("run_id,category,name,distance_meters,maps_url,is_sponsor,sponsor_click_url")
      .eq("run_id", latestRunId)
      .order("is_sponsor", { ascending: false })
      .order("distance_meters", { ascending: true })
      .order("name", { ascending: true });

    const rows = (nearbyRows as NearbyPlaceRow[] | null) ?? [];
    nearbyGroups = groupNearbyPlaces(rows);
    const counts = buildNearbyCounts(nearbyGroups);
    nearbyCounts = {
      food: counts.food,
      coffee: counts.coffee,
      hotels: counts.hotels,
      sporting_goods: counts.sportingGoods,
    };
  }
  const visibleNearbyCounts = {
    food: nearbyCounts.food,
    coffee: nearbyCounts.coffee,
    hotels: 0,
    sporting_goods: nearbyCounts.sporting_goods,
  };
  const hasNearbyData = visibleNearbyCounts.food + visibleNearbyCounts.coffee + visibleNearbyCounts.hotels + visibleNearbyCounts.sporting_goods > 0;

  return (
    <main className="pitchWrap tournamentsWrap">
      <RiVenueDetailAnalytics
        venueId={data.id}
        venueName={data.name || "Venue"}
        city={data.city}
        state={data.state}
        linkedTournamentCount={linkedTournaments.length}
        nearbyHotelCount={visibleNearbyCounts.hotels}
        nearbyCoffeeCount={nearbyCounts.coffee}
        nearbyFoodCount={nearbyCounts.food}
        hasOwlsEye={hasNearbyData}
      />
      <section className={`detailHero ${sportSurfaceClass}`}>
        <div className="detailHero__overlay">
          <article className="detailPanel">
            <RiVenueHotelResultsTracker
              venueId={data.id}
              tournamentId={nearestTournamentId}
              hotelCount={venueHotels.length}
              fallbackReason={showVenueHotelResults ? null : venueHotelsFallbackReason}
              resolvedCheckIn={hotelSearch.resolvedCheckIn}
              resolvedCheckOut={hotelSearch.resolvedCheckOut}
              dateSource="tournament"
            />
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
                  <RiVenueExternalLink
                    href={data.venue_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="secondaryLink"
                    eventName="ri_venue_site_clicked"
                    sourcePageType="venue_detail"
                    venueId={data.id}
                    venueName={data.name || "Venue"}
                    city={data.city}
                    state={data.state}
                    targetKind="venue_site"
                    linkedTournamentCount={linkedTournaments.length}
                  >
                    Venue site
                  </RiVenueExternalLink>
                ) : null}
                {mapLinks ? (
                  <MobileMapLink provider="apple" query={mapLinks.query} fallbackHref={mapLinks.apple} className="primaryLink">
                    View map
                  </MobileMapLink>
                ) : null}
              </div>

              <RiVenueMap
                venueId={data.id}
                venueName={data.name || "Venue"}
                addressLabel={addressLabel || null}
                city={data.city}
                state={data.state}
                latitude={data.latitude}
                longitude={data.longitude}
                linkedTournamentCount={linkedTournaments.length}
              />

              {showVenueHotelResults ? (
                <div className="detailCard" style={{ width: "min(720px, 100%)", display: "grid", gap: 12 }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={{ fontWeight: 900, fontSize: 18, color: "rgba(248, 250, 252, 0.98)" }}>
                      Hotels near this venue
                    </div>
                    <div style={{ color: "rgba(226, 232, 240, 0.9)", fontSize: 14, lineHeight: 1.5 }}>
                      Live HotelPlanner results
                      {hotelSearch.resolvedCheckIn || hotelSearch.resolvedCheckOut
                        ? ` • ${hotelSearch.resolvedCheckIn || "—"} → ${hotelSearch.resolvedCheckOut || "—"}`
                        : ""}
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {venueHotels.slice(0, 8).map((hotel) => {
                      const propertyHref = `${tiOrigin}/go/hotels/property?${new URLSearchParams({
                        hotelId: hotel.id,
                        idTypeId: String(hotel.hotelIDTypeID ?? 0),
                        ...(hotelSearch.resolvedCheckIn ? { inDate: hotelSearch.resolvedCheckIn } : {}),
                        ...(hotelSearch.resolvedCheckOut ? { outDate: hotelSearch.resolvedCheckOut } : {}),
                        venueId: data.id,
                        ...(nearestTournamentId ? { tournamentId: nearestTournamentId } : {}),
                        ...(nearestTournamentSlug ? { tournament_slug: nearestTournamentSlug } : {}),
                        source: "referee_venue_detail",
                        page_type: "referee",
                        cta_placement: "ri_venue_detail_hotels",
                        flow_type: "referee_travel",
                        page_url: venuePath,
                        custom8: "app:refereeinsights",
                      }).toString()}`;

                      return (
                        <RiVenueExternalLink
                          key={hotel.id}
                          href={propertyHref}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                          className="secondaryLink"
                          eventName="ri_venue_hotel_card_clicked"
                          sourcePageType="venue_detail"
                          venueId={data.id}
                          venueName={data.name || "Venue"}
                          city={data.city}
                          state={data.state}
                          targetKind="hotel_outbound"
                          nearbyCategory="hotels"
                          linkedTournamentCount={linkedTournaments.length}
                          sourceSurface="venue_hotel_results"
                          ctaPlacement="ri_venue_detail_hotels"
                          outboundPartner="hotelplanner"
                          outboundDestinationType="hotels"
                          tournamentId={nearestTournamentId}
                          tournamentSlug={nearestTournamentSlug}
                          sport={sportsFromTournaments[0] ?? null}
                          extraProperties={{
                            hotel_id: hotel.id,
                            hotel_name: hotel.name,
                            hotel_rate: hotel.fromPrice ?? null,
                            resolved_check_in: hotelSearch.resolvedCheckIn ?? null,
                            resolved_check_out: hotelSearch.resolvedCheckOut ?? null,
                            date_source: "tournament",
                          }}
                          style={{
                            display: "grid",
                            gap: 6,
                            textDecoration: "none",
                            border: "1px solid rgba(15, 61, 46, 0.12)",
                            borderRadius: 12,
                            padding: 14,
                            background: "#fff",
                            color: "#0f172a",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                            <strong>{hotel.name}</strong>
                            <span style={{ fontWeight: 800, color: "#0f3d2e" }}>
                              {formatCurrency(hotel.fromPrice, hotel.currency || "USD") || "Price on request"}
                            </span>
                          </div>
                          <div style={{ color: "#475569", fontSize: 14 }}>
                            {[hotel.addressLine1, [hotel.city, hotel.state].filter(Boolean).join(", ")].filter(Boolean).join(" • ")}
                            {hotel.distanceMiles != null ? ` • ${hotel.distanceMiles.toFixed(1)} mi` : ""}
                          </div>
                        </RiVenueExternalLink>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {airportSelection ? (
                <RiVenueAirportSection
                  venue={{
                    id: data.id,
                    name: data.name || "Venue",
                    city: data.city,
                    state: data.state,
                  }}
                  airport={airportSelection.airport}
                  sourceKind={airportSelection.sourceKind}
                  linkedTournamentCount={linkedTournaments.length}
                />
              ) : null}

              {nearbyGroups ? (
                <RiVenueNearbySection
                  venue={{
                    id: data.id,
                    name: data.name || "Venue",
                    city: data.city,
                    state: data.state,
                  }}
                  linkedTournamentCount={linkedTournaments.length}
                  nearbyCounts={{
                    food: visibleNearbyCounts.food,
                    coffee: visibleNearbyCounts.coffee,
                    hotels: 0,
                    sportingGoods: visibleNearbyCounts.sporting_goods,
                  }}
                  nearbyGroups={{
                    ...nearbyGroups,
                    hotels: [],
                  }}
                />
              ) : null}

              <div className="detailCard" style={{ width: "min(720px, 100%)" }}>
                <div className="detailLinksRow">
                  {showVenueHotelFallback ? (
                    <RiVenueExternalLink
                      className="secondaryLink"
                      href={travelHotelsHref}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      eventName="ri_venue_hotels_cta_clicked"
                      sourcePageType="venue_detail"
                      venueId={data.id}
                      venueName={data.name || "Venue"}
                      city={data.city}
                      state={data.state}
                      targetKind="hotel_outbound"
                      nearbyCategory="hotels"
                      linkedTournamentCount={linkedTournaments.length}
                      sourceSurface="venue_detail"
                      ctaPlacement="ri_venue_detail_hotels"
                      outboundPartner="hotelplanner"
                      outboundDestinationType="hotels"
                      tournamentId={nearestTournamentId}
                      tournamentSlug={nearestTournamentSlug}
                      sport={sportsFromTournaments[0] ?? null}
                      extraProperties={{
                        fallback_reason: venueHotelsFallbackReason,
                        date_source: "tournament",
                      }}
                    >
                      🏨 Find hotels near this venue
                    </RiVenueExternalLink>
                  ) : null}
                  <RiVenueExternalLink
                    className="secondaryLink"
                    href={travelRentalsHref}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    eventName="ri_venue_rentals_clicked"
                    sourcePageType="venue_detail"
                    venueId={data.id}
                    venueName={data.name || "Venue"}
                    city={data.city}
                    state={data.state}
                    targetKind="rental_outbound"
                    linkedTournamentCount={linkedTournaments.length}
                  >
                    🏠 Search rentals near this venue
                  </RiVenueExternalLink>
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: "rgba(226, 232, 240, 0.9)",
                    lineHeight: 1.45,
                    textAlign: "center",
                  }}
                >
                  This page may contain affiliate links. RefereeInsights may earn a commission if you book through these links, at
                  no additional cost to you.
                </div>
              </div>

              {linkedTournaments.length > 0 ? (
                <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
                  <p style={{ margin: 0, fontWeight: 700, color: "rgba(248, 250, 252, 0.98)" }}>Tournaments at this venue</p>
                  <div style={{ display: "grid", gap: 6 }}>
                    {[...linkedTournaments]
                      .sort((a, b) => (a.startDate ?? "9999-12-31").localeCompare(b.startDate ?? "9999-12-31"))
                      .map((t) => {
                      if (!t.slug || !t.name) return null;
                      const start = formatDate(t.startDate);
                      const end = formatDate(t.endDate);
                      const dateLabel = start && end && start !== end ? `${start} - ${end}` : start || end || "Dates TBA";
                      const tournamentLocation = [t.city, t.state].filter(Boolean).join(", ");
                      const tournamentMeta = [t.sport, tournamentLocation].filter(Boolean).join(" • ");
                      return (
                        <RiVenueInternalLink
                          key={t.id}
                          href={`/tournaments/${t.slug}`}
                          className="secondaryLink"
                          style={{ justifyContent: "space-between", width: "100%" }}
                          eventName="ri_venue_tournament_clicked"
                          sourcePageType="venue_detail"
                          sourcePage="venue_detail_tournaments"
                          venueId={data.id}
                          venueName={data.name || "Venue"}
                          city={data.city}
                          state={data.state}
                          targetKind="linked_tournament"
                          linkedTournamentCount={linkedTournaments.length}
                          tournamentId={t.id}
                          tournamentSlug={t.slug}
                          sport={t.sport}
                        >
                          <span style={{ display: "grid", gap: 2 }}>
                            <span>{t.name}</span>
                            {tournamentMeta ? (
                              <span style={{ fontSize: 12, color: "rgba(226, 232, 240, 0.88)" }}>{tournamentMeta}</span>
                            ) : null}
                          </span>
                          <span style={{ fontSize: 12, color: "rgba(226, 232, 240, 0.92)", textAlign: "right" }}>
                            {dateLabel}
                          </span>
                        </RiVenueInternalLink>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, color: "rgba(226, 232, 240, 0.92)" }}>No tournaments are currently linked to this venue.</p>
              )}

              {data.notes ? (
                <div style={{ marginTop: 6 }}>
                  <p style={{ margin: 0, fontWeight: 700, color: "rgba(248, 250, 252, 0.98)" }}>Notes</p>
                  <p style={{ margin: "4px 0 0", color: "rgba(241, 245, 249, 0.95)", lineHeight: 1.55 }}>{data.notes}</p>
                </div>
              ) : null}

              <div style={{ marginTop: 10, fontSize: 13, color: "rgba(226, 232, 240, 0.9)", lineHeight: 1.5 }}>
                <p style={{ margin: 0 }}>{semanticLocationSentence}</p>
                {semanticTournaments.totalUnique > 0 ? (
                  <p style={{ margin: "6px 0 0" }}>
                    Tournaments played at this venue include {renderSemanticParts(semanticTournaments.parts)}.
                  </p>
                ) : (
                  <p style={{ margin: "6px 0 0" }}>We don’t have any tournaments linked to this venue yet.</p>
                )}
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
