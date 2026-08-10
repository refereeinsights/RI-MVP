import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmailVerified } from "@/lib/email";
import { TI_SPORT_LABELS, TI_SPORTS } from "@/lib/tiSports";
import {
  loadAdminDashboardEmailTiles,
  getEffectiveRecipients,
  loadLowestStates,
  loadRiSummaryCounts,
  loadTiAdminDashboardEmailSettings,
  resolveTiBaseUrl,
} from "@/lib/adminDashboardEmail";
import { isQualifiedTeamHotelAcceptedRequest } from "@/lib/teamHotelReporting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const LOCK_KEY = "ti_admin_dashboard_email_v1";

type PublicDirectoryBySportRow = {
  sport: unknown;
  total?: unknown;
  new_yesterday?: unknown;
};

type TiMapEventRow = {
  event_name: string;
  properties: Record<string, unknown> | null;
  created_at?: string;
};

type HotelOutboundClickRow = {
  source_surface: string | null;
};

type CampspotOutboundClickRow = {
  source_surface: string | null;
  cta_placement: string | null;
  session_id: string | null;
  outbound_attribution_id: string | null;
  venue_id: string | null;
};

type CampspotWindowMetrics = {
  impressions: number;
  outboundClicks: number;
  impressionSessions: number;
  outboundSessions: number;
  bySurface: Record<string, number>;
  byPlacement: Record<string, number>;
  missing: { attributionId: number; sessionId: number; venueId: number };
};

type CampspotExperimentSummary =
  | { ok: true; windowLabel: string; yesterday: CampspotWindowMetrics; trailing7d: CampspotWindowMetrics }
  | { ok: false; windowLabel: string; error: string };

type LodgingSearchSessionRow = {
  created_at: string | null;
  status: string | null;
  group_request_id: string | null;
  outbound_attribution_id: string | null;
  source_page_type: string | null;
  request_source: string | null;
  search_query: Record<string, unknown> | null;
  tournament_id: string | null;
  venue_id: string | null;
};

type HealthStatus = "ok" | "warn" | "neutral";
type HealthItem = { status: HealthStatus; label: string; detail: string };

type WeekendPlannerDailySummary =
  | {
      ok: true;
      windowLabel: string;
      activations: number;
      planClicks: number;
      teamHotelRequests: number;
      snapshot: {
        totalActivations: number;
        meaningfulActivations: number;
        plannerViews: number;
        plannerReady: number;
        plannerLoaded: number;
        newPlannerUsers: "not tracked";
        returningPlannerUsers: "not tracked";
      };
      tournamentFunnel: {
        detailViews: number;
        plannerCtaImpressions: number;
        plannerClicks: number;
        plannerEntries: number;
        plannerAuthGateViews: number;
        plannerAuthStarts: number;
        plannerAuthCompletions: number;
        weekendSaveClicks: number;
        weekendSaved: number;
        plannerOpensFromWeekendFlow: "not tracked";
        activatedAfterWeekendFlow: "not tracked";
      };
      directEntry: {
        plannerViews: number;
        loggedOutViews: number;
        createAccountClicks: number;
        signInClicks: number;
        authRequiredViews: number;
        authStarted: number;
        authCompleted: number;
        savePromptViewed: number;
        claimStarted: number;
        claimSucceeded: number;
        claimFailed: number;
        claimSkipped: number;
        plannerLoaded: number;
        emptyStateViewed: number;
        calendarConnectStarts: "not tracked";
        manualEventsAdded: number;
        calendarFeedsConnected: number;
      };
      tournamentTreatmentFunnel: Array<{
        label: string;
        rawEvents: number;
        uniqueSessions: number;
        conversionFromPrior: string;
      }>;
      directPlannerFunnel: Array<{
        label: string;
        rawEvents: number;
        uniqueSessions: number;
        conversionFromPrior: string;
      }>;
      firstActions: {
        meaningfulActivations: number;
        manualEventsAdded: number;
        calendarFeedsConnected: number;
        weekendPlansSaved: number;
        guestSharesCreated: number;
        privateCalendarFeedsCreated: number;
        firstAuthenticatedActionAfterClaim: number;
      };
      activationBySource: {
        tracked: true;
        arrivalsBySource: Record<"tournament_detail" | "direct" | "unknown", number>;
      };
      teamHotel: {
        landingViews: number;
        uniqueLandingSessions: number;
        headerViews: number;
        headerClicks: number;
        ctaImpressions: number;
        ctaClicks: number;
        formStarts: number;
        requestsSubmitted: number;
        uniqueAcceptedRequests: number;
        qualifiedRequests: number;
        requestsSucceeded: number;
        requestsFailed: number;
      };
      weekendProInterest: {
        gateViews: number;
        gateClicks: number;
        premiumViews: number;
        premiumClicks: number;
      };
      topTournamentPages: Array<{
        tournamentSlug: string;
        impressions: number;
        clicks: number;
        ctr: number | null;
      }>;
      hotelHandoffs: {
        total: number;
        bySurface: Record<string, number>;
        uncapped: true;
      };
      partialWindowNote: string | null;
      healthSummary: HealthItem[];
      alerts: string[];
      missingTracking: string[];
    }
  | {
      ok: false;
      windowLabel: string;
      error: string;
    };

function isAuthorized(req: Request) {
  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("token");
  const tokenFromHeader = req.headers.get("x-cron-secret");
  const token = (tokenFromQuery ?? tokenFromHeader ?? "").trim();
  if (Boolean(process.env.CRON_SECRET && token && token === process.env.CRON_SECRET)) {
    return true;
  }

  // Vercel Cron Jobs cannot send custom headers reliably across all setups, but they do send `x-vercel-cron: 1`.
  // Allow Vercel cron invocations in production without requiring the secret to avoid silent scheduled failures.
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const isProd = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";
  return Boolean(isVercelCron && isProd);
}

function formatInt(value: unknown) {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function formatPercent(value: unknown) {
  const n = typeof value === "number" ? value : Number(value ?? NaN);
  if (!Number.isFinite(n)) return "—";
  // `get_outreach_dashboard_metrics` returns a percent (0-100). Some older callers may treat it as a ratio (0-1).
  // Normalize to a percent number before formatting.
  const pct = n <= 1 ? n * 100 : n;
  return `${Math.round(pct * 10) / 10}%`;
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatRatioPercent(numerator: number | null | undefined, denominator: number | null | undefined) {
  const n = Number(numerator ?? NaN);
  const d = Number(denominator ?? NaN);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return "n/a";
  return `${((n / d) * 100).toFixed(1)}%`;
}

function formatMetricValue(value: number | string) {
  if (typeof value === "number") return formatInt(value);
  return value;
}

function renderMetricRows(rows: Array<{ label: string; value: number | string; note?: string }>) {
  return `<table style="width:100%;border-collapse:collapse;font-size:13px;">
    <tbody>
      ${rows
        .map(
          (row) => `<tr>
            <td style="padding:6px 0;border-top:1px solid #e5e7eb;color:#334155;">${htmlEscape(row.label)}</td>
            <td style="padding:6px 0 6px 16px;border-top:1px solid #e5e7eb;text-align:right;color:#0f172a;font-weight:800;white-space:nowrap;">${htmlEscape(
              formatMetricValue(row.value),
            )}</td>
            <td style="padding:6px 0 6px 12px;border-top:1px solid #e5e7eb;color:#64748b;text-align:right;">${htmlEscape(row.note ?? "")}</td>
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderFunnelRows(rows: Array<{ label: string; rawEvents: number; uniqueSessions: number; conversionFromPrior: string }>) {
  return `<table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f1f5f9;">
        <th style="text-align:left;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Stage</th>
        <th style="text-align:right;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Raw events</th>
        <th style="text-align:right;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Unique sessions</th>
        <th style="text-align:right;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Conv. from prior</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (row) => `<tr>
            <td style="padding:8px 10px;border-top:1px solid #e5e7eb;color:#334155;">${htmlEscape(row.label)}</td>
            <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;color:#0f172a;">${htmlEscape(formatInt(row.rawEvents))}</td>
            <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;color:#0f172a;font-weight:800;">${htmlEscape(formatInt(row.uniqueSessions))}</td>
            <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;color:#64748b;">${htmlEscape(row.conversionFromPrior)}</td>
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderSectionCard(title: string, subtitle: string | null, bodyHtml: string) {
  return `<div style="margin-top:14px;border:1px solid #dbe7e1;border-radius:12px;padding:12px;background:#f8fffb;">
    <div style="font-size:11px;color:#64748b;font-weight:900;text-transform:uppercase;letter-spacing:0.06em;">${htmlEscape(title)}</div>
    ${subtitle ? `<div style="margin-top:4px;color:#475569;font-size:12px;line-height:1.4;">${htmlEscape(subtitle)}</div>` : ""}
    <div style="margin-top:8px;">${bodyHtml}</div>
  </div>`;
}

function eventPropertyText(row: TiMapEventRow, key: string) {
  const value = row.properties?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function countEvents(rows: TiMapEventRow[], eventName: string, predicate?: (row: TiMapEventRow) => boolean) {
  return rows.filter((row) => row.event_name === eventName && (!predicate || predicate(row))).length;
}

function countUniquePlannerSessions(rows: TiMapEventRow[], eventName: string, predicate?: (row: TiMapEventRow) => boolean) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.event_name !== eventName) continue;
    if (predicate && !predicate(row)) continue;
    const plannerSessionId = eventPropertyText(row, "planner_session_id");
    if (!plannerSessionId) continue;
    ids.add(plannerSessionId);
  }
  return ids.size;
}

async function loadHotelOutboundBySurface(params: { startIso: string; endIso: string }) {
  const bySurface: Record<string, number> = {};
  let total = 0;
  let from = 0;
  const pageSize = 1000;

  for (;;) {
    const { data, error } = await supabaseAdmin
      .from("ti_outbound_clicks" as any)
      .select("source_surface")
      .eq("destination_type", "hotels")
      .eq("partner", "hotelplanner")
      .gte("created_at", params.startIso)
      .lt("created_at", params.endIso)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const rows = ((data ?? []) as HotelOutboundClickRow[]) ?? [];
    total += rows.length;
    for (const row of rows) {
      const surface = row.source_surface ?? "unknown";
      bySurface[surface] = (bySurface[surface] ?? 0) + 1;
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return { total, bySurface, uncapped: true as const };
}

async function loadCampspotImpressions(params: { startIso: string; endIso: string }) {
  const rows: TiMapEventRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("ti_map_events" as any)
      .select("event_name,properties,created_at")
      .eq("event_name", "camping_cta_impression")
      .gte("created_at", params.startIso)
      .lt("created_at", params.endIso)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = ((data ?? []) as TiMapEventRow[]) ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function loadCampspotOutboundClicks(params: { startIso: string; endIso: string }) {
  const rows: CampspotOutboundClickRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("ti_outbound_clicks" as any)
      .select("source_surface,cta_placement,session_id,outbound_attribution_id,venue_id")
      .eq("destination_type", "camping")
      .eq("partner", "campspot")
      .gte("created_at", params.startIso)
      .lt("created_at", params.endIso)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = ((data ?? []) as CampspotOutboundClickRow[]) ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function summarizeCampspotWindow(impressions: TiMapEventRow[], outbound: CampspotOutboundClickRow[]): CampspotWindowMetrics {
  const impressionSessions = new Set(
    impressions.map((row) => eventPropertyText(row, "session_id")).filter(Boolean),
  );
  const outboundSessions = new Set(outbound.map((row) => row.session_id?.trim()).filter((value): value is string => Boolean(value)));
  const bySurface: Record<string, number> = {};
  const byPlacement: Record<string, number> = {};
  for (const row of outbound) {
    const surface = row.source_surface?.trim() || "unknown";
    const placement = row.cta_placement?.trim() || "unknown";
    bySurface[surface] = (bySurface[surface] ?? 0) + 1;
    byPlacement[placement] = (byPlacement[placement] ?? 0) + 1;
  }
  return {
    impressions: impressions.length,
    outboundClicks: outbound.length,
    impressionSessions: impressionSessions.size,
    outboundSessions: outboundSessions.size,
    bySurface,
    byPlacement,
    missing: {
      attributionId: outbound.filter((row) => !row.outbound_attribution_id).length,
      sessionId: outbound.filter((row) => !row.session_id).length,
      venueId: outbound.filter((row) => !row.venue_id).length,
    },
  };
}

async function loadCampspotExperimentSummary(params: {
  yesterdayStartUtcIso: string;
  todayStartUtcIso: string;
  trailing7dStartUtcIso: string;
  yesterdayStart: Date;
  timeZone: string;
}): Promise<CampspotExperimentSummary> {
  const windowLabel = formatDateLabelInTimeZone(params.yesterdayStart, params.timeZone);
  try {
    const [yesterdayImpressions, yesterdayOutbound, trailingImpressions, trailingOutbound] = await Promise.all([
      loadCampspotImpressions({ startIso: params.yesterdayStartUtcIso, endIso: params.todayStartUtcIso }),
      loadCampspotOutboundClicks({ startIso: params.yesterdayStartUtcIso, endIso: params.todayStartUtcIso }),
      loadCampspotImpressions({ startIso: params.trailing7dStartUtcIso, endIso: params.todayStartUtcIso }),
      loadCampspotOutboundClicks({ startIso: params.trailing7dStartUtcIso, endIso: params.todayStartUtcIso }),
    ]);
    return {
      ok: true,
      windowLabel,
      yesterday: summarizeCampspotWindow(yesterdayImpressions, yesterdayOutbound),
      trailing7d: summarizeCampspotWindow(trailingImpressions, trailingOutbound),
    };
  } catch (error: any) {
    return { ok: false, windowLabel, error: String(error?.message ?? error ?? "unknown_error") };
  }
}

function formatDateLabelInTimeZone(date: Date, timeZone: string) {
  return date.toLocaleDateString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function loadWeekendPlannerDailySummary(params: {
  yesterdayStartUtcIso: string;
  todayStartUtcIso: string;
  yesterdayStart: Date;
  todayStart: Date;
  timeZone: string;
}): Promise<WeekendPlannerDailySummary> {
  const windowLabel = `${formatDateLabelInTimeZone(params.yesterdayStart, params.timeZone)} (${params.timeZone})`;
  try {
    const trackedEventNames = [
      "tournament_detail_page_viewed",
      "weekend_planner_contextual_cta_viewed",
      "tournament_detail_weekend_plan_clicked",
      "weekend_plan_page_viewed",
      "weekend_plan_save_clicked",
      "weekend_plan_saved",
      "weekend_planner_contextual_cta_clicked",
      "weekend_planner_viewed",
      "weekend_planner_entry_viewed",
      "weekend_planner_auth_gate_viewed",
      "weekend_planner_auth_started",
      "weekend_planner_auth_completed",
      "weekend_planner_auth_required_viewed",
      "weekend_planner_create_account_clicked",
      "weekend_planner_sign_in_clicked",
      "weekend_planner_first_action_available",
      "weekend_planner_first_action_cta_viewed",
      "weekend_planner_first_action_cta_clicked",
      "weekend_planner_manual_event_form_opened",
      "weekend_planner_manual_event_form_started",
      "weekend_planner_manual_event_submitted",
      "weekend_planner_temporary_event_persisted",
      "weekend_planner_manual_event_failed",
      "weekend_planner_first_meaningful_action",
      "weekend_planner_ready",
      "weekend_planner_activation_achieved",
      "weekend_planner_save_prompt_viewed",
      "weekend_planner_anonymous_claim_started",
      "weekend_planner_anonymous_claim_succeeded",
      "weekend_planner_anonymous_claim_failed",
      "weekend_planner_anonymous_claim_skipped",
      "weekend_planner_first_authenticated_action_after_claim",
      "weekend_planner_loaded",
      "weekend_planner_first_action",
      "weekend_planner_empty_state_viewed",
      "planner_manual_event_created",
      "planner_calendar_feed_connect_succeeded",
      "planner_guest_share_created",
      "planner_calendar_feed_created",
      "team_hotel_landing_viewed",
      "team_hotel_header_cta_viewed",
      "team_hotel_header_cta_clicked",
      "team_hotel_cta_viewed",
      "team_hotel_cta_clicked",
      "team_hotel_request_started",
      "team_hotel_request_submitted",
      "team_hotel_request_succeeded",
      "team_hotel_request_failed",
      "premium_modal_viewed",
      "premium_cta_clicked",
      "planner_weekend_pro_gate_viewed",
      "planner_weekend_pro_gate_clicked",
    ];

    const [{ data, error }, hotelHandoffs, acceptedRequestsResult] = await Promise.all([
      supabaseAdmin
        .from("ti_map_events" as any)
        .select("event_name,properties,created_at")
        .in("event_name", trackedEventNames)
        .gte("created_at", params.yesterdayStartUtcIso)
        .lt("created_at", params.todayStartUtcIso),
      loadHotelOutboundBySurface({
        startIso: params.yesterdayStartUtcIso,
        endIso: params.todayStartUtcIso,
      }),
      supabaseAdmin
        .from("lodging_search_session" as any)
        .select("created_at,status,group_request_id,outbound_attribution_id,source_page_type,request_source,search_query,tournament_id,venue_id")
        .eq("endpoint", "/api/lodging/group-request")
        .gte("created_at", params.yesterdayStartUtcIso)
        .lt("created_at", params.todayStartUtcIso),
    ]);

    if (error) {
      return { ok: false, windowLabel, error: error.message || "Failed to load weekend planner analytics." };
    }

    const rows = ((data ?? []) as TiMapEventRow[]) ?? [];
    const plannerCtaImpressions = countEvents(
      rows,
      "weekend_planner_contextual_cta_viewed",
      (row) => eventPropertyText(row, "source_page_type") === "tournament" && eventPropertyText(row, "cta_type") === "weekend_plan",
    );
    const plannerClicks = countEvents(
      rows,
      "weekend_planner_contextual_cta_clicked",
      (row) => eventPropertyText(row, "source_page_type") === "tournament" && eventPropertyText(row, "cta_type") === "weekend_plan",
    );
    const detailViews = countEvents(rows, "tournament_detail_page_viewed");
    const plannerEntries = countEvents(
      rows,
      "weekend_planner_entry_viewed",
      (row) => eventPropertyText(row, "entry_page_type") === "tournament" && eventPropertyText(row, "cta_type") === "weekend_plan",
    );
    const weekendSaveClicks = countEvents(rows, "weekend_plan_save_clicked");
    const weekendSaved = countEvents(rows, "weekend_plan_saved");
    const plannerViews = countEvents(rows, "weekend_planner_viewed");
    const loggedOutViews = countEvents(rows, "weekend_planner_viewed", (row) => eventPropertyText(row, "auth_state") === "signed_out");
    const createAccountClicks = countEvents(rows, "weekend_planner_create_account_clicked");
    const signInClicks = countEvents(rows, "weekend_planner_sign_in_clicked");
    const authRequiredViews = countEvents(rows, "weekend_planner_auth_gate_viewed");
    const authStarted = countEvents(rows, "weekend_planner_auth_started");
    const authCompleted = countEvents(rows, "weekend_planner_auth_completed");
    const plannerReady = countEvents(rows, "weekend_planner_ready");
    const meaningfulActivations = countEvents(rows, "weekend_planner_activation_achieved");
    const savePromptViewed = countEvents(rows, "weekend_planner_save_prompt_viewed");
    const claimStarted = countEvents(rows, "weekend_planner_anonymous_claim_started");
    const claimSucceeded = countEvents(rows, "weekend_planner_anonymous_claim_succeeded");
    const claimFailed = countEvents(rows, "weekend_planner_anonymous_claim_failed");
    const claimSkipped = countEvents(rows, "weekend_planner_anonymous_claim_skipped");
    const firstAuthenticatedActionAfterClaim = countEvents(rows, "weekend_planner_first_authenticated_action_after_claim");
    const plannerLoaded = countEvents(rows, "weekend_planner_loaded");
    const emptyStateViewed = countEvents(rows, "weekend_planner_empty_state_viewed");
    const manualEventsAdded = countEvents(rows, "planner_manual_event_created");
    const calendarFeedsConnected = countEvents(rows, "planner_calendar_feed_connect_succeeded");
    const guestSharesCreated = countEvents(rows, "planner_guest_share_created");
    const privateCalendarFeedsCreated = countEvents(rows, "planner_calendar_feed_created");
    const teamHotelLandingViews = countEvents(rows, "team_hotel_landing_viewed");
    const teamHotelHeaderViews = countEvents(rows, "team_hotel_header_cta_viewed");
    const teamHotelHeaderClicks = countEvents(rows, "team_hotel_header_cta_clicked");
    const teamHotelImpressions = countEvents(rows, "team_hotel_cta_viewed");
    const teamHotelClicks = countEvents(rows, "team_hotel_cta_clicked");
    const teamHotelStarts = countEvents(rows, "team_hotel_request_started");
    const teamHotelSubmitted = countEvents(rows, "team_hotel_request_submitted");
    const teamHotelSucceeded = countEvents(rows, "team_hotel_request_succeeded");
    const teamHotelFailed = countEvents(rows, "team_hotel_request_failed");
    const teamHotelLandingSessionKeys = new Set<string>();
    for (const row of rows) {
      if (row.event_name !== "team_hotel_landing_viewed") continue;
      const key = eventPropertyText(row, "session_id") || eventPropertyText(row, "anonymous_visitor_id");
      if (key) teamHotelLandingSessionKeys.add(key);
    }
    const acceptedRequestRows = ((acceptedRequestsResult.data ?? []) as LodgingSearchSessionRow[]) ?? [];
    const uniqueAcceptedKeys = new Set<string>();
    let qualifiedRequests = 0;
    for (const row of acceptedRequestRows) {
      const key = row.group_request_id || row.outbound_attribution_id;
      if (row.status === "succeeded" && key) uniqueAcceptedKeys.add(key);
      if (
        isQualifiedTeamHotelAcceptedRequest({
          status: row.status,
          group_request_id: row.group_request_id,
          outbound_attribution_id: row.outbound_attribution_id,
          search_query: row.search_query,
          tournament_id: row.tournament_id,
          venue_id: row.venue_id,
        })
      ) {
        qualifiedRequests += 1;
      }
    }
    const premiumViews = countEvents(rows, "premium_modal_viewed");
    const premiumClicks = countEvents(rows, "premium_cta_clicked");
    const plannerGateViews = countEvents(rows, "planner_weekend_pro_gate_viewed");
    const plannerGateClicks = countEvents(rows, "planner_weekend_pro_gate_clicked");
    const activations = manualEventsAdded + calendarFeedsConnected;

    const hotelHandoffsTotal = hotelHandoffs.total;
    const hotelBySurface = hotelHandoffs.bySurface;

    // Partial window detection: find earliest event timestamp in the window
    const windowStartMs = new Date(params.yesterdayStartUtcIso).getTime();
    let firstEventMs: number | null = null;
    for (const row of rows) {
      if (row.created_at) {
        const ms = new Date(row.created_at).getTime();
        if (firstEventMs === null || ms < firstEventMs) firstEventMs = ms;
      }
    }
    const hoursUntilFirstEvent = firstEventMs !== null ? (firstEventMs - windowStartMs) / (1000 * 60 * 60) : null;
    const partialWindowNote =
      rows.length === 0
        ? "No analytics events found in this window — tracking may not yet be active."
        : hoursUntilFirstEvent !== null && hoursUntilFirstEvent > 6
        ? `Analytics tracking started ~${Math.round(hoursUntilFirstEvent)}h into this window — counts are partial.`
        : null;

    const arrivalsBySource: Record<"tournament_detail" | "direct" | "unknown", number> = {
      tournament_detail: 0,
      direct: 0,
      unknown: 0,
    };
    const plannerSessionRows = new Map<string, TiMapEventRow[]>();
    const impressionsBySlug = new Map<string, number>();
    const clicksBySlug = new Map<string, number>();

    for (const row of rows) {
      const plannerSessionId = eventPropertyText(row, "planner_session_id");
      if (plannerSessionId) {
        const list = plannerSessionRows.get(plannerSessionId) ?? [];
        list.push(row);
        plannerSessionRows.set(plannerSessionId, list);
      }
      if (row.event_name === "weekend_planner_entry_viewed") {
        const entrySource = eventPropertyText(row, "entry_source");
        if (entrySource === "tournament_detail" || entrySource === "direct" || entrySource === "unknown") {
          arrivalsBySource[entrySource] += 1;
        } else {
          arrivalsBySource.unknown += 1;
        }
      }

      if (
        row.event_name === "weekend_planner_contextual_cta_viewed" &&
        eventPropertyText(row, "source_page_type") === "tournament" &&
        eventPropertyText(row, "cta_type") === "weekend_plan"
      ) {
        const slug = eventPropertyText(row, "tournament_slug");
        if (slug) impressionsBySlug.set(slug, (impressionsBySlug.get(slug) ?? 0) + 1);
      }

      if (
        row.event_name === "weekend_planner_contextual_cta_clicked" &&
        eventPropertyText(row, "source_page_type") === "tournament" &&
        eventPropertyText(row, "cta_type") === "weekend_plan"
      ) {
        const slug = eventPropertyText(row, "tournament_slug");
        if (slug) clicksBySlug.set(slug, (clicksBySlug.get(slug) ?? 0) + 1);
      }
    }

    const treatmentSessionIds = new Set<string>();
    const directSessionIds = new Set<string>();
    for (const [plannerSessionId, sessionRows] of plannerSessionRows) {
      const hasTournamentTreatmentEntry = sessionRows.some(
        (row) =>
          row.event_name === "weekend_planner_entry_viewed" &&
          eventPropertyText(row, "entry_source") === "tournament_detail" &&
          eventPropertyText(row, "experiment_variant") === "treatment",
      );
      const hasDirectEntry = sessionRows.some(
        (row) => row.event_name === "weekend_planner_entry_viewed" && eventPropertyText(row, "entry_source") === "direct",
      );
      if (hasTournamentTreatmentEntry) treatmentSessionIds.add(plannerSessionId);
      else if (hasDirectEntry) directSessionIds.add(plannerSessionId);
    }

    function countSessionsByEvent(sessionIds: Set<string>, matcher: (row: TiMapEventRow) => boolean) {
      let count = 0;
      for (const plannerSessionId of sessionIds) {
        const sessionRows = plannerSessionRows.get(plannerSessionId) ?? [];
        if (sessionRows.some(matcher)) count += 1;
      }
      return count;
    }

    const treatmentCtaSessions = countUniquePlannerSessions(
      rows,
      "weekend_planner_contextual_cta_clicked",
      (row) =>
        eventPropertyText(row, "source_page_type") === "tournament" &&
        eventPropertyText(row, "cta_type") === "weekend_plan" &&
        eventPropertyText(row, "experiment_variant") === "treatment",
    );
    const treatmentPlannerEntries = treatmentSessionIds.size;
    const treatmentPlannerReadySessions = countSessionsByEvent(treatmentSessionIds, (row) => row.event_name === "weekend_planner_ready");
    const treatmentEmptyStateSessions = countSessionsByEvent(treatmentSessionIds, (row) => row.event_name === "weekend_planner_empty_state_viewed");
    const treatmentFirstActionAvailableSessions = countSessionsByEvent(treatmentSessionIds, (row) => row.event_name === "weekend_planner_first_action_available");
    const treatmentFirstActionCtaViewedSessions = countSessionsByEvent(treatmentSessionIds, (row) => row.event_name === "weekend_planner_first_action_cta_viewed");
    const treatmentFirstActionCtaSessions = countSessionsByEvent(treatmentSessionIds, (row) => row.event_name === "weekend_planner_first_action_cta_clicked");
    const treatmentFormOpenedSessions = countSessionsByEvent(treatmentSessionIds, (row) => row.event_name === "weekend_planner_manual_event_form_opened");
    const treatmentFormStartedSessions = countSessionsByEvent(treatmentSessionIds, (row) => row.event_name === "weekend_planner_manual_event_form_started");
    const treatmentSubmittedSessions = countSessionsByEvent(treatmentSessionIds, (row) => row.event_name === "weekend_planner_manual_event_submitted");
    const treatmentPersistedSessions = countSessionsByEvent(treatmentSessionIds, (row) => row.event_name === "weekend_planner_temporary_event_persisted");
    const treatmentActivatedSessions = countSessionsByEvent(
      treatmentSessionIds,
      (row) => row.event_name === "weekend_planner_first_meaningful_action" || row.event_name === "weekend_planner_activation_achieved",
    );
    const treatmentSavePromptSessions = countSessionsByEvent(treatmentSessionIds, (row) => row.event_name === "weekend_planner_save_prompt_viewed");

    const directEntrySessions = directSessionIds.size;
    const directAuthGateSessions = countSessionsByEvent(directSessionIds, (row) => row.event_name === "weekend_planner_auth_gate_viewed");
    const directAuthStartedSessions = countSessionsByEvent(directSessionIds, (row) => row.event_name === "weekend_planner_auth_started");
    const directAuthCompletedSessions = countSessionsByEvent(directSessionIds, (row) => row.event_name === "weekend_planner_auth_completed");
    const directReadySessions = countSessionsByEvent(
      directSessionIds,
      (row) => row.event_name === "weekend_planner_ready" || row.event_name === "weekend_planner_loaded",
    );
    const directActivatedSessions = countSessionsByEvent(
      directSessionIds,
      (row) => row.event_name === "weekend_planner_first_meaningful_action" || row.event_name === "weekend_planner_activation_achieved",
    );

    const tournamentTreatmentFunnel = [
      { label: "CTA impressions", rawEvents: plannerCtaImpressions, uniqueSessions: 0, conversionFromPrior: "n/a" },
      { label: "Unique CTA sessions", rawEvents: plannerClicks, uniqueSessions: treatmentCtaSessions, conversionFromPrior: formatRatioPercent(treatmentCtaSessions, plannerCtaImpressions) },
      { label: "Tournament-attributed planner entries", rawEvents: plannerEntries, uniqueSessions: treatmentPlannerEntries, conversionFromPrior: formatRatioPercent(treatmentPlannerEntries, treatmentCtaSessions) },
      { label: "Planner-ready sessions", rawEvents: plannerReady, uniqueSessions: treatmentPlannerReadySessions, conversionFromPrior: formatRatioPercent(treatmentPlannerReadySessions, treatmentPlannerEntries) },
      { label: "First-action available sessions", rawEvents: countEvents(rows, "weekend_planner_first_action_available"), uniqueSessions: treatmentFirstActionAvailableSessions, conversionFromPrior: formatRatioPercent(treatmentFirstActionAvailableSessions, treatmentPlannerReadySessions) },
      { label: "First-action CTA viewed sessions", rawEvents: countEvents(rows, "weekend_planner_first_action_cta_viewed"), uniqueSessions: treatmentFirstActionCtaViewedSessions, conversionFromPrior: formatRatioPercent(treatmentFirstActionCtaViewedSessions, treatmentFirstActionAvailableSessions) },
      { label: "First-action CTA sessions", rawEvents: countEvents(rows, "weekend_planner_first_action_cta_clicked"), uniqueSessions: treatmentFirstActionCtaSessions, conversionFromPrior: formatRatioPercent(treatmentFirstActionCtaSessions, treatmentFirstActionAvailableSessions) },
      { label: "Form-open sessions", rawEvents: countEvents(rows, "weekend_planner_manual_event_form_opened"), uniqueSessions: treatmentFormOpenedSessions, conversionFromPrior: formatRatioPercent(treatmentFormOpenedSessions, treatmentFirstActionCtaSessions) },
      { label: "Form-start sessions", rawEvents: countEvents(rows, "weekend_planner_manual_event_form_started"), uniqueSessions: treatmentFormStartedSessions, conversionFromPrior: formatRatioPercent(treatmentFormStartedSessions, treatmentFormOpenedSessions) },
      { label: "Submitted sessions", rawEvents: countEvents(rows, "weekend_planner_manual_event_submitted"), uniqueSessions: treatmentSubmittedSessions, conversionFromPrior: formatRatioPercent(treatmentSubmittedSessions, treatmentFormStartedSessions) },
      { label: "Persisted-event sessions", rawEvents: countEvents(rows, "weekend_planner_temporary_event_persisted"), uniqueSessions: treatmentPersistedSessions, conversionFromPrior: formatRatioPercent(treatmentPersistedSessions, treatmentSubmittedSessions) },
      { label: "Activated sessions", rawEvents: meaningfulActivations, uniqueSessions: treatmentActivatedSessions, conversionFromPrior: formatRatioPercent(treatmentActivatedSessions, treatmentPersistedSessions) },
      { label: "Save-prompt sessions", rawEvents: savePromptViewed, uniqueSessions: treatmentSavePromptSessions, conversionFromPrior: formatRatioPercent(treatmentSavePromptSessions, treatmentPersistedSessions) },
      { label: "Empty-state sessions", rawEvents: emptyStateViewed, uniqueSessions: treatmentEmptyStateSessions, conversionFromPrior: formatRatioPercent(treatmentEmptyStateSessions, treatmentPlannerReadySessions) },
    ];

    const directPlannerFunnel = [
      { label: "Direct entries", rawEvents: plannerEntries, uniqueSessions: directEntrySessions, conversionFromPrior: "n/a" },
      { label: "Auth-gate sessions", rawEvents: authRequiredViews, uniqueSessions: directAuthGateSessions, conversionFromPrior: formatRatioPercent(directAuthGateSessions, directEntrySessions) },
      { label: "Auth-start sessions", rawEvents: authStarted, uniqueSessions: directAuthStartedSessions, conversionFromPrior: formatRatioPercent(directAuthStartedSessions, directAuthGateSessions) },
      { label: "Auth-complete sessions", rawEvents: authCompleted, uniqueSessions: directAuthCompletedSessions, conversionFromPrior: formatRatioPercent(directAuthCompletedSessions, directAuthStartedSessions) },
      { label: "Planner-ready sessions", rawEvents: plannerReady + plannerLoaded, uniqueSessions: directReadySessions, conversionFromPrior: formatRatioPercent(directReadySessions, directAuthCompletedSessions) },
      { label: "Activated sessions", rawEvents: meaningfulActivations, uniqueSessions: directActivatedSessions, conversionFromPrior: formatRatioPercent(directActivatedSessions, directReadySessions) },
    ];

    const topTournamentPages = Array.from(new Set([...impressionsBySlug.keys(), ...clicksBySlug.keys()]))
      .map((tournamentSlug) => {
        const impressions = impressionsBySlug.get(tournamentSlug) ?? 0;
        const clicks = clicksBySlug.get(tournamentSlug) ?? 0;
        return {
          tournamentSlug,
          impressions,
          clicks,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
        };
      })
      .filter((row) => row.impressions > 0 || row.clicks > 0)
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.tournamentSlug.localeCompare(b.tournamentSlug))
      .slice(0, 5);

    const healthSummary: HealthItem[] = [
      {
        status: detailViews > 0 ? "ok" : "warn",
        label: "Tournament traffic",
        detail: detailViews > 0 ? `${formatInt(detailViews)} detail views` : "No tournament detail views recorded",
      },
      {
        status: plannerCtaImpressions > 0 ? "ok" : detailViews > 100 ? "warn" : "neutral",
        label: "Planner CTA",
        detail:
          plannerCtaImpressions > 0
            ? `${formatInt(plannerCtaImpressions)} impressions (${formatRatioPercent(plannerCtaImpressions, detailViews)} of detail views)`
            : detailViews > 100
            ? "Zero impressions despite healthy traffic — CTA may not be rendering"
            : "No data",
      },
      {
        status: meaningfulActivations > 0 || activations > 0 ? "ok" : "warn",
        label: "Planner activations",
        detail:
          meaningfulActivations > 0
            ? `${formatInt(meaningfulActivations)} meaningful activations`
            : activations > 0
            ? `${formatInt(activations)} legacy activations (manual events + calendar connects)`
            : "Zero activations",
      },
      {
        status: hotelHandoffsTotal > 0 ? "ok" : "neutral",
        label: "Hotel handoffs",
        detail: hotelHandoffsTotal > 0 ? `${formatInt(hotelHandoffsTotal)} /go/hotels clicks` : "Zero HotelPlanner handoffs",
      },
      {
        status: uniqueAcceptedKeys.size > 0 ? "ok" : "neutral",
        label: "Team hotel requests",
        detail:
          uniqueAcceptedKeys.size > 0
            ? `${formatInt(uniqueAcceptedKeys.size)} unique accepted`
            : teamHotelSubmitted > 0
            ? `${formatInt(teamHotelSubmitted)} accepted events`
            : "Zero team hotel block requests",
      },
    ];

    const alerts: string[] = [];
    if (detailViews > 100 && plannerEntries === 0) {
      alerts.push("Tournament traffic is healthy but canonical Weekend Planner entries are zero — analytics may be partial or the entry route may be inaccessible.");
    }
    if (detailViews > 100 && plannerCtaImpressions === 0) {
      alerts.push("Tournament detail views are healthy but Planning CTA impressions are zero — the CTA may not be rendering.");
    }
    if (plannerCtaImpressions >= 100 && plannerClicks / Math.max(plannerCtaImpressions, 1) < 0.005) {
      alerts.push("Planning CTA CTR is below 0.5% on 100+ impressions.");
    }
    if (emptyStateViewed > 0 && manualEventsAdded === 0) {
      alerts.push("Planner empty-state views occurred but no manual events were added.");
    }
    if (weekendSaveClicks > 0 && weekendSaved === 0) {
      alerts.push("Weekend plan save clicks occurred but no successful weekend plan saves were tracked.");
    }
    if (teamHotelClicks > 0 && teamHotelStarts === 0) {
      alerts.push("Team hotel CTA clicks occurred but no team hotel form starts were tracked.");
    }
    if (teamHotelSubmitted > 0 && uniqueAcceptedKeys.size === 0) {
      alerts.push("Team hotel accepted-request analytics fired but no authoritative accepted request rows were found.");
    }
    if (plannerEntries > 0 && authRequiredViews >= Math.ceil(plannerEntries * 0.5)) {
      alerts.push("Planner auth-gate views are high relative to canonical planner entries.");
    }
    if (claimStarted > 0 && claimSucceeded === 0 && claimFailed > 0) {
      alerts.push("Anonymous planner claim attempts failed without any successful claims.");
    }

    const missingTracking = [
      "new planner users",
      "returning planner users",
      "calendar feed connect starts",
      "Weekend Planner opens from weekend flow",
      "activated users/events after weekend flow",
      "activation by source",
    ];

    return {
      ok: true,
      windowLabel,
      activations,
      planClicks: plannerClicks,
      teamHotelRequests: teamHotelSubmitted,
      snapshot: {
        totalActivations: activations,
        meaningfulActivations,
        plannerViews,
        plannerReady,
        plannerLoaded,
        newPlannerUsers: "not tracked",
        returningPlannerUsers: "not tracked",
      },
      tournamentFunnel: {
        detailViews,
        plannerCtaImpressions,
        plannerClicks,
        plannerEntries,
        plannerAuthGateViews: authRequiredViews,
        plannerAuthStarts: authStarted,
        plannerAuthCompletions: authCompleted,
        weekendSaveClicks,
        weekendSaved,
        plannerOpensFromWeekendFlow: "not tracked",
        activatedAfterWeekendFlow: "not tracked",
      },
      directEntry: {
        plannerViews,
        loggedOutViews,
        createAccountClicks,
        signInClicks,
        authRequiredViews,
        authStarted,
        authCompleted,
        savePromptViewed,
        claimStarted,
        claimSucceeded,
        claimFailed,
        claimSkipped,
        plannerLoaded,
        emptyStateViewed,
        calendarConnectStarts: "not tracked",
        manualEventsAdded,
        calendarFeedsConnected,
      },
      tournamentTreatmentFunnel,
      directPlannerFunnel,
      firstActions: {
        meaningfulActivations,
        manualEventsAdded,
        calendarFeedsConnected,
        weekendPlansSaved: weekendSaved,
        guestSharesCreated,
        privateCalendarFeedsCreated,
        firstAuthenticatedActionAfterClaim,
      },
      activationBySource: {
        tracked: true,
        arrivalsBySource,
      },
      teamHotel: {
        landingViews: teamHotelLandingViews,
        uniqueLandingSessions: teamHotelLandingSessionKeys.size,
        headerViews: teamHotelHeaderViews,
        headerClicks: teamHotelHeaderClicks,
        ctaImpressions: teamHotelImpressions,
        ctaClicks: teamHotelClicks,
        formStarts: teamHotelStarts,
        requestsSubmitted: teamHotelSubmitted,
        uniqueAcceptedRequests: uniqueAcceptedKeys.size,
        qualifiedRequests,
        requestsSucceeded: teamHotelSucceeded,
        requestsFailed: teamHotelFailed,
      },
      weekendProInterest: {
        gateViews: plannerGateViews,
        gateClicks: plannerGateClicks,
        premiumViews,
        premiumClicks,
      },
      topTournamentPages,
      hotelHandoffs: { total: hotelHandoffsTotal, bySurface: hotelBySurface, uncapped: true },
      partialWindowNote,
      healthSummary,
      alerts,
      missingTracking,
    };
  } catch (error: any) {
    return {
      ok: false,
      windowLabel,
      error: String(error?.message ?? error ?? "unknown_error"),
    };
  }
}

function renderWeekendPlannerSummaryHtml(params: {
  summary: WeekendPlannerDailySummary | null;
  weekendProCheckouts?: { total: number; yesterday: number } | null;
  weekendPassPurchases?: { total: number; yesterday: number } | null;
}) {
  const { summary, weekendProCheckouts, weekendPassPurchases } = params;
  if (!summary) return "";
  if (!summary.ok) {
    return renderSectionCard(
      "Weekend Planner",
      `Daily operator summary for ${summary.windowLabel}`,
      `<div style="color:#b91c1c;font-weight:800;">Error loading Weekend Planner metrics: ${htmlEscape(summary.error)}</div>`,
    );
  }

  const healthIcon: Record<HealthStatus, string> = { ok: "✅", warn: "⚠️", neutral: "—" };
  const healthBlockHtml = `<div style="margin-bottom:8px;padding:10px 12px;background:#f1f5f9;border-radius:8px;font-size:13px;line-height:1.6;">
    ${summary.healthSummary
      .map(
        (item) =>
          `<div><span style="margin-right:6px;">${healthIcon[item.status]}</span><strong>${htmlEscape(item.label)}:</strong> ${htmlEscape(item.detail)}</div>`,
      )
      .join("")}
    ${summary.partialWindowNote ? `<div style="margin-top:6px;color:#92400e;font-size:12px;">⚠️ ${htmlEscape(summary.partialWindowNote)}</div>` : ""}
  </div>`;

  const snapshotHtml = renderMetricRows([
    { label: "Date window", value: summary.windowLabel },
    { label: "Activation events", value: summary.snapshot.totalActivations, note: "manual event + calendar connect" },
    { label: "Meaningful activations", value: summary.snapshot.meaningfulActivations, note: "first user-created planner item" },
    { label: "Weekend Planner route views", value: summary.snapshot.plannerViews },
    { label: "Planner ready", value: summary.snapshot.plannerReady },
    { label: "Planner loaded", value: summary.snapshot.plannerLoaded },
    { label: "New planner users", value: summary.snapshot.newPlannerUsers },
    { label: "Returning planner users", value: summary.snapshot.returningPlannerUsers },
  ]);

  const tournamentFunnelHtml = renderMetricRows([
    { label: "Tournament detail views", value: summary.tournamentFunnel.detailViews },
    { label: "Planning CTA impressions", value: summary.tournamentFunnel.plannerCtaImpressions },
    {
      label: "`Plan this tournament` clicks",
      value: summary.tournamentFunnel.plannerClicks,
      note: formatRatioPercent(summary.tournamentFunnel.plannerClicks, summary.tournamentFunnel.plannerCtaImpressions),
    },
    {
      label: "Canonical planner entries",
      value: summary.tournamentFunnel.plannerEntries,
      note: "raw events only; see treatment funnel below",
    },
    {
      label: "Planner auth-gate views",
      value: summary.tournamentFunnel.plannerAuthGateViews,
      note: "mixed traffic; see direct funnel below",
    },
    {
      label: "Planner auth starts",
      value: summary.tournamentFunnel.plannerAuthStarts,
      note: formatRatioPercent(summary.tournamentFunnel.plannerAuthStarts, summary.tournamentFunnel.plannerAuthGateViews),
    },
    {
      label: "Planner auth completions",
      value: summary.tournamentFunnel.plannerAuthCompletions,
      note: formatRatioPercent(summary.tournamentFunnel.plannerAuthCompletions, summary.tournamentFunnel.plannerAuthStarts),
    },
    { label: "Weekend plan save clicks", value: summary.tournamentFunnel.weekendSaveClicks },
    {
      label: "Weekend plan saves",
      value: summary.tournamentFunnel.weekendSaved,
      note: formatRatioPercent(summary.tournamentFunnel.weekendSaved, summary.tournamentFunnel.plannerEntries),
    },
    { label: "Planner opens from weekend flow", value: summary.tournamentFunnel.plannerOpensFromWeekendFlow },
    { label: "Activated after weekend flow", value: summary.tournamentFunnel.activatedAfterWeekendFlow },
    { label: "Planner activation rate", value: formatRatioPercent(summary.firstActions.meaningfulActivations, summary.snapshot.plannerReady) },
    { label: "End-to-end activation", value: "see treatment funnel below" },
  ]);

  const directEntryHtml = renderMetricRows([
    { label: "`/weekend-planner` views", value: summary.directEntry.plannerViews },
    { label: "Logged-out planner views", value: summary.directEntry.loggedOutViews },
    { label: "Create account clicks", value: summary.directEntry.createAccountClicks },
    { label: "Sign in clicks", value: summary.directEntry.signInClicks },
    { label: "Canonical auth-gate views", value: summary.directEntry.authRequiredViews },
    { label: "Canonical auth starts", value: summary.directEntry.authStarted },
    { label: "Canonical auth completions", value: summary.directEntry.authCompleted },
    { label: "Save prompt viewed", value: summary.directEntry.savePromptViewed },
    { label: "Anonymous claim started", value: summary.directEntry.claimStarted },
    { label: "Anonymous claim succeeded", value: summary.directEntry.claimSucceeded },
    { label: "Anonymous claim failed", value: summary.directEntry.claimFailed },
    { label: "Anonymous claim skipped", value: summary.directEntry.claimSkipped },
    {
      label: "Planner loaded",
      value: summary.directEntry.plannerLoaded,
      note: formatRatioPercent(summary.directEntry.plannerLoaded, summary.directEntry.authCompleted),
    },
    { label: "Empty planner state viewed", value: summary.directEntry.emptyStateViewed },
    { label: "Calendar feed connect starts", value: summary.directEntry.calendarConnectStarts },
    {
      label: "Manual events added",
      value: summary.directEntry.manualEventsAdded,
      note: formatRatioPercent(summary.directEntry.manualEventsAdded, summary.directEntry.plannerLoaded),
    },
    {
      label: "Calendar feeds connected",
      value: summary.directEntry.calendarFeedsConnected,
      note: formatRatioPercent(summary.directEntry.calendarFeedsConnected, summary.directEntry.plannerLoaded),
    },
  ]);

  const treatmentFunnelHtml = renderFunnelRows(summary.tournamentTreatmentFunnel);
  const directFunnelHtml = renderFunnelRows(summary.directPlannerFunnel);

  const firstActionsHtml = renderMetricRows([
    { label: "Meaningful activations", value: summary.firstActions.meaningfulActivations },
    { label: "Manual events added", value: summary.firstActions.manualEventsAdded },
    { label: "Calendar feeds connected", value: summary.firstActions.calendarFeedsConnected },
    { label: "Weekend plans saved", value: summary.firstActions.weekendPlansSaved },
    { label: "Guest shares created", value: summary.firstActions.guestSharesCreated },
    { label: "Private calendar feeds created", value: summary.firstActions.privateCalendarFeedsCreated },
    { label: "First authenticated action after claim", value: summary.firstActions.firstAuthenticatedActionAfterClaim },
  ]);

  const activationBySourceHtml = renderMetricRows([
    { label: "Activation by source", value: "entry tracked", note: "based on canonical planner entry attribution" },
    { label: "Planner entries from tournament detail", value: summary.activationBySource.arrivalsBySource.tournament_detail },
    { label: "Planner entries direct", value: summary.activationBySource.arrivalsBySource.direct },
    { label: "Planner entries unknown", value: summary.activationBySource.arrivalsBySource.unknown },
  ]);

  const hotelHandoffRows: Array<{ label: string; value: number | string; note?: string }> = [
    { label: "/go/hotels handoffs (HotelPlanner)", value: summary.hotelHandoffs.total, note: summary.hotelHandoffs.uncapped ? "uncapped total" : "capped" },
  ];
  for (const [surface, count] of Object.entries(summary.hotelHandoffs.bySurface).sort((a, b) => b[1] - a[1])) {
    hotelHandoffRows.push({
      label: `  ↳ ${surface}`,
      value: count,
      note: formatRatioPercent(count, summary.hotelHandoffs.total),
    });
  }
  const hotelHandoffsHtml = renderMetricRows(hotelHandoffRows);

  const teamHotelHtml = renderMetricRows([
    { label: "Team hotel landing raw views", value: summary.teamHotel.landingViews },
    { label: "Team hotel landing unique sessions", value: summary.teamHotel.uniqueLandingSessions },
    { label: "Team Travel header impressions", value: summary.teamHotel.headerViews },
    { label: "Team Travel header clicks", value: summary.teamHotel.headerClicks, note: formatRatioPercent(summary.teamHotel.headerClicks, summary.teamHotel.headerViews) },
    { label: "Team hotel CTA impressions", value: summary.teamHotel.ctaImpressions },
    {
      label: "Team hotel CTA clicks",
      value: summary.teamHotel.ctaClicks,
      note: formatRatioPercent(summary.teamHotel.ctaClicks, summary.teamHotel.ctaImpressions),
    },
    { label: "Team hotel form starts", value: summary.teamHotel.formStarts },
    { label: "Team hotel accepted-request events", value: summary.teamHotel.requestsSubmitted },
    { label: "Team hotel unique accepted requests", value: summary.teamHotel.uniqueAcceptedRequests },
    { label: "Team hotel qualified requests", value: summary.teamHotel.qualifiedRequests },
    { label: "Team hotel requests succeeded", value: summary.teamHotel.requestsSucceeded },
    { label: "Team hotel requests failed", value: summary.teamHotel.requestsFailed },
  ]);

  const weekendProHtml = renderMetricRows([
    { label: "Planner Weekend Pro gate views", value: summary.weekendProInterest.gateViews },
    { label: "Planner Weekend Pro gate clicks", value: summary.weekendProInterest.gateClicks },
    { label: "Premium modal views", value: summary.weekendProInterest.premiumViews },
    { label: "Premium CTA clicks", value: summary.weekendProInterest.premiumClicks },
    { label: "Weekend Pro checkouts", value: Number(weekendProCheckouts?.yesterday ?? 0) || 0, note: "PT yesterday" },
    { label: "Founders Preview purchases", value: Number(weekendPassPurchases?.yesterday ?? 0) || 0, note: "PT yesterday" },
  ]);

  const topPagesHtml =
    summary.topTournamentPages.length > 0
      ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#ecfdf3;">
              <th style="text-align:left;padding:8px 10px;border-top:1px solid #d1fae5;border-bottom:1px solid #d1fae5;">Tournament</th>
              <th style="text-align:right;padding:8px 10px;border-top:1px solid #d1fae5;border-bottom:1px solid #d1fae5;">Impressions</th>
              <th style="text-align:right;padding:8px 10px;border-top:1px solid #d1fae5;border-bottom:1px solid #d1fae5;">Clicks</th>
              <th style="text-align:right;padding:8px 10px;border-top:1px solid #d1fae5;border-bottom:1px solid #d1fae5;">CTR</th>
            </tr>
          </thead>
          <tbody>
            ${summary.topTournamentPages
              .map(
                (row) => `<tr>
                  <td style="padding:8px 10px;border-top:1px solid #e5e7eb;">${htmlEscape(row.tournamentSlug)}</td>
                  <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;">${htmlEscape(formatInt(row.impressions))}</td>
                  <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;">${htmlEscape(formatInt(row.clicks))}</td>
                  <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;">${htmlEscape(
                    row.ctr == null ? "n/a" : `${row.ctr.toFixed(1)}%`,
                  )}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>`
      : `<div style="color:#64748b;font-size:13px;">No public tournament slug attribution was available yesterday.</div>`;

  const allZero = summary.snapshot.plannerViews === 0 && summary.tournamentFunnel.detailViews === 0;
  const alertsHtml =
    summary.alerts.length > 0
      ? `<ul style="margin:0;padding-left:18px;color:#92400e;font-size:13px;line-height:1.5;">${summary.alerts
          .map((alert) => `<li>${htmlEscape(alert)}</li>`)
          .join("")}</ul>`
      : allZero
      ? `<div style="color:#92400e;font-size:13px;">All metrics are zero — analytics tracking may not yet be active for this window.</div>`
      : `<div style="color:#166534;font-size:13px;">No threshold alerts triggered.</div>`;

  const missingTrackingHtml =
    summary.missingTracking.length > 0
      ? `<ul style="margin:0;padding-left:18px;color:#64748b;font-size:13px;line-height:1.5;">${summary.missingTracking
          .map((item) => `<li>${htmlEscape(item)}</li>`)
          .join("")}</ul>`
      : `<div style="color:#166534;font-size:13px;">No missing tracking noted.</div>`;

  return renderSectionCard(
    "Weekend Planner",
    `Daily operator summary for ${summary.windowLabel}. Treatment and direct-entry funnels below use unique planner_session_id where available.`,
    [
      healthBlockHtml,
      renderSectionCard("Snapshot", null, snapshotHtml),
      renderSectionCard("Tournament → Weekend Planner Funnel", null, tournamentFunnelHtml),
      renderSectionCard("Direct Weekend Planner Entry Funnel", null, directEntryHtml),
      renderSectionCard("Tournament Anonymous Planner Funnel", "Treatment-only funnel using unique planner_session_id denominators", treatmentFunnelHtml),
      renderSectionCard("Direct Planner Session Funnel", "Direct-entry funnel kept separate from tournament treatment traffic", directFunnelHtml),
      renderSectionCard("First Planner Actions", null, firstActionsHtml),
      renderSectionCard("Activation by Source", null, activationBySourceHtml),
      renderSectionCard("Individual Hotel Handoffs (HotelPlanner)", null, hotelHandoffsHtml),
      renderSectionCard("Team Hotel Blocks", null, teamHotelHtml),
      renderSectionCard("Weekend Pro Interest", null, weekendProHtml),
      renderSectionCard("Top Tournament Pages by Planner Clicks", null, topPagesHtml),
      renderSectionCard("Alerts / Anomalies", null, alertsHtml),
      renderSectionCard("Missing Tracking / Notes", null, missingTrackingHtml),
    ].join(""),
  );
}

function renderCampspotExperimentHtml(summary: CampspotExperimentSummary | null) {
  if (!summary) return "";
  if (!summary.ok) {
    return renderSectionCard(
      "Campspot Camping + RV Experiment",
      `TI-only affiliate metrics for ${summary.windowLabel}`,
      `<div style="color:#b91c1c;font-weight:800;">Metrics unavailable; the rest of this email is unaffected: ${htmlEscape(summary.error)}</div>`,
    );
  }
  const breakdownRows = (label: string, values: Record<string, number>, total: number) =>
    Object.entries(values)
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => ({ label: `${label}: ${key}`, value, note: formatRatioPercent(value, total) }));
  const metricRows = [
    { label: "Yesterday", value: summary.windowLabel },
    { label: "Eligible CTA impressions", value: summary.yesterday.impressions },
    { label: "Outbound affiliate clicks", value: summary.yesterday.outboundClicks, note: formatRatioPercent(summary.yesterday.outboundClicks, summary.yesterday.impressions) },
    { label: "Unique impression sessions", value: summary.yesterday.impressionSessions },
    { label: "Unique outbound sessions", value: summary.yesterday.outboundSessions },
    ...breakdownRows("Source", summary.yesterday.bySurface, summary.yesterday.outboundClicks),
    ...breakdownRows("Placement", summary.yesterday.byPlacement, summary.yesterday.outboundClicks),
    { label: "Missing outbound attribution ID", value: summary.yesterday.missing.attributionId },
    { label: "Missing session ID", value: summary.yesterday.missing.sessionId },
    { label: "Missing venue ID", value: summary.yesterday.missing.venueId },
    { label: "Trailing 7d impressions", value: summary.trailing7d.impressions },
    { label: "Trailing 7d outbound clicks", value: summary.trailing7d.outboundClicks, note: formatRatioPercent(summary.trailing7d.outboundClicks, summary.trailing7d.impressions) },
    { label: "Trailing 7d unique impression sessions", value: summary.trailing7d.impressionSessions },
    { label: "Trailing 7d unique outbound sessions", value: summary.trailing7d.outboundSessions },
    ...breakdownRows("Trailing 7d source", summary.trailing7d.bySurface, summary.trailing7d.outboundClicks),
    ...breakdownRows("Trailing 7d placement", summary.trailing7d.byPlacement, summary.trailing7d.outboundClicks),
    { label: "Trailing 7d missing outbound attribution ID", value: summary.trailing7d.missing.attributionId },
    { label: "Trailing 7d missing session ID", value: summary.trailing7d.missing.sessionId },
    { label: "Trailing 7d missing venue ID", value: summary.trailing7d.missing.venueId },
  ];
  return renderSectionCard(
    "Campspot Camping + RV Experiment",
    "TI-only. CTR is outbound clicks divided by eligible CTA impressions; both reporting windows use uncapped pagination.",
    renderMetricRows(metricRows),
  );
}

const SPORT_LABELS_ANY = TI_SPORT_LABELS as unknown as Record<string, string>;
function getSportLabel(sport: unknown) {
  const raw = typeof sport === "string" ? sport : "";
  const key = raw.trim().toLowerCase();
  return SPORT_LABELS_ANY[key] ?? raw ?? "Unknown";
}

type DashboardJson = {
  totals?: {
    total_previews?: number;
    sent_count?: number;
    replied_count?: number;
    reply_rate?: number | null;
    directors_contacted_count?: number;
    total_send_attempts?: number;
    needs_followup_count?: number;
  };
};

async function loadOutreachTotals(sport: string) {
  const { data, error } = await (supabaseAdmin.rpc("get_outreach_dashboard_metrics" as any, {
    p_sport: sport || null,
    p_campaign_id: null,
    p_start_after: null,
    p_start_before: null,
    p_followup_days: 7,
  }) as any);

  if (error) {
    return { sport, ok: false as const, error: error.message || String(error), totals: null as any };
  }

  const payload = (data ?? {}) as DashboardJson;
  return { sport, ok: true as const, error: null, totals: payload.totals ?? {} };
}

function formatDelta(value: unknown) {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(n) || n === 0) return "";
  return n > 0 ? `+${formatInt(n)}` : `-${formatInt(Math.abs(n))}`;
}

function renderTile(label: string, value: string, delta?: string, tone?: "neutral" | "info" | "warn" | "success") {
  const bg =
    tone === "warn" ? "#fef3c7" : tone === "success" ? "#ecfdf3" : tone === "info" ? "#eff6ff" : "#f8fafc";
  const border =
    tone === "warn" ? "#fde68a" : tone === "success" ? "#bbf7d0" : tone === "info" ? "#bfdbfe" : "#e2e8f0";
  const color =
    tone === "warn" ? "#92400e" : tone === "success" ? "#166534" : tone === "info" ? "#1d4ed8" : "#0f172a";

  const deltaHtml = delta
    ? `<div style="margin-top:4px;font-size:12px;color:#64748b;font-weight:800;">${htmlEscape(delta)} yesterday</div>`
    : `<div style="margin-top:4px;font-size:12px;color:#94a3b8;font-weight:700;">&nbsp;</div>`;

  return `<div style="border:1px solid ${border};background:${bg};border-radius:12px;padding:10px 12px;">
    <div style="font-size:11px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;">${htmlEscape(label)}</div>
    <div style="font-size:22px;font-weight:900;color:${color};margin-top:2px;line-height:1.1;">${htmlEscape(value)}</div>
    ${deltaHtml}
  </div>`;
}

function renderUsersTile(params: {
  insiderTotal: number;
  insiderNew: number;
  weekendTotal: number;
  weekendNew: number;
}) {
  const bg = "#ecfdf3";
  const border = "#bbf7d0";
  const color = "#166534";

  const insiderLine = `Insider: ${formatInt(params.insiderTotal)} ${formatDelta(params.insiderNew) ? `(${formatDelta(params.insiderNew)} yesterday)` : ""}`.trim();
  const weekendLine = `Weekend Pro: ${formatInt(params.weekendTotal)} ${formatDelta(params.weekendNew) ? `(${formatDelta(params.weekendNew)} yesterday)` : ""}`.trim();

  return `<div style="border:1px solid ${border};background:${bg};border-radius:12px;padding:10px 12px;">
    <div style="font-size:11px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;">TI users</div>
    <div style="font-size:14px;font-weight:900;color:${color};margin-top:6px;line-height:1.2;">${htmlEscape(insiderLine)}</div>
    <div style="font-size:14px;font-weight:900;color:${color};margin-top:6px;line-height:1.2;">${htmlEscape(weekendLine)}</div>
  </div>`;
}

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function startOfDayInTimeZone(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const year = Number(parts.find((p) => p.type === "year")?.value ?? NaN);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? NaN);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? NaN);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return startOfUtcDay(d);
  }

  // Start with an initial UTC guess for local midnight, then compute the time zone offset for that local date.
  const guessUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const offsetParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(guessUtc);
  const tzName = offsetParts.find((p) => p.type === "timeZoneName")?.value ?? "";
  const m = tzName.match(/GMT([+-]\d{2}):(\d{2})/);
  if (!m) return guessUtc;

  const sign = m[1].startsWith("-") ? -1 : 1;
  const hh = Math.abs(Number(m[1]));
  const mm = Number(m[2]);
  const offsetMinutes = sign * (hh * 60 + mm);
  return new Date(guessUtc.getTime() - offsetMinutes * 60 * 1000);
}

const INTERNAL_EMAIL_SUBSTRINGS = ["tournamentinsights", "rdtest1970"] as const;

async function loadInternalTiUserIds(): Promise<string[]> {
  const res = await supabaseAdmin
    .from("ti_users" as any)
    .select("id,email")
    .or(INTERNAL_EMAIL_SUBSTRINGS.map((s) => `email.ilike.%${s}%`).join(","));
  if (res.error) return [];
  return (res.data ?? []).map((r: any) => r.id).filter(Boolean);
}

async function loadTiUserCountsExcludingInternal(params: { todayStartUtcIso: string; yesterdayStartUtcIso: string }) {
  const internalIds = await loadInternalTiUserIds();
  const exclude = (query: any) => {
    if (!internalIds.length) return query;
    return query.not("id", "in", `(${internalIds.join(",")})`);
  };

  const [insiderTotalRes, insiderNewRes, weekendTotalRes, weekendNewRes] = await Promise.all([
    exclude(supabaseAdmin.from("ti_users" as any).select("id", { count: "exact", head: true }).eq("plan", "insider")),
    exclude(
      supabaseAdmin
        .from("ti_users" as any)
        .select("id", { count: "exact", head: true })
        .eq("plan", "insider")
        .gte("created_at", params.yesterdayStartUtcIso)
        .lt("created_at", params.todayStartUtcIso)
    ),
    exclude(supabaseAdmin.from("ti_users" as any).select("id", { count: "exact", head: true }).eq("plan", "weekend_pro")),
    exclude(
      supabaseAdmin
        .from("ti_users" as any)
        .select("id", { count: "exact", head: true })
        .eq("plan", "weekend_pro")
        .gte("created_at", params.yesterdayStartUtcIso)
        .lt("created_at", params.todayStartUtcIso)
    ),
  ]);

  return {
    internalIds,
    counts: {
      insider_total: insiderTotalRes.error ? 0 : insiderTotalRes.count ?? 0,
      insider_new_yesterday: insiderNewRes.error ? 0 : insiderNewRes.count ?? 0,
      weekend_pro_total: weekendTotalRes.error ? 0 : weekendTotalRes.count ?? 0,
      weekend_pro_new_yesterday: weekendNewRes.error ? 0 : weekendNewRes.count ?? 0,
    },
  };
}

async function loadWeekendProCheckoutCounts(params: {
  todayStartUtcIso: string;
  yesterdayStartUtcIso: string;
  internalUserIds: string[];
}) {
  const exclude = (query: any) => {
    if (!params.internalUserIds.length) return query;
    return query.not("user_id", "in", `(${params.internalUserIds.join(",")})`);
  };

  const totalRes = await exclude(
    supabaseAdmin
    .from("stripe_webhook_events" as any)
    .select("id", { count: "exact", head: true })
    .eq("event_type", "checkout.session.completed")
    .eq("status", "processed")
  );

  const yesterdayRes = await exclude(
    supabaseAdmin
    .from("stripe_webhook_events" as any)
    .select("id", { count: "exact", head: true })
    .eq("event_type", "checkout.session.completed")
    .eq("status", "processed")
    .gte("created_at", params.yesterdayStartUtcIso)
    .lt("created_at", params.todayStartUtcIso)
  );

  return {
    total: totalRes.error ? 0 : totalRes.count ?? 0,
    yesterday: yesterdayRes.error ? 0 : yesterdayRes.count ?? 0,
    errors: {
      total: totalRes.error ? totalRes.error.message : null,
      yesterday: yesterdayRes.error ? yesterdayRes.error.message : null,
    },
  };
}

async function loadWeekendPassPurchaseCounts(params: {
  todayStartUtcIso: string;
  yesterdayStartUtcIso: string;
  internalUserIds: string[];
}) {
  const exclude = (query: any) => {
    if (!params.internalUserIds.length) return query;
    return query.not("user_id", "in", `(${params.internalUserIds.join(",")})`);
  };

  const base = () =>
    exclude(
      supabaseAdmin
        .from("ti_entitlement_grants" as any)
        .select("id", { count: "exact", head: true })
        .eq("offer", "weekend_pass_30d")
    );

  const [totalRes, yesterdayRes] = await Promise.all([
    base(),
    base().gte("created_at", params.yesterdayStartUtcIso).lt("created_at", params.todayStartUtcIso),
  ]);

  const relationMissing =
    String(totalRes.error?.message ?? "")
      .toLowerCase()
      .includes("does not exist") ||
    String(yesterdayRes.error?.message ?? "")
      .toLowerCase()
      .includes("does not exist");

  if (relationMissing) {
    return {
      total: 0,
      yesterday: 0,
      errors: { total: "missing_table", yesterday: "missing_table" },
    };
  }

  return {
    total: totalRes.error ? 0 : totalRes.count ?? 0,
    yesterday: yesterdayRes.error ? 0 : yesterdayRes.count ?? 0,
    errors: {
      total: totalRes.error ? totalRes.error.message : null,
      yesterday: yesterdayRes.error ? yesterdayRes.error.message : null,
    },
  };
}

function buildEmailHtml(params: {
  generatedAtIso: string;
  totalsBySport: Array<ReturnType<typeof loadOutreachTotals> extends Promise<infer T> ? T : never>;
  baseUrl: string;
  includeRiSummary: boolean;
  riSummary?: Awaited<ReturnType<typeof loadRiSummaryCounts>> | null;
  includeLowestStates: boolean;
  lowestStates?: Awaited<ReturnType<typeof loadLowestStates>> | null;
  includeTiles: boolean;
  includeSportTiles: boolean;
  tiles?: Awaited<ReturnType<typeof loadAdminDashboardEmailTiles>> | null;
  weekendProCheckouts?: { total: number; yesterday: number } | null;
  weekendPassPurchases?: { total: number; yesterday: number } | null;
  weekendPlannerSummary?: WeekendPlannerDailySummary | null;
  campspotExperimentSummary?: CampspotExperimentSummary | null;
}) {
  const {
    generatedAtIso,
    totalsBySport,
    baseUrl,
    includeRiSummary,
    riSummary,
    includeLowestStates,
    lowestStates,
    includeTiles,
    includeSportTiles,
    tiles,
    weekendProCheckouts,
    weekendPassPurchases,
    weekendPlannerSummary,
    campspotExperimentSummary,
  } = params;
  const dashboardUrl = `${baseUrl}/admin/outreach-dashboard`;

  const dbTotal = Number((tiles as any)?.tournaments_db?.total ?? 0) || 0;
  const publishedTotal = Number((tiles as any)?.public_directory?.total ?? tiles?.canonical?.total ?? 0) || 0;
  const publishedNew = Number(
    (tiles as any)?.public_directory?.new_yesterday_pt ??
      (tiles as any)?.public_directory?.new_yesterday ??
      (tiles as any)?.canonical?.new_yesterday_pt ??
      tiles?.canonical?.new_yesterday ??
      0
  ) || 0;
  const missingVenuesTotal = Number(tiles?.missing_venues?.total ?? 0) || 0;
  const missingVenuesNew = Number((tiles as any)?.missing_venues?.new_yesterday_pt ?? tiles?.missing_venues?.new_yesterday ?? 0) || 0;
  const owlsEyeTotal = Number(tiles?.owls_eye?.venues_reviewed_total ?? 0) || 0;
  const owlsEyeNew =
    Number((tiles as any)?.owls_eye?.venues_reviewed_new_yesterday_pt ?? tiles?.owls_eye?.venues_reviewed_new_yesterday ?? 0) || 0;
  const venueCheckTotal = Number(tiles?.venue_check?.submissions_total ?? 0) || 0;
  const venueCheckNew =
    Number((tiles as any)?.venue_check?.submissions_new_yesterday_pt ?? tiles?.venue_check?.submissions_new_yesterday ?? 0) || 0;
  const tiInsiderTotal = Number(tiles?.ti_users?.insider_total ?? 0) || 0;
  const tiInsiderNew = Number((tiles as any)?.ti_users?.insider_new_yesterday_pt ?? tiles?.ti_users?.insider_new_yesterday ?? 0) || 0;
  const tiWeekendTotal = Number(tiles?.ti_users?.weekend_pro_total ?? 0) || 0;
  const tiWeekendNew =
    Number((tiles as any)?.ti_users?.weekend_pro_new_yesterday_pt ?? tiles?.ti_users?.weekend_pro_new_yesterday ?? 0) || 0;
  const weekendProCheckoutsTotal = Number(weekendProCheckouts?.total ?? 0) || 0;
  const weekendProCheckoutsYesterday = Number(weekendProCheckouts?.yesterday ?? 0) || 0;
  const weekendPassPurchasesTotal = Number(weekendPassPurchases?.total ?? 0) || 0;
  const weekendPassPurchasesYesterday = Number(weekendPassPurchases?.yesterday ?? 0) || 0;

  const bySport: PublicDirectoryBySportRow[] = (Array.isArray((tiles as any)?.public_directory?.by_sport)
    ? ((tiles as any)?.public_directory?.by_sport ?? [])
    : Array.isArray(tiles?.canonical?.by_sport)
    ? tiles?.canonical?.by_sport ?? []
    : []) as PublicDirectoryBySportRow[];

  const sportTilesHtml =
    includeSportTiles
      ? (() => {
          const rows = TI_SPORTS.map((sport) => {
            const hit = bySport.find((r: PublicDirectoryBySportRow) => String(r.sport).toLowerCase() === sport);
            return {
              sport,
              total: Number(hit?.total ?? 0) || 0,
              new_yesterday: Number((hit as any)?.new_yesterday_pt ?? hit?.new_yesterday ?? 0) || 0,
            };
          }).sort((a, b) => b.total - a.total || a.sport.localeCompare(b.sport));

          if (rows.length === 0) return "";

          return `<div style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;">
            ${rows
              .map((row) =>
                renderTile(
                  getSportLabel(row.sport),
                  formatInt(row.total),
                  row.new_yesterday === 0 ? "0" : formatDelta(row.new_yesterday),
                  "neutral"
                )
              )
              .join("")}
          </div>`;
        })()
      : "";

  const heatmapHtml =
    includeTiles && tiles
      ? (() => {
          const tilesUrl = `${baseUrl}/api/admin-dashboard-email/heatmap?scope=public_directory&v=${encodeURIComponent(
            generatedAtIso.slice(0, 10),
          )}`;
          const mapUrl = `${baseUrl}/api/admin-dashboard-email/heatmap-us?scope=public_directory&v=${encodeURIComponent(
            generatedAtIso.slice(0, 10),
          )}`;
          const interactiveUrl = `${baseUrl}/heatmap?sport=all`;
          return `<div style="margin-top:16px;border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#ffffff;">
            <div style="font-size:12px;color:#64748b;font-weight:900;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">
              Tournament heatmap (US)
            </div>
            <img
              src="${tilesUrl}"
              alt="US Tournament Map (tiles)"
              width="640"
              style="display:block;width:100%;max-width:640px;height:auto;border-radius:12px;border:1px solid #e2e8f0;"
            />
            <div style="height:10px;"></div>
            <img
              src="${mapUrl}"
              alt="US Tournament Map (map)"
              width="640"
              style="display:block;width:100%;max-width:640px;height:auto;border-radius:12px;border:1px solid #e2e8f0;"
            />
            <div style="margin-top:10px;font-size:12px;">
              <a href="${interactiveUrl}" style="color:#1d4ed8;text-decoration:underline;">Open interactive heatmap</a>
            </div>
          </div>`;
        })()
      : "";

  const weekendPlannerHtml = renderWeekendPlannerSummaryHtml({
    summary: weekendPlannerSummary ?? null,
    weekendProCheckouts: weekendProCheckouts ?? null,
    weekendPassPurchases: weekendPassPurchases ?? null,
  });
  const campspotExperimentHtml = renderCampspotExperimentHtml(campspotExperimentSummary ?? null);

  const tilesHtml =
    includeTiles && tiles
      ? `<div style="margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;">
          ${renderTile("Total tournaments in DB", formatInt(dbTotal), "", "info")}
          ${renderTile("Published (public directory, PT yesterday)", formatInt(publishedTotal), formatDelta(publishedNew), "info")}
          ${renderTile("Missing venues", formatInt(missingVenuesTotal), formatDelta(missingVenuesNew), "warn")}
          ${renderTile("Owl's Eye venues reviewed", formatInt(owlsEyeTotal), formatDelta(owlsEyeNew), "success")}
          ${renderTile("Venue Check submissions", formatInt(venueCheckTotal), formatDelta(venueCheckNew), "success")}
          ${renderTile("Weekend Pro checkouts (PT yesterday)", formatInt(weekendProCheckoutsTotal), formatDelta(weekendProCheckoutsYesterday), "success")}
          ${renderTile(
            "Founders Preview purchases (PT yesterday)",
            formatInt(weekendPassPurchasesTotal),
            formatDelta(weekendPassPurchasesYesterday),
            "success"
          )}
          ${renderUsersTile({ insiderTotal: tiInsiderTotal, insiderNew: tiInsiderNew, weekendTotal: tiWeekendTotal, weekendNew: tiWeekendNew })}
        </div>
        ${weekendPlannerHtml}
        ${campspotExperimentHtml}
        ${sportTilesHtml}
        ${heatmapHtml}`
      : `${weekendPlannerHtml}${campspotExperimentHtml}`;

  const rows = totalsBySport
    .map((row) => {
      if (!row.ok) {
        return `<tr>
          <td style="padding:8px 10px;border-top:1px solid #e5e7eb;"><strong>${htmlEscape(
            getSportLabel(row.sport)
          )}</strong></td>
          <td style="padding:8px 10px;border-top:1px solid #e5e7eb;" colspan="6">
            <span style="color:#b91c1c;">Error: ${htmlEscape(row.error ?? "unknown")}</span>
          </td>
        </tr>`;
      }

      const totals = row.totals ?? {};
      return `<tr>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;"><strong>${htmlEscape(
          getSportLabel(row.sport)
        )}</strong></td>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;">${formatInt(totals.total_previews)}</td>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;">${formatInt(totals.sent_count)}</td>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;">${formatInt(totals.replied_count)}</td>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;">${formatPercent(totals.reply_rate)}</td>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;">${formatInt(
          totals.directors_contacted_count
        )}</td>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;">${formatInt(totals.needs_followup_count)}</td>
      </tr>`;
    })
    .join("\n");

  const riSummaryHtml =
    includeRiSummary && riSummary
      ? `<div style="margin-top:18px;padding-top:16px;border-top:1px solid #e5e7eb;">
          <h2 style="margin:0 0 8px 0;font-size:15px;">RI Data Health (published canonical)</h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
            ${[
              ["Published", formatInt(riSummary.published_canonical)],
              ["Draft", formatInt(riSummary.draft)],
              ["Missing venues", formatInt(riSummary.missing_venues)],
              ["Missing URLs", formatInt(riSummary.missing_urls)],
              ["Missing dates", formatInt(riSummary.missing_dates)],
              ["Missing director email", formatInt(riSummary.missing_director_email)],
            ]
              .map(
                ([label, value]) =>
                  `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:10px;background:#f8fafc;">
                     <div style="font-size:11px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;">${htmlEscape(
                       label
                     )}</div>
                     <div style="font-size:18px;font-weight:900;color:#0f172a;margin-top:2px;">${htmlEscape(value)}</div>
                   </div>`
              )
              .join("")}
          </div>
        </div>`
      : "";

  const lowestStatesHtml =
    includeLowestStates && Array.isArray(lowestStates) && lowestStates.length > 0
      ? `<div style="margin-top:14px;">
          <h3 style="margin:0 0 8px 0;font-size:13px;color:#0f172a;">Lowest 5 states (published canonical)</h3>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="text-align:left;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">State</th>
                <th style="text-align:right;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Tournaments</th>
              </tr>
            </thead>
            <tbody>
              ${lowestStates
                .map(
                  (row) => `<tr>
                    <td style="padding:8px 10px;border-top:1px solid #e5e7eb;">${htmlEscape(row.state)}</td>
                    <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;">${htmlEscape(formatInt(row.count))}</td>
                  </tr>`
                )
                .join("\n")}
            </tbody>
          </table>
        </div>`
      : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
    <div style="max-width:780px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:18px 18px 14px;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline;">
          <h1 style="margin:0;font-size:18px;line-height:1.2;">TI Admin Dashboard (Daily)</h1>
          <div style="color:#64748b;font-size:12px;">Generated: ${htmlEscape(generatedAtIso)}</div>
        </div>

        ${tilesHtml}

        <p style="margin:14px 0 12px;color:#334155;font-size:13px;line-height:1.45;">
          Outreach summary by sport (previews, sends, replies, follow-up queue).
        </p>

        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="text-align:left;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Sport</th>
                <th style="text-align:right;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Previews</th>
                <th style="text-align:right;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Sent</th>
                <th style="text-align:right;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Replied</th>
                <th style="text-align:right;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Reply rate</th>
                <th style="text-align:right;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Directors</th>
                <th style="text-align:right;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Needs follow-up</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>

        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
          <a href="${htmlEscape(dashboardUrl)}"
             style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;padding:10px 12px;border-radius:10px;font-weight:600;font-size:13px;">
            Open Outreach Dashboard
          </a>
          <a href="${htmlEscape(baseUrl + "/admin/outreach-previews")}"
             style="display:inline-block;background:#f1f5f9;color:#0f172a;text-decoration:none;padding:10px 12px;border-radius:10px;font-weight:600;font-size:13px;border:1px solid #e5e7eb;">
            Open Outreach Previews
          </a>
        </div>

        ${riSummaryHtml}
        ${lowestStatesHtml}
      </div>
      <div style="color:#64748b;font-size:11px;margin-top:12px;padding:0 6px;">
        Internal admin email. If you don’t want these, remove your address from <code>TI_ADMIN_DASHBOARD_EMAILS</code>.
      </div>
    </div>
  </body>
</html>`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const settings = await loadTiAdminDashboardEmailSettings();
  const recipients = getEffectiveRecipients(settings);
  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no_recipients" });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1";

  const { data: lock, error: lockError } = await (supabaseAdmin as any).rpc("acquire_cron_job_lock", {
    p_key: LOCK_KEY,
    p_ttl_seconds: 10 * 60,
  });
  if (lockError) {
    return NextResponse.json({ ok: false, error: lockError.message }, { status: 500 });
  }
  if (!lock) {
    return NextResponse.json({ ok: true, skipped: true, reason: "lock_held" });
  }

  try {
    const baseUrl = resolveTiBaseUrl();

    const includeTiles = settings?.include_tiles ?? true;
    const includeSportTiles = settings?.include_sport_tiles ?? true;
    const includeOutreach = settings?.include_outreach ?? true;
    const includeRiSummary = settings?.include_ri_summary ?? true;
    const includeLowestStates = settings?.include_lowest_states ?? true;

    const now = new Date();
    const timeZone = "America/Los_Angeles";
    const todayStart = startOfDayInTimeZone(now, timeZone);
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const todayIso = todayStart.toISOString();
    const yesterdayIso = yesterdayStart.toISOString();
    const trailing7dStartIso = new Date(yesterdayStart.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();

    const [tiles, tiUserCounts, totalsBySport, riSummary, lowestStates, weekendPlannerSummary, campspotExperimentSummary] = await Promise.all([
      includeTiles ? loadAdminDashboardEmailTiles() : Promise.resolve(null),
      includeTiles ? loadTiUserCountsExcludingInternal({ todayStartUtcIso: todayIso, yesterdayStartUtcIso: yesterdayIso }) : Promise.resolve(null),
      includeOutreach ? Promise.all(TI_SPORTS.map((sport) => loadOutreachTotals(sport))) : Promise.resolve([]),
      includeRiSummary ? loadRiSummaryCounts() : Promise.resolve(null),
      includeLowestStates ? loadLowestStates(5) : Promise.resolve(null),
      loadWeekendPlannerDailySummary({
        yesterdayStartUtcIso: yesterdayIso,
        todayStartUtcIso: todayIso,
        yesterdayStart,
        todayStart,
        timeZone,
      }),
      loadCampspotExperimentSummary({
        yesterdayStartUtcIso: yesterdayIso,
        todayStartUtcIso: todayIso,
        trailing7dStartUtcIso: trailing7dStartIso,
        yesterdayStart,
        timeZone,
      }),
    ]);
    const weekendProCheckouts = includeTiles
      ? await loadWeekendProCheckoutCounts({
          todayStartUtcIso: todayIso,
          yesterdayStartUtcIso: yesterdayIso,
          internalUserIds: tiUserCounts?.internalIds ?? [],
        })
      : null;
    const weekendPassPurchases = includeTiles
      ? await loadWeekendPassPurchaseCounts({
          todayStartUtcIso: todayIso,
          yesterdayStartUtcIso: yesterdayIso,
          internalUserIds: tiUserCounts?.internalIds ?? [],
        })
      : null;

    const tilesWithFilteredUsers =
      includeTiles && tiles && tiUserCounts
        ? ({
            ...(tiles as any),
            ti_users: {
              ...(tiles as any).ti_users,
              insider_total: tiUserCounts.counts.insider_total,
              insider_new_yesterday: tiUserCounts.counts.insider_new_yesterday,
              weekend_pro_total: tiUserCounts.counts.weekend_pro_total,
              weekend_pro_new_yesterday: tiUserCounts.counts.weekend_pro_new_yesterday,
            },
          } as any)
        : tiles;
    const generatedAtIso = new Date().toISOString();
    const html = buildEmailHtml({
      generatedAtIso,
      totalsBySport,
      baseUrl,
      includeRiSummary,
      riSummary,
      includeLowestStates,
      lowestStates,
      includeTiles,
      includeSportTiles,
      tiles: tilesWithFilteredUsers,
      weekendProCheckouts: weekendProCheckouts ? { total: weekendProCheckouts.total, yesterday: weekendProCheckouts.yesterday } : null,
      weekendPassPurchases: weekendPassPurchases
        ? { total: weekendPassPurchases.total, yesterday: weekendPassPurchases.yesterday }
        : null,
      weekendPlannerSummary,
      campspotExperimentSummary,
    });
    const subject =
      weekendPlannerSummary && weekendPlannerSummary.ok
        ? `TI Admin Dashboard — Weekend Planner: ${weekendPlannerSummary.activations} activations, ${weekendPlannerSummary.planClicks} plan clicks, ${weekendPlannerSummary.teamHotelRequests} team hotel requests — ${generatedAtIso.slice(0, 10)}`
        : `TI Admin Dashboard — ${generatedAtIso.slice(0, 10)}`;

    const responsePayload = {
      ok: true,
      dry_run: dryRun,
      to: recipients,
      subject,
      settings: settings ?? null,
      sections: {
        tiles: includeTiles,
        sport_tiles: includeSportTiles,
        outreach: includeOutreach,
        ri_summary: includeRiSummary,
        lowest_states: includeLowestStates,
      },
      totalsBySportCount: totalsBySport.length,
      tiles: tiles ?? null,
      weekendProCheckouts: weekendProCheckouts ?? null,
      weekendPassPurchases: weekendPassPurchases ?? null,
      weekendPlannerSummary: weekendPlannerSummary ?? null,
      campspotExperimentSummary: campspotExperimentSummary ?? null,
      riSummary: riSummary ?? null,
      lowestStates: lowestStates ?? null,
    };

    try {
      if (!dryRun) {
        await sendEmailVerified({
          kind: "transactional",
          to: recipients,
          subject,
          html,
          allowLocalhostLinks: true,
        });
      }
      await supabaseAdmin.from("ti_admin_dashboard_email_runs" as any).insert({
        run_at: generatedAtIso,
        dry_run: dryRun,
        recipients,
        subject,
        ok: true,
        error: null,
        payload: responsePayload,
      });

      // Fire RI admin email as a companion send — fire-and-forget, does not block TI response.
      if (!dryRun) {
        const riCronUrl = process.env.RI_ADMIN_EMAIL_CRON_URL;
        if (riCronUrl) {
          fetch(riCronUrl, { method: "GET" })
            .then((r) => {
              if (!r.ok) console.warn("[ti-cron] RI admin email returned non-ok status", r.status);
              else console.info("[ti-cron] RI admin email triggered ok");
            })
            .catch((err) => console.warn("[ti-cron] RI admin email trigger failed", String(err?.message ?? err)));
        }
      }

      return NextResponse.json(responsePayload);
    } catch (err: any) {
      const message = String(err?.message ?? err ?? "unknown_error");
      try {
        await supabaseAdmin.from("ti_admin_dashboard_email_runs" as any).insert({
          run_at: generatedAtIso,
          dry_run: dryRun,
          recipients,
          subject,
          ok: false,
          error: message,
          payload: responsePayload,
        });
      } catch {
        // best-effort logging only
      }
      return NextResponse.json({ ok: false, error: "send_failed", detail: message }, { status: 500 });
    }
  } finally {
    try {
      await (supabaseAdmin as any).rpc("release_cron_job_lock", { p_key: LOCK_KEY });
    } catch {
      // Best-effort unlock: TTL will eventually expire.
    }
  }
}
