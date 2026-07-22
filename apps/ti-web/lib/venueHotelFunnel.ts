export const VENUE_HOTEL_PAGE_TYPES = ["venue", "tournament", "planner", "other"] as const;
export type VenueHotelPageType = (typeof VENUE_HOTEL_PAGE_TYPES)[number];

export const VENUE_HOTEL_FLOW_TYPES = ["direct_outbound", "search_then_outbound"] as const;
export type VenueHotelFlowType = (typeof VENUE_HOTEL_FLOW_TYPES)[number];

export const VENUE_HOTEL_CTA_TYPE = "hotel";

export const VENUE_HOTEL_PLACEMENTS = {
  venueDirectoryTextLink: "venue_directory_text_link",
  venueDirectoryPlanningLink: "venue_directory_planning_link",
  venueDirectoryCardLink: "venue_directory_card_link",
  venueDetailsBookingCta: "venue_details_booking_cta",
} as const;

export type VenueHotelPlacement = (typeof VENUE_HOTEL_PLACEMENTS)[keyof typeof VENUE_HOTEL_PLACEMENTS];

export const VENUE_HOTEL_PLACEMENT_CONFIG: Record<
  VenueHotelPlacement,
  {
    flowType: VenueHotelFlowType;
    pageType: VenueHotelPageType;
  }
> = {
  [VENUE_HOTEL_PLACEMENTS.venueDirectoryTextLink]: {
    flowType: "direct_outbound",
    pageType: "venue",
  },
  [VENUE_HOTEL_PLACEMENTS.venueDirectoryPlanningLink]: {
    flowType: "direct_outbound",
    pageType: "venue",
  },
  [VENUE_HOTEL_PLACEMENTS.venueDirectoryCardLink]: {
    flowType: "direct_outbound",
    pageType: "venue",
  },
  [VENUE_HOTEL_PLACEMENTS.venueDetailsBookingCta]: {
    flowType: "direct_outbound",
    pageType: "venue",
  },
};

const ANALYTICS_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PAGE_URL_LENGTH = 512;
const MAX_TRAFFIC_SOURCE_LENGTH = 64;

export type VenueHotelTrackedHrefArgs = {
  href: string;
  sessionId: string | null;
  ctaInstanceId: string;
  ctaInteractionId?: string | null;
  ctaPlacement: VenueHotelPlacement;
  pageType?: VenueHotelPageType;
  pageUrl?: string | null;
  deviceType?: string | null;
  trafficSource?: string | null;
  lodgingSearchId?: string | null;
  outboundRequestId?: string | null;
};

export type VenueHotelTrackingContext = {
  session_id: string | null;
  cta_instance_id: string;
  cta_interaction_id?: string | null;
  cta_type: typeof VENUE_HOTEL_CTA_TYPE;
  cta_placement: VenueHotelPlacement;
  flow_type: VenueHotelFlowType;
  page_type: VenueHotelPageType;
  page_url: string | null;
  device_type: string | null;
  traffic_source: string | null;
};

export type ImpressionTrackerState = {
  tracked: boolean;
  visibleSinceMs: number | null;
};

export type ClickAttemptState = {
  acceptedInteractionId: string | null;
  clickInFlight: boolean;
};

export function isAnalyticsUuid(value: unknown): value is string {
  return typeof value === "string" && ANALYTICS_ID_RE.test(value.trim());
}

export function makeAnalyticsUuid(factory?: () => string) {
  const candidate = factory?.() ?? globalThis.crypto?.randomUUID?.() ?? null;
  if (candidate && isAnalyticsUuid(candidate)) return candidate;
  throw new Error("Unable to generate analytics UUID.");
}

export function resolveVenueHotelContext(args: {
  ctaPlacement: VenueHotelPlacement;
  pageUrl?: string | null;
  sessionId: string | null;
  ctaInstanceId: string;
  ctaInteractionId?: string | null;
  deviceType?: string | null;
  trafficSource?: string | null;
}): VenueHotelTrackingContext {
  const placementConfig = VENUE_HOTEL_PLACEMENT_CONFIG[args.ctaPlacement];
  return {
    session_id: args.sessionId,
    cta_instance_id: args.ctaInstanceId,
    cta_interaction_id: args.ctaInteractionId ?? null,
    cta_type: VENUE_HOTEL_CTA_TYPE,
    cta_placement: args.ctaPlacement,
    flow_type: placementConfig.flowType,
    page_type: placementConfig.pageType,
    page_url: sanitizePageUrl(args.pageUrl ?? null),
    device_type: sanitizeText(args.deviceType ?? null, 32),
    traffic_source: sanitizeText(args.trafficSource ?? null, MAX_TRAFFIC_SOURCE_LENGTH),
  };
}

export function appendVenueHotelTrackingToHref(args: VenueHotelTrackedHrefArgs) {
  const url = new URL(args.href, "https://www.tournamentinsights.com");
  const context = resolveVenueHotelContext({
    ctaPlacement: args.ctaPlacement,
    pageUrl: args.pageUrl ?? null,
    sessionId: args.sessionId,
    ctaInstanceId: args.ctaInstanceId,
    ctaInteractionId: args.ctaInteractionId ?? null,
    deviceType: args.deviceType ?? null,
    trafficSource: args.trafficSource ?? null,
  });

  url.searchParams.set("cta_instance_id", context.cta_instance_id);
  url.searchParams.set("cta_placement", context.cta_placement);
  url.searchParams.set("cta_type", context.cta_type);
  url.searchParams.set("flow_type", context.flow_type);
  url.searchParams.set("page_type", context.page_type);
  if (context.session_id) url.searchParams.set("session_id", context.session_id);
  if (context.cta_interaction_id) url.searchParams.set("cta_interaction_id", context.cta_interaction_id);
  if (context.page_url) url.searchParams.set("page_url", context.page_url);
  if (context.device_type) url.searchParams.set("device_type", context.device_type);
  if (context.traffic_source) url.searchParams.set("traffic_source", context.traffic_source);
  if (args.lodgingSearchId && isAnalyticsUuid(args.lodgingSearchId)) {
    url.searchParams.set("lodging_search_id", args.lodgingSearchId);
  }
  if (args.outboundRequestId && isAnalyticsUuid(args.outboundRequestId)) {
    url.searchParams.set("outbound_request_id", args.outboundRequestId);
  }

  const relative = `${url.pathname}${url.search}${url.hash}`;
  return args.href.startsWith("http://") || args.href.startsWith("https://") ? url.toString() : relative;
}

export function resolveDeviceType(viewportWidth: number | null | undefined) {
  if (!Number.isFinite(viewportWidth ?? NaN)) return null;
  return Number(viewportWidth) < 768 ? "mobile" : "desktop";
}

export function resolveDeviceTypeFromUserAgent(userAgent: string | null | undefined) {
  const normalized = String(userAgent ?? "").toLowerCase();
  if (!normalized) return null;
  if (/(iphone|android.+mobile|mobile)/i.test(normalized)) return "mobile";
  if (/(ipad|tablet)/i.test(normalized)) return "mobile";
  return "desktop";
}

export function resolveTrafficSourceFromPageUrl(pageUrl: string | null | undefined) {
  const sanitized = sanitizePageUrl(pageUrl ?? null);
  if (!sanitized) return null;
  try {
    const url = new URL(sanitized, "https://www.tournamentinsights.com");
    const utmSource = sanitizeText(url.searchParams.get("utm_source"), MAX_TRAFFIC_SOURCE_LENGTH);
    return utmSource;
  } catch {
    return null;
  }
}

export function sanitizePageUrl(value: string | null) {
  return sanitizeText(value, MAX_PAGE_URL_LENGTH);
}

export function sanitizeText(value: string | null, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export function parseVenueHotelUuid(value: unknown) {
  if (!isAnalyticsUuid(value)) return null;
  return value.trim().toLowerCase();
}

export function createInitialImpressionTrackerState(): ImpressionTrackerState {
  return {
    tracked: false,
    visibleSinceMs: null,
  };
}

export function nextImpressionTrackerState(
  state: ImpressionTrackerState,
  input: {
    isVisible: boolean;
    nowMs: number;
    minimumVisibleMs?: number;
  }
) {
  const minimumVisibleMs = input.minimumVisibleMs ?? 500;
  if (state.tracked) {
    return {
      state,
      shouldTrack: false,
    };
  }
  if (!input.isVisible) {
    return {
      state: { ...state, visibleSinceMs: null },
      shouldTrack: false,
    };
  }
  const visibleSinceMs = state.visibleSinceMs ?? input.nowMs;
  const shouldTrack = input.nowMs - visibleSinceMs >= minimumVisibleMs;
  return {
    state: {
      tracked: shouldTrack,
      visibleSinceMs,
    },
    shouldTrack,
  };
}

export function createInitialClickAttemptState(): ClickAttemptState {
  return {
    acceptedInteractionId: null,
    clickInFlight: false,
  };
}

export function acceptVenueHotelClickAttempt(
  state: ClickAttemptState,
  createId: () => string
) {
  if (state.clickInFlight && state.acceptedInteractionId) {
    return {
      state,
      accepted: false,
      interactionId: state.acceptedInteractionId,
    };
  }
  const interactionId = state.acceptedInteractionId ?? createId();
  return {
    state: {
      acceptedInteractionId: interactionId,
      clickInFlight: true,
    },
    accepted: true,
    interactionId,
  };
}

export function completeVenueHotelClickAttempt(state: ClickAttemptState) {
  return {
    acceptedInteractionId: null,
    clickInFlight: false,
  };
}
