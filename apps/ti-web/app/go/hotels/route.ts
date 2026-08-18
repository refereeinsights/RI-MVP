import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildBookingSearchString, isValidZip5 } from "@/lib/booking/venueBooking";
import {
  buildHotelPlannerBookingAttribution,
  createOutboundAttributionId,
  deriveHotelPlannerSourcePageType,
  isValidOutboundAttributionId,
  sanitizeHotelPlannerSpreadsheetContext,
} from "@/lib/hotelPlannerAttribution";
import {
  isHotelOutboundPersistenceSuccess,
  persistHotelOutboundWithSnapshot,
} from "@/lib/lodging/hotelOutboundPersistence";
import {
  getResolvedHotelProgramFeeTarget,
  resolveHotelProgramSnapshotSafely,
  selectHotelHandoffMode,
} from "@/lib/lodging/tournamentHotelProgram";
import { verifyTournamentHotelContext } from "@/lib/lodging/tournamentHotelContext";
import {
  parseVenueHotelUuid,
  sanitizePageUrl,
  sanitizeText,
  resolveDeviceTypeFromUserAgent,
} from "@/lib/venueHotelFunnel";

export const runtime = "nodejs";

function isLocalHost(host: string | null) {
  const value = String(host ?? "").trim().toLowerCase();
  if (!value) return false;
  if (value.startsWith("localhost")) return true;
  if (value.startsWith("127.0.0.1")) return true;
  if (value.startsWith("[::1]")) return true;
  if (value.endsWith(".local")) return true;
  return false;
}

function isLocalDevelopment(host: string | null) {
  if (isLocalHost(host)) return true;
  return process.env.NODE_ENV !== "production";
}

function looksLikeBot(userAgent: string | null) {
  const ua = String(userAgent ?? "").toLowerCase();
  if (!ua) return false;
  return /(bot|spider|crawler|facebookexternalhit|slackbot|discordbot|whatsapp|telegrambot|preview)/i.test(ua);
}

function sourcePathFromReferer(referer: string | null) {
  const ref = String(referer ?? "").trim();
  if (!ref) return null;
  try {
    const url = new URL(ref);
    const host = url.hostname.toLowerCase();
    if (!host.endsWith("tournamentinsights.com")) return null;
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return null;
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidIsoDate(value: string | null) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [y, m, d] = raw.split("-").map((n) => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!Number.isFinite(dt.getTime())) return false;
  return dt.toISOString().slice(0, 10) === raw;
}

function addDaysIso(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function compareIso(a: string, b: string) {
  // Both are YYYY-MM-DD.
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function parseLatLng(raw: string | null, maxAbs: number) {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  const num = Number(v);
  if (!Number.isFinite(num) || Math.abs(num) > maxAbs) return null;
  return num;
}

function normalizeHotelPlannerBaseUrl(raw: string) {
  return String(raw ?? "").trim().replace(/\/+$/, "");
}

function toMmDdYyyy(iso: string) {
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!Number.isFinite(dt.getTime())) return null;
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${y}`;
}

function toMmDdDashYyyy(value: string) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  return `${mm}-${dd}-${yyyy}`;
}

const HOTELPLANNER_SEARCH_HASH_TAIL =
  "default/ASC/ASC/ASC/0/none/none/none/0/0/0/0/None/NaN/0/none/none/0/5/none/none/none/1/0/0/0/1/1/results/0/";

function isZipOnly(raw: string) {
  return /^\d{5}$/.test(String(raw ?? "").trim());
}

function buildHotelPlannerSearchCity(args: {
  destinationSearch: string | null;
  venueName: string | null;
  city: string | null;
  state: string | null;
}) {
  const destinationSearch = String(args.destinationSearch ?? "").trim();
  if (destinationSearch && !isZipOnly(destinationSearch)) return destinationSearch;

  const pieces = [args.venueName, args.city, args.state]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return pieces.length ? pieces.join(", ") : null;
}

function pickTrackingParam(reqUrl: URL, key: string) {
  const target = key.toLowerCase();
  const direct = reqUrl.searchParams.get(key) ?? reqUrl.searchParams.get(target);
  if (direct !== null) {
    const directTrimmed = String(direct).trim();
    return directTrimmed ? directTrimmed : null;
  }

  let fallback: string | null = null;
  for (const [name, value] of reqUrl.searchParams.entries()) {
    if (name.toLowerCase() === target) {
      fallback = value;
      break;
    }
  }

  const trimmed = String(fallback ?? "").trim();
  return trimmed ? trimmed : null;
}

function pickOutboundAttributionId(reqUrl: URL) {
  const direct = pickTrackingParam(reqUrl, "outbound_attribution_id");
  if (isValidOutboundAttributionId(direct)) return direct;
  return null;
}

function deriveStableAttributionId(args: { outboundAttributionId: string | null; outboundRequestId: string | null }) {
  if (args.outboundAttributionId) return args.outboundAttributionId;
  if (args.outboundRequestId) {
    return createHash("sha256").update(`ti-hp:${args.outboundRequestId}`).digest("hex").slice(0, 32);
  }
  return createOutboundAttributionId();
}

function buildHotelPlannerSearchUrl(args: {
  baseUrl: string;
  destination: string;
  dates: { checkin: string; checkout: string };
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  includeHash?: boolean;
  sc?: string | null;
  keyword?: string | null;
  jobCode?: string | null;
  custom1?: string | null;
  custom2?: string | null;
  custom3?: string | null;
  custom4?: string | null;
  custom5?: string | null;
  custom6?: string | null;
  custom7?: string | null;
  custom8?: string | null;
}): string {
  const baseUrl = normalizeHotelPlannerBaseUrl(args.baseUrl);
  const destination = String(args.destination ?? "").trim();
  if (!baseUrl || !destination) return "";

  const searchUrl = new URL("/Search/", baseUrl);
  searchUrl.searchParams.set("destination", destination);
  if (args.latitude !== null && args.latitude !== undefined) searchUrl.searchParams.set("latitude", String(args.latitude));
  if (args.longitude !== null && args.longitude !== undefined) searchUrl.searchParams.set("longitude", String(args.longitude));
  const city = String(args.city ?? "").trim();
  if (city) searchUrl.searchParams.set("city", city);
  searchUrl.searchParams.set("rooms", "1");
  searchUrl.searchParams.set("adults", "2");
  searchUrl.searchParams.set("source", args.sc || "tournamentinsights");
  searchUrl.searchParams.set("sc", args.sc || "tournamentinsights");

  const keyword = String(args.keyword ?? "").trim();
  if (keyword) searchUrl.searchParams.set("kw", keyword);
  const jobCode = String(args.jobCode ?? "").trim();
  if (jobCode) searchUrl.searchParams.set("jobCode", jobCode);
  if (args.custom1) searchUrl.searchParams.set("Custom1", String(args.custom1).trim());
  if (args.custom2) searchUrl.searchParams.set("Custom2", String(args.custom2).trim());
  if (args.custom3) searchUrl.searchParams.set("Custom3", String(args.custom3).trim());
  if (args.custom4) searchUrl.searchParams.set("Custom4", String(args.custom4).trim());
  if (args.custom5) searchUrl.searchParams.set("Custom5", String(args.custom5).trim());
  if (args.custom6) searchUrl.searchParams.set("Custom6", String(args.custom6).trim());
  if (args.custom7) searchUrl.searchParams.set("Custom7", String(args.custom7).trim());
  if (args.custom8) searchUrl.searchParams.set("Custom8", String(args.custom8).trim());

  // Append dates as query string params before the hash — HP cannot parse %2F-encoded slashes,
  // and appending after hash.toString() would place them inside the fragment instead of the query.
  const queryBase = `${searchUrl.origin}${searchUrl.pathname}?${searchUrl.searchParams.toString()}`;
  const dateQs = args.dates.checkin && args.dates.checkout
    ? `&CheckIn=${args.dates.checkin}&CheckOut=${args.dates.checkout}`
    : "";

  const hashCheckin = toMmDdDashYyyy(args.dates.checkin);
  const hashCheckout = toMmDdDashYyyy(args.dates.checkout);
  let hashSuffix = "";
  if (args.includeHash !== false && hashCheckin && hashCheckout) {
    const hashDestination = encodeURIComponent(destination);
    const hashLat = args.latitude !== null && args.latitude !== undefined ? String(args.latitude) : "";
    const hashLng = args.longitude !== null && args.longitude !== undefined ? String(args.longitude) : "";
    hashSuffix = `#search/${hashDestination}/${hashLat}/${hashLng}/${hashCheckin}/${hashCheckout}/${HOTELPLANNER_SEARCH_HASH_TAIL}`;
  }

  return `${queryBase}${dateQs}${hashSuffix}`;
}

function logWeakHotelPlannerDestination(args: {
  reason: "generic_destination" | "missing_location_context" | "invalid_tournament_context" | "invalid_venue_context";
  sourceSurface: string;
  venueIdPresent: boolean;
  tournamentIdPresent: boolean;
  latLngPresent: boolean;
  cityStatePresent: boolean;
}) {
  console.warn("[go/hotels] weak destination context", args);
}

function todayUtcIso() {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return todayUtc.toISOString().slice(0, 10);
}

function isoToUtcDay(iso: string) {
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  return Date.UTC(y, m - 1, d);
}

function stayNights(checkin: string, checkout: string) {
  return Math.round((isoToUtcDay(checkout) - isoToUtcDay(checkin)) / 86_400_000);
}

function computeFallbackDates() {
  const checkin = addDaysIso(todayUtcIso(), 14);
  const checkout = addDaysIso(checkin, 2);
  return { checkin, checkout };
}

export async function GET(request: Request) {
  const reqUrl = new URL(request.url);
  const venueId = String(reqUrl.searchParams.get("venueId") ?? "").trim();
  const tournamentId = String(reqUrl.searchParams.get("tournamentId") ?? "").trim();
  const tournamentContext = String(reqUrl.searchParams.get("tournament_context") ?? "").trim();
  const ssOverride = String(reqUrl.searchParams.get("ss") ?? "").trim();
  const checkinRaw = String(reqUrl.searchParams.get("checkin") ?? "").trim();
  const checkoutRaw = String(reqUrl.searchParams.get("checkout") ?? "").trim();
  const querySc = pickTrackingParam(reqUrl, "sc");
  const queryKeyword = pickTrackingParam(reqUrl, "kw");
  const queryKeywordLegacy = pickTrackingParam(reqUrl, "keyword");
  const queryJobCode = pickTrackingParam(reqUrl, "jobcode");
  const queryCustom1 = pickTrackingParam(reqUrl, "custom1");
  const queryCustom2 = pickTrackingParam(reqUrl, "custom2");
  const queryCustom3 = pickTrackingParam(reqUrl, "custom3");
  const queryCustom4 = pickTrackingParam(reqUrl, "custom4");
  const queryCustom5 = pickTrackingParam(reqUrl, "custom5");
  const queryCustom6 = pickTrackingParam(reqUrl, "custom6");
  const queryCustom7 = pickTrackingParam(reqUrl, "custom7");
  const queryCustom8 = pickTrackingParam(reqUrl, "custom8");
  const latitude = parseLatLng(reqUrl.searchParams.get("lat"), 90);
  const latitudeAlt = parseLatLng(reqUrl.searchParams.get("latitude"), 90);
  const longitude = parseLatLng(reqUrl.searchParams.get("lng"), 180);
  const longitudeAlt = parseLatLng(reqUrl.searchParams.get("longitude"), 180);

  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").trim();
  const localDev = isLocalDevelopment(host);
  const referer = request.headers.get("referer");
  const userAgent = request.headers.get("user-agent");
  const ctaInstanceId = parseVenueHotelUuid(pickTrackingParam(reqUrl, "cta_instance_id"));
  const ctaInteractionId = parseVenueHotelUuid(pickTrackingParam(reqUrl, "cta_interaction_id"));
  const outboundRequestId = parseVenueHotelUuid(pickTrackingParam(reqUrl, "outbound_request_id"));
  const lodgingSearchId = parseVenueHotelUuid(pickTrackingParam(reqUrl, "lodging_search_id"));
  const sessionId = parseVenueHotelUuid(pickTrackingParam(reqUrl, "session_id"));
  const plannerSessionId = parseVenueHotelUuid(pickTrackingParam(reqUrl, "planner_session_id"));
  const ctaType = sanitizeText(pickTrackingParam(reqUrl, "cta_type"), 32);
  const ctaPlacement = sanitizeText(pickTrackingParam(reqUrl, "cta_placement"), 64);
  const flowType = sanitizeText(pickTrackingParam(reqUrl, "flow_type"), 32);
  const pageType = sanitizeText(pickTrackingParam(reqUrl, "page_type"), 32);
  const pageUrl = sanitizePageUrl(pickTrackingParam(reqUrl, "page_url"));
  const trafficSource = sanitizeText(pickTrackingParam(reqUrl, "traffic_source"), 64);
  const outboundAttributionId = pickOutboundAttributionId(reqUrl);
  const deviceType =
    sanitizeText(pickTrackingParam(reqUrl, "device_type"), 32) ?? resolveDeviceTypeFromUserAgent(userAgent);

  const venueIdValid = Boolean(venueId && isUuid(venueId));

  // Anti-abuse guardrail: allow generic mode only when invoked from approved TI travel/planner surfaces (or local dev).
  const source = String(reqUrl.searchParams.get("source") ?? "").trim();
  const sourcePath = sourcePathFromReferer(referer);
  const genericAllowed =
    localDev ||
    source === "book_travel" ||
    source === "weekend_planner" ||
    source === "tournament_directory" ||
    source === "tournament_detail" ||
    source === "tournament_hotels" ||
    (sourcePath ?? "").startsWith("/weekend-planner") ||
    (sourcePath ?? "").startsWith("/book-travel");

  if (!venueIdValid && !genericAllowed) {
    return new NextResponse("Missing or invalid venueId", { status: 400 });
  }

  const hasCheckin = isValidIsoDate(checkinRaw);
  const hasCheckout = isValidIsoDate(checkoutRaw);
  const hasDateOverride = hasCheckin && hasCheckout;

  const { data: venue } = venueIdValid
    ? await supabaseAdmin
        .from("venues" as any)
        .select("id,name,city,state,zip,latitude,longitude")
        .eq("id", venueId)
        .maybeSingle<{
          id: string;
          name: string | null;
          city: string | null;
          state: string | null;
          zip: string | null;
          latitude: number | null;
          longitude: number | null;
        }>()
    : { data: null as { id: string; name: string | null; city: string | null; state: string | null; zip: string | null; latitude: number | null; longitude: number | null } | null };

  const requestedTournamentId = tournamentId && isUuid(tournamentId) ? tournamentId : null;
  const verifiedTournamentContext = !venueId
    ? verifyTournamentHotelContext(tournamentContext, requestedTournamentId)
    : { ok: false as const, reason: "format" as const };
  const { data: tournament } = requestedTournamentId
    ? await supabaseAdmin
        .from("tournaments_public" as any)
        .select("id,slug,start_date,end_date")
        .eq("id", requestedTournamentId)
        .maybeSingle<{ id: string; slug: string | null; start_date: string | null; end_date: string | null }>()
    : { data: null as { id: string; slug: string | null; start_date: string | null; end_date: string | null } | null };

  const ss = (() => {
    const override = ssOverride.trim();
    if (override) return override;

    if (!venueIdValid) return null;

    const computed = buildBookingSearchString({
      venueName: venue?.name ?? null,
      city: venue?.city ?? null,
      state: venue?.state ?? null,
      zip: venue?.zip ?? null,
    });
    if (computed) return computed;

    // Backstop: if data is incomplete, use ZIP-only when possible, else a broad default.
    const zip = (venue?.zip ?? "").trim();
    if (isValidZip5(zip)) return zip;
    return "United States";
  })();
  const bookingSearchString = ss || "United States";

  const venueLat = venue?.latitude ?? null;
  const venueLng = venue?.longitude ?? null;
  const hotelPlannerLat = (latitude ?? latitudeAlt ?? venueLat) ?? null;
  const hotelPlannerLng = (longitude ?? longitudeAlt ?? venueLng) ?? null;
  const hasHotelPlannerLatLng = hotelPlannerLat !== null && hotelPlannerLng !== null;
  const sourcePageType = deriveHotelPlannerSourcePageType({
    source,
    pageType,
    sourcePath,
    hasVenueId: venueIdValid,
  });
  const sourceSurface = sourcePageType;
  const tournamentCompleted = Boolean(
    tournament?.end_date && isValidIsoDate(tournament.end_date) && compareIso(tournament.end_date, todayUtcIso()) < 0
  );
  const hotelProgram = await resolveHotelProgramSnapshotSafely({
    tournamentId: tournament?.id ?? null,
    venueId: venue?.id ?? null,
    sourcePageType,
    tournamentContextTrusted: verifiedTournamentContext.ok,
    tournamentCompleted,
  });
  const hotelProgramSnapshot = hotelProgram.snapshot;
  const hasCityState = Boolean(String(venue?.city ?? "").trim() && String(venue?.state ?? "").trim());

  if (!ss && !hasHotelPlannerLatLng) {
    logWeakHotelPlannerDestination({
      reason: "missing_location_context",
      sourceSurface,
      venueIdPresent: venueIdValid,
      tournamentIdPresent: Boolean(requestedTournamentId),
      latLngPresent: false,
      cityStatePresent: hasCityState,
    });
    return new NextResponse("Missing ss (destination). Use /weekend-planner to run a generic hotel search.", {
      status: 400,
    });
  }

  const dates = (() => {
    const today = todayUtcIso();

    const validateBookingSafe = (checkin: string, checkout: string) => {
      if (compareIso(checkin, today) < 0) return { ok: false as const, reason: "checkin_in_past" };
      if (compareIso(checkout, checkin) <= 0) return { ok: false as const, reason: "checkout_not_after_checkin" };
      const nights = stayNights(checkin, checkout);
      if (!Number.isFinite(nights) || nights <= 0) return { ok: false as const, reason: "invalid_stay_length" };
      if (nights > 14) return { ok: false as const, reason: "stay_too_long" };
      return { ok: true as const, nights };
    };

    if (hasDateOverride) {
      let checkin = checkinRaw;
      let checkout = checkoutRaw;
      if (compareIso(checkout, checkin) <= 0) checkout = addDaysIso(checkin, 1);
      const validated = validateBookingSafe(checkin, checkout);
      if (!validated.ok) {
        return { ...computeFallbackDates(), source: "fallback" as const, rejected: { source: "explicit" as const, reason: validated.reason } };
      }
      return { checkin, checkout, source: "explicit" as const, rejected: null as null | { source: "explicit" | "tournament"; reason: string } };
    }

    const tStart = tournament?.start_date ?? null;
    const tEnd = tournament?.end_date ?? null;
    if (isValidIsoDate(tStart) && isValidIsoDate(tEnd)) {
      const start = tStart!;
      const end = tEnd!;

      // Policy:
      // - Upcoming: check in on start date, check out the day after end date.
      // - In-progress: check in today, check out at end+1 (capped to a short stay window).
      // - Past: fall back.
      const isUpcoming = compareIso(start, today) >= 0;
      const isInProgress = compareIso(start, today) < 0 && compareIso(today, end) <= 0;

      if (isUpcoming) {
        const checkin = start;
        const checkout = addDaysIso(end, 1);
        const validated = validateBookingSafe(checkin, checkout);
        if (!validated.ok) {
          return {
            ...computeFallbackDates(),
            source: "fallback" as const,
            rejected: { source: "tournament" as const, reason: validated.reason },
          };
        }
        return {
          checkin,
          checkout,
          source: "tournament" as const,
          rejected: null as null | { source: "explicit" | "tournament"; reason: string },
        };
      }

      if (isInProgress) {
        const checkin = today;
        const checkoutCandidate = addDaysIso(end, 1);
        const checkout = compareIso(checkoutCandidate, addDaysIso(checkin, 3)) <= 0 ? checkoutCandidate : addDaysIso(checkin, 3);
        const validated = validateBookingSafe(checkin, checkout);
        if (!validated.ok) {
          return {
            ...computeFallbackDates(),
            source: "fallback" as const,
            rejected: { source: "tournament" as const, reason: validated.reason },
          };
        }
        return {
          checkin,
          checkout,
          source: "tournament" as const,
          rejected: null as null | { source: "explicit" | "tournament"; reason: string },
        };
      }

      return {
        ...computeFallbackDates(),
        source: "fallback" as const,
        rejected: null as null | { source: "explicit" | "tournament"; reason: string },
      };
    }

    return { ...computeFallbackDates(), source: "fallback" as const, rejected: null as null | { source: "explicit" | "tournament"; reason: string } };
  })();

  const hotelPlannerWhiteLabelUrl = process.env.HOTELPLANNER_WHITE_LABEL_BASE_URL || "";
  const hotelPlannerCheckin = toMmDdYyyy(dates.checkin);
  const hotelPlannerCheckout = toMmDdYyyy(dates.checkout);
  const hotelPlannerCitySearch = buildHotelPlannerSearchCity({
    destinationSearch: ss,
    venueName: venue?.name ?? null,
    city: venue?.city ?? null,
    state: venue?.state ?? null,
  });
  const hotelPlannerDestination =
    hotelPlannerLat !== null && hotelPlannerLng !== null
      ? `${hotelPlannerLat},${hotelPlannerLng}`
      : String(hotelPlannerCitySearch ?? bookingSearchString).trim();
  const stableOutboundAttributionId = deriveStableAttributionId({
    outboundAttributionId,
    outboundRequestId,
  });
  const attributionFields = buildHotelPlannerBookingAttribution({
    outboundAttributionId: stableOutboundAttributionId,
    sourcePageType,
    placement: ctaPlacement,
    venueId: venueIdValid ? venueId : null,
    tournamentRef: tournament?.slug ?? null,
    plannerSessionId,
    ctaInteractionId,
    sc: querySc || "tournamentinsights",
    keyword: queryKeyword || queryKeywordLegacy || null,
    jobCode: queryJobCode || null,
    custom1: queryCustom1,
    custom2: queryCustom2,
    custom3: queryCustom3,
    custom4: queryCustom4,
    custom5: queryCustom5,
    custom6: queryCustom6,
    custom7: queryCustom7,
    custom8:
      sourcePageType === "tournament_hotels"
        ? sanitizeHotelPlannerSpreadsheetContext(queryCustom8)
        : queryCustom8,
  });

  if (venueIdValid && !venue?.id) {
    logWeakHotelPlannerDestination({
      reason: "invalid_venue_context",
      sourceSurface,
      venueIdPresent: true,
      tournamentIdPresent: Boolean(requestedTournamentId),
      latLngPresent: hasHotelPlannerLatLng,
      cityStatePresent: hasCityState,
    });
  } else if (requestedTournamentId && !tournament?.id) {
    logWeakHotelPlannerDestination({
      reason: "invalid_tournament_context",
      sourceSurface,
      venueIdPresent: venueIdValid,
      tournamentIdPresent: true,
      latLngPresent: hasHotelPlannerLatLng,
      cityStatePresent: hasCityState,
    });
  } else if (hotelPlannerDestination === "United States" || bookingSearchString === "United States") {
    logWeakHotelPlannerDestination({
      reason: "generic_destination",
      sourceSurface,
      venueIdPresent: venueIdValid,
      tournamentIdPresent: Boolean(requestedTournamentId),
      latLngPresent: hasHotelPlannerLatLng,
      cityStatePresent: hasCityState,
    });
  }

  const buildTargetForBaseUrl = (baseUrl: string) =>
    baseUrl && hotelPlannerCheckin && hotelPlannerCheckout && hotelPlannerDestination
      ? (() => {
          if (!venueIdValid && (source === "book_travel" || source === "weekend_planner")) {
            const genericDestination = String(hotelPlannerCitySearch ?? bookingSearchString).trim();
            return buildHotelPlannerSearchUrl({
              baseUrl,
              destination: genericDestination,
              latitude: null,
              longitude: null,
              city: genericDestination,
              includeHash: false,
              dates: {
                checkin: hotelPlannerCheckin,
                checkout: hotelPlannerCheckout,
              },
              sc: attributionFields.sc,
              keyword: attributionFields.keyword,
              jobCode: attributionFields.jobCode,
              custom1: attributionFields.custom1,
              custom2: attributionFields.custom2,
              custom3: attributionFields.custom3,
              custom4: attributionFields.custom4,
              custom5: attributionFields.custom5,
              custom6: attributionFields.custom6,
              custom7: attributionFields.custom7,
              custom8: attributionFields.custom8,
            });
          }

          return buildHotelPlannerSearchUrl({
            baseUrl,
            destination: hotelPlannerDestination,
            latitude: hotelPlannerLat,
            longitude: hotelPlannerLng,
            city: hotelPlannerCitySearch || null,
            includeHash: false,
            dates: {
              checkin: hotelPlannerCheckin,
              checkout: hotelPlannerCheckout,
            },
            sc: attributionFields.sc,
            keyword: attributionFields.keyword,
            jobCode: attributionFields.jobCode,
            custom1: attributionFields.custom1,
            custom2: attributionFields.custom2,
            custom3: attributionFields.custom3,
            custom4: attributionFields.custom4,
            custom5: attributionFields.custom5,
            custom6: attributionFields.custom6,
            custom7: attributionFields.custom7,
            custom8: attributionFields.custom8,
          });
        })()
      : "";
  const hotelPlannerTarget = buildTargetForBaseUrl(hotelPlannerWhiteLabelUrl);
  const feeHotelPlannerTarget = buildTargetForBaseUrl(getResolvedHotelProgramFeeTarget(hotelProgram) ?? "");

  if (!hotelPlannerTarget) {
    const message = hotelPlannerWhiteLabelUrl
      ? "Unable to build HotelPlanner target URL."
      : "HOTELPLANNER_WHITE_LABEL_BASE_URL is required for hotelplanner provider.";
    if (localDev) {
      console.warn(`[go/hotels] ${message}`);
    }
    return new NextResponse(message, { status: 500 });
  }

  const local = isLocalHost(host);
  const bot = looksLikeBot(userAgent);
  const intendedTarget = hotelProgramSnapshot.programType === "standard" ? hotelPlannerTarget : feeHotelPlannerTarget;
  const targetUrl = intendedTarget;

  let persistenceSucceeded = false;
  if (!local && !bot) {
    const persistenceResult = await persistHotelOutboundWithSnapshot({
      snapshot: hotelProgramSnapshot,
      row: {
        destination_type: "hotels",
        partner: "hotelplanner",
        outbound_partner: "hotelplanner",
        source_surface: sourceSurface,
        venue_id: venueIdValid ? venueId : null,
        tournament_id: tournament?.id ?? null,
        tournament_slug: tournament?.slug ?? null,
        target_url: targetUrl,
        redirect_url: targetUrl,
        source_path: sourcePath ?? pageUrl,
        referer,
        host,
        user_agent: userAgent?.slice(0, 300) ?? null,
        is_localhost: false,
        session_id: sessionId,
        cta_instance_id: ctaInstanceId,
        cta_interaction_id: ctaInteractionId,
        cta_type: ctaType,
        cta_placement: ctaPlacement,
        flow_type: flowType,
        page_type: pageType,
        page_url: pageUrl,
        device_type: deviceType,
        traffic_source: trafficSource,
        lodging_search_id: lodgingSearchId,
        outbound_request_id: outboundRequestId,
        outbound_attribution_id: stableOutboundAttributionId,
        source_page_type: sourcePageType,
        job_code: attributionFields.jobCode,
        keyword: attributionFields.keyword,
        partner_source_code: attributionFields.sc,
        custom_field1: attributionFields.custom1,
        custom_field2: attributionFields.custom2,
        custom_field3: attributionFields.custom3,
        custom_field4: attributionFields.custom4,
        custom_field5: attributionFields.custom5,
        custom_field6: attributionFields.custom6,
        custom_field7: attributionFields.custom7,
        custom_field8: attributionFields.custom8,
      },
    });
    persistenceSucceeded = isHotelOutboundPersistenceSuccess(persistenceResult);
  }

  const handoffMode = selectHotelHandoffMode({
    snapshot: hotelProgramSnapshot,
    persistenceSucceeded,
    standardTargetAvailable: Boolean(hotelPlannerTarget),
    feeTargetAvailable: Boolean(feeHotelPlannerTarget),
  });
  if (handoffMode === "retryable_error") {
    return new NextResponse("Hotel handoff is temporarily unavailable.", { status: 503 });
  }

  const redirectTarget = handoffMode === "fee_redirect" ? feeHotelPlannerTarget : hotelPlannerTarget;
  return NextResponse.redirect(redirectTarget, {
    status: 302,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}
