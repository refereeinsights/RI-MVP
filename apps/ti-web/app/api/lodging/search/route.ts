import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  createLodgingProvider,
  getLodgingProviderName,
  LODGING_SEARCH_DEFAULTS,
  type FallbackReason,
  type SearchHotelsInput,
} from "@/lib/lodging/lodging-provider";
import { formatDateToMmDdYyyy } from "@/lib/lodging/lodging-dates";
import { HotelPlannerApiError } from "@/lib/lodging/hotelPlannerProvider";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type SearchRequestBody = {
  venueId?: unknown;
  tournamentId?: unknown;
  destination?: unknown;
  ss?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  lat?: unknown;
  lng?: unknown;
  checkin?: unknown;
  checkout?: unknown;
  rooms?: unknown;
  adults?: unknown;
  sc?: unknown;
  keyword?: unknown;
  jobCode?: unknown;
  source?: unknown;
  kw?: unknown;
  jobcode?: unknown;
  custom1?: unknown;
  custom2?: unknown;
  custom3?: unknown;
  custom4?: unknown;
  custom5?: unknown;
  custom6?: unknown;
  custom7?: unknown;
  custom8?: unknown;
  customField1?: unknown;
  customField2?: unknown;
  customField3?: unknown;
  customField4?: unknown;
  customField5?: unknown;
  customField6?: unknown;
  customField7?: unknown;
  customField8?: unknown;
  groupTypeCode?: unknown;
};

type RateLimitWindow = {
  max: number;
  seconds: number;
};

const SEARCH_ENDPOINT = "/api/lodging/search";
const RATE_LIMIT_WINDOWS: RateLimitWindow[] = [
  { max: 5, seconds: 5 },
  { max: 30, seconds: 60 },
];
const REQUEST_QUERY_COLUMNS = "id";
const IS_LODGING_DEBUG = process.env.TI_LODGING_DEBUG === "1" || process.env.TI_LODGING_DEBUG === "true";
const MAPBOX_GEOCODE_BASE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";

function toText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

function parseInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid integer value: ${String(value)}`);
  return n;
}

function parseMmDdYyyy(value: string): Date | null {
  const v = value.trim();
  const [m, d, y] = v.split("/");
  if (!m || !d || !y) return null;
  const month = Number(m);
  const day = Number(d);
  const year = Number(y);
  if (
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    year < 1900 ||
    year > 3000
  ) {
    return null;
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsed.getTime())) return null;
  const formatted = formatDateToMmDdYyyy(parsed);
  return formatted === v ? parsed : null;
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map((part) => Number(part));
  if (![y, m, d].every(Number.isInteger)) return null;
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === trimmed ? parsed : null;
}

function addDays(value: Date, days: number) {
  const date = new Date(value.getTime());
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function diffUtcDays(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function asTrackingString(body: SearchRequestBody, keys: Array<keyof SearchRequestBody>): string | null {
  for (const key of keys) {
    const text = toText(body[key]);
    if (text) return text;
  }
  return null;
}

function firstIpFromHeader(value: string | null) {
  if (!value) return null;
  const first = String(value).split(",")[0]?.trim();
  return first || null;
}

function limitExceeded(count: number, max: number) {
  return Number.isFinite(count) && count >= max;
}

function asRequestError(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

function buildProviderFailureDebug(error: unknown) {
  if (!IS_LODGING_DEBUG) return undefined;
  if (error instanceof HotelPlannerApiError) {
    return {
      providerStatus: error.status,
      providerCode: error.code,
      providerName: error.name,
      providerMessage: error.message,
      details: typeof error.details === "string" && error.details.length > 4000 ? `${error.details.slice(0, 4000)}...` : error.details,
    };
  }
  if (error instanceof Error) {
    return {
      providerName: error.name,
      providerMessage: error.message,
    };
  }
  return { providerMessage: typeof error === "string" ? error : "Unknown provider failure" };
}

function fallbackPayload(reason: FallbackReason) {
  return {
    showHotelFallback: true,
    showVrboFallback: true,
    reason,
  };
}

function resolvedCoordinatesPayload(args: {
  isGenericSearch: boolean;
  latitude: number | null;
  longitude: number | null;
}) {
  return {
    resolvedLatitude: args.isGenericSearch ? (args.latitude ?? null) : null,
    resolvedLongitude: args.isGenericSearch ? (args.longitude ?? null) : null,
  };
}

async function ensureRateLimitAllowed(input: { clientIp: string | null; userAgent: string | null }) {
  const ip = input.clientIp || "unknown";
  const ua = input.userAgent || "unknown";
  for (const rule of RATE_LIMIT_WINDOWS) {
    const cutoff = new Date(Date.now() - rule.seconds * 1000).toISOString();
    const { count, error } = await (supabaseAdmin as any)
      .from("lodging_search_session" as any)
      .select(REQUEST_QUERY_COLUMNS, { count: "exact", head: true })
      .eq("endpoint", SEARCH_ENDPOINT)
      .eq("client_ip", ip)
      .eq("user_agent", ua)
      .gte("created_at", cutoff);

    if (error) throw new Error(error.message);
    if (limitExceeded(count ?? 0, rule.max)) {
      return { limited: true as const };
    }
  }
  return { limited: false as const };
}

async function insertStartedSession(input: {
  sessionId: string;
  provider: string;
  searchQuery: Record<string, unknown>;
  clientIp: string | null;
  userAgent: string | null;
}) {
  try {
    const payload = {
      id: input.sessionId,
      provider: input.provider,
      correlation_id: input.sessionId,
      session_id: input.sessionId,
      search_query: input.searchQuery,
      status: "started" as const,
      endpoint: SEARCH_ENDPOINT,
      client_ip: input.clientIp ?? "unknown",
      user_agent: input.userAgent,
      started_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await (supabaseAdmin.from("lodging_search_session" as any) as any).insert(payload);
  } catch {
    // best-effort write; provider call must continue even if this fails.
  }
}

async function updateSessionLifecycle(input: {
  sessionId: string;
  status: "succeeded" | "failed";
  resultCount?: number;
  latencyMs: number;
  fallbackReason?: string | null;
  errorCode?: string | null;
  responseSnapshot?: unknown;
}) {
  if (!input.sessionId) return;
  try {
    const payload: Record<string, unknown> = {
      status: input.status,
      ended_at: new Date().toISOString(),
      latency_ms: input.latencyMs,
      updated_at: new Date().toISOString(),
      result_count: input.resultCount ?? 0,
      fallback_reason: input.fallbackReason ?? null,
      error_code: input.errorCode ?? null,
    };
    if (input.responseSnapshot !== undefined) {
      payload.response_snapshot = input.responseSnapshot;
    }
    await (supabaseAdmin.from("lodging_search_session" as any) as any).update(payload).eq("id", input.sessionId);
  } catch {
    // Non-blocking: never fail request on telemetry writes.
  }
}

async function fetchVenueById(venueId: string) {
  const { data: venue } = await supabaseAdmin
    .from("venues" as any)
    .select("id,name,city,state,latitude,longitude")
    .eq("id", venueId)
    .maybeSingle<{
      id: string;
      name: string | null;
      city: string | null;
      state: string | null;
      latitude: number | null;
      longitude: number | null;
    }>();
  return venue ?? null;
}

function parseCoordinate(value: unknown, maxAbs: number): number | null {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || Math.abs(numeric) > maxAbs) return null;
  return numeric;
}

function getMapboxToken() {
  return (
    String(process.env.MAPBOX_SECRET_TOKEN ?? "").trim() ||
    String(process.env.MAPBOX_ACCESS_TOKEN ?? "").trim() ||
    String(process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "").trim()
  );
}

async function fetchTournamentDates(tournamentId: string) {
  const { data: tournament } = await supabaseAdmin
    .from("tournaments_search_public" as any)
    .select("id,start_date,end_date")
    .eq("id", tournamentId)
    .maybeSingle<{ id: string; start_date: string | null; end_date: string | null }>();
  return tournament ? { startDate: tournament.start_date, endDate: tournament.end_date } : null;
}

function resolveSearchWindow(body: SearchRequestBody, tournamentDates: { startDate: string | null; endDate: string | null } | null) {
  const checkinText = toText(body.checkin);
  const checkoutText = toText(body.checkout);
  const explicitCheckin = checkinText
    ? parseIsoDate(checkinText) ?? parseMmDdYyyy(checkinText)
    : null;
  const explicitCheckout = checkoutText
    ? parseIsoDate(checkoutText) ?? parseMmDdYyyy(checkoutText)
    : null;

  if (explicitCheckin && explicitCheckout && explicitCheckout > explicitCheckin) {
    return {
      source: "explicit" as const,
      window: {
        checkIn: formatDateToMmDdYyyy(explicitCheckin),
        checkOut: formatDateToMmDdYyyy(explicitCheckout),
      },
      reason: null as null | FallbackReason,
    };
  }

  if (checkinText || checkoutText) {
    return { source: "explicit" as const, window: null, reason: "no_dates" as FallbackReason };
  }

  if (tournamentDates?.startDate && tournamentDates?.endDate) {
    const start = parseIsoDate(tournamentDates.startDate);
    const end = parseIsoDate(tournamentDates.endDate);
    if (start && end && end >= start) {
      const today = startOfTodayUtc();
      const isUpcoming = start >= today;
      const isInProgress = start < today && end >= today;

      if (isUpcoming) {
        const checkin = start;
        const checkOut = addDays(end, 1);
        if (checkOut > checkin) {
          return {
            source: "tournament" as const,
            window: {
              checkIn: formatDateToMmDdYyyy(checkin),
              checkOut: formatDateToMmDdYyyy(checkOut),
            },
            reason: null as null | FallbackReason,
          };
        }
      }

      if (isInProgress) {
        const checkin = today;
        const endPlusOne = addDays(end, 1);
        const maxShortStayCheckout = addDays(checkin, 3);
        const checkOut = endPlusOne <= maxShortStayCheckout ? endPlusOne : maxShortStayCheckout;
        if (checkOut > checkin && diffUtcDays(checkin, checkOut) > 0) {
          return {
            source: "tournament" as const,
            window: {
              checkIn: formatDateToMmDdYyyy(checkin),
              checkOut: formatDateToMmDdYyyy(checkOut),
            },
            reason: null as null | FallbackReason,
          };
        }
      }

      if (end < today) {
        return {
          source: "tournament" as const,
          window: null,
          reason: "no_dates" as FallbackReason,
        };
      }
    }
  }

  return { source: "tournament" as const, window: null, reason: "no_dates" as FallbackReason };
}

function resolveDestination(venue: {
  name: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
}) {
  if (Number.isFinite(venue.latitude) && Number.isFinite(venue.longitude)) {
    return {
      destination: null as string | null,
      latitude: Number(venue.latitude),
      longitude: Number(venue.longitude),
    };
  }

  const city = toText(venue.city);
  const state = toText(venue.state);
  if (!city || !state) {
    return { destination: null, latitude: null, longitude: null };
  }

  const normalizedName = toText(venue.name);
  const destination = [normalizedName, city, state].filter(Boolean).join(", ");
  return { destination, latitude: null, longitude: null };
}

function resolveGenericDestination(body: SearchRequestBody) {
  const destination =
    toText(body.destination) ||
    toText(body.ss);
  const latitude = parseCoordinate(body.latitude ?? body.lat, 90);
  const longitude = parseCoordinate(body.longitude ?? body.lng, 180);

  if (latitude !== null && longitude !== null) {
    return {
      destination: destination ?? null,
      latitude,
      longitude,
    };
  }

  return {
    destination,
    latitude: null,
    longitude: null,
  };
}

async function geocodeGenericDestination(destination: string): Promise<{ latitude: number; longitude: number; placeName?: string | null } | null> {
  const token = getMapboxToken();
  const trimmedDestination = String(destination ?? "").trim();
  if (!token || !trimmedDestination) return null;

  try {
    const url = new URL(`${MAPBOX_GEOCODE_BASE_URL}/${encodeURIComponent(trimmedDestination)}.json`);
    url.searchParams.set("access_token", token);
    url.searchParams.set("country", "us");
    url.searchParams.set("limit", "1");
    url.searchParams.set("types", "place,postcode,locality,address,region,district");

    const response = await fetch(url.toString(), { method: "GET" });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as
      | { features?: Array<{ center?: [number, number]; place_name?: string | null }> }
      | null;

    const feature = Array.isArray(payload?.features) ? payload!.features[0] : null;
    const lng = Array.isArray(feature?.center) ? Number(feature?.center?.[0]) : null;
    const lat = Array.isArray(feature?.center) ? Number(feature?.center?.[1]) : null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
      latitude: Number(lat),
      longitude: Number(lng),
      placeName: feature?.place_name ?? null,
    };
  } catch {
    return null;
  }
}

function genericFallbackWindow() {
  const today = startOfTodayUtc();
  const checkIn = addDays(today, 14);
  const checkOut = addDays(checkIn, 2);
  return {
    checkIn: formatDateToMmDdYyyy(checkIn),
    checkOut: formatDateToMmDdYyyy(checkOut),
  };
}

function buildSearchInput(params: {
  roomCount: number;
  adultCount: number;
  checkin: string;
  checkout: string;
  destination: string | null;
  latitude: number | null;
  longitude: number | null;
  body: SearchRequestBody;
  correlationId: string;
  clientIp: string | null;
  userAgent: string | null;
}): SearchHotelsInput {
  const {
    roomCount,
    adultCount,
    checkin,
    checkout,
    destination,
    latitude,
    longitude,
    body,
    correlationId,
    clientIp,
    userAgent,
  } = params;

  return {
    destination,
    latitude,
    longitude,
    checkIn: checkin,
    checkOut: checkout,
    roomCount,
    adultCount,
    sc: asTrackingString(body, ["sc", "source"]),
    keyword: asTrackingString(body, ["keyword", "kw"]),
    jobCode: asTrackingString(body, ["jobCode", "jobcode"]),
    customField1: asTrackingString(body, ["customField1", "custom1"]),
    customField2: asTrackingString(body, ["customField2", "custom2"]),
    customField3: asTrackingString(body, ["customField3", "custom3"]),
    customField4: asTrackingString(body, ["customField4", "custom4"]),
    customField5: asTrackingString(body, ["customField5", "custom5"]),
    customField6: asTrackingString(body, ["customField6", "custom6"]),
    customField7: asTrackingString(body, ["customField7", "custom7"]),
    customField8: asTrackingString(body, ["customField8", "custom8"]),
    groupTypeCode: asTrackingString(body, ["groupTypeCode"]),
    correlationId,
    customerIPAddress: clientIp,
    customerUserAgent: userAgent,
  };
}

function classifyProviderFailure(error: unknown) {
  if (error instanceof HotelPlannerApiError) {
    return {
      statusCode: 502,
      errorCode: String(error.code ?? "provider_error"),
      errorMessage: error.message,
    };
  }

  if (error instanceof Error) {
    if (error.message === "Fallback provider not implemented.") {
      return {
        statusCode: 502,
        errorCode: "provider_not_configured",
        errorMessage: error.message,
      };
    }
    if (error.message.startsWith("Missing ")) {
      return {
        statusCode: 500,
        errorCode: "server_configuration_error",
        errorMessage: error.message,
      };
    }
  }

  return {
    statusCode: 500,
    errorCode: "server_error",
    errorMessage: error instanceof Error ? error.message : "Unknown error",
  };
}

export async function POST(request: Request) {
  let body = (await request.json().catch(() => null)) as SearchRequestBody | null;
  if (!body || typeof body !== "object") {
    return asRequestError("Invalid JSON body");
  }

  const venueId = parseUuid(body.venueId);
  const genericSource = toText(body.source);
  let genericDestination = resolveGenericDestination(body);
  const isGenericSearch = !venueId;

  if (!venueId && !genericDestination.destination && (genericDestination.latitude === null || genericDestination.longitude === null)) {
    return asRequestError("Missing destination");
  }

  if (
    isGenericSearch &&
    genericSource !== "book_travel" &&
    genericSource !== "weekend_planner"
  ) {
    return asRequestError("Generic destination search is not allowed for this source");
  }

  const tournamentId = toText(body.tournamentId) ? parseUuid(body.tournamentId) : null;
  if (toText(body.tournamentId) && !tournamentId) {
    return asRequestError("Invalid tournamentId");
  }

  const providerName = getLodgingProviderName();
  const [venue, tournament] = await Promise.all([
    venueId ? fetchVenueById(venueId) : Promise.resolve(null),
    tournamentId ? fetchTournamentDates(tournamentId) : Promise.resolve(null),
  ]);

  if (venueId && !venue) {
    return NextResponse.json({ ok: false, error: "Venue not found" }, { status: 400 });
  }

  if (
    isGenericSearch &&
    genericDestination.destination &&
    genericDestination.latitude === null &&
    genericDestination.longitude === null
  ) {
    const geocoded = await geocodeGenericDestination(genericDestination.destination);
    if (geocoded) {
      genericDestination = {
        destination: genericDestination.destination,
        latitude: geocoded.latitude,
        longitude: geocoded.longitude,
      };
    }
  }

  const requestedRooms = body.rooms;
  const requestedAdults = body.adults;
  let roomCount: number;
  let adultCount: number;
  try {
    roomCount = parseInteger(
      requestedRooms,
      LODGING_SEARCH_DEFAULTS.minRooms,
      LODGING_SEARCH_DEFAULTS.maxRooms,
      LODGING_SEARCH_DEFAULTS.defaultRooms
    );
    adultCount = parseInteger(
      requestedAdults,
      LODGING_SEARCH_DEFAULTS.minAdultCount,
      LODGING_SEARCH_DEFAULTS.maxAdultCount,
      LODGING_SEARCH_DEFAULTS.defaultAdultsPerRoom
    );
  } catch (error: unknown) {
    return asRequestError((error as Error).message);
  }

  const clientIp = firstIpFromHeader(request.headers.get("x-forwarded-for")) || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";

  const destination = venue ? resolveDestination(venue) : genericDestination;
  if (!destination.destination && (destination.latitude === null || destination.longitude === null)) {
    return NextResponse.json(
      {
        sessionId: randomUUID(),
        provider: providerName,
        hotels: [],
        fallback: fallbackPayload(venue ? "no_venue_coordinates" : "no_dates"),
        resolvedCheckIn: null,
        resolvedCheckOut: null,
      },
      { status: 200 }
    );
  }

  const resolvedWindow = resolveSearchWindow(body, tournament ? { startDate: tournament.startDate, endDate: tournament.endDate } : null);
  if (!resolvedWindow.window) {
    if (isGenericSearch) {
      const fallbackWindow = genericFallbackWindow();
      const rateCheck = await ensureRateLimitAllowed({ clientIp, userAgent });
      if (rateCheck.limited) {
        return NextResponse.json({ ok: false, error: "Rate limit exceeded" }, { status: 429 });
      }

      const provider = createLodgingProvider(providerName);
      const sessionId = randomUUID();
      const providerInput = buildSearchInput({
        roomCount,
        adultCount,
        checkin: fallbackWindow.checkIn,
        checkout: fallbackWindow.checkOut,
        destination: destination.destination,
        latitude: destination.latitude,
        longitude: destination.longitude,
        body,
        correlationId: sessionId,
        clientIp,
        userAgent,
      });

      const searchQuery = {
        venueId: null,
        tournamentId: tournamentId || null,
        genericDestination: destination.destination,
        requestedWindow: {
          source: "generic_fallback",
          checkin: fallbackWindow.checkIn,
          checkout: fallbackWindow.checkOut,
        },
        rooms: roomCount,
        adults: adultCount,
        source: providerInput.sc,
        destinationUsed:
          destination.latitude !== null && destination.longitude !== null ? "coordinates" : "destination",
      };

      await insertStartedSession({
        sessionId,
        provider: providerName,
        searchQuery,
        clientIp,
        userAgent,
      });

      const startedAt = Date.now();
      try {
        const result = await provider.searchHotels(providerInput);
        const fallback = result.fallback ?? { showHotelFallback: false, showVrboFallback: false };
        const count = Array.isArray(result.hotels) ? result.hotels.length : 0;
        const latencyMs = Date.now() - startedAt;
        const fallbackReason = fallback.showHotelFallback ? "low_inventory" : null;
        await updateSessionLifecycle({
          sessionId,
          status: "succeeded",
          resultCount: count,
          latencyMs,
          fallbackReason,
        });
        return NextResponse.json({
          sessionId,
          provider: result.provider,
          hotels: result.hotels,
          fallback,
          resolvedCheckIn: fallbackWindow.checkIn,
          resolvedCheckOut: fallbackWindow.checkOut,
          ...resolvedCoordinatesPayload({
            isGenericSearch,
            latitude: destination.latitude,
            longitude: destination.longitude,
          }),
        });
      } catch (error: unknown) {
        const { statusCode, errorCode, errorMessage } = classifyProviderFailure(error);
        const latencyMs = Date.now() - startedAt;
        const providerError = errorMessage;
        const fallback = fallbackPayload("provider_error");
        await updateSessionLifecycle({
          sessionId,
          status: "failed",
          resultCount: 0,
          latencyMs,
          fallbackReason: "provider_error",
          errorCode,
          responseSnapshot:
            errorCode || statusCode === 502
              ? { message: providerError, type: (error instanceof Error ? error.name : "Error") }
              : null,
        });

        if (statusCode === 502) {
          return NextResponse.json(
            {
              sessionId,
              provider: providerName,
              hotels: [],
              fallback,
              error: "Provider failure",
              code: errorCode,
              resolvedCheckIn: fallbackWindow.checkIn,
              resolvedCheckOut: fallbackWindow.checkOut,
              ...resolvedCoordinatesPayload({
                isGenericSearch,
                latitude: destination.latitude,
                longitude: destination.longitude,
              }),
              ...(IS_LODGING_DEBUG
                ? { providerFailure: buildProviderFailureDebug(error) }
                : {}),
            },
            { status: 502 }
          );
        }

        return NextResponse.json(
          {
            sessionId,
            provider: providerName,
            error: providerError,
            resolvedCheckIn: fallbackWindow.checkIn,
            resolvedCheckOut: fallbackWindow.checkOut,
            ...resolvedCoordinatesPayload({
              isGenericSearch,
              latitude: destination.latitude,
              longitude: destination.longitude,
            }),
            ...(IS_LODGING_DEBUG
              ? { providerFailure: buildProviderFailureDebug(error) }
              : {}),
          },
          { status: statusCode }
        );
      }
    }

    return NextResponse.json(
      {
        sessionId: randomUUID(),
        provider: providerName,
        hotels: [],
        fallback: fallbackPayload(resolvedWindow.reason),
        resolvedCheckIn: null,
        resolvedCheckOut: null,
        ...resolvedCoordinatesPayload({
          isGenericSearch,
          latitude: destination.latitude,
          longitude: destination.longitude,
        }),
      },
      { status: 200 }
    );
  }

  const rateCheck = await ensureRateLimitAllowed({ clientIp, userAgent });
  if (rateCheck.limited) {
    return NextResponse.json({ ok: false, error: "Rate limit exceeded" }, { status: 429 });
  }

  const provider = createLodgingProvider(providerName);
  const sessionId = randomUUID();
  const providerInput = buildSearchInput({
    roomCount,
    adultCount,
    checkin: resolvedWindow.window.checkIn,
    checkout: resolvedWindow.window.checkOut,
    destination: destination.destination,
    latitude: destination.latitude,
    longitude: destination.longitude,
    body,
    correlationId: sessionId,
    clientIp,
    userAgent,
  });

  const searchQuery = {
    venueId,
    tournamentId: tournamentId || null,
    genericDestination: isGenericSearch ? destination.destination : null,
    requestedWindow: {
      source: resolvedWindow.source,
      checkin: resolvedWindow.window.checkIn,
      checkout: resolvedWindow.window.checkOut,
    },
    rooms: roomCount,
    adults: adultCount,
    source: providerInput.sc,
    destinationUsed:
      destination.latitude !== null && destination.longitude !== null ? "coordinates" : "destination",
  };

  await insertStartedSession({
    sessionId,
    provider: providerName,
    searchQuery,
    clientIp,
    userAgent,
  });

  const startedAt = Date.now();
  try {
    const result = await provider.searchHotels(providerInput);
    const fallback = result.fallback ?? { showHotelFallback: false, showVrboFallback: false };
    const count = Array.isArray(result.hotels) ? result.hotels.length : 0;
    const latencyMs = Date.now() - startedAt;
    const fallbackReason = fallback.showHotelFallback ? "low_inventory" : null;
    await updateSessionLifecycle({
      sessionId,
      status: "succeeded",
      resultCount: count,
      latencyMs,
      fallbackReason,
    });
    return NextResponse.json({
      sessionId,
      provider: result.provider,
      hotels: result.hotels,
      fallback,
      resolvedCheckIn: resolvedWindow.window.checkIn,
      resolvedCheckOut: resolvedWindow.window.checkOut,
      ...resolvedCoordinatesPayload({
        isGenericSearch,
        latitude: destination.latitude,
        longitude: destination.longitude,
      }),
    });
  } catch (error: unknown) {
    const { statusCode, errorCode, errorMessage } = classifyProviderFailure(error);
    const latencyMs = Date.now() - startedAt;
    const providerError = errorMessage;
    const fallback = fallbackPayload("provider_error");
    await updateSessionLifecycle({
      sessionId,
      status: "failed",
      resultCount: 0,
      latencyMs,
      fallbackReason: "provider_error",
      errorCode,
      responseSnapshot:
        errorCode || statusCode === 502
          ? { message: providerError, type: (error instanceof Error ? error.name : "Error") }
          : null,
    });

    if (statusCode === 502) {
      return NextResponse.json(
        {
          sessionId,
          provider: providerName,
          hotels: [],
          fallback,
          error: "Provider failure",
          code: errorCode,
          resolvedCheckIn: resolvedWindow.window.checkIn,
          resolvedCheckOut: resolvedWindow.window.checkOut,
          ...resolvedCoordinatesPayload({
            isGenericSearch,
            latitude: destination.latitude,
            longitude: destination.longitude,
          }),
          ...(IS_LODGING_DEBUG
            ? { providerFailure: buildProviderFailureDebug(error) }
            : {}),
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        sessionId,
        provider: providerName,
        error: providerError,
        resolvedCheckIn: resolvedWindow.window.checkIn,
        resolvedCheckOut: resolvedWindow.window.checkOut,
        ...resolvedCoordinatesPayload({
          isGenericSearch,
          latitude: destination.latitude,
          longitude: destination.longitude,
        }),
        ...(IS_LODGING_DEBUG
          ? { providerFailure: buildProviderFailureDebug(error) }
          : {}),
      },
      { status: statusCode }
    );
  }
}
