import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildBookingSearchString, isValidZip5 } from "@/lib/booking/venueBooking";

export const runtime = "nodejs";

type LodgingProvider = "booking" | "hotelplanner";

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

function parseProvider(raw: string | null): LodgingProvider {
  const normalized = String(raw ?? "").trim().toLowerCase();
  return normalized === "hotelplanner" ? "hotelplanner" : "booking";
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

function buildHotelPlannerSearchUrl(args: {
  baseUrl: string;
  destination: string;
  dates: { checkin: string; checkout: string };
}): string {
  const baseUrl = normalizeHotelPlannerBaseUrl(args.baseUrl);
  const destination = String(args.destination ?? "").trim();
  if (!baseUrl || !destination) return "";

  const searchUrl = new URL("/Search/", baseUrl);
  searchUrl.searchParams.set("destination", destination);
  if (args.dates.checkin) searchUrl.searchParams.set("checkin", args.dates.checkin);
  if (args.dates.checkout) searchUrl.searchParams.set("checkout", args.dates.checkout);
  searchUrl.searchParams.set("rooms", "1");
  searchUrl.searchParams.set("adults", "2");
  searchUrl.searchParams.set("source", "tournamentinsights");
  return searchUrl.toString();
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

function buildBookingSearchUrl(args: { ss: string; checkin: string; checkout: string }) {
  const { ss, checkin, checkout } = args;
  const encodedSS = encodeURIComponent(ss);
  return `https://www.booking.com/searchresults.html?ss=${encodedSS}&checkin=${checkin}&checkout=${checkout}&group_adults=2&no_rooms=1`;
}

function wrapAwin(bookingUrl: string) {
  const mid = process.env.BOOKING_AWIN_MID;
  const affId = process.env.BOOKING_AWIN_AFFID;
  if (!mid || !affId) {
    return { ok: false as const, error: "Missing BOOKING_AWIN_MID or BOOKING_AWIN_AFFID" };
  }

  const wrapped = `https://www.awin1.com/cread.php?awinmid=${encodeURIComponent(mid)}&awinaffid=${encodeURIComponent(
    affId
  )}&ued=${encodeURIComponent(bookingUrl)}`;
  return { ok: true as const, url: wrapped };
}

export async function GET(request: Request) {
  const reqUrl = new URL(request.url);
  const venueId = String(reqUrl.searchParams.get("venueId") ?? "").trim();
  const tournamentId = String(reqUrl.searchParams.get("tournamentId") ?? "").trim();
  const ssOverride = String(reqUrl.searchParams.get("ss") ?? "").trim();
  const checkinRaw = String(reqUrl.searchParams.get("checkin") ?? "").trim();
  const checkoutRaw = String(reqUrl.searchParams.get("checkout") ?? "").trim();
  const provider = parseProvider(reqUrl.searchParams.get("provider"));
  const latitude = parseLatLng(reqUrl.searchParams.get("lat"), 90);
  const latitudeAlt = parseLatLng(reqUrl.searchParams.get("latitude"), 90);
  const longitude = parseLatLng(reqUrl.searchParams.get("lng"), 180);
  const longitudeAlt = parseLatLng(reqUrl.searchParams.get("longitude"), 180);

  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").trim();
  const localDev = isLocalDevelopment(host);
  const referer = request.headers.get("referer");
  const userAgent = request.headers.get("user-agent");

  const venueIdValid = Boolean(venueId && isUuid(venueId));

  // Anti-abuse guardrail: allow generic mode only when invoked from /weekend-planner (or local dev).
  const source = String(reqUrl.searchParams.get("source") ?? "").trim();
  const sourcePath = sourcePathFromReferer(referer);
  const genericAllowed =
    localDev ||
    source === "weekend_planner" ||
    source === "tournament_directory" ||
    source === "tournament_detail" ||
    (sourcePath ?? "").startsWith("/weekend-planner");

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

  if (!ss && !(provider === "hotelplanner" && hasHotelPlannerLatLng)) {
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

  const bookingUrl = buildBookingSearchUrl({
    ss: bookingSearchString,
    checkin: dates.checkin,
    checkout: dates.checkout,
  });

  const providerTarget: LodgingProvider =
    provider === "hotelplanner" && hasHotelPlannerLatLng ? "hotelplanner" : "booking";
  const hotelPlannerWhiteLabelUrl = process.env.HOTELPLANNER_WHITE_LABEL_BASE_URL || "";
  const hotelPlannerCheckin = toMmDdYyyy(dates.checkin);
  const hotelPlannerCheckout = toMmDdYyyy(dates.checkout);

  const hotelPlannerTarget =
    providerTarget === "hotelplanner" && hotelPlannerWhiteLabelUrl && hotelPlannerCheckin && hotelPlannerCheckout
      ? buildHotelPlannerSearchUrl({
          baseUrl: hotelPlannerWhiteLabelUrl,
          destination: `${hotelPlannerLat},${hotelPlannerLng}`,
          dates: { checkin: hotelPlannerCheckin, checkout: hotelPlannerCheckout },
        })
      : "";

  const wrapped = providerTarget === "booking" ? wrapAwin(bookingUrl) : { ok: true as const, url: hotelPlannerTarget };
  const localProviderTarget = providerTarget;
  const effectiveProviderTarget: LodgingProvider =
    localProviderTarget === "hotelplanner" && !hotelPlannerTarget
      ? "booking"
      : localProviderTarget;

  if (providerTarget === "hotelplanner" && !hotelPlannerTarget && localDev) {
    console.warn("[go/hotels] missing HOTELPLANNER_WHITE_LABEL_BASE_URL for provider=hotelplanner, using Booking fallback in local mode");
  }

  if (!wrapped.ok) {
    if (!localDev) {
      console.error("[go/hotels] missing Awin config");
      return new NextResponse(wrapped.error, { status: 500 });
    }
    console.warn("[go/hotels] missing Awin config, using direct booking URL");
  }

  if (providerTarget === "hotelplanner" && !hotelPlannerTarget && !localDev) {
    return new NextResponse("HOTELPLANNER_WHITE_LABEL_BASE_URL is required for hotelplanner provider.", { status: 500 });
  }

  const local = isLocalHost(host);
  const bot = looksLikeBot(userAgent);
  const redirectTarget =
    effectiveProviderTarget === "hotelplanner"
      ? hotelPlannerTarget
      : wrapped.ok
        ? wrapped.url
        : bookingUrl;
  const targetUrl = effectiveProviderTarget === "hotelplanner" ? hotelPlannerTarget : bookingUrl;

  if (!local && !bot) {
    try {
      const sourceSurface =
        venueIdValid
          ? "venue_page"
          : source === "tournament_directory"
          ? "tournament_directory"
          : source === "tournament_detail"
          ? "tournament_detail"
          : "weekend_planner";
      await supabaseAdmin.from("ti_outbound_clicks" as any).insert({
        destination_type: "hotels",
        partner: effectiveProviderTarget,
        source_surface: sourceSurface,
        venue_id: venueIdValid ? venueId : null,
        tournament_id: tournament?.id ?? null,
        tournament_slug: tournament?.slug ?? null,
        target_url: targetUrl,
        redirect_url: redirectTarget,
        source_path: sourcePath,
        referer,
        host,
        user_agent: userAgent?.slice(0, 300) ?? null,
        is_localhost: false,
      });
    } catch {
      // Don't block redirects on logging failures.
      console.warn("[go/hotels] outbound click insert failed");
    }
  }

  return NextResponse.redirect(redirectTarget, {
    status: 302,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}
