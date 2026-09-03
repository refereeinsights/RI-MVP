import { sendEmailAlert } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { loadHotelBookingSummary, type HotelBookingSummary } from "@/lib/hotelPlannerBookingSync";
import { calculateAttributionCoverage } from "@/lib/hotelBookingReconciliation";
import { loadHotelSyncHealth } from "@/lib/hotelPlannerSyncHeartbeat.server";
import type { HotelSyncHealth } from "@/lib/hotelPlannerSyncHeartbeat";

// ---------------------------------------------------------------------------
// Recipients / base URL
// ---------------------------------------------------------------------------

export function parseTiAdminDashboardRecipients() {
  const raw = process.env.TI_ADMIN_DASHBOARD_EMAILS ?? process.env.RI_ADMIN_DASHBOARD_EMAILS ?? process.env.RI_ADMIN_EMAIL ?? "";
  return Array.from(
    new Set(raw.split(/[,\n]/g).map((v) => v.trim()).filter(Boolean))
  );
}

export function resolveTiBaseUrl() {
  return (
    (process.env.TI_BASE_URL ?? "").trim() ||
    (process.env.NEXT_PUBLIC_TI_SITE_URL ?? "").trim() ||
    "https://www.tournamentinsights.com"
  );
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

type TileData = {
  tournaments?: {
    canonical_total?: number;
    canonical_new_yesterday_pt?: number;
    public_total?: number;
  };
  users?: {
    insider_total?: number;
    insider_new_yesterday_pt?: number;
    weekend_total?: number;
    weekend_new_yesterday_pt?: number;
  };
};

async function loadTiles(): Promise<TileData> {
  try {
    const { data, error } = await (supabaseAdmin as any).rpc("get_admin_dashboard_email_tiles");
    if (error) {
      console.error("[ti-admin-email] tiles rpc error", error.message);
      return {};
    }
    return (data ?? {}) as TileData;
  } catch (err) {
    console.error("[ti-admin-email] tiles rpc failed", err);
    return {};
  }
}

// Distinct hotel handoff count — COUNT(DISTINCT outbound_attribution_id) for the window.
// Fetches IDs and deduplicates in JS; acceptable at current volumes.
async function loadHotelHandoffs(windowDays: number): Promise<{ current: number; prev: number }> {
  const now = Date.now();
  const cutoff = new Date(now - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const prevCutoff = new Date(now - 2 * windowDays * 24 * 60 * 60 * 1000).toISOString();

  const [currentResult, prevResult] = await Promise.all([
    (supabaseAdmin as any)
      .from("ti_outbound_clicks")
      .select("outbound_attribution_id")
      .eq("destination_type", "hotels")
      .not("outbound_attribution_id", "is", null)
      .gte("created_at", cutoff),
    (supabaseAdmin as any)
      .from("ti_outbound_clicks")
      .select("outbound_attribution_id")
      .eq("destination_type", "hotels")
      .not("outbound_attribution_id", "is", null)
      .gte("created_at", prevCutoff)
      .lt("created_at", cutoff),
  ]);

  const distinct = (rows: Array<{ outbound_attribution_id: string }> | null) =>
    new Set((rows ?? []).map((r) => r.outbound_attribution_id)).size;

  return {
    current: distinct(currentResult.data),
    prev: distinct(prevResult.data),
  };
}

// Tournament page views as the primary traffic signal.
// Event: tournament_detail_page_viewed tracked via ti_map_events.
async function loadTrafficSummary(windowDays: number): Promise<{
  current: number;
  prev: number;
}> {
  const now = Date.now();
  const cutoff = new Date(now - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const prevCutoff = new Date(now - 2 * windowDays * 24 * 60 * 60 * 1000).toISOString();

  const [currentResult, prevResult] = await Promise.all([
    (supabaseAdmin as any)
      .from("ti_map_events")
      .select("id", { count: "exact", head: true })
      .eq("event_name", "tournament_detail_page_viewed")
      .gte("created_at", cutoff),
    (supabaseAdmin as any)
      .from("ti_map_events")
      .select("id", { count: "exact", head: true })
      .eq("event_name", "tournament_detail_page_viewed")
      .gte("created_at", prevCutoff)
      .lt("created_at", cutoff),
  ]);

  return {
    current: (currentResult.count as number | null) ?? 0,
    prev: (prevResult.count as number | null) ?? 0,
  };
}

async function loadPlannerActivations(windowDays: number): Promise<{ activations: number }> {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const events = ["planner_manual_event_created", "planner_calendar_feed_connect_succeeded"];

  const { count, error } = await (supabaseAdmin as any)
    .from("ti_map_events")
    .select("id", { count: "exact", head: true })
    .in("event_name", events)
    .gte("created_at", cutoff);

  if (error) {
    console.error("[ti-admin-email] planner activations error", error.message);
    return { activations: 0 };
  }
  return { activations: (count as number | null) ?? 0 };
}

async function loadPendingCounts(): Promise<{
  pendingContacts: number;
  pendingReviews: number;
  pendingVerifications: number;
}> {
  const [contacts, reviews, verifications] = await Promise.all([
    (supabaseAdmin as any)
      .from("tournament_contacts")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    (supabaseAdmin as any)
      .from("tournament_referee_reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    (supabaseAdmin as any)
      .from("referee_verification_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);
  return {
    pendingContacts: (contacts.count as number | null) ?? 0,
    pendingReviews: (reviews.count as number | null) ?? 0,
    pendingVerifications: (verifications.count as number | null) ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Email summary type
// ---------------------------------------------------------------------------

export type TiAdminDashboardSummary = {
  windowDays: number;
  generatedAt: string;
  tiles: TileData;
  hotelHandoffs: { current: number; prev: number };
  traffic: { current: number; prev: number };
  bookings: HotelBookingSummary;
  hotelSyncHealth: HotelSyncHealth;
  plannerActivations: number;
  pending: Awaited<ReturnType<typeof loadPendingCounts>>;
};

export async function loadTiAdminDashboardSummary(windowDays = 7): Promise<TiAdminDashboardSummary> {
  const [tiles, hotelHandoffs, traffic, bookings, hotelSyncHealth, plannerData, pending] = await Promise.all([
    loadTiles(),
    loadHotelHandoffs(windowDays),
    loadTrafficSummary(windowDays),
    loadHotelBookingSummary(windowDays),
    loadHotelSyncHealth(),
    loadPlannerActivations(windowDays),
    loadPendingCounts(),
  ]);

  return {
    windowDays,
    generatedAt: new Date().toISOString(),
    tiles,
    hotelHandoffs,
    traffic,
    bookings,
    hotelSyncHealth,
    plannerActivations: plannerData.activations,
    pending,
  };
}

// ---------------------------------------------------------------------------
// Email rendering
// ---------------------------------------------------------------------------

function formatInt(v: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(v));
}

function formatUsd(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function formatTimestamp(iso: string | null, timeZone = "America/Los_Angeles"): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function hotelSyncStatusLabel(health: HotelSyncHealth) {
  if (health.attemptState === "stale_running") return "STALE RUNNING";
  if (health.lastAttemptStatus === "running") return "RUNNING";
  return health.lastAttemptStatus?.toUpperCase() ?? "NEVER";
}

function escapeHtml(v: string) {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function trendLabel(current: number, prev: number, windowDays: number): string {
  if (prev === 0) return current > 0 ? "▲ new" : "—";
  const delta = current - prev;
  const pct = Math.round((delta / prev) * 100);
  if (delta > 0) return `▲ ${pct}% vs prior ${windowDays}d`;
  if (delta < 0) return `▼ ${Math.abs(pct)}% vs prior ${windowDays}d`;
  return `= flat vs prior ${windowDays}d`;
}

const SECTION_STYLE = "background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px 18px;margin-bottom:14px;";
const HEADING_STYLE = "margin:0 0 10px;font-size:15px;font-weight:700;color:#111827;border-bottom:1px solid #f3f4f6;padding-bottom:6px;";
const ROW_STYLE = "display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-bottom:1px solid #f9fafb;font-size:13px;";
const LABEL_STYLE = "color:#374151;";
const VALUE_STYLE = "font-weight:700;color:#111827;";
const NOTE_STYLE = "color:#9ca3af;font-size:11px;";
const MUTED_STYLE = "color:#6b7280;font-size:12px;margin-top:6px;";

function row(label: string, value: string | number, note?: string) {
  const valStr = typeof value === "number" ? formatInt(value) : escapeHtml(String(value));
  const noteStr = note ? ` <span style="${NOTE_STYLE}">(${escapeHtml(note)})</span>` : "";
  return `<div style="${ROW_STYLE}"><span style="${LABEL_STYLE}">${escapeHtml(label)}</span><span style="${VALUE_STYLE}">${valStr}${noteStr}</span></div>`;
}

function section(heading: string, content: string) {
  return `<section style="${SECTION_STYLE}"><h2 style="${HEADING_STYLE}">${escapeHtml(heading)}</h2>${content}</section>`;
}

export function buildTiAdminDashboardEmail(summary: TiAdminDashboardSummary) {
  const baseUrl = resolveTiBaseUrl();
  const adminUrl = `${baseUrl.replace("www.tournamentinsights.com", "www.refereeinsights.com")}/admin/ti`;
  const pt = "America/Los_Angeles";
  const dateLabel = new Date(summary.generatedAt).toLocaleDateString("en-US", { timeZone: pt, month: "short", day: "numeric", year: "numeric" });
  const subject = `TI Admin · ${dateLabel}`;

  const t = summary.tiles;
  const b = summary.bookings;
  const sync = summary.hotelSyncHealth;
  const hh = summary.hotelHandoffs;
  const tr = summary.traffic;
  const w = summary.windowDays;

  // 1. Business Snapshot
  const snapshotContent = [
    row("Published (canonical)", t.tournaments?.canonical_total ?? 0),
    row("In public directory", t.tournaments?.public_total ?? 0, `+${t.tournaments?.canonical_new_yesterday_pt ?? 0} yesterday`),
    row("Insider users", t.users?.insider_total ?? 0, `+${t.users?.insider_new_yesterday_pt ?? 0} yesterday`),
    row("Weekend Pro users", t.users?.weekend_total ?? 0, `+${t.users?.weekend_new_yesterday_pt ?? 0} yesterday`),
  ].join("");

  // 2. Traffic — tournament detail page views
  const trafficTrend = trendLabel(tr.current, tr.prev, w);
  const trafficContent = [
    row(`Tournament page views (${w}d)`, tr.current, trafficTrend),
    row(`Prior ${w}d`, tr.prev),
  ].join("");

  // 3. Hotels
  const syncHealthContent = [
    row("Last attempt", formatTimestamp(sync.lastAttemptStartedAt, pt)),
    row("Status", hotelSyncStatusLabel(sync)),
    row("Last successful sync", formatTimestamp(sync.lastSuccessfulCompletedAt, pt)),
    row("Purchases returned", sync.lastAttemptPurchaseRows),
    row("Cancellations returned", sync.lastAttemptCancellationRows),
    row("Rows updated", sync.lastAttemptRowsUpserted),
    sync.lastAttemptRowsFailed > 0 ? row("Rows failed", sync.lastAttemptRowsFailed) : "",
    sync.lastAttemptErrorStage ? row("Stage", sync.lastAttemptErrorStage) : "",
    `<div style="${MUTED_STYLE}">Latest persisted purchase: ${escapeHtml(formatTimestamp(sync.latestPurchasedAt, pt))}</div>`,
  ].join("");
  const attributionCoverage = calculateAttributionCoverage({
    reconciliationStatus: b.reconciliationStatus,
    matchedCount: b.matchedCount,
    confirmedTiSourceCount: b.confirmedCount,
  });
  const coverageRate = b.reconciliationStatus === "unavailable"
    ? "Unavailable"
    : attributionCoverage === null ? "—" : `${attributionCoverage}%`;
  const internallyUnmatched = b.reconciliationStatus === "available"
    ? (b.orphanedValidTokenCount ?? 0) + (b.missingTokenCount ?? 0) + (b.invalidTokenCount ?? 0)
    : null;

  const hotelsContent = [
    `<div style="${MUTED_STYLE}">Commercial truth: normalized HotelPlanner Source = TournamentInsights</div>`,
    row("Confirmed bookings", b.confirmedCount, "TournamentInsights source"),
    row("Cancelled bookings", b.cancelledCount),
    row("Other / unknown statuses", b.otherCount + b.unknownCount),
    row("Confirmed booking value", formatUsd(b.confirmedBookingValueUsd), "not revenue"),
    row("Confirmed expected commission", formatUsd(b.confirmedExpectedCommissionUsd), "not paid commission"),
    row("Provider-reported paid commission — all provider statuses", formatUsd(b.providerReportedPaidCommissionUsd)),
    row("Room nights", "UNPROVEN"),
    row("HotelPlanner arrival", "UNOBSERVABLE", "redirect does not prove provider arrival"),
    b.confirmedCount > 0 ? [
      b.reconciliationStatus === "available"
        ? row("Deterministically matched", b.matchedCount ?? 0, "valid Custom3 → persisted outbound join")
        : row("  · Attribution reconciliation", "Unavailable", "outbound lookup failed"),
      b.reconciliationStatus === "available" ? row("Internally unmatched", internallyUnmatched ?? 0) : "",
      row("Attribution coverage", coverageRate),
      b.reconciliationStatus === "available" && (b.orphanedValidTokenCount ?? 0) > 0
        ? row("  · Orphaned valid token", b.orphanedValidTokenCount ?? 0) : "",
      b.reconciliationStatus === "available" ? row("  · Missing token", b.missingTokenCount ?? 0) : "",
      b.reconciliationStatus === "available" && (b.invalidTokenCount ?? 0) > 0
        ? row("  · Invalid token", b.invalidTokenCount ?? 0) : "",
    ].join("") : "",
    row(`Diagnostic hotel handoffs (${w}d, distinct)`, hh.current, trendLabel(hh.current, hh.prev, w)),
    b.otherSourceCount > 0 ? row("Other HotelPlanner Sources", b.otherSourceCount) : "",
    b.topTournamentSlugs.length > 0
      ? `<div style="${MUTED_STYLE}">Top tournaments: ${b.topTournamentSlugs.map((s) => `${escapeHtml(s.slug)} (${s.count})`).join(", ")}</div>`
      : "",
  ].join("");

  // 4. Planning
  const planningContent = [
    row(`Planner activations (${w}d)`, summary.plannerActivations, "manual event created or calendar feed connected"),
  ].join("");

  // 5. Tournament Partners
  const partnersContent = [
    row("Pending tournament contacts", summary.pending.pendingContacts),
    row("Pending referee reviews", summary.pending.pendingReviews),
  ].join("");

  // 6. Alerts
  const alerts: string[] = [];

  if (sync.attemptState === "stale_running") {
    alerts.push(`Hotel booking sync has remained running for more than 30 minutes. Last terminal state: ${sync.lastTerminalStatus ?? "none"}.`);
  }
  if (sync.lastSuccessState !== "fresh") {
    alerts.push(
      sync.lastSuccessfulCompletedAt
        ? `Hotel booking sync is stale — last success ${formatTimestamp(sync.lastSuccessfulCompletedAt, pt)} (${Math.round(sync.lastSuccessAgeHours ?? 0)}h ago). Verify the cron and heartbeat status.`
        : "Hotel booking sync has no recorded successful run. Verify the cron route, heartbeat migration, and provider configuration."
    );
  }

  if (summary.pending.pendingVerifications > 0) {
    alerts.push(`${summary.pending.pendingVerifications} pending referee verification request(s)`);
  }
  if (b.confirmedCount === 0 && hh.current > 0 && sync.lastSuccessState === "fresh") {
    alerts.push("Hotel handoffs recorded but no confirmed bookings in sync window. HP reporting may lag 24-48h.");
  }
  if (b.reconciliationStatus === "unavailable") alerts.push("Hotel booking attribution reconciliation is unavailable. Booking totals are preserved; matched conversion is suppressed.");
  if ((b.orphanedValidTokenCount ?? 0) > 0) alerts.push(`${b.orphanedValidTokenCount} booking(s) have a valid Custom3 token without a persisted TI outbound match.`);
  if ((b.invalidTokenCount ?? 0) > 0) alerts.push(`${b.invalidTokenCount} booking(s) have a non-empty Custom3 value with an invalid attribution-token format.`);

  const alertsContent = alerts.length > 0
    ? alerts.map((a) => `<div style="font-size:13px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;margin-bottom:6px;">${escapeHtml(a)}</div>`).join("")
    : `<div style="font-size:13px;color:#6b7280;">No alerts.</div>`;

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;padding:24px;">
      <div style="max-width:680px;margin:0 auto;">
        <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;">TI Admin Dashboard</h1>
        <p style="margin:0 0 18px;color:#475569;font-size:13px;">
          ${escapeHtml(dateLabel)} · ${w}-day window ·
          <a href="${adminUrl}" style="color:#2563eb;">Open admin</a>
        </p>

        ${section("1. Business Snapshot", snapshotContent)}
        ${section("2. Traffic", trafficContent)}
        ${section("3. Hotels", hotelsContent)}
        ${section("4. HotelPlanner Sync", syncHealthContent)}
        ${section("5. Planning", planningContent)}
        ${section("6. Tournament Partners", partnersContent)}
        ${section("7. Alerts", alertsContent)}
      </div>
    </div>
  `;

  const text = [
    `TI Admin Dashboard — ${dateLabel}`,
    `${w}-day window | Admin: ${adminUrl}`,
    "",
    "1. Business Snapshot",
    `  Published: ${t.tournaments?.canonical_total ?? 0}`,
    `  In directory: ${t.tournaments?.public_total ?? 0}`,
    `  Insider users: ${t.users?.insider_total ?? 0}`,
    `  Weekend Pro: ${t.users?.weekend_total ?? 0}`,
    "",
    "2. Traffic",
    `  Tournament page views (${w}d): ${tr.current} ${trafficTrend}`,
    "",
    "3. Hotels",
    "  Commercial truth: normalized HotelPlanner Source = TournamentInsights",
    `  Confirmed bookings: ${b.confirmedCount}`,
    `  Cancelled bookings: ${b.cancelledCount}`,
    `  Other / unknown statuses: ${b.otherCount + b.unknownCount}`,
    `  Confirmed booking value: ${formatUsd(b.confirmedBookingValueUsd)} (not revenue)`,
    `  Confirmed expected commission: ${formatUsd(b.confirmedExpectedCommissionUsd)}`,
    `  Provider-reported paid commission — all provider statuses: ${formatUsd(b.providerReportedPaidCommissionUsd)}`,
    "  Room nights: UNPROVEN",
    "  HotelPlanner arrival: UNOBSERVABLE",
    b.confirmedCount > 0 && b.reconciliationStatus === "available" ? `    · Deterministically matched: ${b.matchedCount ?? 0}` : "",
    b.confirmedCount > 0 && b.reconciliationStatus === "unavailable" ? "    · Attribution reconciliation: Unavailable" : "",
    b.confirmedCount > 0 && b.reconciliationStatus === "available" ? `    · Internally unmatched: ${internallyUnmatched ?? 0}` : "",
    `    · Attribution coverage: ${coverageRate}`,
    `  Diagnostic hotel handoffs (${w}d, distinct): ${hh.current} ${trendLabel(hh.current, hh.prev, w)}`,
    b.otherSourceCount > 0 ? `  Other HotelPlanner Sources: ${b.otherSourceCount}` : "",
    "",
    "4. HotelPlanner Sync",
    `  Last attempt: ${formatTimestamp(sync.lastAttemptStartedAt, pt)}`,
    `  Status: ${hotelSyncStatusLabel(sync)}`,
    `  Last successful sync: ${formatTimestamp(sync.lastSuccessfulCompletedAt, pt)}`,
    `  Purchases returned: ${sync.lastAttemptPurchaseRows}`,
    `  Cancellations returned: ${sync.lastAttemptCancellationRows}`,
    `  Rows updated: ${sync.lastAttemptRowsUpserted}`,
    sync.lastAttemptRowsFailed > 0 ? `  Rows failed: ${sync.lastAttemptRowsFailed}` : "",
    sync.lastAttemptErrorStage ? `  Stage: ${sync.lastAttemptErrorStage}` : "",
    `  Latest persisted purchase: ${formatTimestamp(sync.latestPurchasedAt, pt)}`,
    "",
    "5. Planning",
    `  Planner activations (${w}d): ${summary.plannerActivations}`,
    "",
    "6. Tournament Partners",
    `  Pending contacts: ${summary.pending.pendingContacts}`,
    `  Pending reviews: ${summary.pending.pendingReviews}`,
    "",
    "7. Alerts",
    alerts.length > 0 ? alerts.join("\n  ") : "No alerts.",
  ].filter(Boolean).join("\n");

  return { subject, html, text };
}

export async function sendTiAdminDashboardEmail(recipients = parseTiAdminDashboardRecipients()) {
  if (!recipients.length) {
    throw new Error("No TI admin dashboard email recipients configured.");
  }
  const summary = await loadTiAdminDashboardSummary();
  const { subject, html, text } = buildTiAdminDashboardEmail(summary);
  await sendEmailAlert({ to: recipients, subject, html, text });
  return { recipients, summary };
}
