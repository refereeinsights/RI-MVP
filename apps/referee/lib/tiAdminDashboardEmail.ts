import { sendEmailAlert } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { loadHotelBookingSummary, type HotelBookingSummary } from "@/lib/hotelPlannerBookingSync";
import { calculateMatchedBookingConversion } from "@/lib/hotelBookingReconciliation";

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
  plannerActivations: number;
  pending: Awaited<ReturnType<typeof loadPendingCounts>>;
};

export async function loadTiAdminDashboardSummary(windowDays = 7): Promise<TiAdminDashboardSummary> {
  const [tiles, hotelHandoffs, traffic, bookings, plannerData, pending] = await Promise.all([
    loadTiles(),
    loadHotelHandoffs(windowDays),
    loadTrafficSummary(windowDays),
    loadHotelBookingSummary(windowDays),
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
  const syncLine = `<div style="${MUTED_STYLE}">Hotel booking data last synced: ${escapeHtml(formatTimestamp(b.lastSyncedAt, pt))}</div>`;
  const matchedConversion = calculateMatchedBookingConversion({
    reconciliationStatus: b.reconciliationStatus,
    matchedCount: b.matchedCount,
    handoffCount: hh.current,
  });
  const conversionRate = b.reconciliationStatus === "unavailable"
    ? "Unavailable"
    : matchedConversion === null ? "—" : `${matchedConversion}%`;

  const hotelsContent = [
    row(`Hotel handoffs (${w}d, distinct)`, hh.current, trendLabel(hh.current, hh.prev, w)),
    row("Confirmed bookings", b.confirmedCount),
    b.confirmedCount > 0 ? [
      b.reconciliationStatus === "available"
        ? row("  · Matched TI", b.matchedCount ?? 0, "valid Custom3 → persisted outbound join")
        : row("  · Attribution reconciliation", "Unavailable", "outbound lookup failed"),
      b.reconciliationStatus === "available" && (b.orphanedValidTokenCount ?? 0) > 0
        ? row("  · Orphaned valid token", b.orphanedValidTokenCount ?? 0, "valid Custom3 without an outbound match") : "",
      row("  · Missing token", b.missingTokenCount, "no Custom3"),
      b.invalidTokenCount > 0 ? row("  · Invalid token", b.invalidTokenCount, "non-empty Custom3 with invalid format") : "",
    ].join("") : "",
    row("Cancelled bookings", b.cancelledCount),
    row("Tracked handoff → booking conversion", conversionRate),
    b.expectedCommissionUsd > 0 ? row("Expected commission", formatUsd(b.expectedCommissionUsd)) : "",
    b.totalBookingValueUsd > 0 ? row("Total booking value", formatUsd(b.totalBookingValueUsd)) : "",
    b.topTournamentSlugs.length > 0
      ? `<div style="${MUTED_STYLE}">Top tournaments: ${b.topTournamentSlugs.map((s) => `${escapeHtml(s.slug)} (${s.count})`).join(", ")}</div>`
      : "",
    syncLine,
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

  // Stale sync alert — fires when lastSyncedAt is >36h ago or never ran
  const syncAgeHours = b.lastSyncedAt
    ? (Date.now() - new Date(b.lastSyncedAt).getTime()) / 3_600_000
    : Infinity;
  if (syncAgeHours > 36) {
    alerts.push(
      b.lastSyncedAt
        ? `Hotel booking sync is stale — last synced ${formatTimestamp(b.lastSyncedAt, pt)} (${Math.round(syncAgeHours)}h ago). Verify the cron is running.`
        : "Hotel booking sync has never completed. Verify the cron route and HP credentials."
    );
  }

  if (summary.pending.pendingVerifications > 0) {
    alerts.push(`${summary.pending.pendingVerifications} pending referee verification request(s)`);
  }
  if (b.confirmedCount === 0 && hh.current > 0 && syncAgeHours <= 36) {
    alerts.push("Hotel handoffs recorded but no confirmed bookings in sync window. HP reporting may lag 24-48h.");
  }
  if (b.reconciliationStatus === "unavailable") alerts.push("Hotel booking attribution reconciliation is unavailable. Booking totals are preserved; matched conversion is suppressed.");
  if ((b.orphanedValidTokenCount ?? 0) > 0) alerts.push(`${b.orphanedValidTokenCount} booking(s) have a valid Custom3 token without a persisted TI outbound match.`);
  if (b.invalidTokenCount > 0) alerts.push(`${b.invalidTokenCount} booking(s) have a non-empty Custom3 value with an invalid attribution-token format.`);

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
        ${section("4. Planning", planningContent)}
        ${section("5. Tournament Partners", partnersContent)}
        ${section("6. Alerts", alertsContent)}
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
    `  Hotel handoffs (${w}d, distinct): ${hh.current} ${trendLabel(hh.current, hh.prev, w)}`,
    `  Confirmed bookings: ${b.confirmedCount}`,
    b.confirmedCount > 0 && b.reconciliationStatus === "available" ? `    · Matched TI: ${b.matchedCount ?? 0}` : "",
    b.confirmedCount > 0 && b.reconciliationStatus === "unavailable" ? "    · Attribution reconciliation: Unavailable" : "",
    b.confirmedCount > 0 && b.reconciliationStatus === "available" ? `    · Orphaned valid token: ${b.orphanedValidTokenCount ?? 0}` : "",
    b.confirmedCount > 0 ? `    · Missing token: ${b.missingTokenCount}` : "",
    b.invalidTokenCount > 0 ? `    · Invalid token: ${b.invalidTokenCount}` : "",
    `  Matched conversion: ${conversionRate}`,
    b.expectedCommissionUsd > 0 ? `  Expected commission: ${formatUsd(b.expectedCommissionUsd)}` : "",
    `  Hotel booking data last synced: ${formatTimestamp(b.lastSyncedAt, pt)}`,
    "",
    "4. Planning",
    `  Planner activations (${w}d): ${summary.plannerActivations}`,
    "",
    "5. Tournament Partners",
    `  Pending contacts: ${summary.pending.pendingContacts}`,
    `  Pending reviews: ${summary.pending.pendingReviews}`,
    "",
    "6. Alerts",
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
