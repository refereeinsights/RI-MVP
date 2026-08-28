import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import {
  buildHotelPlannerBookingAttribution,
  createOutboundAttributionId,
  deriveHotelOutboundSourceSurface,
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
import {
  parseVenueHotelUuid,
  sanitizePageUrl,
  sanitizeText,
  resolveDeviceTypeFromUserAgent,
} from "@/lib/venueHotelFunnel";
import {
  isKnownAutomatedHotelUserAgent,
  normalizeHotelDistributionSource,
  resolveHotelTrafficSource,
} from "@/lib/hotelMeasurement";

export const runtime = "nodejs";

function pickTrackingParam(reqUrl: URL, key: string) {
  const target = key.toLowerCase();
  const direct = reqUrl.searchParams.get(key) ?? reqUrl.searchParams.get(target);
  if (direct !== null) {
    const directTrimmed = String(direct).trim();
    return directTrimmed ? directTrimmed : null;
  }
  for (const [name, value] of reqUrl.searchParams.entries()) {
    if (name.toLowerCase() !== target) continue;
    const trimmed = String(value).trim();
    return trimmed || null;
  }
  return null;
}

function isLocalHost(host: string | null) {
  const value = String(host ?? "").trim().toLowerCase();
  if (!value) return false;
  return value.startsWith("localhost") || value.startsWith("127.0.0.1") || value.startsWith("[::1]") || value.endsWith(".local");
}

function toHotelPlannerDate(value: string | null) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (match) return raw;
  const fullYear = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (fullYear) {
    const [, mm, dd, yyyy] = fullYear;
    return `${mm}/${dd}/${yyyy.slice(-2)}`;
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return null;
  const [, yyyy, mm, dd] = iso;
  return `${mm}/${dd}/${yyyy.slice(-2)}`;
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

function deriveStableAttributionId(args: { outboundAttributionId: string | null; outboundRequestId: string | null }) {
  if (args.outboundAttributionId && isValidOutboundAttributionId(args.outboundAttributionId)) {
    return args.outboundAttributionId;
  }
  if (args.outboundRequestId) {
    return createHash("sha256").update(`ti-hp:${args.outboundRequestId}`).digest("hex").slice(0, 32);
  }
  return createOutboundAttributionId();
}

function buildPropertyUrl(args: {
  baseUrl: string;
  hotelId: string;
  idTypeId: string;
  inDate: string;
  outDate: string;
  attribution: ReturnType<typeof buildHotelPlannerBookingAttribution>;
  sourcePageType: string;
}) {
  const url = new URL("/Hotel/HotelRoomTypes.htm", args.baseUrl);
  url.searchParams.set("hotelId", args.hotelId);
  url.searchParams.set("idTypeId", args.idTypeId);
  url.searchParams.set("inDate", args.inDate);
  url.searchParams.set("outDate", args.outDate);
  url.searchParams.set("NumRooms", "1");
  url.searchParams.set("sc", args.attribution.sc);
  url.searchParams.set("source", args.sourcePageType);
  if (args.attribution.keyword) url.searchParams.set("kw", args.attribution.keyword);
  if (args.attribution.jobCode) url.searchParams.set("jobCode", args.attribution.jobCode);
  if (args.attribution.custom1) url.searchParams.set("Custom1", args.attribution.custom1);
  if (args.attribution.custom2) url.searchParams.set("Custom2", args.attribution.custom2);
  if (args.attribution.custom3) url.searchParams.set("Custom3", args.attribution.custom3);
  if (args.attribution.custom4) url.searchParams.set("Custom4", args.attribution.custom4);
  if (args.attribution.custom5) url.searchParams.set("Custom5", args.attribution.custom5);
  if (args.attribution.custom6) url.searchParams.set("Custom6", args.attribution.custom6);
  if (args.attribution.custom7) url.searchParams.set("Custom7", args.attribution.custom7);
  if (args.attribution.custom8) url.searchParams.set("Custom8", args.attribution.custom8);
  url.hash = "content";
  return url.toString();
}

export async function GET(request: Request) {
  const reqUrl = new URL(request.url);
  const baseUrl = String(process.env.HOTELPLANNER_WHITE_LABEL_BASE_URL ?? process.env.NEXT_PUBLIC_HOTELPLANNER_WHITE_LABEL_URL ?? "").trim();
  const hotelId = sanitizeText(pickTrackingParam(reqUrl, "hotelId"), 64);
  const idTypeId = sanitizeText(pickTrackingParam(reqUrl, "idTypeId"), 16) || "0";
  const inDate = toHotelPlannerDate(pickTrackingParam(reqUrl, "inDate"));
  const outDate = toHotelPlannerDate(pickTrackingParam(reqUrl, "outDate"));

  if (!baseUrl || !hotelId || !inDate || !outDate) {
    return new NextResponse("Missing property handoff parameters.", { status: 400 });
  }

  const referer = request.headers.get("referer");
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").trim();
  const userAgent = request.headers.get("user-agent");
  const sourcePath = sourcePathFromReferer(referer);
  const source = sanitizeText(pickTrackingParam(reqUrl, "source"), 64);
  const requestSource = sanitizeText(pickTrackingParam(reqUrl, "request_source"), 64);
  const pageType = sanitizeText(pickTrackingParam(reqUrl, "page_type"), 32);
  const sourcePageType = deriveHotelPlannerSourcePageType({
    source,
    pageType,
    sourcePath,
    hasVenueId: Boolean(pickTrackingParam(reqUrl, "venueId")),
  });
  const outboundRequestId = parseVenueHotelUuid(pickTrackingParam(reqUrl, "outbound_request_id"));
  const outboundAttributionId = deriveStableAttributionId({
    outboundAttributionId: pickTrackingParam(reqUrl, "outbound_attribution_id"),
    outboundRequestId,
  });
  const ctaInteractionId = parseVenueHotelUuid(pickTrackingParam(reqUrl, "cta_interaction_id"));
  const plannerSessionId = parseVenueHotelUuid(pickTrackingParam(reqUrl, "planner_session_id"));
  const ctaPlacement = sanitizeText(pickTrackingParam(reqUrl, "cta_placement"), 64);
  const ctaType = sanitizeText(pickTrackingParam(reqUrl, "cta_type"), 32);
  const flowType = sanitizeText(pickTrackingParam(reqUrl, "flow_type"), 32);
  const pageUrl = sanitizePageUrl(pickTrackingParam(reqUrl, "page_url"));
  const distributionSource = normalizeHotelDistributionSource(pickTrackingParam(reqUrl, "distribution_source"));
  const trafficSource = resolveHotelTrafficSource({
    distributionSource,
    existingTrafficSource: sanitizeText(pickTrackingParam(reqUrl, "traffic_source"), 64),
  });
  const deviceType = sanitizeText(pickTrackingParam(reqUrl, "device_type"), 32) ?? resolveDeviceTypeFromUserAgent(userAgent);
  const venueId = parseVenueHotelUuid(pickTrackingParam(reqUrl, "venueId"));
  const tournamentId = parseVenueHotelUuid(pickTrackingParam(reqUrl, "tournamentId"));
  const tournamentSlug = sanitizeText(pickTrackingParam(reqUrl, "tournament_slug"), 128)
    ?? sanitizeText(pickTrackingParam(reqUrl, "tournamentSlug"), 128);
  const hotelProgram = await resolveHotelProgramSnapshotSafely({
    tournamentId,
    venueId,
    sourcePageType,
  });
  const hotelProgramSnapshot = hotelProgram.snapshot;

  const attribution = buildHotelPlannerBookingAttribution({
    outboundAttributionId,
    sourcePageType,
    placement: ctaPlacement,
    venueId,
    tournamentRef: tournamentSlug,
    plannerSessionId,
    ctaInteractionId,
    sc: pickTrackingParam(reqUrl, "sc") || "tournamentinsights",
    keyword: pickTrackingParam(reqUrl, "kw") || pickTrackingParam(reqUrl, "keyword"),
    jobCode: pickTrackingParam(reqUrl, "jobCode") || pickTrackingParam(reqUrl, "jobcode"),
    custom1: pickTrackingParam(reqUrl, "custom1"),
    custom2: pickTrackingParam(reqUrl, "custom2"),
    custom8:
      sourcePageType === "tournament_hotels"
        ? sanitizeHotelPlannerSpreadsheetContext(pickTrackingParam(reqUrl, "custom8"))
        : pickTrackingParam(reqUrl, "custom8"),
  });

  const standardTarget = buildPropertyUrl({
    baseUrl,
    hotelId,
    idTypeId,
    inDate,
    outDate,
    attribution,
    sourcePageType,
  });
  const feeBaseUrl = getResolvedHotelProgramFeeTarget(hotelProgram);
  const feeTarget = feeBaseUrl
    ? buildPropertyUrl({ baseUrl: feeBaseUrl, hotelId, idTypeId, inDate, outDate, attribution, sourcePageType })
    : "";
  const intendedTarget = hotelProgramSnapshot.programType === "standard" ? standardTarget : feeTarget;

  let persistenceSucceeded = false;
  if (!isLocalHost(host) && !isKnownAutomatedHotelUserAgent(userAgent)) {
    const persistenceResult = await persistHotelOutboundWithSnapshot({
      snapshot: hotelProgramSnapshot,
      row: {
        destination_type: "hotels",
        partner: "hotelplanner",
        outbound_partner: "hotelplanner",
        source_surface: deriveHotelOutboundSourceSurface({ requestSource, sourcePageType }),
        source_page_type: sourcePageType,
        venue_id: venueId,
        tournament_id: tournamentId,
        tournament_slug: tournamentSlug,
        target_url: intendedTarget,
        redirect_url: intendedTarget,
        source_path: sourcePath ?? pageUrl,
        referer,
        host,
        user_agent: userAgent?.slice(0, 300) ?? null,
        is_localhost: false,
        session_id: parseVenueHotelUuid(pickTrackingParam(reqUrl, "session_id")),
        cta_instance_id: parseVenueHotelUuid(pickTrackingParam(reqUrl, "cta_instance_id")),
        cta_interaction_id: ctaInteractionId,
        cta_type: ctaType,
        cta_placement: ctaPlacement,
        flow_type: flowType,
        page_type: pageType ?? sourcePageType,
        page_url: pageUrl,
        device_type: deviceType,
        traffic_source: trafficSource,
        lodging_search_id: parseVenueHotelUuid(pickTrackingParam(reqUrl, "lodging_search_id")),
        outbound_request_id: outboundRequestId,
        outbound_attribution_id: outboundAttributionId,
        job_code: attribution.jobCode,
        keyword: attribution.keyword,
        partner_source_code: attribution.sc,
        custom_field1: attribution.custom1,
        custom_field2: attribution.custom2,
        custom_field3: attribution.custom3,
        custom_field4: attribution.custom4,
        custom_field5: attribution.custom5,
        custom_field6: attribution.custom6,
        custom_field7: attribution.custom7,
        custom_field8: attribution.custom8,
      },
    });
    persistenceSucceeded = isHotelOutboundPersistenceSuccess(persistenceResult);
  }

  const handoffMode = selectHotelHandoffMode({
    snapshot: hotelProgramSnapshot,
    persistenceSucceeded,
    standardTargetAvailable: Boolean(standardTarget),
    feeTargetAvailable: Boolean(feeTarget),
  });
  if (handoffMode === "retryable_error") {
    return new NextResponse("Hotel handoff is temporarily unavailable.", { status: 503 });
  }

  const redirectTarget = handoffMode === "fee_redirect" ? feeTarget : standardTarget;
  return NextResponse.redirect(redirectTarget, {
    status: 302,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}
