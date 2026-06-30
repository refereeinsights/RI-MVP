import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  createLodgingProvider,
  getLodgingProviderName,
  type GroupRequestInput,
  LODGING_SEARCH_DEFAULTS,
} from "@/lib/lodging/lodging-provider";
import { formatDateToMmDdYyyy } from "@/lib/lodging/lodging-dates";
import { HotelPlannerApiError } from "@/lib/lodging/hotelPlannerProvider";
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
};

const GROUP_REQUEST_ENDPOINT = "/api/lodging/group-request";

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parsePropertyId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
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
  clientIp: string | null;
  userAgent: string | null;
}) {
  try {
    await (supabaseAdmin.from("lodging_search_session" as any) as any).insert({
      id: input.sessionId,
      provider: input.provider,
      correlation_id: input.sessionId,
      session_id: input.sessionId,
      search_query: input.groupRequestQuery,
      status: "started",
      endpoint: GROUP_REQUEST_ENDPOINT,
      client_ip: input.clientIp || "unknown",
      user_agent: input.userAgent || "unknown",
      started_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Best-effort telemetry only.
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

    await (supabaseAdmin.from("lodging_search_session" as any) as any)
      .update(payload)
      .eq("id", input.sessionId);
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
  if (!propertyId) {
    return asRequestError("Invalid propertyId");
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
    rooms = parseInteger(
      body.rooms,
      5,
      LODGING_SEARCH_DEFAULTS.maxRooms,
      5,
      true
    );
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

  const providerInput: GroupRequestInput = {
    propertyId,
    destination: toText(body.destination) ?? undefined,
    checkIn,
    checkOut,
    rooms,
    adultsPerRoom,
    childrenPerRoom,
    firstName,
    lastName,
    email,
    split,
    rating: ratingText,
    roomTypeCode,
    comments: toText(body.comments) ?? undefined,
    targetRate: parseNonNegativeInteger(body.targetRate),
    minRate: parseNonNegativeInteger(body.minRate),
    itinerary: toText(body.itinerary) ?? undefined,
    locale: toText(body.locale) || undefined,
    currency: toText(body.currency) || undefined,
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
    groupTypeCode: toText(body.groupTypeCode) || "143",
    customerIPAddress: firstIpFromHeader(request.headers.get("x-forwarded-for")) || request.headers.get("x-real-ip") || "unknown",
    customerUserAgent: request.headers.get("user-agent") || "unknown",
  };

  const provider = createLodgingProvider(providerName);
  const sessionId = randomUUID();

  await insertStartedSession({
    sessionId,
    provider: providerName,
    groupRequestQuery: {
      propertyId,
      checkIn,
      checkOut,
      rooms,
      adultsPerRoom,
      roomTypeCode,
      rating: ratingText,
      split,
      firstName,
      lastName,
      email,
      groupTypeCode: providerInput.groupTypeCode,
      source: providerInput.sc,
      locale: providerInput.locale,
      currency: providerInput.currency,
    },
    clientIp: providerInput.customerIPAddress ?? "unknown",
    userAgent: providerInput.customerUserAgent ?? "unknown",
  });

  const startedAt = Date.now();
  try {
    const result = await provider.createGroupRequest(providerInput);
    const latencyMs = Date.now() - startedAt;

    await updateSessionLifecycle({
      sessionId,
      status: "succeeded",
      resultCount: 1,
      latencyMs,
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
