export type TiLodgingProvider = "hotelplanner" | "fallback";

export const LODGING_PROVIDERS = ["hotelplanner", "fallback"] as const satisfies readonly TiLodgingProvider[];

export const DEFAULT_LODGING_PROVIDER: TiLodgingProvider = "hotelplanner";

export const LODGING_SEARCH_DEFAULTS = {
  minRooms: 1,
  maxRooms: 12,
  maxAdultCount: 12,
  minAdultCount: 1,
  childCount: 0,
  defaultRooms: 1,
  defaultAdultsPerRoom: 1,
  defaultSc: "tournamentinsights",
} as const;

export const LODGING_EVENT_NAMES = [
  "lodging_api_search_started",
  "lodging_api_search_succeeded",
  "lodging_api_search_failed",
  "lodging_low_inventory",
  "lodging_map_impression",
  "hotel_pin_impression",
  "hotel_card_view",
  "hotel_pin_click",
  "hotel_card_click",
  "hotel_availability_requested",
  "hotel_availability_succeeded",
  "hotel_availability_failed",
  "hotel_room_view",
  "hotel_checkout_handoff",
  "team_block_cta_click",
  "team_block_rfp_start",
  "team_block_rfp_submit",
  "partner_booking_reported",
  "partner_booking_cancelled",
  "lodging_commission_reported",
] as const;

export type LodgingEventName = (typeof LODGING_EVENT_NAMES)[number];

export type FallbackReason =
  | "provider_error"
  | "timeout"
  | "low_inventory"
  | "no_dates"
  | "no_venue_coordinates";

export type TrackingFieldKey = `customField${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

export type TrackingFields = {
  sc?: string | null;
  keyword?: string | null;
  jobCode?: string | null;
  groupTypeCode?: string | null;
} & Partial<Record<TrackingFieldKey, string | null>>;

export type SearchHotelsInput = {
  destination?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  checkIn: string;
  checkOut: string;
  roomCount: number;
  adultCount: number;
  childCount?: number | null;
  locale?: string;
  currency?: string;
  source?: string;
  correlationId?: string;
} & TrackingFields;

export type HotelAvailabilityInput = {
  propertyId: string;
  checkIn: string;
  checkOut: string;
  roomCount: number;
  adultCount: number;
  childCount?: number | null;
  locale?: string;
  currency?: string;
  source?: string;
  correlationId?: string;
} & TrackingFields;

export type GroupRequestInput = {
  propertyId: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adultsPerRoom: number;
  childrenPerRoom?: number | null;
  firstName: string;
  lastName: string;
  email: string;
  split: number;
  rating: string;
  roomTypeCode: string;
  comments?: string | null;
  targetRate?: number | null;
  minRate?: number | null;
  itinerary?: string | null;
  locale?: string;
  currency?: string;
  source?: string;
  correlationId?: string;
  customField1?: string | null;
  customField2?: string | null;
  customField3?: string | null;
  customField4?: string | null;
  customField5?: string | null;
  customField6?: string | null;
  customField7?: string | null;
  customField8?: string | null;
  jobCode?: string | null;
  sc?: string | null;
  groupTypeCode?: string | null;
};

export type SearchHotelProperty = {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  addressLine1?: string | null;
  distanceMiles?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  thumbnailUrl?: string | null;
  currency?: string | null;
  fromPrice?: number | null;
  raw?: unknown;
};

export type SearchHotelsResult = {
  provider: TiLodgingProvider;
  hotels: SearchHotelProperty[];
  fallback?: {
    showBookingFallback: boolean;
    showVrboFallback: boolean;
    reason?: FallbackReason;
  };
  sessionId?: string;
};

export type HotelRateOption = {
  roomTypeCode: string;
  roomName: string;
  rate: number;
  currency: string;
  taxesAndFees?: number | null;
  totalWithTaxes?: number | null;
  cancelPolicy?: string | null;
  raw?: unknown;
};

export type HotelAvailabilityResult = {
  propertyId: string;
  currency?: string | null;
  roomOptions: HotelRateOption[];
};

export type GroupRequestResult = {
  success: boolean;
  requestId?: string | null;
  raw?: unknown;
};

export type LodgingProvider = {
  name: TiLodgingProvider;
  ping: () => Promise<boolean>;
  searchHotels: (input: SearchHotelsInput) => Promise<SearchHotelsResult>;
  getHotelAvailability: (input: HotelAvailabilityInput) => Promise<HotelAvailabilityResult>;
  createGroupRequest: (input: GroupRequestInput) => Promise<GroupRequestResult>;
};

export type HotelPlannerProviderConfig = {
  apiKey: string;
  secretKey: string;
  accountId: string;
  siteId: string;
  baseUrl: string;
  whiteLabelBaseUrl: string;
};

export type LodgingProviderFactory = (name: TiLodgingProvider) => LodgingProvider;

export function getLodgingProviderName(): TiLodgingProvider {
  const raw = String(process.env.TI_LODGING_PROVIDER || DEFAULT_LODGING_PROVIDER).trim().toLowerCase();
  if (raw === "fallback") return "fallback";
  if (raw === "hotelplanner") return "hotelplanner";
  return DEFAULT_LODGING_PROVIDER;
}

export function validateHotelPlannerEnv(raw: {
  apiKey?: string | undefined;
  secretKey?: string | undefined;
  accountId?: string | undefined;
  siteId?: string | undefined;
  baseUrl?: string | undefined;
  whiteLabelBaseUrl?: string | undefined;
}): HotelPlannerProviderConfig {
  const apiKey = String(raw.apiKey ?? "").trim();
  const secretKey = String(raw.secretKey ?? "").trim();
  const accountId = String(raw.accountId ?? "").trim();
  const siteId = String(raw.siteId ?? "").trim();
  const baseUrl = String(raw.baseUrl ?? "https://api.hotelplanner.com/hpapi/v2.3/").trim();
  const whiteLabelBaseUrl = String(raw.whiteLabelBaseUrl ?? "").trim();

  if (!apiKey) throw new Error("Missing HOTELPLANNER_API_KEY");
  if (!secretKey) throw new Error("Missing HOTELPLANNER_SECRET_KEY");
  if (!accountId) throw new Error("Missing HOTELPLANNER_ACCOUNT_ID");
  if (!siteId) throw new Error("Missing HOTELPLANNER_SITE_ID");
  if (!whiteLabelBaseUrl) throw new Error("Missing HOTELPLANNER_WHITE_LABEL_BASE_URL");

  return {
    apiKey,
    secretKey,
    accountId,
    siteId,
    baseUrl,
    whiteLabelBaseUrl,
  };
}

export function getHotelPlannerEnv(): HotelPlannerProviderConfig {
  return validateHotelPlannerEnv({
    apiKey: process.env.HOTELPLANNER_API_KEY,
    secretKey: process.env.HOTELPLANNER_SECRET_KEY,
    accountId: process.env.HOTELPLANNER_ACCOUNT_ID,
    siteId: process.env.HOTELPLANNER_SITE_ID,
    baseUrl: process.env.HOTELPLANNER_BASE_URL,
    whiteLabelBaseUrl: process.env.HOTELPLANNER_WHITE_LABEL_BASE_URL,
  });
}

export function createLodgingProvider(providerName?: TiLodgingProvider, factory?: LodgingProviderFactory): LodgingProvider {
  const name = providerName ?? getLodgingProviderName();
  if (!factory) {
    return {
      name,
      ping: async () => {
        throw new Error(`Lodging provider implementation pending for ${name}`);
      },
      searchHotels: async () => {
        throw new Error(`Lodging provider implementation pending for ${name}`);
      },
      getHotelAvailability: async () => {
        throw new Error(`Lodging provider implementation pending for ${name}`);
      },
      createGroupRequest: async () => {
        throw new Error(`Lodging provider implementation pending for ${name}`);
      },
    };
  }
  return factory(name);
}
