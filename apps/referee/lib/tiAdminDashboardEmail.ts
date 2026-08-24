import { sendEmailAlert } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { loadHotelBookingSummary } from "@/lib/hotelPlannerBookingSync";

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

async function loadHotelOutboundSummary(windowDays: number) {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const prevCutoff = new Date(Date.now() - 2 * windowDays * 24 * 60 * 60 * 1000).toISOString();

  const [currentResult, prevResult] = await Promise.all([
    (supabaseAdmin as any)
      .from("ti_outbound_clicks")
      .select("id", { count: "exact", head: true })
      .eq("destination_type", "hotels")
      .gte("created_at", cutoff),
    (supabaseAdmin as any)
      .from("ti_outbound_clicks")
      .select("id", { count: "exact", head: true })
      .eq("destination_type", "hotels")
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
  hotelOutbound: { current: number; prev: number };
  bookings: Awaited<ReturnType<typeof loadHotelBookingSummary>>;
  plannerActivations: number;
  pending: Awaited<ReturnType<typeof loadPendingCounts>>;
};

export async function loadTiAdminDashboardSummary(windowDays = 7): Promise<TiAdminDashboardSummary> {
  const [tiles, hotelOutbound, bookings, plannerData, pending] = await Promise.all([
    loadTiles(),
    loadHotelOutboundSummary(windowDays),
    loadHotelBookingSummary(windowDays),
    loadPlannerActivations(windowDays),
    loadPendingCounts(),
  ]);

  return {
    windowDays,
    generatedAt: new Date().toISOString(),
    tiles,
    hotelOutbound,
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

function escapeHtml(v: string) {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function trendLabel(current: number, prev: number): string {
  if (prev === 0) return current > 0 ? "▲ new" : "—";
  const delta = current - prev;
  const pct = Math.round((delta / prev) * 100);
  if (delta > 0) return `▲ ${pct}% vs prev ${7}d`;
  if (delta < 0) return `▼ ${Math.abs(pct)}% vs prev ${7}d`;
  return "= flat vs prev 7d";
}

const SECTION_STYLE = "background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px 18px;margin-bottom:14px;";
const HEADING_STYLE = "margin:0 0 10px;font-size:15px;font-weight:700;color:#111827;border-bottom:1px solid #f3f4f6;padding-bottom:6px;";
const ROW_STYLE = "display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-bottom:1px solid #f9fafb;font-size:13px;";
const LABEL_STYLE = "color:#374151;";
const VALUE_STYLE = "font-weight:700;color:#111827;";

function row(label: string, value: string | number, note?: string) {
  const valStr = typeof value === "number" ? formatInt(value) : escapeHtml(String(value));
  const noteStr = note ? ` <span style="color:#9ca3af;font-size:11px;">(${escapeHtml(note)})</span>` : "";
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
  const ho = summary.hotelOutbound;
  const w = summary.windowDays;

  // 1. Business Snapshot
  const snapshotContent = [
    row("Published (canonical)", t.tournaments?.canonical_total ?? 0),
    row("In public directory", t.tournaments?.public_total ?? 0, `+${t.tournaments?.canonical_new_yesterday_pt ?? 0} yesterday`),
    row("Insider users", t.users?.insider_total ?? 0, `+${t.users?.insider_new_yesterday_pt ?? 0} yesterday`),
    row("Weekend Pro users", t.users?.weekend_total ?? 0, `+${t.users?.weekend_new_yesterday_pt ?? 0} yesterday`),
  ].join("");

  // 2. Traffic — hotel outbound handoffs as traffic proxy
  const trendNote = trendLabel(ho.current, ho.prev);
  const trafficContent = [
    row(`Hotel handoffs (${w}d)`, ho.current, trendNote),
    row(`Hotel handoffs (prior ${w}d)`, ho.prev),
  ].join("");

  // 3. Hotels
  const hotelsContent = [
    row("Confirmed bookings (purchased window)", b.confirmedCount),
    row("Cancelled bookings", b.cancelledCount),
    row("Pending / other", b.pendingCount),
    row("Total booking value (USD)", formatUsd(b.totalBookingValueUsd)),
    row("Expected commission (USD)", formatUsd(b.expectedCommissionUsd)),
    b.topTournamentSlugs.length > 0
      ? `<div style="margin-top:8px;font-size:12px;color:#6b7280;">Top tournaments: ${b.topTournamentSlugs.map((s) => `${escapeHtml(s.slug)} (${s.count})`).join(", ")}</div>`
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
  if (summary.pending.pendingVerifications > 0) {
    alerts.push(`${summary.pending.pendingVerifications} pending referee verification request(s)`);
  }
  if (b.confirmedCount === 0 && ho.current > 0) {
    alerts.push("Hotel handoffs recorded but no confirmed bookings in sync window — verify HotelPlanner attribution or sync coverage.");
  }
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
    `  Hotel handoffs (${w}d): ${ho.current} ${trendNote}`,
    "",
    "3. Hotels",
    `  Confirmed bookings: ${b.confirmedCount}`,
    `  Cancelled: ${b.cancelledCount}`,
    `  Total booking value: ${formatUsd(b.totalBookingValueUsd)}`,
    `  Expected commission: ${formatUsd(b.expectedCommissionUsd)}`,
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
  ].join("\n");

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
