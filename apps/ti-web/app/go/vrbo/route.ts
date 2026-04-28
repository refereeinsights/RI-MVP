import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildCjVrboUrl, buildVrboSearchUrl } from "@/lib/vrbo";

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

function isLocalDevelopment(host: string | null) {
  if (isLocalHost(host)) return true;
  return process.env.NODE_ENV !== "production";
}

function looksLikeBot(userAgent: string | null) {
  const ua = String(userAgent ?? "").toLowerCase();
  if (!ua) return false;
  return /(bot|spider|crawler|facebookexternalhit|slackbot|discordbot|whatsapp|telegrambot|preview)/i.test(ua);
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidIsoDate(value: string | null) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [y, m, d] = raw.split("-").map((n) => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!Number.isFinite(dt.getTime())) return false;
  return dt.toISOString().slice(0, 10) === raw;
}

function addDaysIso(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function compareIso(a: string, b: string) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function todayUtcIso() {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return todayUtc.toISOString().slice(0, 10);
}

function buildDestination(args: {
  venueCity: string | null;
  venueState: string | null;
  tournamentCity: string | null;
  tournamentState: string | null;
}) {
  const city = (args.venueCity || args.tournamentCity || "").trim();
  const state = (args.venueState || args.tournamentState || "").trim();
  if (city && state) return `${city}, ${state}, United States`;
  if (state) return `${state}, United States`;
  return city ? `${city}, United States` : null;
}

export async function GET(request: Request) {
  const reqUrl = new URL(request.url);
  const venueId = String(reqUrl.searchParams.get("venueId") ?? "").trim();
  const tournamentId = String(reqUrl.searchParams.get("tournamentId") ?? "").trim();

  if (!venueId || !isUuid(venueId)) {
    return new NextResponse("Missing or invalid venueId", { status: 400 });
  }

  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").trim();
  const localDev = isLocalDevelopment(host);

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

  const requestedTournamentId = tournamentId && isUuid(tournamentId) ? tournamentId : null;
  const { data: tournament } = requestedTournamentId
    ? await supabaseAdmin
        .from("tournaments_public" as any)
        .select("id,slug,city,state,start_date,end_date")
        .eq("id", requestedTournamentId)
        .maybeSingle<{
          id: string;
          slug: string | null;
          city: string | null;
          state: string | null;
          start_date: string | null;
          end_date: string | null;
        }>()
    : { data: null as any };

  const destination = buildDestination({
    venueCity: venue?.city ?? null,
    venueState: venue?.state ?? null,
    tournamentCity: tournament?.city ?? null,
    tournamentState: tournament?.state ?? null,
  });

  const dates = (() => {
    const today = todayUtcIso();
    const start = tournament?.start_date ?? null;
    const end = tournament?.end_date ?? null;
    if (!isValidIsoDate(start) || !isValidIsoDate(end)) return null;

    const checkin = start!;
    if (compareIso(checkin, today) < 0) return null;

    const checkoutBase = compareIso(end!, checkin) === 0 ? addDaysIso(checkin, 1) : end!;
    const checkout = compareIso(checkoutBase, checkin) <= 0 ? addDaysIso(checkin, 1) : checkoutBase;
    return { checkin, checkout };
  })();

  const vrboUrl = destination
    ? buildVrboSearchUrl({
        destination,
        latitude: venue?.latitude ?? null,
        longitude: venue?.longitude ?? null,
        checkin: dates?.checkin ?? null,
        checkout: dates?.checkout ?? null,
        adults: 2,
      })
    : "https://www.vrbo.com/";

  const wrapped = buildCjVrboUrl(vrboUrl);
  if (!wrapped.ok) {
    if (!localDev) {
      console.error("[go/vrbo] missing CJ config");
      return new NextResponse(wrapped.error, { status: 500 });
    }
    console.warn("[go/vrbo] missing CJ config, using direct vrbo URL");
  }

  const referer = request.headers.get("referer");
  const userAgent = request.headers.get("user-agent");
  const local = isLocalHost(host);
  const bot = looksLikeBot(userAgent);
  const redirectTarget = wrapped.ok ? wrapped.url : vrboUrl;

  if (!local && !bot) {
    const sourcePath = sourcePathFromReferer(referer);
    try {
      await supabaseAdmin.from("ti_outbound_clicks" as any).insert({
        destination_type: "vrbo",
        partner: "cj",
        source_surface: "venue_map",
        venue_id: venueId,
        tournament_id: tournament?.id ?? null,
        tournament_slug: tournament?.slug ?? null,
        target_url: vrboUrl,
        redirect_url: redirectTarget,
        source_path: sourcePath,
        referer,
        host,
        user_agent: userAgent?.slice(0, 300) ?? null,
        is_localhost: false,
      });
    } catch {
      // Don't block redirects on logging failures.
      console.warn("[go/vrbo] outbound click insert failed");
    }
  }

  return NextResponse.redirect(redirectTarget, {
    status: 302,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

