import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildCampspotAffiliateUrl,
  buildCampspotUrl,
  createCampspotAttributionId,
  deriveCampspotTournamentDates,
  isValidCampspotCoordinates,
  isValidCampspotSourcePlacement,
} from "@/lib/affiliates/campspot";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseVenueHotelUuid, resolveDeviceTypeFromUserAgent, sanitizePageUrl, sanitizeText } from "@/lib/venueHotelFunnel";

export const runtime = "nodejs";

function isLocalHost(host: string | null) {
  const value = String(host ?? "").trim().toLowerCase();
  return value.startsWith("localhost") || value.startsWith("127.0.0.1") || value.startsWith("[::1]") || value.endsWith(".local");
}

function looksLikeBot(userAgent: string | null) {
  return /(bot|spider|crawler|facebookexternalhit|slackbot|discordbot|whatsapp|telegrambot|preview)/i.test(
    String(userAgent ?? ""),
  );
}

function sourcePathFromReferer(referer: string | null) {
  const value = String(referer ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return hostname === "tournamentinsights.com" || hostname.endsWith(".tournamentinsights.com")
      ? `${url.pathname}${url.search}`
      : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const referer = request.headers.get("referer");
  const userAgent = request.headers.get("user-agent");

  const venueId = parseVenueHotelUuid(requestUrl.searchParams.get("venue_id"));
  const rawTournamentId = String(requestUrl.searchParams.get("tournament_id") ?? "").trim();
  const requestedTournamentId = parseVenueHotelUuid(rawTournamentId);
  const sourceSurface = String(requestUrl.searchParams.get("source_surface") ?? "").trim();
  const ctaPlacement = String(requestUrl.searchParams.get("cta_placement") ?? "").trim();
  if (!venueId) return new NextResponse("Missing or invalid venue_id", { status: 400 });
  if (rawTournamentId && !requestedTournamentId) return new NextResponse("Invalid tournament_id", { status: 400 });
  if (!isValidCampspotSourcePlacement(sourceSurface, ctaPlacement)) {
    return new NextResponse("Invalid Campspot source or placement", { status: 400 });
  }

  const { data: venue, error: venueError } = await supabaseAdmin
    .from("venues" as any)
    .select("id,city,state,latitude,longitude")
    .eq("id", venueId)
    .maybeSingle<{
      id: string;
      city: string | null;
      state: string | null;
      latitude: number | null;
      longitude: number | null;
    }>();
  if (venueError) {
    console.error("[go/camping] venue lookup failed", { code: venueError.code, message: String(venueError.message ?? "").slice(0, 160) });
    return new NextResponse("Unable to resolve camping destination", { status: 503 });
  }

  const city = sanitizeText(venue?.city ?? null, 80);
  const state = sanitizeText(venue?.state ?? null, 80);
  const latitude = venue?.latitude ?? null;
  const longitude = venue?.longitude ?? null;
  if (!venue || !city || !state || !isValidCampspotCoordinates(latitude, longitude)) {
    return new NextResponse("Venue is missing required Campspot destination context", { status: 400 });
  }

  const tournamentResult = requestedTournamentId
    ? await supabaseAdmin
        .from("tournaments_public" as any)
        .select("id,slug,start_date,end_date")
        .eq("id", requestedTournamentId)
        .maybeSingle<{ id: string; slug: string | null; start_date: string | null; end_date: string | null }>()
    : { data: null, error: null };
  if (tournamentResult.error) {
    console.warn("[go/camping] tournament lookup failed; continuing without tournament dates", {
      code: tournamentResult.error.code,
      message: String(tournamentResult.error.message ?? "").slice(0, 160),
    });
  }
  const tournament = tournamentResult.error ? null : tournamentResult.data;
  const dates = deriveCampspotTournamentDates({
    startDate: tournament?.start_date ?? null,
    endDate: tournament?.end_date ?? null,
  });

  const outboundAttributionId = createCampspotAttributionId(randomUUID);
  const campspotUrl = buildCampspotUrl({
    city,
    stateName: state,
    latitude: Number(latitude),
    longitude: Number(longitude),
    checkin: dates?.checkin ?? null,
    checkout: dates?.checkout ?? null,
  });
  const affiliateUrl = buildCampspotAffiliateUrl({ campspotUrl, outboundAttributionId });

  const sessionId = parseVenueHotelUuid(requestUrl.searchParams.get("session_id"));
  const outboundRequestId = parseVenueHotelUuid(requestUrl.searchParams.get("outbound_request_id")) ?? randomUUID();
  const pageUrl = sanitizePageUrl(requestUrl.searchParams.get("page_url"));
  const deviceType =
    sanitizeText(requestUrl.searchParams.get("device_type"), 32) ?? resolveDeviceTypeFromUserAgent(userAgent);
  const sourcePath = sourcePathFromReferer(referer) ?? pageUrl;

  if (!isLocalHost(host) && !looksLikeBot(userAgent)) {
    try {
      const { error: persistError } = await supabaseAdmin.from("ti_outbound_clicks" as any).insert({
        destination_type: "camping",
        partner: "campspot",
        outbound_partner: "campspot",
        source_surface: sourceSurface,
        venue_id: venue.id,
        tournament_id: tournament?.id ?? null,
        tournament_slug: tournament?.slug ?? null,
        target_url: campspotUrl,
        redirect_url: affiliateUrl,
        source_path: sourcePath,
        referer,
        host,
        user_agent: userAgent?.slice(0, 300) ?? null,
        is_localhost: false,
        session_id: sessionId,
        cta_type: "camping",
        cta_placement: ctaPlacement,
        flow_type: "direct_outbound",
        page_type: sourceSurface,
        page_url: pageUrl,
        device_type: deviceType,
        outbound_request_id: outboundRequestId,
        outbound_attribution_id: outboundAttributionId,
        source_page_type: sourceSurface,
      });
      if (persistError && persistError.code !== "23505") {
        console.error("[go/camping] outbound click persist failed", {
          code: persistError.code,
          message: String(persistError.message ?? "").slice(0, 200),
          attribution_id: outboundAttributionId,
          source_surface: sourceSurface,
          cta_placement: ctaPlacement,
        });
      }
    } catch (error) {
      console.error("[go/camping] outbound click threw unexpectedly", {
        error: String(error).slice(0, 200),
        attribution_id: outboundAttributionId,
        source_surface: sourceSurface,
      });
    }
  }

  return NextResponse.redirect(affiliateUrl, {
    status: 302,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}
