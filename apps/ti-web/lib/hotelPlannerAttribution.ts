export const HOTEL_PLANNER_SOURCE_PAGE_TYPES = [
  "venue",
  "tournament",
  "weekend_planner",
  "book_travel",
  "venue_map",
  "weekend",
  "referee",
  "other",
] as const;

export type HotelPlannerSourcePageType = (typeof HOTEL_PLANNER_SOURCE_PAGE_TYPES)[number];

export const HOTEL_PLANNER_BOOKING_PLACEMENTS = {
  venueMapPropertyCard: "venue_map_property_card",
  venueMapViewAllHotels: "venue_map_view_all_hotels",
  bookTravelPropertyCard: "book_travel_property_card",
  bookTravelViewAllHotels: "book_travel_view_all_hotels",
  weekendPlannerPropertyCard: "weekend_planner_property_card",
  weekendPlannerViewAllHotels: "weekend_planner_view_all_hotels",
} as const;

export const HOTEL_PLANNER_GROUP_REQUEST_PLACEMENTS = {
  bookTravelTeamBlock: "book_travel_team_block",
  weekendPlannerTeamBlock: "weekend_planner_team_block",
  venueMapTeamBlock: "venue_map_team_block",
} as const;

export type HotelPlannerBookingPlacement =
  (typeof HOTEL_PLANNER_BOOKING_PLACEMENTS)[keyof typeof HOTEL_PLANNER_BOOKING_PLACEMENTS];
export type HotelPlannerGroupRequestPlacement =
  (typeof HOTEL_PLANNER_GROUP_REQUEST_PLACEMENTS)[keyof typeof HOTEL_PLANNER_GROUP_REQUEST_PLACEMENTS];

export const HOTEL_PLANNER_PARTNER_SOURCE = "tournamentinsights";
export const HOTEL_PLANNER_TOKEN_CUSTOM_FIELD = 3;
const ATTRIBUTION_ID_RE = /^[0-9a-f]{32}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BookingAttributionInput = {
  outboundAttributionId?: string | null;
  sourcePageType: HotelPlannerSourcePageType;
  placement?: string | null;
  venueId?: string | null;
  tournamentRef?: string | null;
  plannerSessionId?: string | null;
  ctaInteractionId?: string | null;
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
};

type GroupRequestAttributionInput = {
  outboundAttributionId?: string | null;
  sourcePageType: HotelPlannerSourcePageType;
  placement?: string | null;
  venueId?: string | null;
  tournamentId?: string | null;
  plannerSessionId?: string | null;
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
};

export type HotelPlannerAttributionFields = {
  sc: string;
  keyword: string | null;
  jobCode: string;
  custom1: string | null;
  custom2: string | null;
  custom3: string | null;
  custom4: string | null;
  custom5: string | null;
  custom6: string | null;
  custom7: string | null;
  custom8: string | null;
};

export function isUuidLike(value: string | null | undefined) {
  return UUID_RE.test(String(value ?? "").trim());
}

export function isValidOutboundAttributionId(value: string | null | undefined): value is string {
  return ATTRIBUTION_ID_RE.test(String(value ?? "").trim().toLowerCase());
}

export function createOutboundAttributionId(factory?: () => string) {
  const candidate = String(factory?.() ?? globalThis.crypto?.randomUUID?.() ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "");
  if (isValidOutboundAttributionId(candidate)) return candidate;
  throw new Error("Unable to generate outbound attribution id.");
}

export function formatOutboundAttributionToken(outboundAttributionId: string | null | undefined) {
  if (!isValidOutboundAttributionId(outboundAttributionId)) return null;
  return `attr:${String(outboundAttributionId).trim().toLowerCase()}`;
}

export function deriveHotelPlannerSourcePageType(args: {
  source?: string | null;
  pageType?: string | null;
  sourcePath?: string | null;
  hasVenueId?: boolean;
}): HotelPlannerSourcePageType {
  const source = String(args.source ?? "").trim().toLowerCase();
  const pageType = String(args.pageType ?? "").trim().toLowerCase();
  const sourcePath = String(args.sourcePath ?? "").trim().toLowerCase();

  if (pageType === "venue") return "venue";
  if (pageType === "tournament") return "tournament";
  if (pageType === "planner" || pageType === "weekend_planner") return "weekend_planner";
  if (pageType === "book_travel") return "book_travel";
  if (pageType === "venue_map") return "venue_map";
  if (pageType === "weekend") return "weekend";
  if (pageType === "referee") return "referee";

  if (source === "book_travel") return "book_travel";
  if (source === "weekend_planner") return "weekend_planner";
  if (source === "venue_map") return "venue_map";
  if (source === "tournament_detail" || source === "tournament_directory") return "tournament";
  if (source === "venue_directory") return "venue";
  if (source === "weekend_share" || source === "weekend") return "weekend";
  if (source.startsWith("referee")) return "referee";

  if (sourcePath.startsWith("/book-travel")) return "book_travel";
  if (sourcePath.startsWith("/weekend-planner")) return "weekend_planner";
  if (sourcePath.startsWith("/weekend/")) return "weekend";
  if (sourcePath.startsWith("/tournaments/")) return "tournament";
  if (sourcePath.startsWith("/venues/")) return "venue";

  return args.hasVenueId ? "venue" : "other";
}

function sanitizeText(value: string | null | undefined, maxLength = 128) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function defaultJobCode(sourcePageType: HotelPlannerSourcePageType) {
  if (sourcePageType === "book_travel" || sourcePageType === "weekend_planner") return "TI-BOOK-TRAVEL";
  if (sourcePageType === "venue_map") return "TI-VENUE-MAP";
  return "TI-HOTELS";
}

function defaultKeyword() {
  return "Tournament weekend stay";
}

function defaultGroupRequestKeyword() {
  return "Team hotel block";
}

function defaultLegacyCustom1(args: Pick<BookingAttributionInput, "sourcePageType" | "venueId">) {
  const venueId = sanitizeText(args.venueId, 64);
  if (venueId) return `ven:${venueId}`;
  return `src:${args.sourcePageType}`;
}

function defaultLegacyCustom2(args: Pick<BookingAttributionInput, "sourcePageType" | "tournamentRef">) {
  const tournamentRef = sanitizeText(args.tournamentRef, 96);
  return tournamentRef || args.sourcePageType;
}

function defaultGroupRequestCustom1(args: Pick<GroupRequestAttributionInput, "venueId" | "tournamentId">) {
  const venueId = sanitizeText(args.venueId, 64);
  if (venueId) return `ven:${venueId}`;
  const tournamentId = sanitizeText(args.tournamentId, 64);
  if (tournamentId) return `tour:${tournamentId}`;
  return null;
}

function defaultGroupRequestCustom2(args: Pick<GroupRequestAttributionInput, "venueId" | "tournamentId">) {
  const venueId = sanitizeText(args.venueId, 64);
  const tournamentId = sanitizeText(args.tournamentId, 64);
  if (venueId && tournamentId) return `tour:${tournamentId}`;
  return null;
}

export function buildHotelPlannerBookingAttribution(input: BookingAttributionInput): HotelPlannerAttributionFields {
  const sourcePageType = input.sourcePageType;
  const token = formatOutboundAttributionToken(input.outboundAttributionId);

  return {
    sc: sanitizeText(input.sc, 64) || HOTEL_PLANNER_PARTNER_SOURCE,
    keyword: sanitizeText(input.keyword, 96) || defaultKeyword(),
    jobCode: sanitizeText(input.jobCode, 64) || defaultJobCode(sourcePageType),
    custom1: sanitizeText(input.custom1, 128) || defaultLegacyCustom1(input),
    custom2: sanitizeText(input.custom2, 128) || defaultLegacyCustom2(input),
    custom3: token || sanitizeText(input.custom3, 128),
    custom4: sanitizeText(input.custom4, 128) || `srcp:${sourcePageType}`,
    custom5: sanitizeText(input.custom5, 128) || (sanitizeText(input.placement, 96) ? `place:${sanitizeText(input.placement, 96)}` : null),
    custom6:
      sanitizeText(input.custom6, 128) ||
      (isUuidLike(input.plannerSessionId) ? `plan:${String(input.plannerSessionId).trim().toLowerCase()}` : null),
    custom7:
      sanitizeText(input.custom7, 128) ||
      (isUuidLike(input.ctaInteractionId) ? `cta:${String(input.ctaInteractionId).trim().toLowerCase()}` : null),
    custom8: sanitizeText(input.custom8, 128),
  };
}

export function buildHotelPlannerGroupRequestAttribution(
  input: GroupRequestAttributionInput
): HotelPlannerAttributionFields {
  const token = formatOutboundAttributionToken(input.outboundAttributionId);

  return {
    sc: sanitizeText(input.sc, 64) || HOTEL_PLANNER_PARTNER_SOURCE,
    keyword: sanitizeText(input.keyword, 96) || defaultGroupRequestKeyword(),
    jobCode: sanitizeText(input.jobCode, 64) || "TI-TEAM-BLOCK",
    custom1: sanitizeText(input.custom1, 128) || defaultGroupRequestCustom1(input),
    custom2: sanitizeText(input.custom2, 128) || defaultGroupRequestCustom2(input),
    custom3: token || sanitizeText(input.custom3, 128),
    custom4: sanitizeText(input.custom4, 128) || `srcp:${input.sourcePageType}`,
    custom5:
      sanitizeText(input.custom5, 128) ||
      (sanitizeText(input.placement, 96) ? `place:${sanitizeText(input.placement, 96)}` : null),
    custom6:
      sanitizeText(input.custom6, 128) ||
      (isUuidLike(input.plannerSessionId) ? `plan:${String(input.plannerSessionId).trim().toLowerCase()}` : null),
    custom7: sanitizeText(input.custom7, 128),
    custom8: sanitizeText(input.custom8, 128),
  };
}
