import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type AnalyticsRequest = {
  event?: string;
  properties?: Record<string, unknown>;
};

const QUICK_CHECK_EVENTS = new Set([
  "Venue Quick Check Opened",
  "Venue Quick Check Started",
  "Venue Quick Check Dismissed",
  "Venue Quick Check Submitted",
  "Venue Quick Check Signup Prompt Shown",
  "Venue Quick Check Signup Clicked",
  "Venue Quick Check Signup Dismissed",
  "Venue Quick Check Login Clicked",
]);

const MAP_EVENTS = new Set([
  "hotel_cta_impression",
  "hotel_cta_clicked",
  "map_viewed",
  "map_filter_changed",
  "map_state_clicked",
  "homepage_cta_clicked",
  "homepage_sport_chip_clicked",
  "tournament_detail_more_in_state_clicked",
  "tournament_detail_weekend_plan_clicked",
  "tournament_detail_venue_map_clicked",
  "tournament_detail_travel_search_clicked",
  "tournament_detail_hotel_cta_clicked",
  "tournament_detail_page_viewed",
  "tournament_card_plan_weekend_clicked",
  "tournament_directory_page_viewed",
  "search_submitted",
  "tournament_map_cta_clicked",
  "venue_page_viewed",
  "venue_map_opened",
  "venue_map_loaded",
  "tournament_map_loaded_from_venue",
  "venue_select",
  "directions_click",
  "hotels_click",
  "venue_view_click",
  "venue_directory_plan_map_click",
  "venue_directory_view_venue_click",
  "nearest_airport_click",
  "venue_map_hotels_clicked",
  "tier_gate_hit",
  "owls_eye_unlock_prompt_shown",
  "owls_eye_full_opened",
  "owls_eye_category_pins_enabled",
  "owls_eye_category_expanded",
  "owls_eye_result_selected",
  "owls_eye_directions_clicked",
  "owls_eye_limited_continue",
  "owls_eye_preview_shown",
  "owls_eye_preview_pin_click",
  "owls_eye_preview_directions_click",
  "owls_eye_preview_upgrade_click",
  "owls_eye_preview_hotel_booking_click",
  "premium_modal_viewed",
  "premium_cta_clicked",
  "venue_hotels_cta_clicked",
  "weekend_share_clicked",
  "weekend_page_opened",
  "weekend_plan_page_viewed",
  "weekend_share_venue_map_clicked",
  "weekend_share_travel_clicked",
  "weekend_share_planner_hub_clicked",
  "weekend_share_directions_clicked",
  "weekend_share_airport_directions_clicked",
  "weekend_share_owls_eye_directions_clicked",
  "tournament_map_weekend_plan_clicked",
  "tournament_map_back_to_tournament_clicked",
  "tournament_map_add_to_planner_clicked",
  "weekend_plan_save_clicked",
  "weekend_plan_saved",
  "weekend_planner_saved_tournament_clicked",
  "weekend_planner_saved_weekend_plan_clicked",
  "weekend_planner_saved_venue_map_clicked",
  "weekend_planner_saved_travel_clicked",
  // Convention-only allowlist: partner clicks are recorded server-side via /go/partner/[partnerLinkId].
  // Do not add client-side /api/analytics calls for this event, or it will double-count.
  "partner_click_clicked",
]);

const TRAVEL_EVENTS = new Set([
  "book_travel_viewed",
  "book_travel_hotels_clicked",
  "book_travel_vrbo_clicked",
  "book_travel_shared",
  "book_travel_search_by_city_clicked",
  "book_travel_add_event_clicked",
  "book_travel_tournament_directory_clicked",
  "book_travel_weekend_pro_upsell_clicked",
]);

const SAVED_TOURNAMENT_EVENTS = new Set([
  "Tournament Save Clicked",
  "Tournament Save Auth Redirect",
  "Tournament Saved",
  "Saved Tournament Notify Prompt Shown",
  "Saved Tournament Notify Enabled",
  "Saved Tournament Notify Dismissed",
]);

// Weekend Planner (Stage 2.7): allowlisted for persistence into ti_map_events (privacy-safe payloads only).
const PLANNER_EVENTS = new Set([
  "planner_calendar_feed_connect_succeeded",
  "planner_calendar_feed_connect_failed",
  "planner_calendar_feed_limit_reached",
  "planner_calendar_feed_refresh_clicked",
  "planner_calendar_feed_refresh_succeeded",
  "planner_calendar_feed_refresh_failed",
  "planner_view_toggle_clicked",
  "planner_calendar_timezone_changed",
  "planner_load_more_clicked",
  "planner_manual_event_created",
  "planner_manual_event_updated",
  "planner_manual_event_deleted",
  "planner_duplicate_keep_separate_clicked",
  "planner_duplicate_merge_modal_opened",
  "planner_duplicate_merge_succeeded",
  "planner_duplicate_merge_failed",
  "planner_weekend_pro_gate_viewed",
  "planner_weekend_pro_gate_clicked",
  "planner_map_view_opened",
  "planner_calendar_event_detail_opened",
  "weekend_planner_viewed",
  "weekend_planner_start_clicked",
  "weekend_planner_auth_required_viewed",
  "weekend_planner_create_account_clicked",
  "weekend_planner_sign_in_clicked",
  "weekend_planner_loaded",
  "weekend_planner_empty_state_viewed",
  "weekend_planner_contextual_cta_viewed",
  "weekend_planner_contextual_cta_clicked",
  "weekend_planner_prefill_started",
  "weekend_planner_prefill_saved",
  "weekend_planner_prefill_auth_required",
  "planner_guest_share_panel_viewed",
  "planner_guest_share_created",
  "planner_guest_share_copied",
  "planner_guest_share_disabled",
  "planner_guest_share_regenerated",
  "planner_calendar_feed_panel_viewed",
  "planner_calendar_feed_created",
  "planner_calendar_feed_revealed",
  "planner_calendar_feed_copied",
  "planner_calendar_feed_disabled",
  "planner_calendar_feed_regenerated",
  "team_hotel_cta_viewed",
  "team_hotel_cta_clicked",
  "team_hotel_request_started",
  "team_hotel_request_submitted",
]);

function asText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asTextWithLimit(value: unknown, maxLen: number) {
  const text = asText(value);
  if (!text) return null;
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function isLocalhostHost(host: string) {
  const h = host.trim().toLowerCase();
  if (!h) return false;
  if (h === "localhost" || h.startsWith("localhost:")) return true;
  if (h === "127.0.0.1" || h.startsWith("127.0.0.1:")) return true;
  if (h === "0.0.0.0" || h.startsWith("0.0.0.0:")) return true;
  if (h === "[::1]" || h.startsWith("[::1]:")) return true;
  if (h.endsWith(".local")) return true;
  return false;
}

function isPrivateNetworkHost(host: string) {
  const h = host.trim().toLowerCase();
  if (!h) return false;
  const withoutPort = h.startsWith("[") ? h : h.split(":")[0];
  const ip = withoutPort.replace(/^\[/, "").replace(/\]$/, "");
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function shouldPersistMapEvents(request: Request) {
  // Local dev should never persist analytics into Supabase unless explicitly enabled.
  // This repo often points local dev at production Supabase, so we fail-closed by default.
  if (process.env.ENABLE_TI_ANALYTICS_TRACKING === "true") return true;
  if (process.env.NODE_ENV === "development") return false;

  const host = asTextWithLimit(request.headers.get("x-forwarded-host") ?? request.headers.get("host"), 128);
  if (host && isLocalhostHost(host)) return false;
  if (host && isPrivateNetworkHost(host)) return false;

  const origin = asTextWithLimit(request.headers.get("origin"), 256);
  if (origin && (origin.includes("://localhost") || origin.includes("://127.0.0.1") || origin.includes("://[::1]"))) {
    return false;
  }

  const referer = asTextWithLimit(request.headers.get("referer"), 512);
  if (referer && (referer.includes("://localhost") || referer.includes("://127.0.0.1") || referer.includes("://[::1]"))) {
    return false;
  }

  return true;
}

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    const text = asText(item);
    if (!text) continue;
    out.push(text.slice(0, 64));
  }
  return out.length ? out : null;
}

function asObject(value: unknown) {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function POST(request: Request) {
  let payload: AnalyticsRequest | null = null;

  try {
    payload = (await request.json()) as AnalyticsRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid analytics payload." }, { status: 400 });
  }

  if (!payload?.event || typeof payload.event !== "string") {
    return NextResponse.json({ ok: false, error: "Event is required." }, { status: 400 });
  }

  const userAgent = asTextWithLimit(request.headers.get("user-agent"), 256);

  console.info(
    "[ti-analytics]",
    JSON.stringify({
      event: payload.event,
      properties: payload.properties ?? {},
      received_at: new Date().toISOString(),
    })
  );

  // Persist quick-check events for admin analytics. Keep the surface area small: only store
  // the venue quick check funnel events, with tight parsing and field limits.
  if (QUICK_CHECK_EVENTS.has(payload.event)) {
    // Avoid polluting analytics with local testing / admin poking around.
    if (!shouldPersistMapEvents(request)) {
      return NextResponse.json({ ok: true, skipped: "localhost" });
    }

    const props = payload.properties ?? {};
    const venueUuid = asText((props as any).venueUuid);
    const pageType = asText((props as any).pageType);
    const sourceTournamentUuid = asText((props as any).sourceTournamentUuid);
    const fieldsCompleted = asNumber((props as any).fieldsCompleted);
    const fieldsAnswered = asStringArray((props as any).fieldsAnswered);

    try {
      await supabaseAdmin.from("venue_quick_check_events" as any).insert({
        event_type: payload.event,
        venue_id: venueUuid,
        page_type: pageType,
        source_tournament_id: sourceTournamentUuid,
        fields_completed: fieldsCompleted,
        fields_answered: fieldsAnswered,
      });
    } catch {
      // Ignore persistence failures; analytics must never block UX.
    }
  }

  // Persist map interactions so we can review adoption and usage patterns.
  if (MAP_EVENTS.has(payload.event)) {
    const host = asTextWithLimit(request.headers.get("x-forwarded-host") ?? request.headers.get("host"), 128);
    const origin = asTextWithLimit(request.headers.get("origin"), 256);
    const referer = asTextWithLimit(request.headers.get("referer"), 512);

    // Avoid polluting analytics with local testing / admin poking around.
    if (!shouldPersistMapEvents(request)) {
      return NextResponse.json({ ok: true, skipped: "localhost" });
    }

    const propsRaw = payload.properties ?? {};
    const props = asObject(propsRaw) ?? {};
    const pageType = asTextWithLimit((props as any).page_type, 32);
    const sport = asTextWithLimit((props as any).sport, 32);
    const state = asTextWithLimit((props as any).state, 8);
    const href = asTextWithLimit((props as any).href ?? (props as any).page_url, 512);
    const filterName = asTextWithLimit((props as any).filter_name, 32);
    const oldValue = asTextWithLimit((props as any).old_value, 64);
    const newValue = asTextWithLimit((props as any).new_value, 64);
    const cta = asTextWithLimit((props as any).cta ?? (props as any).cta_placement, 64);

    const properties = {
      ...(props as any),
      ua: (props as any).ua ?? userAgent ?? null,
      host: (props as any).host ?? host ?? null,
      origin: (props as any).origin ?? origin ?? null,
      referer: (props as any).referer ?? referer ?? null,
    };

    try {
      await supabaseAdmin.from("ti_map_events" as any).insert({
        event_name: payload.event,
        properties,
        page_type: pageType,
        sport,
        state,
        href,
        filter_name: filterName,
        old_value: oldValue,
        new_value: newValue,
        cta,
      });
    } catch {
      // Ignore persistence failures; analytics must never block UX.
    }
  }

  // Persist Book Travel funnel events (CRO/SEO measurement). Keep the surface area small and
  // re-use the same storage pattern as map events to avoid schema churn.
  if (TRAVEL_EVENTS.has(payload.event)) {
    const host = asTextWithLimit(request.headers.get("x-forwarded-host") ?? request.headers.get("host"), 128);
    const origin = asTextWithLimit(request.headers.get("origin"), 256);
    const referer = asTextWithLimit(request.headers.get("referer"), 512);

    // Avoid polluting analytics with local testing / admin poking around.
    if (!shouldPersistMapEvents(request)) {
      return NextResponse.json({ ok: true, skipped: "localhost" });
    }

    const propsRaw = payload.properties ?? {};
    const props = asObject(propsRaw) ?? {};

    const pagePath = asTextWithLimit((props as any).page_path, 128);
    const sourcePage = asTextWithLimit((props as any).source_page, 64);
    const travelType = asTextWithLimit((props as any).travel_type, 16);
    const ctaLocation = asTextWithLimit((props as any).cta_location, 64);

    const properties = {
      ...(props as any),
      ua: (props as any).ua ?? userAgent ?? null,
      host: (props as any).host ?? host ?? null,
      origin: (props as any).origin ?? origin ?? null,
      referer: (props as any).referer ?? referer ?? null,
    };

    try {
      await supabaseAdmin.from("ti_map_events" as any).insert({
        event_name: payload.event,
        properties,
        page_type: "book_travel",
        sport: null,
        state: null,
        href: pagePath,
        filter_name: null,
        old_value: sourcePage,
        new_value: travelType,
        cta: ctaLocation,
      });
    } catch {
      // Ignore persistence failures; analytics must never block UX.
    }
  }

  // Persist Weekend Planner events for UAT hardening + adoption review.
  if (PLANNER_EVENTS.has(payload.event)) {
    const host = asTextWithLimit(request.headers.get("x-forwarded-host") ?? request.headers.get("host"), 128);
    const origin = asTextWithLimit(request.headers.get("origin"), 256);
    const referer = asTextWithLimit(request.headers.get("referer"), 512);

    // Avoid polluting analytics with local testing / admin poking around.
    if (!shouldPersistMapEvents(request)) {
      return NextResponse.json({ ok: true, skipped: "localhost" });
    }

    const propsRaw = payload.properties ?? {};
    const props = asObject(propsRaw) ?? {};

    const pagePath = asTextWithLimit((props as any).page_path, 128);
    const entitlement = asTextWithLimit((props as any).entitlement, 32);
    const view = asTextWithLimit((props as any).view, 32);
    const fromView = asTextWithLimit((props as any).from_view, 32);
    const toView = asTextWithLimit((props as any).to_view, 32);
    const gateName = asTextWithLimit((props as any).gate_name, 32);
    const target = asTextWithLimit((props as any).target, 64);
    const reasonCode = asTextWithLimit((props as any).reason_code, 64);
    const surface = asTextWithLimit((props as any).surface, 32);
    const sourcePageType = asTextWithLimit((props as any).source_page_type, 32);
    const ctaType = asTextWithLimit((props as any).cta_type, 64);
    const authState = asTextWithLimit((props as any).auth_state, 32);
    const actionSurface = asTextWithLimit((props as any).action_surface, 32);
    const contextType = asTextWithLimit((props as any).context_type, 32);
    const loadedEventCountBucket = asTextWithLimit((props as any).loaded_event_count_bucket, 16);
    const feedCountBucket = asTextWithLimit((props as any).feed_count_bucket, 16);
    const childTeamCountBucket = asTextWithLimit((props as any).child_team_count_bucket, 16);

    const hasPlannerActivationShape =
      payload.event.startsWith("weekend_planner_") ||
      payload.event.startsWith("planner_guest_share_") ||
      payload.event.startsWith("planner_calendar_feed_") ||
      payload.event.startsWith("team_hotel_");

    const properties = hasPlannerActivationShape
      ? {
          surface,
          source_page_type: sourcePageType,
          cta_type: ctaType,
          auth_state: authState,
          entitlement,
          action_surface: actionSurface,
          context_type: contextType,
          view,
          loaded_event_count_bucket: loadedEventCountBucket,
          feed_count_bucket: feedCountBucket,
          child_team_count_bucket: childTeamCountBucket,
          ua: userAgent ?? null,
          host: host ?? null,
          origin: origin ?? null,
          referer: referer ?? null,
        }
      : {
          ...(props as any),
          ua: (props as any).ua ?? userAgent ?? null,
          host: (props as any).host ?? host ?? null,
          origin: (props as any).origin ?? origin ?? null,
          referer: (props as any).referer ?? referer ?? null,
        };

    try {
      await supabaseAdmin.from("ti_map_events" as any).insert({
        event_name: payload.event,
        properties,
        page_type: sourcePageType === "book_travel" ? "book_travel" : "weekend_planner",
        sport: null,
        state: null,
        href: pagePath ?? "/weekend-planner",
        filter_name: view ?? gateName ?? contextType ?? null,
        old_value: fromView ?? authState ?? entitlement ?? null,
        new_value: toView ?? reasonCode ?? loadedEventCountBucket ?? null,
        cta: ctaType ?? target ?? actionSurface ?? null,
      });
    } catch {
      // Ignore persistence failures; analytics must never block UX.
    }
  }

  // Persist saved tournament actions for TI engagement reporting.
  if (SAVED_TOURNAMENT_EVENTS.has(payload.event)) {
    // Avoid polluting analytics with local testing / admin poking around.
    if (!shouldPersistMapEvents(request)) {
      return NextResponse.json({ ok: true, skipped: "localhost" });
    }

    const propsRaw = payload.properties ?? {};
    const props = asObject(propsRaw) ?? {};
    const host = asTextWithLimit(request.headers.get("x-forwarded-host") ?? request.headers.get("host"), 128);
    const origin = asTextWithLimit(request.headers.get("origin"), 256);
    const referer = asTextWithLimit(request.headers.get("referer"), 512);

    const tournamentId = asText((props as any).tournamentId);
    const eventProperties = {
      ...(props as any),
      tournament_id: tournamentId ?? null,
      saved_before: asBoolean((props as any).saved_before),
      logged_in: asBoolean((props as any).logged_in),
      verified: asBoolean((props as any).verified),
      reason: asText((props as any).reason),
      return_to: asText((props as any).returnTo),
      ua: (props as any).ua ?? userAgent ?? null,
      host: (props as any).host ?? host ?? null,
      origin: (props as any).origin ?? origin ?? null,
      referer: (props as any).referer ?? referer ?? null,
    };

    try {
      await supabaseAdmin.from("ti_map_events" as any).insert({
        event_name: payload.event,
        properties: eventProperties,
        page_type: "tournament_detail",
        sport: null,
        state: null,
        href: null,
        filter_name: null,
        old_value: null,
        new_value: null,
        cta: null,
      });
    } catch {
      // Ignore persistence failures; analytics must never block UX.
    }
  }

  return NextResponse.json({ ok: true });
}
