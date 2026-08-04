import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  createLodgingProvider,
  getLodgingProviderName,
  type GroupRequestInput,
  LODGING_SEARCH_DEFAULTS,
} from "@/lib/lodging/lodging-provider";
import { formatDateToMmDdYyyy } from "@/lib/lodging/lodging-dates";
import { buildGroupRequestBody, HotelPlannerApiError } from "@/lib/lodging/hotelPlannerProvider";
import {
  buildHotelPlannerGroupRequestAttribution,
  createOutboundAttributionId,
  deriveHotelPlannerSourcePageType,
  isValidOutboundAttributionId,
  type HotelPlannerSourcePageType,
} from "@/lib/hotelPlannerAttribution";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type GroupRequestBody = {
  propertyId?: unknown;
  destination?: unknown;
  checkin?: unknown;
  checkout?: unknown;
  checkIn?: unknown;
  checkOut?: unknown;
  rooms?: unknown;
  adults?: unknown;
  adultsPerRoom?: unknown;
  children?: unknown;
  childrenPerRoom?: unknown;
  childCount?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  groupName?: unknown;
  teamName?: unknown;
  phone?: unknown;
  split?: unknown;
  rating?: unknown;
  roomTypeCode?: unknown;
  comments?: unknown;
  targetRate?: unknown;
  minRate?: unknown;
  itinerary?: unknown;
  locale?: unknown;
  currency?: unknown;
  sc?: unknown;
  source?: unknown;
  keyword?: unknown;
  jobCode?: unknown;
  jobcode?: unknown;
  kw?: unknown;
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
  planner_session_id?: unknown;
  tournament_id?: unknown;
  venue_id?: unknown;
  entry_source?: unknown;
  entry_page_type?: unknown;
  entry_path?: unknown;
  entry_placement?: unknown;
  current_page_type?: unknown;
  current_page_path?: unknown;
  source_page_type?: unknown;
  source_path?: unknown;
  cta_placement?: unknown;
  page_url?: unknown;
  request_source?: unknown;
  traffic_source?: unknown;
  referrer?: unknown;
  device_type?: unknown;
  outbound_attribution_id?: unknown;
  session_id?: unknown;
  anonymous_visitor_id?: unknown;
  cta_interaction_id?: unknown;
};

type GroupRequestTracking = {
  outboundAttributionId: string;
  sourcePageType: HotelPlannerSourcePageType;
  sourcePath: string | null;
  ctaPlacement: string | null;
  pageType: string | null;
  pageUrl: string | null;
  deviceType: string | null;
  trafficSource: string | null;
  referrer: string | null;
  plannerSessionId: string | null;
  tournamentId: string | null;
  venueId: string | null;
  entrySource: string | null;
  entryPageType: string | null;
  entryPath: string | null;
  entryPlacement: string | null;
  currentPageType: string | null;
  currentPagePath: string | null;
  requestSource: string | null;
  jobCode: string | null;
  keyword: string | null;
  partnerSourceCode: string | null;
  customField1: string | null;
  customField2: string | null;
  customField3: string | null;
  customField4: string | null;
  customField5: string | null;
  customField6: string | null;
  customField7: string | null;
  customField8: string | null;
};

const GROUP_REQUEST_ENDPOINT = "/api/lodging/group-request";

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function sanitizeText(value: string | null, maxLength: number) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function sanitizePageUrl(value: string | null) {
  const trimmed = sanitizeText(value, 512);
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return sanitizeText(`${parsed.pathname}${parsed.search}` || "/", 512);
  } catch {
    return null;
  }
}

function parsePropertyId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseOutboundAttributionId(value: unknown): string | null {
  const text = toText(value)?.toLowerCase().replace(/-/g, "") ?? null;
  if (!text) return null;
  return isValidOutboundAttributionId(text) ? text : null;
}

function parseInteger(
  value: unknown,
  min: number,
  max: number,
  fallback?: number,
  required = false
): number {
  if ((value === undefined || value === null || value === "") && required) {
    throw new Error("Invalid integer value: missing");
  }

  if ((value === undefined || value === null || value === "") && fallback !== undefined && !required) {
    return fallback;
  }

  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Invalid integer value: ${String(value)}`);
  }

  return n;
}

function parseNonNegativeInteger(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Invalid non-negative integer value: ${String(value)}`);
  }
  return n;
}

function parseMmDdYyyy(value: string): string | null {
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
  return formatted === v ? v : null;
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

function parseMmDdToDate(value: string): Date | null {
  const parsed = parseMmDdYyyy(value);
  if (!parsed) return null;
  const [m, d, y] = parsed.split("/").map((part) => Number(part));
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function normalizeCheckDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const mmdd = parseMmDdYyyy(trimmed);
  if (mmdd) return mmdd;

  const parsedIso = parseIsoDate(trimmed);
  if (!parsedIso) return null;
  return formatDateToMmDdYyyy(parsedIso);
}

function asRequestError(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

function isLocalhostHost(host: string) {
  const h = host.trim().toLowerCase();
  if (!h) return false;
  if (h === "localhost" || h.startsWith("localhost:")) return true;
  if (h === "127.0.0.1" || h.startsWith("127.0.0.1:")) return true;
  if (h === "0.0.0.0" || h.startsWith("0.0.0.0:")) return true;
  if (h === "[::1]" || h.startsWith("[::1]:")) return true;
  if (h.endsWith(".local")) return true;
  return false;
}

function isPrivateNetworkHost(host: string) {
  const h = host.trim().toLowerCase();
  if (!h) return false;
  const withoutPort = h.startsWith("[") ? h : h.split(":")[0];
  const ip = withoutPort.replace(/^\[/, "").replace(/\]$/, "");
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function shouldPersistTeamHotelAnalytics(request: Request) {
  if (process.env.ENABLE_TI_ANALYTICS_TRACKING === "true") return true;
  if (process.env.NODE_ENV === "development") return false;

  const host = sanitizeText(request.headers.get("x-forwarded-host") ?? request.headers.get("host"), 128);
  if (host && isLocalhostHost(host)) return false;
  if (host && isPrivateNetworkHost(host)) return false;

  const origin = sanitizeText(request.headers.get("origin"), 256);
  if (origin && (origin.includes("://localhost") || origin.includes("://127.0.0.1") || origin.includes("://[::1]"))) {
    return false;
  }

  const referer = sanitizeText(request.headers.get("referer"), 512);
  if (referer && (referer.includes("://localhost") || referer.includes("://127.0.0.1") || referer.includes("://[::1]"))) {
    return false;
  }

  return true;
}

function firstIpFromHeader(value: string | null) {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

function asTrackingString(body: GroupRequestBody, keys: Array<keyof GroupRequestBody>): string | null {
  for (const key of keys) {
    const value = toText(body[key]);
    if (value) return value;
  }
  return null;
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

async function insertStartedSession(input: {
  sessionId: string;
  provider: string;
  groupRequestQuery: Record<string, unknown>;
  providerRequestSnapshot: Record<string, unknown>;
  clientIp: string | null;
  userAgent: string | null;
  tracking: GroupRequestTracking;
}): Promise<{ sessionId: string; duplicateSuccess: { requestId: string | null } | null }> {
  try {
    const now = new Date().toISOString();
    const basePayload = {
      provider: input.provider,
      correlation_id: input.sessionId,
      session_id: input.sessionId,
      search_query: input.groupRequestQuery,
      provider_request_snapshot: input.providerRequestSnapshot,
      status: "started" as const,
      endpoint: GROUP_REQUEST_ENDPOINT,
      client_ip: input.clientIp || "unknown",
      user_agent: input.userAgent || "unknown",
      started_at: now,
      updated_at: now,
      outbound_attribution_id: input.tracking.outboundAttributionId,
      source_page_type: input.tracking.sourcePageType,
      source_path: input.tracking.sourcePath,
      cta_placement: input.tracking.ctaPlacement,
      page_type: input.tracking.pageType,
      page_url: input.tracking.pageUrl,
      device_type: input.tracking.deviceType,
      traffic_source: input.tracking.trafficSource,
      referrer: input.tracking.referrer,
      planner_session_id: input.tracking.plannerSessionId,
      tournament_id: input.tracking.tournamentId,
      venue_id: input.tracking.venueId,
      entry_source: input.tracking.entrySource,
      entry_page_type: input.tracking.entryPageType,
      entry_path: input.tracking.entryPath,
      entry_placement: input.tracking.entryPlacement,
      current_page_type: input.tracking.currentPageType,
      current_page_path: input.tracking.currentPagePath,
      request_source: input.tracking.requestSource,
      job_code: input.tracking.jobCode,
      keyword: input.tracking.keyword,
      partner_source_code: input.tracking.partnerSourceCode,
      custom_field1: input.tracking.customField1,
      custom_field2: input.tracking.customField2,
      custom_field3: input.tracking.customField3,
      custom_field4: input.tracking.customField4,
      custom_field5: input.tracking.customField5,
      custom_field6: input.tracking.customField6,
      custom_field7: input.tracking.customField7,
      custom_field8: input.tracking.customField8,
      outbound_partner: "hotelplanner",
      destination_type: "group_request",
    };

    const existing = await (supabaseAdmin.from("lodging_search_session" as any) as any)
      .select("id,status,group_request_id")
      .eq("endpoint", GROUP_REQUEST_ENDPOINT)
      .eq("outbound_attribution_id", input.tracking.outboundAttributionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const existingRow = existing?.data as { id?: string | null; status?: string | null; group_request_id?: string | null } | null;
    if (existingRow?.id && existingRow.status === "succeeded") {
      return {
        sessionId: existingRow.id,
        duplicateSuccess: { requestId: existingRow.group_request_id ?? null },
      };
    }

    if (existingRow?.id) {
      await (supabaseAdmin.from("lodging_search_session" as any) as any)
        .update(basePayload)
        .eq("id", existingRow.id);
      return { sessionId: existingRow.id, duplicateSuccess: null };
    }

    await (supabaseAdmin.from("lodging_search_session" as any) as any).insert({
      id: input.sessionId,
      created_at: now,
      ...basePayload,
    });
  } catch {
    // Best-effort telemetry only.
  }
  return { sessionId: input.sessionId, duplicateSuccess: null };
}

async function updateSessionLifecycle(input: {
  sessionId: string;
  status: "succeeded" | "failed";
  resultCount?: number;
  latencyMs: number;
  fallbackReason?: string | null;
  errorCode?: string | null;
  groupRequestId?: string | null;
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
      group_request_id: input.groupRequestId ?? null,
    };

    if (input.responseSnapshot !== undefined) {
      payload.response_snapshot = input.responseSnapshot;
    }

    await (supabaseAdmin.from("lodging_search_session" as any) as any)
      .update(payload)
      .eq("id", input.sessionId);
  } catch {
    // best-effort
  }
}

async function insertAcceptedAnalyticsEvent(input: {
  request: Request;
  tracking: GroupRequestTracking;
  body: GroupRequestBody;
  requestId: string | null;
  sessionId: string;
}) {
  if (!shouldPersistTeamHotelAnalytics(input.request)) return;

  const requestedCheckIn = toText(input.body.checkin) ?? toText(input.body.checkIn);
  const requestedCheckOut = toText(input.body.checkout) ?? toText(input.body.checkOut);
  const checkInDate = normalizeCheckDate(requestedCheckIn);
  const checkOutDate = normalizeCheckDate(requestedCheckOut);

  const properties = {
    surface: "team_hotel",
    source_surface: sanitizeText(toText(input.body.request_source) ?? toText(input.body.source), 64) ?? "team_hotel",
    source_page_type: input.tracking.sourcePageType,
    action_surface: "team_hotel",
    auth_state: "unknown",
    entitlement: "unknown",
    context_type: "team_hotel",
    session_id: sanitizeText(toText(input.body.session_id), 128),
    anonymous_visitor_id: sanitizeText(toText(input.body.anonymous_visitor_id), 128),
    source_path: input.tracking.sourcePath,
    cta_interaction_id: sanitizeText(toText(input.body.cta_interaction_id), 128),
    planner_session_id: input.tracking.plannerSessionId,
    tournament_id: input.tracking.tournamentId,
    venue_id: input.tracking.venueId,
    entry_source: input.tracking.entrySource,
    entry_page_type: input.tracking.entryPageType,
    entry_path: input.tracking.entryPath,
    entry_placement: input.tracking.entryPlacement,
    current_page_type: input.tracking.currentPageType,
    current_page_path: input.tracking.currentPagePath,
    request_source: input.tracking.requestSource,
    sport: null,
    event_start_date: checkInDate ? parseMmDdToDate(checkInDate)?.toISOString().slice(0, 10) ?? null : null,
    event_end_date: checkOutDate ? parseMmDdToDate(checkOutDate)?.toISOString().slice(0, 10) ?? null : null,
    request_id: input.requestId,
    outbound_attribution_id: input.tracking.outboundAttributionId,
    server_session_id: input.sessionId,
  };

  try {
    await (supabaseAdmin.from("ti_map_events" as any) as any).insert({
      event_name: "team_hotel_request_submitted",
      properties,
      page_type: "other",
      sport: null,
      state: null,
      href: input.tracking.currentPagePath ?? input.tracking.sourcePath ?? "/team-hotel-booking",
      filter_name: input.tracking.entryPlacement ?? null,
      old_value: input.tracking.entrySource ?? null,
      new_value: input.requestId,
      cta: "team_hotel",
    });
  } catch {
    // best-effort
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as GroupRequestBody | null;
  if (!body || typeof body !== "object") {
    return asRequestError("Invalid JSON body");
  }

  const providerName = getLodgingProviderName();
  const propertyId = parsePropertyId(body.propertyId);
  const destination = toText(body.destination);
  if (!propertyId && !destination) {
    return asRequestError("Missing destination");
  }

  const checkIn = normalizeCheckDate(toText(body.checkin) ?? toText(body.checkIn));
  const checkOut = normalizeCheckDate(toText(body.checkout) ?? toText(body.checkOut));
  if (!checkIn || !checkOut) {
    return asRequestError("Invalid or missing checkin/checkout");
  }

  const checkInDate = parseMmDdToDate(checkIn);
  const checkOutDate = parseMmDdToDate(checkOut);
  if (!checkInDate || !checkOutDate || checkOutDate <= checkInDate) {
    return asRequestError("Invalid date range");
  }

  let rooms: number;
  let adultsPerRoom: number;
  let childrenPerRoom: number;
  let split: number;
  let ratingText: string;

  if (body.split === undefined || body.split === null || body.split === "") {
    return asRequestError("Missing split");
  }

  try {
    rooms = parseInteger(body.rooms, 5, LODGING_SEARCH_DEFAULTS.maxRooms, 5, true);
    adultsPerRoom = parseInteger(
      body.adults ?? body.adultsPerRoom,
      LODGING_SEARCH_DEFAULTS.minAdultCount,
      LODGING_SEARCH_DEFAULTS.maxAdultCount,
      LODGING_SEARCH_DEFAULTS.defaultAdultsPerRoom
    );
    childrenPerRoom = parseNonNegativeInteger(body.children ?? body.childrenPerRoom ?? body.childCount);
    split = parseInteger(body.split, 1, Number.MAX_SAFE_INTEGER, undefined, true);
  } catch (error: unknown) {
    return asRequestError((error as Error).message);
  }

  ratingText = toText(body.rating) || "5";

  const roomTypeCode = toText(body.roomTypeCode);
  if (!roomTypeCode) {
    return asRequestError("Missing roomTypeCode");
  }

  const firstName = toText(body.firstName);
  if (!firstName) {
    return asRequestError("Missing firstName");
  }

  const lastName = toText(body.lastName);
  if (!lastName) {
    return asRequestError("Missing lastName");
  }

  const email = toText(body.email);
  if (!email) {
    return asRequestError("Missing email");
  }

  const groupName = asTrackingString(body, ["groupName", "teamName"]);
  const phone = toText(body.phone);
  const sourcePageType = (() => {
    const direct = sanitizeText(toText(body.source_page_type), 32);
    if (direct) return direct as HotelPlannerSourcePageType;
    return deriveHotelPlannerSourcePageType({
      source: toText(body.source),
      pageType: toText(body.current_page_type) ?? toText(body.entry_page_type),
      sourcePath: toText(body.current_page_path) ?? toText(body.entry_path),
      hasVenueId: Boolean(toText(body.venue_id)),
    });
  })();
  const ctaPlacement = sanitizeText(toText(body.cta_placement) ?? toText(body.entry_placement), 64);
  const trackingBase = {
    outboundAttributionId: parseOutboundAttributionId(body.outbound_attribution_id) ?? createOutboundAttributionId(),
    sourcePageType,
    sourcePath: sanitizePageUrl(toText(body.source_path) ?? toText(body.current_page_path) ?? toText(body.entry_path)),
    ctaPlacement,
    pageType: sanitizeText(toText(body.current_page_type) ?? sourcePageType, 32),
    pageUrl: sanitizePageUrl(toText(body.page_url) ?? toText(body.current_page_path) ?? toText(body.entry_path)),
    deviceType: sanitizeText(toText(body.device_type), 32),
    trafficSource: sanitizeText(toText(body.traffic_source), 64),
    referrer: sanitizeText(toText(body.referrer), 512),
    plannerSessionId: toText(body.planner_session_id),
    tournamentId: toText(body.tournament_id),
    venueId: toText(body.venue_id),
    entrySource: toText(body.entry_source),
    entryPageType: toText(body.entry_page_type),
    entryPath: sanitizePageUrl(toText(body.entry_path)),
    entryPlacement: sanitizeText(toText(body.entry_placement), 64),
    currentPageType: sanitizeText(toText(body.current_page_type), 32),
    currentPagePath: sanitizePageUrl(toText(body.current_page_path)),
    requestSource: sanitizeText(toText(body.request_source) ?? toText(body.source), 64),
  };

  const attributionFields = buildHotelPlannerGroupRequestAttribution({
    outboundAttributionId: trackingBase.outboundAttributionId,
    sourcePageType,
    placement: ctaPlacement,
    venueId: trackingBase.venueId,
    tournamentId: trackingBase.tournamentId,
    plannerSessionId: trackingBase.plannerSessionId,
    sc: "tournamentinsights",
    keyword: asTrackingString(body, ["keyword", "kw"]) ?? "Team hotel block",
    jobCode: asTrackingString(body, ["jobCode", "jobcode"]) ?? "TI-TEAM-BLOCK",
  });

  const providerInput: GroupRequestInput = {
    propertyId,
    destination: destination ?? undefined,
    checkIn,
    checkOut,
    rooms,
    adultsPerRoom,
    childrenPerRoom,
    firstName,
    lastName,
    email,
    groupName,
    phone,
    split,
    rating: ratingText,
    roomTypeCode,
    comments: toText(body.comments) ?? undefined,
    targetRate: parseNonNegativeInteger(body.targetRate),
    minRate: parseNonNegativeInteger(body.minRate),
    itinerary: toText(body.itinerary) ?? undefined,
    locale: toText(body.locale) || undefined,
    currency: toText(body.currency) || undefined,
    sc: attributionFields.sc,
    keyword: attributionFields.keyword ?? undefined,
    jobCode: attributionFields.jobCode,
    customField1: attributionFields.custom1 ?? undefined,
    customField2: attributionFields.custom2 ?? undefined,
    customField3: attributionFields.custom3 ?? undefined,
    customField4: attributionFields.custom4 ?? undefined,
    customField5: attributionFields.custom5 ?? undefined,
    customField6: attributionFields.custom6 ?? undefined,
    customField7: attributionFields.custom7 ?? undefined,
    customField8: attributionFields.custom8 ?? undefined,
    groupTypeCode: toText(body.groupTypeCode) || "143",
    customerIPAddress: firstIpFromHeader(request.headers.get("x-forwarded-for")) || request.headers.get("x-real-ip") || "unknown",
    customerUserAgent: request.headers.get("user-agent") || "unknown",
  };
  const providerRequestSnapshot = buildGroupRequestBody(providerInput);
  const tracking: GroupRequestTracking = {
    ...trackingBase,
    jobCode: attributionFields.jobCode,
    keyword: attributionFields.keyword,
    partnerSourceCode: attributionFields.sc,
    customField1: attributionFields.custom1,
    customField2: attributionFields.custom2,
    customField3: attributionFields.custom3,
    customField4: attributionFields.custom4,
    customField5: attributionFields.custom5,
    customField6: attributionFields.custom6,
    customField7: attributionFields.custom7,
    customField8: attributionFields.custom8,
  };

  const provider = createLodgingProvider(providerName);
  const startedSession = await insertStartedSession({
    sessionId: randomUUID(),
    provider: providerName,
    groupRequestQuery: {
      outbound_attribution_id: tracking.outboundAttributionId,
      propertyId,
      destination,
      checkIn,
      checkOut,
      rooms,
      adultsPerRoom,
      childrenPerRoom,
      roomTypeCode,
      rating: ratingText,
      split,
      firstName,
      lastName,
      email,
      groupName,
      phone,
      comments: toText(body.comments) ?? undefined,
      targetRate: parseNonNegativeInteger(body.targetRate),
      minRate: parseNonNegativeInteger(body.minRate),
      groupTypeCode: providerInput.groupTypeCode,
      source: toText(body.source),
      source_page_type: tracking.sourcePageType,
      source_path: tracking.sourcePath,
      cta_placement: tracking.ctaPlacement,
      legacy_custom1: asTrackingString(body, ["customField1", "custom1"]),
      legacy_custom2: asTrackingString(body, ["customField2", "custom2"]),
      sc: attributionFields.sc,
      keyword: attributionFields.keyword,
      jobCode: attributionFields.jobCode,
      customField1: attributionFields.custom1,
      customField2: attributionFields.custom2,
      customField3: attributionFields.custom3,
      customField4: attributionFields.custom4,
      customField5: attributionFields.custom5,
      customField6: attributionFields.custom6,
      customField7: attributionFields.custom7,
      customField8: attributionFields.custom8,
      locale: providerInput.locale,
      currency: providerInput.currency,
      page_url: tracking.pageUrl,
      device_type: tracking.deviceType,
      traffic_source: tracking.trafficSource,
      referrer: tracking.referrer,
      planner_session_id: tracking.plannerSessionId,
      tournament_id: tracking.tournamentId,
      venue_id: tracking.venueId,
      entry_source: tracking.entrySource,
      entry_page_type: tracking.entryPageType,
      entry_path: tracking.entryPath,
      entry_placement: tracking.entryPlacement,
      current_page_type: tracking.currentPageType,
      current_page_path: tracking.currentPagePath,
      request_source: tracking.requestSource,
    },
    providerRequestSnapshot,
    clientIp: providerInput.customerIPAddress ?? "unknown",
    userAgent: providerInput.customerUserAgent ?? "unknown",
    tracking,
  });

  if (startedSession.duplicateSuccess) {
    return NextResponse.json({
      sessionId: startedSession.sessionId,
      provider: providerName,
      propertyId,
      success: true,
      ...(startedSession.duplicateSuccess.requestId ? { requestId: startedSession.duplicateSuccess.requestId } : {}),
    });
  }

  const sessionId = startedSession.sessionId;
  const startedAt = Date.now();
  try {
    const result = await provider.createGroupRequest(providerInput);
    const latencyMs = Date.now() - startedAt;

    await updateSessionLifecycle({
      sessionId,
      status: "succeeded",
      resultCount: 1,
      latencyMs,
      groupRequestId: result.requestId ?? null,
      responseSnapshot: result.raw ?? { requestId: result.requestId ?? null, success: result.success },
    });

    await insertAcceptedAnalyticsEvent({
      request,
      tracking,
      body,
      requestId: result.requestId ?? null,
      sessionId,
    });

    const responseBody = {
      sessionId,
      provider: providerName,
      propertyId,
      success: result.success,
      ...(result.requestId ? { requestId: result.requestId } : {}),
    };
    return NextResponse.json(responseBody);
  } catch (error: unknown) {
    const { statusCode, errorCode, errorMessage } = classifyProviderFailure(error);
    const latencyMs = Date.now() - startedAt;

    await updateSessionLifecycle({
      sessionId,
      status: "failed",
      latencyMs,
      resultCount: 0,
      errorCode,
      fallbackReason: "provider_error",
      responseSnapshot: { message: errorMessage, type: error instanceof Error ? error.name : "Error" },
    });

    if (statusCode === 502) {
      return NextResponse.json(
        {
          sessionId,
          provider: providerName,
          propertyId,
          success: false,
          error: "Provider failure",
          code: errorCode,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ sessionId, provider: providerName, propertyId, success: false, error: errorMessage }, { status: statusCode });
  }
}
