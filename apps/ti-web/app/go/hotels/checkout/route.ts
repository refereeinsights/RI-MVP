import { NextResponse } from "next/server";
import { buildHotelsHref } from "@/lib/booking/venueBooking";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

async function logOutboundClick(args: {
  venueId: string | null;
  tournamentId: string | null;
  referer: string | null;
  host: string | null;
  userAgent: string | null;
  sourcePath: string | null;
}) {
  try {
    await supabaseAdmin.from("ti_outbound_clicks" as any).insert({
      destination_type: "hotels",
      partner: "hotelplanner",
      source_surface: "venue_map_room_rate",
      venue_id: args.venueId && isUuid(args.venueId) ? args.venueId : null,
      tournament_id: args.tournamentId && isUuid(args.tournamentId) ? args.tournamentId : null,
      target_url: "hotelplanner:white-label-checkout",
      redirect_url: "hotelplanner:white-label-checkout",
      source_path: args.sourcePath,
      referer: args.referer,
      host: args.host,
      user_agent: args.userAgent?.slice(0, 300) ?? null,
      is_localhost: false,
    });
  } catch {
    console.warn("[go/hotels/checkout] outbound click insert failed");
  }
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
  const formData = await request.formData();
  const bundle = toText(formData.get("bundle"));
  const venueId = toText(formData.get("venueId"));
  const tournamentId = toText(formData.get("tournamentId"));
  const checkIn = toText(formData.get("checkin"));
  const checkOut = toText(formData.get("checkout"));
  const source = toText(formData.get("source")) || "venue_map";
  const referer = request.headers.get("referer");
  const userAgent = request.headers.get("user-agent");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const sourcePath = sourcePathFromReferer(referer);

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

  if (!isLocalHost(host)) {
    await logOutboundClick({
      venueId,
      tournamentId,
      referer,
      host,
      userAgent,
      sourcePath,
    });
  }

  const actionUrl = `${whiteLabelBaseUrl}/Accept/CheckOut.htm`;
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
      <form id="hotelplanner-checkout" method="post" action="${escapeHtml(actionUrl)}">
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
