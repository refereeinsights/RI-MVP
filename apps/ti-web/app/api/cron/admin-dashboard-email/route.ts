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
};

type WeekendPlannerDailySummary =
  | {
      ok: true;
      windowLabel: string;
      activations: number;
      planClicks: number;
      teamHotelRequests: number;
      snapshot: {
        totalActivations: number;
        plannerViews: number;
        plannerLoaded: number;
        newPlannerUsers: "not tracked";
        returningPlannerUsers: "not tracked";
      };
      tournamentFunnel: {
        detailViews: number;
        plannerCtaImpressions: number;
        plannerClicks: number;
        weekendArrivals: number;
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
        plannerLoaded: number;
        emptyStateViewed: number;
        calendarConnectStarts: "not tracked";
        manualEventsAdded: number;
        calendarFeedsConnected: number;
      };
      firstActions: {
        manualEventsAdded: number;
        calendarFeedsConnected: number;
        weekendPlansSaved: number;
        guestSharesCreated: number;
        privateCalendarFeedsCreated: number;
      };
      activationBySource: {
        tracked: false;
        arrivalsBySource: Record<"tournament_detail" | "direct" | "unknown", number>;
      };
      teamHotel: {
        ctaImpressions: number;
        ctaClicks: number;
        formStarts: number;
        requestsSubmitted: number;
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
      "weekend_planner_viewed",
      "weekend_planner_auth_required_viewed",
      "weekend_planner_create_account_clicked",
      "weekend_planner_sign_in_clicked",
      "weekend_planner_loaded",
      "weekend_planner_empty_state_viewed",
      "planner_manual_event_created",
      "planner_calendar_feed_connect_succeeded",
      "planner_guest_share_created",
      "planner_calendar_feed_created",
      "team_hotel_cta_viewed",
      "team_hotel_cta_clicked",
      "team_hotel_request_started",
      "team_hotel_request_submitted",
      "premium_modal_viewed",
      "premium_cta_clicked",
      "planner_weekend_pro_gate_viewed",
      "planner_weekend_pro_gate_clicked",
    ];

    const { data, error } = await supabaseAdmin
      .from("ti_map_events" as any)
      .select("event_name,properties")
      .in("event_name", trackedEventNames)
      .gte("created_at", params.yesterdayStartUtcIso)
      .lt("created_at", params.todayStartUtcIso);

    if (error) {
      return { ok: false, windowLabel, error: error.message || "Failed to load weekend planner analytics." };
    }

    const rows = ((data ?? []) as TiMapEventRow[]) ?? [];
    const plannerCtaImpressions = countEvents(
      rows,
      "weekend_planner_contextual_cta_viewed",
      (row) => eventPropertyText(row, "source_page_type") === "tournament" && eventPropertyText(row, "cta_type") === "weekend_plan",
    );
    const plannerClicks = countEvents(rows, "tournament_detail_weekend_plan_clicked");
    const detailViews = countEvents(rows, "tournament_detail_page_viewed");
    const weekendArrivals = countEvents(rows, "weekend_plan_page_viewed");
    const weekendSaveClicks = countEvents(rows, "weekend_plan_save_clicked");
    const weekendSaved = countEvents(rows, "weekend_plan_saved");
    const plannerViews = countEvents(rows, "weekend_planner_viewed");
    const loggedOutViews = countEvents(rows, "weekend_planner_viewed", (row) => eventPropertyText(row, "auth_state") === "signed_out");
    const createAccountClicks = countEvents(rows, "weekend_planner_create_account_clicked");
    const signInClicks = countEvents(rows, "weekend_planner_sign_in_clicked");
    const authRequiredViews = countEvents(rows, "weekend_planner_auth_required_viewed");
    const plannerLoaded = countEvents(rows, "weekend_planner_loaded");
    const emptyStateViewed = countEvents(rows, "weekend_planner_empty_state_viewed");
    const manualEventsAdded = countEvents(rows, "planner_manual_event_created");
    const calendarFeedsConnected = countEvents(rows, "planner_calendar_feed_connect_succeeded");
    const guestSharesCreated = countEvents(rows, "planner_guest_share_created");
    const privateCalendarFeedsCreated = countEvents(rows, "planner_calendar_feed_created");
    const teamHotelImpressions = countEvents(rows, "team_hotel_cta_viewed");
    const teamHotelClicks = countEvents(rows, "team_hotel_cta_clicked");
    const teamHotelStarts = countEvents(rows, "team_hotel_request_started");
    const teamHotelSubmitted = countEvents(rows, "team_hotel_request_submitted");
    const premiumViews = countEvents(rows, "premium_modal_viewed");
    const premiumClicks = countEvents(rows, "premium_cta_clicked");
    const plannerGateViews = countEvents(rows, "planner_weekend_pro_gate_viewed");
    const plannerGateClicks = countEvents(rows, "planner_weekend_pro_gate_clicked");
    const activations = manualEventsAdded + calendarFeedsConnected;

    const arrivalsBySource: Record<"tournament_detail" | "direct" | "unknown", number> = {
      tournament_detail: 0,
      direct: 0,
      unknown: 0,
    };
    const impressionsBySlug = new Map<string, number>();
    const clicksBySlug = new Map<string, number>();

    for (const row of rows) {
      if (row.event_name === "weekend_plan_page_viewed") {
        const sourcePage = eventPropertyText(row, "source_page");
        if (sourcePage === "tournament_detail" || sourcePage === "direct" || sourcePage === "unknown") {
          arrivalsBySource[sourcePage] += 1;
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

      if (row.event_name === "tournament_detail_weekend_plan_clicked") {
        const slug = eventPropertyText(row, "tournament_slug");
        if (slug) clicksBySlug.set(slug, (clicksBySlug.get(slug) ?? 0) + 1);
      }
    }

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

    const alerts: string[] = [];
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
    if (plannerViews > 0 && authRequiredViews >= Math.ceil(plannerViews * 0.5)) {
      alerts.push("Auth-required planner views are high relative to planner views.");
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
        plannerViews,
        plannerLoaded,
        newPlannerUsers: "not tracked",
        returningPlannerUsers: "not tracked",
      },
      tournamentFunnel: {
        detailViews,
        plannerCtaImpressions,
        plannerClicks,
        weekendArrivals,
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
        plannerLoaded,
        emptyStateViewed,
        calendarConnectStarts: "not tracked",
        manualEventsAdded,
        calendarFeedsConnected,
      },
      firstActions: {
        manualEventsAdded,
        calendarFeedsConnected,
        weekendPlansSaved: weekendSaved,
        guestSharesCreated,
        privateCalendarFeedsCreated,
      },
      activationBySource: {
        tracked: false,
        arrivalsBySource,
      },
      teamHotel: {
        ctaImpressions: teamHotelImpressions,
        ctaClicks: teamHotelClicks,
        formStarts: teamHotelStarts,
        requestsSubmitted: teamHotelSubmitted,
      },
      weekendProInterest: {
        gateViews: plannerGateViews,
        gateClicks: plannerGateClicks,
        premiumViews,
        premiumClicks,
      },
      topTournamentPages,
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

  const snapshotHtml = renderMetricRows([
    { label: "Date window", value: summary.windowLabel },
    { label: "Activation events", value: summary.snapshot.totalActivations, note: "manual event + calendar connect" },
    { label: "Weekend Planner views", value: summary.snapshot.plannerViews },
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
    { label: "`/weekend/[slug]` arrivals", value: summary.tournamentFunnel.weekendArrivals },
    { label: "Weekend plan save clicks", value: summary.tournamentFunnel.weekendSaveClicks },
    {
      label: "Weekend plan saves",
      value: summary.tournamentFunnel.weekendSaved,
      note: formatRatioPercent(summary.tournamentFunnel.weekendSaved, summary.tournamentFunnel.weekendArrivals),
    },
    { label: "Planner opens from weekend flow", value: summary.tournamentFunnel.plannerOpensFromWeekendFlow },
    { label: "Activated after weekend flow", value: summary.tournamentFunnel.activatedAfterWeekendFlow },
    { label: "Planner activation rate", value: formatRatioPercent(summary.activations, summary.snapshot.plannerLoaded) },
    {
      label: "End-to-end activation",
      value: formatRatioPercent(summary.activations, summary.tournamentFunnel.plannerCtaImpressions),
    },
  ]);

  const directEntryHtml = renderMetricRows([
    { label: "`/weekend-planner` views", value: summary.directEntry.plannerViews },
    { label: "Logged-out planner views", value: summary.directEntry.loggedOutViews },
    { label: "Create account clicks", value: summary.directEntry.createAccountClicks },
    { label: "Sign in clicks", value: summary.directEntry.signInClicks },
    { label: "Auth-required views", value: summary.directEntry.authRequiredViews },
    {
      label: "Planner loaded",
      value: summary.directEntry.plannerLoaded,
      note: formatRatioPercent(summary.directEntry.plannerLoaded, summary.directEntry.plannerViews),
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

  const firstActionsHtml = renderMetricRows([
    { label: "Manual events added", value: summary.firstActions.manualEventsAdded },
    { label: "Calendar feeds connected", value: summary.firstActions.calendarFeedsConnected },
    { label: "Weekend plans saved", value: summary.firstActions.weekendPlansSaved },
    { label: "Guest shares created", value: summary.firstActions.guestSharesCreated },
    { label: "Private calendar feeds created", value: summary.firstActions.privateCalendarFeedsCreated },
  ]);

  const activationBySourceHtml = renderMetricRows([
    { label: "Activation by source", value: "not tracked", note: "completion events do not carry source attribution yet" },
    { label: "Weekend arrivals from tournament detail", value: summary.activationBySource.arrivalsBySource.tournament_detail },
    { label: "Weekend arrivals direct", value: summary.activationBySource.arrivalsBySource.direct },
    { label: "Weekend arrivals unknown", value: summary.activationBySource.arrivalsBySource.unknown },
  ]);

  const teamHotelHtml = renderMetricRows([
    { label: "Team hotel CTA impressions", value: summary.teamHotel.ctaImpressions },
    {
      label: "Team hotel CTA clicks",
      value: summary.teamHotel.ctaClicks,
      note: formatRatioPercent(summary.teamHotel.ctaClicks, summary.teamHotel.ctaImpressions),
    },
    { label: "Team hotel form starts", value: summary.teamHotel.formStarts },
    { label: "Team hotel requests submitted", value: summary.teamHotel.requestsSubmitted },
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

  const alertsHtml =
    summary.alerts.length > 0
      ? `<ul style="margin:0;padding-left:18px;color:#92400e;font-size:13px;line-height:1.5;">${summary.alerts
          .map((alert) => `<li>${htmlEscape(alert)}</li>`)
          .join("")}</ul>`
      : `<div style="color:#166534;font-size:13px;">No threshold alerts triggered yesterday.</div>`;

  const missingTrackingHtml =
    summary.missingTracking.length > 0
      ? `<ul style="margin:0;padding-left:18px;color:#64748b;font-size:13px;line-height:1.5;">${summary.missingTracking
          .map((item) => `<li>${htmlEscape(item)}</li>`)
          .join("")}</ul>`
      : `<div style="color:#166534;font-size:13px;">No missing tracking noted.</div>`;

  return renderSectionCard(
    "Weekend Planner",
    `Daily operator summary for ${summary.windowLabel}. Activation counts are event counts, not de-duplicated users.`,
    [
      renderSectionCard("Snapshot", null, snapshotHtml),
      renderSectionCard("Tournament → Weekend Planner Funnel", null, tournamentFunnelHtml),
      renderSectionCard("Direct Weekend Planner Entry Funnel", null, directEntryHtml),
      renderSectionCard("First Planner Actions", null, firstActionsHtml),
      renderSectionCard("Activation by Source", null, activationBySourceHtml),
      renderSectionCard("Team Hotel Blocks", null, teamHotelHtml),
      renderSectionCard("Weekend Pro Interest", null, weekendProHtml),
      renderSectionCard("Top Tournament Pages by Planner Clicks", null, topPagesHtml),
      renderSectionCard("Alerts / Anomalies", null, alertsHtml),
      renderSectionCard("Missing Tracking / Notes", null, missingTrackingHtml),
    ].join(""),
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
    timeZoneName: "shortOffset",
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
        ${sportTilesHtml}
        ${heatmapHtml}`
      : weekendPlannerHtml;

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

    const [tiles, tiUserCounts, totalsBySport, riSummary, lowestStates, weekendPlannerSummary] = await Promise.all([
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
