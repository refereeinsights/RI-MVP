import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildHotelPlannerBookingAttribution,
  createOutboundAttributionId,
  deriveHotelPlannerSourcePageType,
  isValidOutboundAttributionId,
  sanitizeHotelPlannerSpreadsheetContext,
} from "@/lib/hotelPlannerAttribution";
import { buildHotelsHref } from "@/lib/booking/venueBooking";
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeWhiteLabelBaseUrl(raw: string) {
  return String(raw ?? "").trim().replace(/\/+$/, "");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toText(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseMmDdYyyyToIso(value: string | null) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, mmRaw, ddRaw, yyyy] = match;
  const mm = mmRaw.padStart(2, "0");
  const dd = ddRaw.padStart(2, "0");
  const parsed = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  if (Number.isNaN(parsed.getTime())) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function buildFallbackPath(args: {
  venueId: string | null;
  tournamentId: string | null;
  checkInMmdd: string | null;
  checkOutMmdd: string | null;
  source: string | null;
}) {
  if (!args.venueId || !isUuid(args.venueId)) return "/";
  const href = buildHotelsHref({
    venueId: args.venueId,
    tournamentId: args.tournamentId && isUuid(args.tournamentId) ? args.tournamentId : null,
    provider: "hotelplanner",
    source: args.source || "venue_map",
  });
  const url = new URL(href, "https://placeholder.local");
  const checkinIso = parseMmDdYyyyToIso(args.checkInMmdd);
  const checkoutIso = parseMmDdYyyyToIso(args.checkOutMmdd);
  if (checkinIso) url.searchParams.set("checkin", checkinIso);
  if (checkoutIso) url.searchParams.set("checkout", checkoutIso);
  return `${url.pathname}${url.search}`;
}

function pickFormOrQuery(formData: FormData, reqUrl: URL, key: string): string | null {
  const fromForm = toText(formData.get(key));
  if (fromForm !== null) return fromForm;
  const lowerKey = key.toLowerCase();
  for (const [name, value] of reqUrl.searchParams.entries()) {
    if (name.toLowerCase() !== lowerKey) continue;
    const trimmed = String(value).trim();
    return trimmed || null;
  }
  return null;
}

function deriveStableAttributionId(args: {
  outboundAttributionId: string | null;
  outboundRequestId: string | null;
}) {
  if (args.outboundAttributionId && isValidOutboundAttributionId(args.outboundAttributionId)) {
    return args.outboundAttributionId;
  }
  if (args.outboundRequestId) {
    return createHash("sha256").update(`ti-hp:${args.outboundRequestId}`).digest("hex").slice(0, 32);
  }
  return createOutboundAttributionId();
}

function sourcePathFromReferer(referer: string | null) {
  const ref = String(referer ?? "").trim();
  if (!ref) return null;
  try {
    const url = new URL(ref);
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const whiteLabelBaseUrl = normalizeWhiteLabelBaseUrl(process.env.HOTELPLANNER_WHITE_LABEL_BASE_URL || "");
  const reqUrl = new URL(request.url);
  const formData = await request.formData();

  // Core passthrough fields
  const bundle = toText(formData.get("bundle"));
  const venueId = parseVenueHotelUuid(pickFormOrQuery(formData, reqUrl, "venueId"));
  const tournamentId = parseVenueHotelUuid(pickFormOrQuery(formData, reqUrl, "tournamentId"));
  const checkIn = pickFormOrQuery(formData, reqUrl, "checkin");
  const checkOut = pickFormOrQuery(formData, reqUrl, "checkout");
  const source = pickFormOrQuery(formData, reqUrl, "source") ?? "venue_map";

  // Attribution params — HP may forward these back as form fields or URL query params
  const rawAttributionId = pickFormOrQuery(formData, reqUrl, "outbound_attribution_id");
  const rawRequestId = parseVenueHotelUuid(pickFormOrQuery(formData, reqUrl, "outbound_request_id"));
  const outboundAttributionId = deriveStableAttributionId({
    outboundAttributionId: rawAttributionId,
    outboundRequestId: rawRequestId,
  });
  const ctaPlacement = sanitizeText(pickFormOrQuery(formData, reqUrl, "cta_placement"), 64);
  const plannerSessionId = parseVenueHotelUuid(pickFormOrQuery(formData, reqUrl, "planner_session_id"));
  const trafficSource = sanitizeText(pickFormOrQuery(formData, reqUrl, "traffic_source"), 64);
  const pageType = sanitizeText(pickFormOrQuery(formData, reqUrl, "page_type"), 32);
  const pageUrl = sanitizePageUrl(pickFormOrQuery(formData, reqUrl, "page_url"));

  const referer = request.headers.get("referer");
  const userAgent = request.headers.get("user-agent");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const deviceType =
    sanitizeText(pickFormOrQuery(formData, reqUrl, "device_type"), 32) ??
    resolveDeviceTypeFromUserAgent(userAgent);
  const sourcePath = sourcePathFromReferer(referer);

  const sourcePageType = deriveHotelPlannerSourcePageType({
    source,
    pageType,
    sourcePath,
    hasVenueId: Boolean(venueId),
  });
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
    plannerSessionId,
    sc: pickFormOrQuery(formData, reqUrl, "sc") ?? "tournamentinsights",
    keyword:
      pickFormOrQuery(formData, reqUrl, "kw") ??
      pickFormOrQuery(formData, reqUrl, "keyword"),
    jobCode:
      pickFormOrQuery(formData, reqUrl, "jobCode") ??
      pickFormOrQuery(formData, reqUrl, "jobcode"),
    custom1:
      pickFormOrQuery(formData, reqUrl, "custom1") ??
      pickFormOrQuery(formData, reqUrl, "Custom1"),
    custom2:
      pickFormOrQuery(formData, reqUrl, "custom2") ??
      pickFormOrQuery(formData, reqUrl, "Custom2"),
    custom8:
      sourcePageType === "tournament_hotels"
        ? sanitizeHotelPlannerSpreadsheetContext(
            pickFormOrQuery(formData, reqUrl, "custom8") ??
              pickFormOrQuery(formData, reqUrl, "Custom8")
          )
        : pickFormOrQuery(formData, reqUrl, "custom8") ??
          pickFormOrQuery(formData, reqUrl, "Custom8"),
  });

  const fallbackPath = buildFallbackPath({
    venueId,
    tournamentId,
    checkInMmdd: checkIn,
    checkOutMmdd: checkOut,
    source,
  });
  const fallbackUrl = new URL(fallbackPath, request.url).toString();

  if (!bundle || !whiteLabelBaseUrl) {
    return NextResponse.redirect(fallbackUrl, {
      status: 303,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        Pragma: "no-cache",
      },
    });
  }

  const actionUrl = `${whiteLabelBaseUrl}/Accept/CheckOut.htm`;
  const feeBaseUrl = getResolvedHotelProgramFeeTarget(hotelProgram);
  const feeActionUrl = feeBaseUrl ? `${feeBaseUrl}/Accept/CheckOut.htm` : "";
  const intendedTarget = hotelProgramSnapshot.programType === "standard" ? actionUrl : feeActionUrl;
  let persistenceSucceeded = false;
  if (!isLocalHost(host)) {
    const persistenceResult = await persistHotelOutboundWithSnapshot({
      snapshot: hotelProgramSnapshot,
      row: {
        destination_type: "hotels",
        partner: "hotelplanner",
        outbound_partner: "hotelplanner",
        source_surface: sourcePageType,
        source_page_type: sourcePageType,
        venue_id: venueId && isUuid(venueId) ? venueId : null,
        tournament_id: tournamentId && isUuid(tournamentId) ? tournamentId : null,
        target_url: intendedTarget,
        redirect_url: intendedTarget,
        source_path: sourcePath ?? pageUrl,
        referer,
        host,
        user_agent: userAgent?.slice(0, 300) ?? null,
        is_localhost: false,
        outbound_request_id: rawRequestId,
        outbound_attribution_id: outboundAttributionId,
        cta_placement: ctaPlacement,
        traffic_source: trafficSource,
        device_type: deviceType,
        page_url: pageUrl,
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
    standardTargetAvailable: true,
    feeTargetAvailable: Boolean(feeActionUrl),
  });
  if (handoffMode === "retryable_error") {
    return new NextResponse("Hotel checkout is temporarily unavailable.", { status: 503 });
  }
  const selectedActionUrl = handoffMode === "fee_redirect" ? feeActionUrl : actionUrl;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>Redirecting to HotelPlanner</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f3f4f6; color: #111827; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 24px; }
      main { width: min(520px, 100%); background: #ffffff; border: 1px solid #d1d5db; border-radius: 16px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
      h1 { font-size: 20px; margin: 0 0 10px; }
      p { font-size: 14px; line-height: 1.5; margin: 0 0 12px; }
      button { appearance: none; border: 0; border-radius: 999px; background: #2563eb; color: #fff; padding: 10px 14px; font-weight: 700; cursor: pointer; }
      a { color: #1d4ed8; }
    </style>
  </head>
  <body>
    <main>
      <h1>Opening HotelPlanner checkout</h1>
      <p>Your room selection is being sent to the HotelPlanner checkout page.</p>
      <form id="hotelplanner-checkout" method="post" action="${escapeHtml(selectedActionUrl)}">
        <input type="hidden" name="bundle" value="${escapeHtml(bundle)}" />
        <input type="hidden" name="ReturnPage" value="${escapeHtml(fallbackUrl)}" />
        <noscript>
          <p>JavaScript is disabled. Use the button below to continue.</p>
          <button type="submit">Continue to HotelPlanner</button>
        </noscript>
      </form>
      <p>If checkout does not open, <a href="${escapeHtml(fallbackUrl)}">view full hotel results</a>.</p>
    </main>
    <script>document.getElementById("hotelplanner-checkout")?.submit();</script>
  </body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}
