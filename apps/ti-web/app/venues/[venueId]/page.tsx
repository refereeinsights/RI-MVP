import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { canAccessWeekendPro, getTier } from "@/lib/entitlements";
import VenueIndexBadge from "@/components/VenueIndexBadge";
import OwlsEyeVenueCard, { type AirportSummary, type NearbyPlace } from "@/components/venues/OwlsEyeVenueCard";
import MobileMapLink from "@/components/venues/MobileMapLink";
import QuickVenueCheck from "@/components/venues/QuickVenueCheck";
import {
  DEMO_STARFIRE_VENUE_ID,
  buildOwlsEyeDemoScores,
  type OwlsEyeDemoScores,
  type VenueReviewChoiceRow,
} from "@/lib/owlsEyeScores";
import { getVenueHref } from "@/lib/venues/getVenueHref";
import { isUuid } from "@/lib/venues/isUuid";
import { getVenueCardClassFromSports } from "../sportSurface";
import { formatEntityList, type SemanticListItem, type SemanticListPart } from "../../../../../shared/semantic/formatEntityList";
import "../../tournaments/tournaments.css";

const US_STATE_CODES = new Set(
  [
    "AL",
    "AK",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY",
    "DC",
  ].sort()
);

const STREET_TOKENS = new Set([
  "st",
  "street",
  "ave",
  "avenue",
  "rd",
  "road",
  "dr",
  "drive",
  "blvd",
  "boulevard",
  "ln",
  "lane",
  "ct",
  "court",
  "way",
  "pkwy",
  "parkway",
  "pl",
  "place",
  "cir",
  "circle",
  "ter",
  "terrace",
  "hwy",
  "highway",
]);

function parseLegacyAddressSlug(param: string): { state: string; number: string; keyword: string | null } | null {
  const raw = param.trim().toLowerCase();
  if (!raw || raw.length > 140) return null;
  // Heuristic: looks like "425-woodward-st-austin-tx" or "32200-del-obispo-street-san-juan-capistrano-ca".
  if (!/^\d{1,6}-[a-z0-9-]{3,140}-[a-z]{2}$/.test(raw)) return null;
  const parts = raw.split("-").filter(Boolean);
  if (parts.length < 4) return null;
  const number = parts[0] ?? "";
  const stateRaw = (parts[parts.length - 1] ?? "").toUpperCase();
  if (!/^\d{1,6}$/.test(number)) return null;
  if (!US_STATE_CODES.has(stateRaw)) return null;

  const body = parts.slice(1, -1);
  const hasStreetSignal = body.some((p) => STREET_TOKENS.has(p));
  if (!hasStreetSignal) return null;

  const keyword =
    body.find((p) => p.length >= 4 && !STREET_TOKENS.has(p) && !/^\d+$/.test(p) && !["of", "the", "and", "at", "in"].includes(p)) ??
    null;
  return { state: stateRaw, number, keyword };
}

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
  seo_slug?: string | null;
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
  tournament_venues?: {
    is_inferred?: boolean | null;
    tournaments?: LinkedTournament | null;
  }[] | null;
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
  address?: string | null;
  distance_meters: number | null;
  maps_url: string | null;
  is_sponsor: boolean | null;
  sponsor_click_url?: string | null;
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

function buildMapLinks(query: string) {
  const encoded = encodeURIComponent(query);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    apple: `https://maps.apple.com/?q=${encoded}`,
    waze: `https://waze.com/ul?q=${encoded}&navigate=yes`,
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

const PREMIUM_PREVIEW_TOURNAMENT_SLUGS = new Set(["refereeinsights-demo-tournament"]);

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
    return { alternates: { canonical: `https://www.tournamentinsights.com${redirectTo}` } };
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
  const canonical = getVenueHref(data);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
  };
}

async function fetchVenueByParam(param: string): Promise<{ venue: VenueRow | null; redirectTo: string | null }> {
  const baseSelect =
    "id,seo_slug,name,address,city,state,zip,notes,venue_url,sport,restroom_cleanliness_avg,shade_score_avg,vendor_score_avg,parking_convenience_score_avg,review_count,reviews_last_updated_at,tournament_venues(is_inferred,tournaments(id,slug,name,sport,start_date,end_date))";

  const bySlug = await supabaseAdmin
    .from("venues" as any)
    .select(baseSelect)
    .eq("seo_slug", param)
    .maybeSingle<VenueRow>();
  if (!bySlug.error && bySlug.data?.id) {
    return { venue: bySlug.data, redirectTo: null };
  }

  if (isUuid(param)) {
    const byId = await supabaseAdmin.from("venues" as any).select(baseSelect).eq("id", param).maybeSingle<VenueRow>();
    if (!byId.error && byId.data?.id) {
      if (byId.data.seo_slug && byId.data.seo_slug !== param) {
        return { venue: byId.data, redirectTo: getVenueHref(byId.data) };
      }
      return { venue: byId.data, redirectTo: null };
    }
  }

  const legacy = parseLegacyAddressSlug(param);
  if (legacy) {
    try {
      let query = supabaseAdmin
        .from("venues" as any)
        .select(baseSelect)
        .eq("state", legacy.state)
        .ilike("address", `%${legacy.number}%`);
      if (legacy.keyword) query = query.ilike("address", `%${legacy.keyword}%`);
      const resp = await query.limit(5);
      if (!resp.error && Array.isArray(resp.data) && resp.data.length) {
        const pick = resp.data[0] as VenueRow;
        return { venue: pick, redirectTo: getVenueHref(pick) };
      }
    } catch {
      // best-effort only
    }
  }

  return { venue: null, redirectTo: null };
}

export default async function VenueDetailsPage({
  params,
  searchParams,
}: {
  params: { venueId: string };
  searchParams?: { tournament?: string; venue_sport?: string };
}) {
  const { venue: resolvedVenue, redirectTo } = await fetchVenueByParam(params.venueId);
  if (redirectTo) redirect(redirectTo);
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
  const isPaid = canAccessWeekendPro(user, entitlementProfile ?? null);

  const data = resolvedVenue;
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

  const linkedTournaments = (data.tournament_venues ?? [])
    .filter((tv) => !tv?.is_inferred)
    .map((tv) => tv?.tournaments)
    .filter((t): t is LinkedTournament => Boolean(t?.id));
  const requestedTournamentRaw = typeof searchParams?.tournament === "string" ? searchParams.tournament.trim() : "";
  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const requestedTournamentId = requestedTournamentRaw && isUuid(requestedTournamentRaw) ? requestedTournamentRaw : "";
  const requestedTournamentSlug = requestedTournamentId ? "" : requestedTournamentRaw.toLowerCase();
  const selectedTournament =
    requestedTournamentId
      ? linkedTournaments.find((t) => t.id === requestedTournamentId) ?? null
      : requestedTournamentSlug.length > 0
        ? linkedTournaments.find((t) => (t.slug ?? "").trim().toLowerCase() === requestedTournamentSlug) ?? null
        : null;
  const hasPremiumPreviewTournament = linkedTournaments.some((t) =>
    PREMIUM_PREVIEW_TOURNAMENT_SLUGS.has((t.slug ?? "").trim().toLowerCase())
  );
  const canViewPremiumDetails = isPaid || isDemoVenue || hasPremiumPreviewTournament;

  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const upcomingTournaments = linkedTournaments
    .filter((t) => {
      const startOk = Boolean(t.start_date && t.start_date >= today);
      const endOk = Boolean(t.end_date && t.end_date >= today);
      return startOk || endOk;
    })
    .sort((a, b) => (a.start_date ?? "9999-12-31").localeCompare(b.start_date ?? "9999-12-31"));

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
      const start = (t.start_date ?? "").trim();
      if (!start) return false;
      return start >= cutoffIso;
    })
    .sort((a, b) => {
      const dateCmp = (a.start_date ?? "9999-12-31").localeCompare(b.start_date ?? "9999-12-31");
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

  let nearbyCounts = { food: 0, coffee: 0, hotels: 0, sporting_goods: 0 };
  let premiumNearby:
    | { food: NearbyPlace[]; coffee: NearbyPlace[]; hotels: NearbyPlace[]; sporting_goods: NearbyPlace[]; captured_at: string | null }
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
      .select("run_id,category,name,address,distance_meters,maps_url,is_sponsor,sponsor_click_url")
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
    });

    const foodRows = dedupeRows(
      rows.filter((row) => {
        const category = (row.category ?? "food").toLowerCase();
        return (
          category !== "coffee" &&
          category !== "hotel" &&
          category !== "hotels" &&
          category !== "sporting_goods" &&
          category !== "big_box_fallback"
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

    nearbyCounts = {
      food: partnerPlaces.food.length + foodRows.length,
      coffee: partnerPlaces.coffee.length + coffeeRows.length,
      hotels: partnerPlaces.hotels.length + hotelRows.length,
      sporting_goods: sportingGoodsRows.length,
    };

    if (canViewPremiumDetails) {
      premiumNearby = {
        food: [...partnerPlaces.food, ...foodRows.map(toPlace)],
        coffee: [...partnerPlaces.coffee, ...coffeeRows.map(toPlace)],
        hotels: [...partnerPlaces.hotels, ...hotelRows.map(toPlace)],
        sporting_goods: sportingGoodsRows.map(toPlace),
        captured_at: latestRun?.updated_at ?? latestRun?.created_at ?? null,
      };
    }
  } else if (partnerRows.length) {
    nearbyCounts = {
      food: partnerPlaces.food.length,
      coffee: partnerPlaces.coffee.length,
      hotels: partnerPlaces.hotels.length,
      sporting_goods: 0,
    };
    if (canViewPremiumDetails) {
      premiumNearby = {
        food: partnerPlaces.food,
        coffee: partnerPlaces.coffee,
        hotels: partnerPlaces.hotels,
        sporting_goods: [],
        captured_at: partnerRows[0]?.updated_at ?? partnerRows[0]?.created_at ?? null,
      };
    }
  }

  const hasOwlsEye = nearbyCounts.food + nearbyCounts.coffee + nearbyCounts.hotels + nearbyCounts.sporting_goods > 0;

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

  return (
    <main className="pitchWrap tournamentsWrap">
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

              <QuickVenueCheck
                venueId={data.id}
                pageType="venue"
                sourceTournamentId={selectedTournament?.id ?? null}
                sport={requestedVenueSport || selectedTournament?.sport || null}
              />

              {canReviewVenue ? (
                <div className="detailLinksRow">
                  <Link href={reviewHref} className="secondaryLink detailLinkSmall">
                    Review this venue
                  </Link>
                </div>
              ) : (
                <div className="detailLinksRow">
                  <Link href={reviewLoginHref} className="secondaryLink detailLinkSmall">
                    Sign in to review
                  </Link>
                </div>
              )}

              <div className="detailLinksRow">
                <Link href="/venues" className="secondaryLink detailLinkSmall">
                  Back to venues
                </Link>
                {data.venue_url ? (
                  <a href={data.venue_url} target="_blank" rel="noopener noreferrer" className="secondaryLink detailLinkSmall">
                    Venue site
                  </a>
                ) : null}
                {mapLinks ? (
                  <MobileMapLink
                    provider="apple"
                    query={addressLabel}
                    fallbackHref={mapLinks.apple}
                    className="secondaryLink detailLinkSmall"
                  >
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
                canViewPremiumDetails={canViewPremiumDetails}
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
              />

              {upcomingTournaments.length > 0 ? (
                <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>Upcoming tournaments at this venue</p>
                  <div style={{ display: "grid", gap: 6 }}>
                    {upcomingTournaments.map((t) => {
                      if (!t.slug || !t.name) return null;
                      const start = formatDate(t.start_date);
                      const end = formatDate(t.end_date);
                      const dateLabel =
                        start && end && start !== end ? `${start} - ${end}` : start || end || "Dates TBA";
                      return (
                        <Link
                          key={t.id}
                          href={`/tournaments/${t.slug}`}
                          className="secondaryLink"
                          style={{ justifyContent: "space-between", width: "100%" }}
                        >
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
