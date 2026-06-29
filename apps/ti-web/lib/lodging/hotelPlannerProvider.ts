import { createHmac } from "node:crypto";

import type {
  FallbackReason,
  GroupRequestInput,
  GroupRequestResult,
  HotelAvailabilityInput,
  HotelAvailabilityResult,
  HotelPlannerProviderConfig,
  HotelRateOption,
  LodgingProvider,
  SearchHotelProperty,
  SearchHotelsInput,
  SearchHotelsResult,
  TrackingFields,
  TiLodgingProvider,
} from "./lodging-provider";

type HotelPlannerMethod = "ping" | "multiPropertySearch" | "propertyAvailability" | "createGroupRequest";

type HotelPlannerRequestContext = {
  customerIPAddress: string;
  customerUserAgent: string;
  locale?: string | null;
  currency?: string | null;
  sc?: string | null;
  epoch?: number;
};

type HotelPlannerEnvelope<T> = {
  success?: boolean;
  code?: number | string;
  message?: string;
  text?: string;
  data?: T;
  result?: T;
  [key: string]: unknown;
};

export class HotelPlannerApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number | null,
    public details?: string | null
  ) {
    super(message);
    this.name = "HotelPlannerApiError";
  }
}

export function buildHotelPlannerAuthorizationToken(config: HotelPlannerProviderConfig, epoch: number): string {
  const apiKey = Buffer.from(config.apiKey).toString("base64url");
  const signatureInput = `${apiKey}|${config.accountId}|${epoch}`;
  const signature = createHmac("sha256", config.secretKey).update(signatureInput).digest("base64url");
  return `${apiKey}.${signature}`;
}

export function buildHotelPlannerAuthHeaders(
  config: HotelPlannerProviderConfig,
  epoch: number
): HeadersInit {
  return {
    Authorization: buildHotelPlannerAuthorizationToken(config, epoch),
    "x-hp-api-siteid": String(config.siteId),
    "content-type": "application/json; charset=UTF-8",
  };
}

export function buildHotelPlannerQuery(
  method: HotelPlannerMethod,
  context: HotelPlannerRequestContext
): string {
  const epoch = Math.floor(context.epoch ?? Math.floor(Date.now() / 1000));
  const params = new URLSearchParams({
    method,
    epoch: String(epoch),
    customerIPAddress: String(context.customerIPAddress),
    customerUserAgent: String(context.customerUserAgent),
  });

  if (context.locale) params.set("locale", context.locale);
  if (context.currency) params.set("currency", context.currency);
  if (context.sc) params.set("sc", context.sc);

  return params.toString();
}

export function normalizeDestination(input: SearchHotelsInput): string | null {
  const lat = Number.isFinite(Number(input.latitude)) ? Number(input.latitude) : null;
  const lng = Number.isFinite(Number(input.longitude)) ? Number(input.longitude) : null;
  if (lat !== null && lng !== null) return `${lat},${lng}`;
  if (!input.destination) return null;
  const trimmed = String(input.destination).trim();
  return trimmed ? trimmed : null;
}

function assertNonEmptyString(value: unknown, label: string): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) throw new Error(`Missing required ${label}`);
  return trimmed;
}

function clampInt(value: unknown, fallback: number): number {
  const numberValue = Number(value ?? fallback);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return fallback;
  return Math.floor(numberValue);
}

function clampOptionalNonNegative(value: unknown): number {
  const numberValue = Number(value ?? 0);
  if (!Number.isFinite(numberValue) || numberValue < 0) return 0;
  return Math.floor(numberValue);
}

function pickText(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function pickNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toPayloadTextMap(input: TrackingFields): Record<string, string> {
  const payload: Record<string, string> = {};
  if (input.sc) payload.sc = input.sc;
  if (input.keyword) payload.keyword = input.keyword;
  if (input.jobCode) payload.jobCode = input.jobCode;
  if (input.groupTypeCode) payload.groupTypeCode = input.groupTypeCode;
  for (let index = 1; index <= 8; index += 1) {
    const key = `customField${index}`;
    const value = input[key as keyof TrackingFields];
    if (typeof value === "string" && value.trim()) {
      payload[key] = value.trim();
    }
  }
  return payload;
}

function mapFallback(hotelCount: number, reason?: FallbackReason): {
  showBookingFallback: boolean;
  showVrboFallback: boolean;
  reason?: FallbackReason;
} {
  const isFallback = hotelCount < 3;
  return {
    showBookingFallback: isFallback,
    showVrboFallback: isFallback,
    reason: isFallback ? reason ?? "low_inventory" : undefined,
  };
}

function buildSearchBody(input: SearchHotelsInput): Record<string, unknown> {
  const destination = assertNonEmptyString(normalizeDestination(input), "destination");
  const body: Record<string, unknown> = {
    destination,
    checkIn: assertNonEmptyString(input.checkIn, "checkIn"),
    checkOut: assertNonEmptyString(input.checkOut, "checkOut"),
    roomCount: clampInt(input.roomCount, 1),
    adultCount: clampInt(input.adultCount, 1),
    childCount: clampOptionalNonNegative(input.childCount),
  };
  Object.assign(body, toPayloadTextMap(input));
  return body;
}

function buildAvailabilityBody(input: HotelAvailabilityInput): Record<string, unknown> {
  return {
    hotelID: assertNonEmptyString(input.propertyId, "propertyId"),
    hotelIDTypeID: 0,
    checkIn: assertNonEmptyString(input.checkIn, "checkIn"),
    checkOut: assertNonEmptyString(input.checkOut, "checkOut"),
    roomCount: clampInt(input.roomCount, 1),
    adultCount: clampInt(input.adultCount, 1),
    childCount: clampOptionalNonNegative(input.childCount),
    ...toPayloadTextMap(input),
  };
}

function buildGroupRequestBody(input: GroupRequestInput): Record<string, unknown> {
  return {
    hotelID: assertNonEmptyString(input.propertyId, "propertyId"),
    checkIn: assertNonEmptyString(input.checkIn, "checkIn"),
    checkOut: assertNonEmptyString(input.checkOut, "checkOut"),
    numRooms: clampInt(input.rooms, 1),
    adultsPerRoom: clampInt(input.adultsPerRoom, 1),
    split: clampInt(input.split, 1),
    rating: assertNonEmptyString(input.rating, "rating"),
    roomTypeCode: assertNonEmptyString(input.roomTypeCode, "roomTypeCode"),
    firstName: assertNonEmptyString(input.firstName, "firstName"),
    lastName: assertNonEmptyString(input.lastName, "lastName"),
    email: assertNonEmptyString(input.email, "email"),
    comments: pickText(input.comments ?? "") ?? "test test",
    targetRate: clampInt(input.targetRate, 0),
    minRate: clampInt(input.minRate, 0),
    itinerary: input.itinerary ?? "",
    groupTypeCode: input.groupTypeCode ?? "143",
    ...toPayloadTextMap({
      sc: input.sc,
      keyword: input.keyword,
      jobCode: input.jobCode,
      groupTypeCode: input.groupTypeCode,
      customField1: input.customField1,
      customField2: input.customField2,
      customField3: input.customField3,
      customField4: input.customField4,
      customField5: input.customField5,
      customField6: input.customField6,
      customField7: input.customField7,
      customField8: input.customField8,
    }),
  };
}

function normalizeSearchHotels(payload: unknown): SearchHotelsResult {
  const root = (payload ?? {}) as Record<string, unknown>;
  const rawHotels = root.hotels;
  const hotelsRaw = Array.isArray(rawHotels)
    ? rawHotels
    : rawHotels && typeof rawHotels === "object"
      ? Object.values(rawHotels as Record<string, unknown>)
      : [];
  const availabilitiesRaw = Array.isArray(root.availabilities) ? root.availabilities : [];
  const minRatesByHotel = new Map<string, number>();

  for (const row of availabilitiesRaw) {
    const entry = (row ?? {}) as Record<string, unknown>;
    const propertyId = pickText(entry.hotelID ?? entry.hotelId ?? entry.id);
    if (!propertyId) continue;
    const candidate = pickNumber(entry.fromRate ?? entry.lowRate ?? entry.rate);
    if (candidate === null) continue;
    if (!minRatesByHotel.has(propertyId) || candidate < (minRatesByHotel.get(propertyId) ?? Number.POSITIVE_INFINITY)) {
      minRatesByHotel.set(propertyId, candidate);
    }
  }

  const hotels = hotelsRaw.reduce((acc: SearchHotelProperty[], row) => {
      const item = (row ?? {}) as Record<string, unknown>;
      const propertyId = pickText(item.hotelID ?? item.hotelId ?? item.id);
      if (!propertyId) return acc;
      const coordinatesLatitude = item.latitude ?? item.lat;
      const coordinatesLongitude = item.longitude ?? item.lng;
      const ratingValue = pickNumber(item.starrating ?? item.stars ?? item.rating);
      const reviewRaw = item.reviewratings;
      const reviewCountFromPayload = typeof reviewRaw === "object" && reviewRaw !== null
        ? pickNumber((reviewRaw as Record<string, unknown>).count ?? (reviewRaw as Record<string, unknown>).basedon)
        : null;
      const fromPrice = minRatesByHotel.get(propertyId) ?? pickNumber(item.fromRate ?? item.lowRate);
      acc.push({
        id: propertyId,
        name: pickText(item.hotelname ?? item.name ?? item.hotelName) ?? "Hotel",
        city: pickText(item.city),
        state: pickText(item.state),
        country: pickText(item.country ?? item.countrycode),
        lat: pickNumber(coordinatesLatitude),
        lng: pickNumber(coordinatesLongitude),
        addressLine1: pickText(item.address1 ?? item.address ?? item.street),
        distanceMiles: pickNumber(item.distance ?? item.distanceMiles),
        rating: ratingValue,
        reviewCount: reviewCountFromPayload ?? pickNumber(item.reviewCount),
        thumbnailUrl: pickText(item.thumbnailUrl ?? item.image ?? item.img ?? item.photo),
        currency: pickText(item.currency) ?? "USD",
        fromPrice,
        raw: item,
      });
      return acc;
    }, []);

  return {
    provider: "hotelplanner",
    hotels,
    fallback: mapFallback(hotels.length, hotels.length ? undefined : "low_inventory"),
  };
}

function normalizeHotelAvailability(payload: unknown, propertyId: string): HotelAvailabilityResult {
  const root = (payload ?? {}) as Record<string, unknown>;
  const availabilityRows = Array.isArray(root.availabilities) ? (root.availabilities as unknown[]) : [];
  const roomRows = availabilityRows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const typedRow = row as Record<string, unknown>;
    const roomRates = typedRow.roomRates;
    if (Array.isArray(roomRates)) return roomRates;
    const rooms = typedRow.rooms;
    if (Array.isArray(rooms)) return rooms;
    return [];
  });

  const roomOptions = roomRows.reduce((acc: HotelRateOption[], row) => {
      const item = (row ?? {}) as Record<string, unknown>;
      const roomTypeCode = pickText(item.roomTypeCode ?? item.roomCode ?? item.code);
      const roomName = pickText(item.roomType ?? item.roomName ?? item.name ?? item.description);
      const rate = pickNumber(item.rate ?? item.totalRate ?? item.price);
      const rawRate = pickNumber(item.rateAfterTax ?? item.totalWithTaxes);
      if (!roomTypeCode || !roomName || rate === null) return acc;
      acc.push({
        roomTypeCode,
        roomName,
        rate,
        currency: pickText(item.currency) ?? "USD",
        taxesAndFees: pickNumber(item.taxes ?? item.taxesAndFees) ?? null,
        totalWithTaxes: rawRate,
        cancelPolicy: pickText(item.cancelPolicy ?? item.cancellation),
        raw: item,
      });
      return acc;
    }, []);

  return {
    propertyId,
    currency: pickText(root.currency) ?? "USD",
    roomOptions,
  };
}

function normalizeGroupRequest(payload: unknown): GroupRequestResult {
  const root = (payload ?? {}) as Record<string, unknown>;
  const groupRequest = root.groupRequest as Record<string, unknown> | null | undefined;
  const requestId = pickText(groupRequest?.postingID ?? groupRequest?.postingId ?? root.requestId ?? root.id) || null;
  const code = pickNumber(root.code);
  const success = Boolean(root.success) || code === 0;
  return {
    success,
    requestId,
    raw: root,
  };
}

function parseHotelPlannerSuccess(payload: HotelPlannerEnvelope<unknown>): boolean {
  if (payload.success === true) return true;
  if (payload.code === 0 || payload.code === "0") return true;
  return false;
}

async function callHotelPlannerApi<T = unknown>(
  config: HotelPlannerProviderConfig,
  context: HotelPlannerRequestContext,
  method: HotelPlannerMethod,
  body: Record<string, unknown>
): Promise<T> {
  const epoch = Math.floor(context.epoch ?? Math.floor(Date.now() / 1000));
  const query = buildHotelPlannerQuery(method, { ...context, epoch });
  const endpoint = `${String(config.baseUrl).replace(/\/+$/, "")}/?${query}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildHotelPlannerAuthHeaders(config, epoch),
    body: JSON.stringify(body),
  });

  const bodyText = await response.text();
  let payload: HotelPlannerEnvelope<T>;
  try {
    payload = bodyText ? (JSON.parse(bodyText) as HotelPlannerEnvelope<T>) : {};
  } catch {
    throw new HotelPlannerApiError(
      `Invalid JSON response from HotelPlanner for ${method}`,
      response.status,
      null,
      bodyText
    );
  }

  const success = parseHotelPlannerSuccess(payload);
  if (!response.ok || !success) {
    const code = Number(payload.code ?? response.headers.get("x-auth-status-code") ?? response.status);
    const statusCode = Number.isNaN(code) ? response.status : code;
    throw new HotelPlannerApiError(payload.message || payload.text || "HotelPlanner request failed", response.status, statusCode, bodyText);
  }

  const data = payload.data ?? payload.result ?? (payload as T);
  return data;
}

export async function pingHotelPlanner(
  config: HotelPlannerProviderConfig,
  context: HotelPlannerRequestContext
): Promise<boolean> {
  await callHotelPlannerApi(config, context, "ping", { echo: "Hello World" });
  return true;
}

export async function multiPropertySearch(
  config: HotelPlannerProviderConfig,
  input: SearchHotelsInput,
  context: HotelPlannerRequestContext
): Promise<SearchHotelsResult> {
  const payload = await callHotelPlannerApi<Record<string, unknown>>(config, context, "multiPropertySearch", buildSearchBody(input));
  return normalizeSearchHotels(payload);
}

export async function propertyAvailability(
  config: HotelPlannerProviderConfig,
  input: HotelAvailabilityInput,
  context: HotelPlannerRequestContext
): Promise<HotelAvailabilityResult> {
  const payload = await callHotelPlannerApi<Record<string, unknown>>(config, context, "propertyAvailability", buildAvailabilityBody(input));
  return normalizeHotelAvailability(payload, input.propertyId);
}

export async function createGroupRequest(
  config: HotelPlannerProviderConfig,
  input: GroupRequestInput,
  context: HotelPlannerRequestContext
): Promise<GroupRequestResult> {
  const payload = await callHotelPlannerApi<Record<string, unknown>>(config, context, "createGroupRequest", buildGroupRequestBody(input));
  return normalizeGroupRequest(payload);
}

// Compatibility helpers used by Step-2 integration:
export async function searchHotelsWithHotelPlanner(
  config: HotelPlannerProviderConfig,
  input: SearchHotelsInput,
  context: HotelPlannerRequestContext
): Promise<SearchHotelsResult> {
  return multiPropertySearch(config, input, context);
}

export async function getHotelAvailabilityWithHotelPlanner(
  config: HotelPlannerProviderConfig,
  input: HotelAvailabilityInput,
  context: HotelPlannerRequestContext
): Promise<HotelAvailabilityResult> {
  return propertyAvailability(config, input, context);
}

export async function createGroupRequestWithHotelPlanner(
  config: HotelPlannerProviderConfig,
  input: GroupRequestInput,
  context: HotelPlannerRequestContext
): Promise<GroupRequestResult> {
  return createGroupRequest(config, input, context);
}

export function createFallbackProvider(): LodgingProvider {
  return {
    name: "fallback" as TiLodgingProvider,
    ping: async () => {
      throw new Error("Fallback provider not implemented.");
    },
    searchHotels: async () => {
      throw new Error("Fallback provider not implemented.");
    },
    getHotelAvailability: async () => {
      throw new Error("Fallback provider not implemented.");
    },
    createGroupRequest: async () => {
      throw new Error("Fallback provider not implemented.");
    },
  };
}

export function createHotelPlannerProvider(config: HotelPlannerProviderConfig): LodgingProvider {
  const effectiveConfig: HotelPlannerProviderConfig = {
    ...config,
    baseUrl: String(config.baseUrl || "https://api.hotelplanner.com/hpapi/v2.3/"),
  };

  return {
    name: "hotelplanner" as TiLodgingProvider,
    ping: async () => {
      await pingHotelPlanner(effectiveConfig, {
        customerIPAddress: "0.0.0.0",
        customerUserAgent: "TI",
      });
      return true;
    },
    searchHotels: async (input) => {
      return searchHotelsWithHotelPlanner(effectiveConfig, input, {
        customerIPAddress: input.customerIPAddress ?? "0.0.0.0",
        customerUserAgent: input.customerUserAgent ?? "TI",
        sc: input.sc ?? "tournamentinsights",
        locale: input.locale,
        currency: input.currency,
      });
    },
    getHotelAvailability: async (input) => {
      return getHotelAvailabilityWithHotelPlanner(effectiveConfig, input, {
        customerIPAddress: input.customerIPAddress ?? "0.0.0.0",
        customerUserAgent: input.customerUserAgent ?? "TI",
        sc: input.sc ?? "tournamentinsights",
        locale: input.locale,
        currency: input.currency,
      });
    },
    createGroupRequest: async (input) => {
      return createGroupRequestWithHotelPlanner(effectiveConfig, input, {
        customerIPAddress: input.customerIPAddress ?? "0.0.0.0",
        customerUserAgent: input.customerUserAgent ?? "TI",
        sc: input.sc ?? "tournamentinsights",
        locale: input.locale,
        currency: input.currency,
      });
    },
  };
}
