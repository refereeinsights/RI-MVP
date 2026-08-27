import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeAnalyticsRequestBody } from "../../../../../packages/lib/analytics-batch";
import { normalizeHotelMeasurementProperties } from "@/lib/hotelMeasurement";

const HOTEL_MEASUREMENT_EVENTS = new Set([
  "hotel_cta_impression",
  "hotel_cta_clicked",
  "hotel_card_click",
  "hotel_pin_click",
  "hotel_checkout_handoff",
  "tournament_hotels_page_viewed",
  "tournament_detail_hotel_cta_clicked",
  "hotels_click",
  "venue_map_hotels_clicked",
  "venue_hotels_cta_clicked",
  "book_travel_hotels_clicked",
]);

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
  "hotel_card_click",
  "hotel_pin_click",
  "hotel_checkout_handoff",
  "tournament_hotels_page_viewed",
  "camping_cta_impression",
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
  "team_block_cta_click",
  "team_block_rfp_start",
  "team_block_rfp_submit",
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
  "weekend_planner_entry_viewed",
  "weekend_planner_auth_gate_viewed",
  "weekend_planner_auth_started",
  "weekend_planner_auth_completed",
  "weekend_planner_start_clicked",
  "weekend_planner_first_action_available",
  "weekend_planner_first_action_cta_viewed",
  "weekend_planner_first_action_cta_clicked",
  "weekend_planner_manual_event_form_opened",
  "weekend_planner_manual_event_form_started",
  "weekend_planner_manual_event_submitted",
  "weekend_planner_temporary_event_persisted",
  "weekend_planner_manual_event_failed",
  "weekend_planner_first_meaningful_action",
  "weekend_planner_auth_required_viewed",
  "weekend_planner_create_account_clicked",
  "weekend_planner_sign_in_clicked",
  "weekend_planner_ready",
  "weekend_planner_activation_achieved",
  "weekend_planner_loaded",
  "weekend_planner_first_action",
  "weekend_planner_save_prompt_viewed",
  "weekend_planner_anonymous_claim_started",
  "weekend_planner_anonymous_claim_succeeded",
  "weekend_planner_anonymous_claim_failed",
  "weekend_planner_anonymous_claim_skipped",
  "weekend_planner_first_authenticated_action_after_claim",
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
  "team_hotel_landing_viewed",
  "team_hotel_header_cta_viewed",
  "team_hotel_header_cta_clicked",
  "team_hotel_request_started",
  "team_hotel_request_submitted",
  "team_hotel_request_succeeded",
  "team_hotel_request_failed",
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

function normalizePlannerPageType(value: string | null) {
  if (value === "tournament") return "tournament";
  if (value === "tournament_hotels") return "tournament_hotels";
  if (value === "planner") return "weekend_planner";
  if (value === "planner_entry") return "weekend_planner";
  if (value === "auth") return "auth";
  if (value === "book_travel") return "book_travel";
  return "other";
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
  const startedAt = Date.now();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid analytics payload." }, { status: 400 });
  }

  const events = normalizeAnalyticsRequestBody(body);
  if (!events) return NextResponse.json({ ok: false, error: "Invalid analytics payload." }, { status: 400 });

  const userAgent = asTextWithLimit(request.headers.get("user-agent"), 256);
  const persistableCount = events.filter(({ event }) =>
    QUICK_CHECK_EVENTS.has(event) ||
    MAP_EVENTS.has(event) ||
    TRAVEL_EVENTS.has(event) ||
    PLANNER_EVENTS.has(event) ||
    SAVED_TOURNAMENT_EVENTS.has(event)
  ).length;
  if (persistableCount > 0 && !shouldPersistMapEvents(request)) {
    return NextResponse.json({ ok: true, persisted: false, skipped: "non_production_or_local" });
  }

  const quickCheckRows: Record<string, unknown>[] = [];
  const mapEventRows: Record<string, unknown>[] = [];

  for (const payload of events) {
    // Persist quick-check events for admin analytics. Keep the surface area small: only store
    // the venue quick check funnel events, with tight parsing and field limits.
    if (QUICK_CHECK_EVENTS.has(payload.event)) {
    const props = payload.properties ?? {};
    const venueUuid = asText((props as any).venueUuid);
    const pageType = asText((props as any).pageType);
    const sourceTournamentUuid = asText((props as any).sourceTournamentUuid);
    const fieldsCompleted = asNumber((props as any).fieldsCompleted);
    const fieldsAnswered = asStringArray((props as any).fieldsAnswered);

    quickCheckRows.push({
      event_type: payload.event,
      venue_id: venueUuid,
      page_type: pageType,
      source_tournament_id: sourceTournamentUuid,
      fields_completed: fieldsCompleted,
      fields_answered: fieldsAnswered,
    });
    }

  // Persist map interactions so we can review adoption and usage patterns.
    if (MAP_EVENTS.has(payload.event)) {
    const host = asTextWithLimit(request.headers.get("x-forwarded-host") ?? request.headers.get("host"), 128);
    const origin = asTextWithLimit(request.headers.get("origin"), 256);
    const referer = asTextWithLimit(request.headers.get("referer"), 512);

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

    const hotelMeasurement = HOTEL_MEASUREMENT_EVENTS.has(payload.event)
      ? normalizeHotelMeasurementProperties(props)
      : null;
    const properties = {
      ...(props as any),
      ...(hotelMeasurement ?? {}),
      ua: (props as any).ua ?? userAgent ?? null,
      host: (props as any).host ?? host ?? null,
      origin: (props as any).origin ?? origin ?? null,
      referer: (props as any).referer ?? referer ?? null,
    };

    mapEventRows.push({
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
    }

  // Persist Book Travel funnel events (CRO/SEO measurement). Keep the surface area small and
  // re-use the same storage pattern as map events to avoid schema churn.
    if (TRAVEL_EVENTS.has(payload.event)) {
    const host = asTextWithLimit(request.headers.get("x-forwarded-host") ?? request.headers.get("host"), 128);
    const origin = asTextWithLimit(request.headers.get("origin"), 256);
    const referer = asTextWithLimit(request.headers.get("referer"), 512);

    const propsRaw = payload.properties ?? {};
    const props = asObject(propsRaw) ?? {};

    const pagePath = asTextWithLimit((props as any).page_path, 128);
    const sourcePage = asTextWithLimit((props as any).source_page, 64);
    const travelType = asTextWithLimit((props as any).travel_type, 16);
    const ctaLocation = asTextWithLimit((props as any).cta_location, 64);

    const hotelMeasurement = HOTEL_MEASUREMENT_EVENTS.has(payload.event)
      ? normalizeHotelMeasurementProperties(props)
      : null;
    const properties = {
      ...(props as any),
      ...(hotelMeasurement ?? {}),
      ua: (props as any).ua ?? userAgent ?? null,
      host: (props as any).host ?? host ?? null,
      origin: (props as any).origin ?? origin ?? null,
      referer: (props as any).referer ?? referer ?? null,
    };

    mapEventRows.push({
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
    }

  // Persist Weekend Planner events for UAT hardening + adoption review.
    if (PLANNER_EVENTS.has(payload.event)) {
    const host = asTextWithLimit(request.headers.get("x-forwarded-host") ?? request.headers.get("host"), 128);
    const origin = asTextWithLimit(request.headers.get("origin"), 256);
    const referer = asTextWithLimit(request.headers.get("referer"), 512);

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
    const currentPageType = asTextWithLimit((props as any).current_page_type, 32);
    const currentPagePath = asTextWithLimit((props as any).current_page_path, 128);
    const plannerSessionId = asTextWithLimit((props as any).planner_session_id, 64);
    const entrySource = asTextWithLimit((props as any).entry_source, 64);
    const entryPageType = asTextWithLimit((props as any).entry_page_type, 32);
    const entryPath = asTextWithLimit((props as any).entry_path, 128);
    const entryPlacement = asTextWithLimit((props as any).entry_placement, 64);
    const requestSource = asTextWithLimit((props as any).request_source, 64);
    const tournamentId = asTextWithLimit((props as any).tournament_id, 64);
    const tournamentSlug = asTextWithLimit((props as any).tournament_slug, 128);
    const venueId = asTextWithLimit((props as any).venue_id, 64);
    const firstActionType = asTextWithLimit((props as any).first_action_type, 64);
    const ctaType = asTextWithLimit((props as any).cta_type, 64);
    const eventType = asTextWithLimit((props as any).event_type, 32);
    const authState = asTextWithLimit((props as any).auth_state, 32);
    const actionSurface = asTextWithLimit((props as any).action_surface, 32);
    const contextType = asTextWithLimit((props as any).context_type, 32);
    const formLocation = asTextWithLimit((props as any).form_location, 64);
    const temporaryPlanId = asTextWithLimit((props as any).temporary_plan_id, 128);
    const failureReason = asTextWithLimit((props as any).failure_reason, 256);
    const deviceType = asTextWithLimit((props as any).device_type, 32);
    const requestId = asTextWithLimit((props as any).request_id, 128);
    const outboundAttributionId = asTextWithLimit((props as any).outbound_attribution_id, 128);
    const loadedEventCountBucket = asTextWithLimit((props as any).loaded_event_count_bucket, 16);
    const feedCountBucket = asTextWithLimit((props as any).feed_count_bucket, 16);
    const childTeamCountBucket = asTextWithLimit((props as any).child_team_count_bucket, 16);
    const experimentName = asTextWithLimit((props as any).experiment_name, 64);
    const experimentVariant = asTextWithLimit((props as any).experiment_variant, 32);
    const featureFlagState = asTextWithLimit((props as any).feature_flag_state, 32);
    const activationFlow = asTextWithLimit((props as any).activation_flow, 64);
    const dateSource = asTextWithLimit((props as any).date_source, 32);
    const ctaPlacement = asTextWithLimit((props as any).cta_placement, 64);
    const hotelMeasurement = normalizeHotelMeasurementProperties(props);

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
          cta_placement: ctaPlacement,
          planner_session_id: plannerSessionId,
          session_id: hotelMeasurement.session_id,
          distribution_source: hotelMeasurement.distribution_source,
          entry_source: entrySource,
          entry_page_type: entryPageType,
          entry_path: entryPath,
          entry_placement: entryPlacement,
          request_source: requestSource,
          current_page_type: currentPageType,
          current_page_path: currentPagePath,
          tournament_id: tournamentId,
          tournament_slug: tournamentSlug,
          venue_id: venueId,
          first_action_type: firstActionType,
          event_type: eventType,
          auth_state: authState,
          entitlement,
          action_surface: actionSurface,
          context_type: contextType,
          form_location: formLocation,
          temporary_plan_id: temporaryPlanId,
          failure_reason: failureReason,
          device_type: deviceType,
          request_id: requestId,
          outbound_attribution_id: outboundAttributionId,
          view,
          loaded_event_count_bucket: loadedEventCountBucket,
          feed_count_bucket: feedCountBucket,
          child_team_count_bucket: childTeamCountBucket,
          experiment_name: experimentName,
          experiment_variant: experimentVariant,
          feature_flag_state: featureFlagState,
          activation_flow: activationFlow,
          date_source: dateSource,
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

    mapEventRows.push({
      event_name: payload.event,
      properties,
      page_type: normalizePlannerPageType(currentPageType ?? sourcePageType),
      sport: null,
      state: null,
      href: currentPagePath ?? pagePath ?? "/weekend-planner",
      filter_name: view ?? gateName ?? contextType ?? entryPlacement ?? null,
      old_value: fromView ?? authState ?? entitlement ?? entrySource ?? null,
      new_value: toView ?? reasonCode ?? loadedEventCountBucket ?? firstActionType ?? null,
      cta: ctaType ?? target ?? actionSurface ?? null,
    });
    }

  // Persist saved tournament actions for TI engagement reporting.
    if (SAVED_TOURNAMENT_EVENTS.has(payload.event)) {
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

    mapEventRows.push({
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
    }
  }

  const inserts: Promise<{ error: { code?: string; message?: string } | null }>[] = [];
  if (quickCheckRows.length) {
    inserts.push(supabaseAdmin.from("venue_quick_check_events" as any).insert(quickCheckRows) as any);
  }
  if (mapEventRows.length) {
    inserts.push(supabaseAdmin.from("ti_map_events" as any).insert(mapEventRows) as any);
  }

  try {
    const results = await Promise.all(inserts);
    const failure = results.find((result) => result.error)?.error;
    if (failure) {
      console.error(JSON.stringify({
        level: "error",
        message: "TI analytics batch insert failed",
        route: "/api/analytics",
        requestId: request.headers.get("x-vercel-id"),
        receivedEvents: events.length,
        persistedRowsAttempted: quickCheckRows.length + mapEventRows.length,
        errorCode: failure.code ?? "unknown",
        durationMs: Date.now() - startedAt,
      }));
      return NextResponse.json({ ok: true, persisted: false, skipped: "insert_failed" });
    }
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "TI analytics batch insert threw",
      route: "/api/analytics",
      requestId: request.headers.get("x-vercel-id"),
      receivedEvents: events.length,
      persistedRowsAttempted: quickCheckRows.length + mapEventRows.length,
      error: error instanceof Error ? error.message : "unknown",
      durationMs: Date.now() - startedAt,
    }));
    return NextResponse.json({ ok: true, persisted: false, skipped: "insert_exception" });
  }

  const persistedRows = quickCheckRows.length + mapEventRows.length;
  console.info(JSON.stringify({
    level: "info",
    message: "TI analytics batch processed",
    route: "/api/analytics",
    requestId: request.headers.get("x-vercel-id"),
    receivedEvents: events.length,
    persistedRows,
    durationMs: Date.now() - startedAt,
  }));
  return NextResponse.json({ ok: true, persisted: persistedRows > 0, persistedEvents: persistedRows });
}
