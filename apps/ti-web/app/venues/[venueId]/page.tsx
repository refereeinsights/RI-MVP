import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { canAccessWeekendPro, getTier } from "@/lib/entitlements";
import VenueIndexBadge from "@/components/VenueIndexBadge";
import OwlsEyeVenueCard, { type AirportSummary, type NearbyPlace } from "@/components/venues/OwlsEyeVenueCard";
import MobileMapLink from "@/components/venues/MobileMapLink";
import QuickVenueCheck from "@/components/venues/QuickVenueCheck";
import VenuePageViewTracker from "@/components/analytics/VenuePageViewTracker";
import ShareWeekendButton from "@/components/ShareWeekendButton";
import TeamTravelVenueLink from "@/components/TeamTravelVenueLink";
import HotelBookingCta from "@/components/venues/HotelBookingCta";
import CampspotAffiliateLink from "@/components/affiliates/CampspotAffiliateLink";
import VenueClusterModule from "./VenueClusterModule";
import { buildTeamHotelBookingHref } from "@/lib/teamHotelBooking";
import { evaluateVenueTeamTravelEligibility } from "@/lib/teamTravelEligibility";
import {
  DEMO_STARFIRE_VENUE_ID,
  buildOwlsEyeDemoScores,
  type OwlsEyeDemoScores,
  type VenueReviewChoiceRow,
} from "@/lib/owlsEyeScores";
import { isPremiumPreviewTournamentSlug } from "@/lib/premiumPreview";
import { SITE_ORIGIN } from "@/lib/sitemaps";
import { getVenueHref } from "@/lib/venues/getVenueHref";
import { isUuid } from "@/lib/venues/isUuid";
import { buildHotelsHref, canShowBookingCta } from "@/lib/booking/venueBooking";
import { isVenueHotelPageEligible } from "@/lib/venueHotelPilot";
import {
  buildCampingHref,
  CAMPSPOT_CTA_PLACEMENTS,
  hasValidCampspotDestination,
} from "@/lib/affiliates/campspot";
import { getVenueCardClassFromSports } from "../sportSurface";
import {
  buildVenueClusterCandidates,
  listSharedVenuesByCityState,
  listSharedVenuesByIds,
  resolveSharedVenueByParam,
  type SharedVenue,
  type SharedVenueSourceRow,
} from "../../../../../packages/lib/venue";
import { formatEntityList, type SemanticListItem, type SemanticListPart } from "../../../../../shared/semantic/formatEntityList";
import { isValidLatLng } from "@/lib/staticTournamentMaps";
import { buildPlanningMapUrl } from "@/lib/planningMapUrl";
import "../../tournaments/tournaments.css";
import styles from "./VenueDetail.module.css";

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
  address?: string | null;
  distance_meters: number | null;
  maps_url: string | null;
  is_sponsor: boolean | null;
  sponsor_click_url?: string | null;
  provider?: string | null;
  provider_place_id?: string | null;
  reason_tags?: string[] | null;
};

type TournamentPartnerNearbyRow = {
  id: string;
  venue_id?: string | null;
  category: string | null;
  name: string;
  address?: string | null;
  distance_meters: number | null;
  maps_url: string | null;
  sponsor_click_url?: string | null;
  sort_order?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
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

function formatDateRangeLabel(startIso: string | null, endIso: string | null) {
  if (!startIso && !endIso) return "Dates TBA";
  if (startIso && !endIso) return formatDate(startIso);
  if (!startIso && endIso) return formatDate(endIso);

  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    const fallbackStart = formatDate(startIso);
    const fallbackEnd = formatDate(endIso);
    if (fallbackStart && fallbackEnd && fallbackStart !== fallbackEnd) return `${fallbackStart} – ${fallbackEnd}`;
    return fallbackStart || fallbackEnd || "Dates TBA";
  }

  const sameDay = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === end.getDate();
  if (sameDay) return formatDate(startIso);

  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();

  const fmtMonth = new Intl.DateTimeFormat(undefined, { month: "short" });
  const fmtMonthDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  const fmtMonthDayYear = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

  if (sameMonth) {
    return `${fmtMonth.format(start)} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
  }

  if (sameYear) {
    return `${fmtMonthDay.format(start)} – ${fmtMonthDay.format(end)}, ${start.getFullYear()}`;
  }

  return `${fmtMonthDayYear.format(start)} – ${fmtMonthDayYear.format(end)}`;
}

function buildMapLinks(query: string) {
  const encoded = encodeURIComponent(query);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    apple: `https://maps.apple.com/?q=${encoded}`,
    waze: `https://waze.com/ul?q=${encoded}&navigate=yes`,
  };
}

function buildVenueAbsoluteUrl(venue: { id: string; seo_slug?: string | null }) {
  return `${SITE_ORIGIN}${getVenueHref(venue)}`;
}

function buildVenueStructuredData(venue: SharedVenueSourceRow) {
  const url = buildVenueAbsoluteUrl(venue);
  const hasAddress = [venue.address, venue.city, venue.state, venue.zip].some(Boolean);
  const sameAs = (venue.venue_url ?? "").trim();

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${url}#venue`,
    name: venue.name ?? "Venue",
    url,
    address: hasAddress
      ? {
          "@type": "PostalAddress",
          streetAddress: venue.address ?? undefined,
          addressLocality: venue.city ?? undefined,
          addressRegion: venue.state ?? undefined,
          postalCode: venue.zip ?? undefined,
          addressCountry: "US",
        }
      : undefined,
    sameAs: sameAs || undefined,
  };
}

function normalizeNearbyText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildNearbyDedupKey(row: {
  name: string;
  address?: string | null;
  maps_url?: string | null;
}) {
  const mapKey = normalizeNearbyText(row.maps_url);
  if (mapKey) return `map:${mapKey}`;
  return `text:${normalizeNearbyText(row.name)}|${normalizeNearbyText(row.address)}`;
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

export async function generateMetadata({ params }: { params: { venueId: string } }): Promise<Metadata> {
  const { venue, redirectTo } = await fetchVenueByParam(params.venueId);

  if (redirectTo) {
    return { alternates: { canonical: `${SITE_ORIGIN}${redirectTo}` } };
  }

  if (!venue) {
    return {
      title: "Venue not found | TournamentInsights",
      robots: { index: false, follow: false },
    };
  }

  const data = venue;
  const { buildTIVenueTitle, assertNoDoubleBrand } = await import("@/lib/seo/buildTITitle");
  const title = buildTIVenueTitle(data.name ?? "Tournament venue", data.city, data.state);
  assertNoDoubleBrand(title);
  const description = `Youth sports venue details for ${data.name || "venue"} in ${[data.city, data.state]
    .filter(Boolean)
    .join(", ")}.`;
  const canonical = buildVenueAbsoluteUrl(data);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
  };
}

async function fetchVenueByParam(param: string): Promise<{
  venue: SharedVenueSourceRow | null;
  sharedVenue: SharedVenue | null;
  redirectTo: string | null;
}> {
  const resolved = await resolveSharedVenueByParam(supabaseAdmin, param, { allowLegacyAddressSlugLookup: true });
  return {
    venue: resolved.sourceRow,
    sharedVenue: resolved.venue,
    redirectTo: resolved.canonicalParam && resolved.sourceRow ? getVenueHref({ id: resolved.sourceRow.id, seo_slug: resolved.canonicalParam }) : null,
  };
}

export default async function VenueDetailsPage({
  params,
  searchParams,
}: {
  params: { venueId: string };
  searchParams?: { tournament?: string; venue_sport?: string };
}) {
  const { venue: resolvedVenue, sharedVenue, redirectTo } = await fetchVenueByParam(params.venueId);
  if (redirectTo) permanentRedirect(redirectTo);
  if (!resolvedVenue?.id) notFound();

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: entitlementProfile } = user
    ? await supabase
        .from("ti_users" as any)
        .select("plan,subscription_status,current_period_end,trial_ends_at")
        .eq("id", user.id)
        .maybeSingle<{
          plan: string | null;
          subscription_status: string | null;
          current_period_end: string | null;
          trial_ends_at: string | null;
        }>()
    : {
        data: null as {
          plan: string | null;
          subscription_status: string | null;
          current_period_end: string | null;
          trial_ends_at: string | null;
        } | null,
      };
  const tier = getTier(user, entitlementProfile ?? null);
  const authState: "signed_out" | "unverified" | "verified" = !user ? "signed_out" : user.email_confirmed_at ? "verified" : "unverified";
  const isPaid = canAccessWeekendPro(user, entitlementProfile ?? null);

  const data = resolvedVenue;
  const linkedTournaments = sharedVenue?.tournaments ?? [];
  const canReviewVenue = tier !== "explorer";
  const venueInsightsExtra = await supabaseAdmin
    .from("venues" as any)
    .select("id,player_parking_fee,parking_notes,bring_field_chairs,seating_notes")
    .eq("id", data.id)
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

  const isDemoVenue = data.id === DEMO_STARFIRE_VENUE_ID;
  const requestedTournamentRaw = typeof searchParams?.tournament === "string" ? searchParams.tournament.trim() : "";
  const requestedTournamentId = requestedTournamentRaw && isUuid(requestedTournamentRaw) ? requestedTournamentRaw : "";
  const requestedTournamentSlug = requestedTournamentId ? "" : requestedTournamentRaw.toLowerCase();
  const selectedTournament =
    requestedTournamentId
      ? linkedTournaments.find((t) => t.id === requestedTournamentId) ?? null
      : requestedTournamentSlug.length > 0
        ? linkedTournaments.find((t) => (t.slug ?? "").trim().toLowerCase() === requestedTournamentSlug) ?? null
        : null;
  const hasPremiumPreviewTournament = linkedTournaments.some((t) =>
    isPremiumPreviewTournamentSlug(t.slug)
  );
  const canViewPremiumDetails = isPaid || isDemoVenue || hasPremiumPreviewTournament;

  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const upcomingTournaments = linkedTournaments
    .filter((t) => {
      const startOk = Boolean(t.startDate && t.startDate >= today);
      const endOk = Boolean(t.endDate && t.endDate >= today);
      return startOk || endOk;
    })
    .sort((a, b) => (a.startDate ?? "9999-12-31").localeCompare(b.startDate ?? "9999-12-31"));

  const upcomingTournamentIds = Array.from(new Set(upcomingTournaments.map((tournament) => tournament.id).filter(Boolean)));
  const sameTournamentVenueIds =
    upcomingTournamentIds.length > 0
      ? Array.from(
          new Set(
            (
              (
                await (supabaseAdmin.from("tournament_venues" as any) as any)
                  .select("venue_id")
                  .in("tournament_id", upcomingTournamentIds)
                  .neq("venue_id", data.id)
              ).data as Array<{ venue_id?: string | null }> | null
            )?.map((row) => String(row.venue_id ?? "").trim()).filter(Boolean) ?? []
          )
        )
      : [];
  const sameTournamentVenues = await listSharedVenuesByIds(supabaseAdmin as any, sameTournamentVenueIds);
  const sameCityVenues = await listSharedVenuesByCityState(
    supabaseAdmin as any,
    {
      city: data.city,
      state: data.state,
      excludeVenueId: data.id,
      limit: 24,
    }
  );
  const venueClusterCandidates =
    sharedVenue
      ? buildVenueClusterCandidates({
          currentVenue: sharedVenue,
          sameTournamentVenues,
          sameCityVenues,
          now: new Date(`${today}T12:00:00Z`),
        })
      : [];

  const hasStaticMapPreview =
    Boolean((process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "").trim()) &&
    isValidLatLng(data.latitude, data.longitude);

  const contextTournament = selectedTournament ?? upcomingTournaments[0] ?? null;
  const selectedTournamentHasHotelDates = Boolean(
    selectedTournament?.startDate &&
      selectedTournament?.endDate &&
      (selectedTournament.startDate >= today || selectedTournament.endDate >= today)
  );
  const teamTravelEligibility = evaluateVenueTeamTravelEligibility({
    selectedTournament,
    upcomingTournaments,
    venueId: data.id,
    venueName: data.name ?? null,
    city: data.city ?? null,
    state: data.state ?? null,
  });
  const teamTravelTournament = teamTravelEligibility.tournamentId
    ? linkedTournaments.find((t) => t.id === teamTravelEligibility.tournamentId) ?? null
    : null;

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
  const semanticTournamentItems: SemanticListItem[] = semanticTournamentCandidates.slice(0, MAX_TOURNAMENTS_IN_SENTENCE + 1).map((t) => ({
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

  const sportsFromTournaments = Array.from(
    new Set(
      linkedTournaments
        .map((t) => canonicalSport(t.sport))
        .filter((sport) => sport !== "unknown")
    )
  );
  if (sportsFromTournaments.length === 0) {
    const fallback = canonicalSport(data.sport);
    if (fallback !== "unknown") sportsFromTournaments.push(fallback);
  }

  type VenueSportProfileRow = {
    id: string;
    sport: string;
    restroom_cleanliness_avg?: number | null;
    shade_score_avg?: number | null;
    vendor_score_avg?: number | null;
    parking_convenience_score_avg?: number | null;
    review_count?: number | null;
    reviews_last_updated_at?: string | null;
  };

  const requestedVenueSport = typeof searchParams?.venue_sport === "string" ? searchParams.venue_sport.trim().toLowerCase() : "";
  const venueSportProfilesResp = await supabaseAdmin
    .from("venue_sport_profiles" as any)
    .select("id,sport,restroom_cleanliness_avg,shade_score_avg,vendor_score_avg,parking_convenience_score_avg,review_count,reviews_last_updated_at")
    .eq("venue_id", data.id)
    .order("sport", { ascending: true });
  const venueSportProfilesCode = (venueSportProfilesResp as any)?.error?.code;
  const venueSportProfilesFallback =
    venueSportProfilesResp.error && (venueSportProfilesCode === "42703" || venueSportProfilesCode === "PGRST204")
      ? await supabaseAdmin
          .from("venue_sport_profiles" as any)
          .select("id,sport")
          .eq("venue_id", data.id)
          .order("sport", { ascending: true })
      : null;
  const venueSportProfiles = ((venueSportProfilesResp.data as any) ?? (venueSportProfilesFallback?.data as any) ?? []) as VenueSportProfileRow[];
  const profilesBySport = new Map(
    venueSportProfiles
      .filter((p) => p?.id && p?.sport)
      .map((p) => [String(p.sport).trim().toLowerCase(), p])
  );
  const availableVenueSports = Array.from(new Set([...sportsFromTournaments, ...Array.from(profilesBySport.keys())])).sort();
  const selectedSportProfile = requestedVenueSport ? profilesBySport.get(requestedVenueSport) ?? null : null;
  const teamTravelSport = teamTravelTournament ? requestedVenueSport || teamTravelTournament.sport || data.sport || null : null;
  const activeScoreSource = selectedSportProfile
    ? {
        restroom_cleanliness_avg: selectedSportProfile.restroom_cleanliness_avg ?? null,
        shade_score_avg: selectedSportProfile.shade_score_avg ?? null,
        vendor_score_avg: selectedSportProfile.vendor_score_avg ?? null,
        parking_convenience_score_avg: selectedSportProfile.parking_convenience_score_avg ?? null,
        review_count: selectedSportProfile.review_count ?? null,
        reviews_last_updated_at: selectedSportProfile.reviews_last_updated_at ?? null,
      }
    : {
        restroom_cleanliness_avg: data.restroom_cleanliness_avg,
        shade_score_avg: data.shade_score_avg,
        vendor_score_avg: data.vendor_score_avg,
        parking_convenience_score_avg: data.parking_convenience_score_avg,
        review_count: data.review_count,
        reviews_last_updated_at: data.reviews_last_updated_at,
      };

  const sportSurfaceClass = getVenueCardClassFromSports(sportsFromTournaments);
  const locationLabel = [data.city, data.state].filter(Boolean).join(", ");
  const addressLabel = [data.address, data.city, data.state, data.zip].filter(Boolean).join(", ");
  const mapLinks = addressLabel ? buildMapLinks(addressLabel) : null;
  const reviewHref = `/venues/reviews?venueId=${encodeURIComponent(data.id)}`;
  const reviewLoginHref = `/login?returnTo=${encodeURIComponent(getVenueHref(data))}`;

  const runRows = await fetchLatestOwlsEyeRuns([data.id]);
  const latestRun = runRows.find((row) => row.venue_id === data.id) ?? null;
  const latestRunId = latestRun ? (latestRun.run_id ?? latestRun.id) : null;
  const partnerRows = selectedTournament?.id
      ? (
        (await supabaseAdmin
          .from("tournament_partner_nearby" as any)
          .select("id,venue_id,category,name,address,distance_meters,maps_url,sponsor_click_url,sort_order,updated_at,created_at")
          .eq("tournament_id", selectedTournament.id)
          .eq("is_active", true)
          .or(`venue_id.is.null,venue_id.eq.${data.id}`)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false })).data as TournamentPartnerNearbyRow[] | null
      ) ?? []
    : [];

  let nearbyCounts = { food: 0, coffee: 0, hotels: 0, sporting_goods: 0, quick_eats: 0, hangouts: 0 };
  let premiumNearby:
    | {
        food: NearbyPlace[];
        coffee: NearbyPlace[];
        hotels: NearbyPlace[];
        sporting_goods: NearbyPlace[];
        quick_eats: NearbyPlace[];
        hangouts: NearbyPlace[];
        captured_at: string | null;
      }
    | null = null;
  let demoScores: OwlsEyeDemoScores | null = null;
  const airportSummary = latestRun?.outputs?.airports ?? null;

  const partnerPlaces = {
    food: [] as NearbyPlace[],
    coffee: [] as NearbyPlace[],
    hotels: [] as NearbyPlace[],
  };
  const isNearbySponsorCategory = (value: string | null | undefined) => {
    const normalized = (value ?? "").toLowerCase();
    return normalized === "food" || normalized === "coffee" || normalized === "hotel" || normalized === "hotels";
  };
  const sortedPartnerRows = [...partnerRows].sort((left, right) => {
    const leftSpecific = left.venue_id === data.id ? 1 : 0;
    const rightSpecific = right.venue_id === data.id ? 1 : 0;
    if (leftSpecific !== rightSpecific) return rightSpecific - leftSpecific;
    return (left.sort_order ?? 0) - (right.sort_order ?? 0);
  });

  for (const row of sortedPartnerRows) {
    if (!isNearbySponsorCategory(row.category)) continue;
    const place: NearbyPlace = {
      name: row.name,
      distance_meters: row.distance_meters,
      maps_url: row.maps_url,
      is_sponsor: true,
      sponsor_click_url: row.sponsor_click_url ?? null,
    };
    const normalizedCategory = (row.category ?? "food").toLowerCase();
    if (normalizedCategory === "coffee") partnerPlaces.coffee.push(place);
    else if (normalizedCategory === "hotel" || normalizedCategory === "hotels") partnerPlaces.hotels.push(place);
    else partnerPlaces.food.push(place);
  }

  const partnerDedupKeys = {
    food: new Set(
      sortedPartnerRows
        .filter((row) => {
          const category = (row.category ?? "food").toLowerCase();
          return category === "food";
        })
        .map(buildNearbyDedupKey)
    ),
    coffee: new Set(
      sortedPartnerRows.filter((row) => (row.category ?? "food").toLowerCase() === "coffee").map(buildNearbyDedupKey)
    ),
    hotels: new Set(
      sortedPartnerRows
        .filter((row) => {
          const category = (row.category ?? "").toLowerCase();
          return category === "hotel" || category === "hotels";
        })
        .map(buildNearbyDedupKey)
    ),
  };

  if (latestRunId) {
    const { data: nearbyRows } = await supabaseAdmin
      .from("owls_eye_nearby_food" as any)
      .select("run_id,category,name,address,distance_meters,maps_url,is_sponsor,sponsor_click_url,provider,provider_place_id,reason_tags")
      .eq("run_id", latestRunId)
      .order("is_sponsor", { ascending: false })
      .order("distance_meters", { ascending: true })
      .order("name", { ascending: true });

    const rows = (nearbyRows as NearbyPlaceRow[] | null) ?? [];
    const dedupeRows = (categoryRows: NearbyPlaceRow[], dedupeKeys: Set<string>) =>
      categoryRows.filter((row) => !dedupeKeys.has(buildNearbyDedupKey(row)));

    const toPlace = (row: NearbyPlaceRow): NearbyPlace => ({
      name: row.name,
      distance_meters: row.distance_meters,
      maps_url: row.maps_url,
      is_sponsor: Boolean(row.is_sponsor),
      sponsor_click_url: row.sponsor_click_url ?? null,
      reason_tags: row.reason_tags ?? null,
      provider: row.provider ?? null,
    });

    const foodRows = dedupeRows(
      rows.filter((row) => {
        const category = (row.category ?? "food").toLowerCase();
        return (
          category !== "coffee" &&
          category !== "hotel" &&
          category !== "hotels" &&
          category !== "sporting_goods" &&
          category !== "big_box_fallback" &&
          category !== "quick_eats" &&
          category !== "hangouts"
        );
      }),
      partnerDedupKeys.food
    );
    const coffeeRows = dedupeRows(
      rows.filter((row) => (row.category ?? "").toLowerCase() === "coffee"),
      partnerDedupKeys.coffee
    );
    const hotelRows = dedupeRows(
      rows.filter((row) => {
        const category = (row.category ?? "").toLowerCase();
        return category === "hotel" || category === "hotels";
      }),
      partnerDedupKeys.hotels
    );
    const sportingGoodsRows = rows.filter((row) => {
      const category = (row.category ?? "").toLowerCase();
      return category === "sporting_goods" || category === "big_box_fallback";
    });
    const quickEatsRows = rows.filter((row) => (row.category ?? "").toLowerCase() === "quick_eats");
    const hangoutRows = rows.filter((row) => (row.category ?? "").toLowerCase() === "hangouts");

    nearbyCounts = {
      food: partnerPlaces.food.length + foodRows.length,
      coffee: partnerPlaces.coffee.length + coffeeRows.length,
      hotels: partnerPlaces.hotels.length + hotelRows.length,
      sporting_goods: sportingGoodsRows.length,
      quick_eats: quickEatsRows.length,
      hangouts: hangoutRows.length,
    };

    if (canViewPremiumDetails) {
      premiumNearby = {
        food: [...partnerPlaces.food, ...foodRows.map(toPlace)],
        coffee: [...partnerPlaces.coffee, ...coffeeRows.map(toPlace)],
        hotels: [...partnerPlaces.hotels, ...hotelRows.map(toPlace)],
        sporting_goods: sportingGoodsRows.map(toPlace),
        quick_eats: quickEatsRows.map(toPlace),
        hangouts: hangoutRows.map(toPlace),
        captured_at: latestRun?.updated_at ?? latestRun?.created_at ?? null,
      };
    }
  } else if (partnerRows.length) {
    nearbyCounts = {
      food: partnerPlaces.food.length,
      coffee: partnerPlaces.coffee.length,
      hotels: partnerPlaces.hotels.length,
      sporting_goods: 0,
      quick_eats: 0,
      hangouts: 0,
    };
    if (canViewPremiumDetails) {
      premiumNearby = {
        food: partnerPlaces.food,
        coffee: partnerPlaces.coffee,
        hotels: partnerPlaces.hotels,
        sporting_goods: [],
        quick_eats: [],
        hangouts: [],
        captured_at: partnerRows[0]?.updated_at ?? partnerRows[0]?.created_at ?? null,
      };
    }
  }

  const hasOwlsEye =
    nearbyCounts.food +
      nearbyCounts.coffee +
      nearbyCounts.sporting_goods +
      nearbyCounts.quick_eats +
      nearbyCounts.hangouts >
    0;

  let reviewChoicesQuery = supabaseAdmin
    .from("venue_reviews" as any)
    .select(
      "restrooms,parking_distance,parking_convenience_score,food_vendors,coffee_vendors,bring_field_chairs,player_parking_fee,parking_notes,seating_notes,created_at,updated_at"
    )
    .eq("venue_id", data.id)
    .eq("status", "active");
  if (selectedSportProfile?.id) {
    reviewChoicesQuery = reviewChoicesQuery.eq("venue_sport_profile_id", selectedSportProfile.id);
  }
  const reviewChoicesPrimary = await reviewChoicesQuery;
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

  demoScores = buildOwlsEyeDemoScores({
    nearbyCounts,
    vendor_score_avg: activeScoreSource.vendor_score_avg,
    restroom_cleanliness_avg: activeScoreSource.restroom_cleanliness_avg,
    shade_score_avg: activeScoreSource.shade_score_avg,
    parking_convenience_score_avg: activeScoreSource.parking_convenience_score_avg,
    venue_player_parking_fee: resolvedVenueInsights?.player_parking_fee ?? null,
    parking_notes: resolvedVenueInsights?.parking_notes ?? null,
    venue_bring_field_chairs: resolvedVenueInsights?.bring_field_chairs ?? null,
    seating_notes: resolvedVenueInsights?.seating_notes ?? null,
    review_count: activeScoreSource.review_count,
    reviews_last_updated_at: activeScoreSource.reviews_last_updated_at,
    reviewChoices: reviewChoiceRows,
  });
  const teamHotelHref = teamTravelEligibility.eligible
    ? buildTeamHotelBookingHref({
        tournamentId: teamTravelTournament?.id ?? null,
        tournamentSlug: teamTravelTournament?.slug ?? null,
        tournamentName: teamTravelTournament?.name ?? null,
        venueId: data.id,
        venueName: data.name ?? null,
        city: data.city ?? null,
        state: data.state ?? null,
        sport: teamTravelSport,
        checkin: teamTravelTournament?.startDate ?? null,
        checkout: teamTravelTournament?.endDate ?? null,
        entrySource: "venue_detail",
        entryPageType: "venue",
        entryPath: `/venues/${encodeURIComponent(data.seo_slug || data.id)}${teamTravelTournament?.id ? `?tournament=${encodeURIComponent(teamTravelTournament.id)}` : ""}`,
        entryPlacement: "venue_detail_team_hotel_cta",
      })
    : null;
  const hotelBookingHref = buildHotelsHref({
    venueId: data.id,
    tournamentId: selectedTournament?.id ?? null,
    source: "venue_directory",
    provider: "hotelplanner",
    latitude: data.latitude,
    longitude: data.longitude,
    checkin: selectedTournament?.startDate ?? null,
    checkout: selectedTournament?.endDate ?? null,
  });
  const hotelMapHref =
    selectedTournamentHasHotelDates && selectedTournament?.slug
      ? buildPlanningMapUrl({
          tournamentSlug: selectedTournament.slug,
          venueId: data.id,
          source: "venue_details",
        })
      : null;
  const showPrimaryHotelBooking = canShowBookingCta({
    zip: data.zip,
    latitude: data.latitude,
    longitude: data.longitude,
  });
  const campspotHref = hasValidCampspotDestination({
    city: data.city,
    state: data.state,
    latitude: data.latitude,
    longitude: data.longitude,
  })
    ? buildCampingHref({
        venueId: data.id,
        tournamentId: contextTournament?.id ?? null,
        sourceSurface: "venue_detail",
        ctaPlacement: CAMPSPOT_CTA_PLACEMENTS.venueDetail,
      })
    : null;
  const venueStructuredData = buildVenueStructuredData(data);

  return (
    <main className="pitchWrap tournamentsWrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(venueStructuredData) }} />
      <VenuePageViewTracker
        pageType="venue_detail"
        venueId={data.id}
        venueSlug={data.seo_slug ?? null}
        sport={requestedVenueSport || selectedTournament?.sport || data.sport || null}
        state={data.state ?? null}
        sourceTournamentId={selectedTournament?.id ?? null}
        sourceTournamentSlug={selectedTournament?.slug ?? null}
      />
      <section className={`detailHero ${sportSurfaceClass}`}>
        <div className="detailHero__overlay">
          <article className="detailPanel" style={{ paddingTop: "1.25rem" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <h1 style={{ margin: 0 }}>{data.name || "Venue"}</h1>
              <p className="meta" style={{ margin: 0 }}>
                <strong>Venue</strong>
                {locationLabel ? ` • ${locationLabel}` : ""}
              </p>
              <p className="dates" style={{ margin: 0 }}>
                {addressLabel || "Address TBA"}
              </p>

              {selectedTournament?.id || teamHotelHref ? (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {selectedTournament?.slug ? (
                    <ShareWeekendButton
                      tournamentSlug={selectedTournament.slug}
                      tournamentName={selectedTournament.name ?? "Tournament"}
                      venueLabel={[data.name, data.city, data.state].filter(Boolean).join(", ")}
                      venue={data.seo_slug || data.id}
                      sourcePage="venue_detail"
                      buttonLabel="Share This Weekend"
                      className="secondaryLink"
                    />
                  ) : null}
                  {teamHotelHref ? (
                    <TeamTravelVenueLink
                      href={teamHotelHref}
                      className="secondaryLink"
                      label={teamTravelEligibility.ctaLevel === "link" ? "Team hotel rooms" : "Request 5+ rooms for your team"}
                      authState={authState}
                      entitlement={tier}
                      tournamentId={teamTravelTournament?.id ?? null}
                      tournamentSlug={teamTravelTournament?.slug ?? null}
                      venueId={data.id}
                      sport={requestedVenueSport || teamTravelTournament?.sport || data.sport || null}
                      eventStartDate={teamTravelTournament?.startDate ?? null}
                      eventEndDate={teamTravelTournament?.endDate ?? null}
                      entrySource="venue_detail"
                      entryPageType="venue"
                      entryPath={`/venues/${encodeURIComponent(data.seo_slug || data.id)}${teamTravelTournament?.id ? `?tournament=${encodeURIComponent(teamTravelTournament.id)}` : ""}`}
                      entryPlacement="venue_detail_team_hotel_cta"
                      intentLevel={teamTravelEligibility.intentLevel}
                      eligibilityReason={teamTravelEligibility.reason}
                      ctaLevel={teamTravelEligibility.ctaLevel}
                    />
                  ) : null}
                </div>
              ) : null}

              {(() => {
                const upcomingValid = upcomingTournaments.filter((t) => Boolean(t.name));
                const upcomingCount = upcomingValid.length;

                const renderTournamentRow = (t: typeof upcomingValid[number], variant: "mobile" | "desktop") => {
                  const dateLabel = formatDateRangeLabel(t.startDate, t.endDate);
                  const tournamentLocation = [t.city, t.state].filter(Boolean).join(", ");
                  const tournamentMeta = [t.sport, tournamentLocation].filter(Boolean).join(" • ");
                  const href = t.slug ? `/tournaments/${t.slug}` : "";

                  const content = (
                    <>
                      <div className={styles.upcomingRowTop}>
                        <span className={styles.upcomingRowName}>{t.name}</span>
                        {t.slug ? (
                          <span className={styles.upcomingRowChevron} aria-hidden="true">
                            ›
                          </span>
                        ) : null}
                      </div>
                      {tournamentMeta ? <div className={styles.upcomingRowMeta}>{tournamentMeta}</div> : null}
                      <div className={styles.upcomingRowDate}>{variant === "mobile" && tournamentLocation ? `${dateLabel}` : dateLabel}</div>
                    </>
                  );

                  return t.slug ? (
                    <Link href={href} className={styles.upcomingRowLink}>
                      {content}
                    </Link>
                  ) : (
                    <div className={styles.upcomingRowPlain}>{content}</div>
                  );
                };

                if (upcomingCount === 1) {
                  const t = upcomingValid[0]!;
                  return (
                    <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>Upcoming tournaments at this venue</p>
                      <div className={styles.upcomingList}>{renderTournamentRow(t, "desktop")}</div>
                    </div>
                  );
                }

                if (upcomingCount > 1) {
                  return (
                    <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>Upcoming tournaments at this venue</p>
                      <div className={styles.upcomingList}>
                        {upcomingValid.map((t) => (
                          <div key={t.id}>{renderTournamentRow(t, "desktop")}</div>
                        ))}
                      </div>
                    </div>
                  );
                }

                return (
                  <p className={styles.upcomingEmptyDesktopOnly} style={{ margin: 0, opacity: 0.9 }}>
                    No upcoming tournaments currently linked to this venue.
                  </p>
                );
              })()}

              {canViewPremiumDetails || tier !== "explorer" ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {availableVenueSports.length > 1 ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link
                        href={`/venues/${encodeURIComponent(data.seo_slug || data.id)}${selectedTournament?.id ? `?tournament=${encodeURIComponent(selectedTournament.id)}` : ""}`}
                        className="secondaryLink"
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.22)",
                          background: !requestedVenueSport ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
                          fontWeight: 900,
                        }}
                      >
                        All sports
                      </Link>
                      {availableVenueSports.map((sport) => {
                        const isActive = requestedVenueSport === sport;
                        const qp = new URLSearchParams();
                        if (selectedTournament?.id) qp.set("tournament", selectedTournament.id);
                        qp.set("venue_sport", sport);
                        return (
                          <Link
                            key={sport}
                            href={`/venues/${encodeURIComponent(data.seo_slug || data.id)}?${qp.toString()}`}
                            className="secondaryLink"
                            style={{
                              padding: "6px 10px",
                              borderRadius: 999,
                              border: "1px solid rgba(255,255,255,0.22)",
                              background: isActive ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
                              fontWeight: 900,
                              textTransform: "capitalize",
                            }}
                          >
                            {sport}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                  <VenueIndexBadge
                    restroom_cleanliness_avg={activeScoreSource.restroom_cleanliness_avg}
                    shade_score_avg={activeScoreSource.shade_score_avg}
                    vendor_score_avg={activeScoreSource.vendor_score_avg}
                    parking_convenience_score_avg={activeScoreSource.parking_convenience_score_avg}
                    review_count={activeScoreSource.review_count}
                    reviews_last_updated_at={activeScoreSource.reviews_last_updated_at}
                  />
                </div>
              ) : (
                <div
                  style={{
                    border: "1px dashed rgba(255,255,255,0.3)",
                    borderRadius: 12,
                    padding: "10px 12px",
                    fontSize: 13,
                    opacity: 0.9,
                  }}
                >
                  Venue scores are locked. Create a free Insider account to view.
                </div>
              )}

              <div id="quick-venue-check" style={{ scrollMarginTop: 90 }}>
                <QuickVenueCheck
                  venueId={data.id}
                  pageType="venue"
                  sourceTournamentId={selectedTournament?.id ?? null}
                  sport={requestedVenueSport || selectedTournament?.sport || null}
                />
              </div>

              <div className={styles.actionsCluster}>
                {mapLinks && !hasStaticMapPreview ? (
                  <MobileMapLink
                    provider="apple"
                    query={addressLabel}
                    fallbackHref={mapLinks.apple}
                    className={`secondaryLink detailLinkSmall ${styles.actionPrimary}`}
                  >
                    View map
                  </MobileMapLink>
                ) : null}

                {canReviewVenue ? (
                  <Link href={reviewHref} className={`secondaryLink detailLinkSmall ${styles.actionSecondary}`}>
                    Review this venue
                  </Link>
                ) : (
                  <Link href={reviewLoginHref} className={`secondaryLink detailLinkSmall ${styles.actionSecondary}`}>
                    Sign in to review
                  </Link>
                )}

                <div className={styles.tertiaryRow}>
                  <Link href="/venues" className="secondaryLink detailLinkSmall">
                    Back to venues
                  </Link>
                  {data.venue_url ? (
                    <a href={data.venue_url} target="_blank" rel="noopener noreferrer" className="secondaryLink detailLinkSmall">
                      Venue site
                    </a>
                  ) : (
                    <span />
                  )}
                </div>
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
                  latitude: data.latitude ?? null,
                  longitude: data.longitude ?? null,
                }}
                hasOwlsEye={hasOwlsEye}
                canViewPremiumDetails={canViewPremiumDetails}
                selectedTournamentId={selectedTournament?.id ?? null}
                selectedTournamentSlug={(selectedTournament?.slug ?? "").trim() || null}
                selectedTournamentStartDate={selectedTournament?.startDate ?? null}
                selectedTournamentEndDate={selectedTournament?.endDate ?? null}
                nearbyCounts={nearbyCounts}
                airportSummary={airportSummary}
                premiumNearby={premiumNearby}
                tier={tier}
                showAllDetails={canViewPremiumDetails}
                mapLinks={mapLinks}
                mapQuery={addressLabel || null}
                demoScores={demoScores}
                demoScoresIsDemo={isDemoVenue}
                defaultNearbyAllCollapsed
                showHotelBookingCta={false}
                primaryTravelAction={
                  showPrimaryHotelBooking ? (
                    <HotelBookingCta
                      href={hotelMapHref ?? hotelBookingHref}
                      venueId={data.id}
                      tournamentId={selectedTournament?.id ?? null}
                      label={hotelMapHref ? "See hotels & rates on map" : "Find hotels near this venue"}
                      align="start"
                      target={hotelMapHref ? "_self" : "_blank"}
                    />
                  ) : null
                }
                secondaryTravelAction={
                  campspotHref ? (
                    <div className={styles.campingSecondaryBlock}>
                      <span className={styles.campingSecondaryLabel}>Camping or bringing an RV?</span>
                      <CampspotAffiliateLink
                        href={campspotHref}
                        sourceSurface="venue_detail"
                        ctaPlacement={CAMPSPOT_CTA_PLACEMENTS.venueDetail}
                        venueId={data.id}
                        tournamentId={contextTournament?.id ?? null}
                        tournamentSlug={contextTournament?.slug ?? null}
                        className={styles.campingSecondaryLink}
                      >
                        Find campgrounds &amp; RV parks near this venue →
                      </CampspotAffiliateLink>
                    </div>
                  ) : null
                }
              />

              {isVenueHotelPageEligible(data) && data.seo_slug && (
                <div style={{ marginTop: "8px" }}>
                  <Link
                    href={`/venues/${encodeURIComponent(data.seo_slug)}/hotels`}
                    style={{ fontSize: "0.9rem", color: "#1a6c3f", textDecoration: "none" }}
                  >
                    Browse hotel options near this venue →
                  </Link>
                </div>
              )}

              {venueClusterCandidates.length > 0 ? (
                <VenueClusterModule
                  heading="Other tournament venues nearby"
                  intro="Continue planning in this travel market with other venue guides that also have current or upcoming tournament activity."
                  sourceVenueId={data.id}
                  sourceVenueSlug={data.seo_slug ?? null}
                  sourceCity={data.city ?? null}
                  sourceState={data.state ?? null}
                  candidates={venueClusterCandidates.map((candidate) => ({
                    venueId: candidate.venue.id,
                    venueName: candidate.venue.name ?? "Venue",
                    venueHref: getVenueHref({ id: candidate.venue.id, seo_slug: candidate.venue.seoSlug }),
                    city: candidate.venue.address.city,
                    state: candidate.venue.address.state,
                    tier: candidate.tier,
                    reason: candidate.reason,
                    upcomingTournamentCount: candidate.upcomingTournamentCount,
                    nearestUpcomingTournamentLabel: candidate.nearestUpcomingTournament
                      ? `${candidate.nearestUpcomingTournament.name ?? "Upcoming tournament"} • ${formatDateRangeLabel(
                          candidate.nearestUpcomingTournament.startDate,
                          candidate.nearestUpcomingTournament.endDate
                        )}`
                      : null,
                  }))}
                  classNames={{
                    section: styles.clusterSection,
                    header: styles.clusterHeader,
                    heading: styles.clusterHeading,
                    intro: styles.clusterIntro,
                    list: styles.clusterList,
                    card: styles.clusterCard,
                    cardBody: styles.clusterCardBody,
                    cardTop: styles.clusterCardTop,
                    venueName: styles.clusterVenueName,
                    venueMeta: styles.clusterVenueMeta,
                    tierBadge: styles.clusterTierBadge,
                    reason: styles.clusterReason,
                    tournamentCount: styles.clusterTournamentCount,
                    nearest: styles.clusterNearest,
                    link: styles.clusterLink,
                  }}
                />
              ) : null}

              {data.notes && canViewPremiumDetails ? (
                <div style={{ marginTop: 6 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>Notes</p>
                  <p style={{ margin: "4px 0 0", opacity: 0.95 }}>{data.notes}</p>
                </div>
              ) : null}

              <div style={{ marginTop: 10, fontSize: 13, opacity: 0.78, lineHeight: 1.35 }}>
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
