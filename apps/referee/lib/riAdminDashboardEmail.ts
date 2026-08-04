import { sendEmailAlert } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type RiAnalyticsEmailRow = {
  created_at: string;
  event_name: string;
  page_type: string | null;
  source_page_type: string | null;
  traffic_source: string | null;
  device_type: string | null;
  venue_id: string | null;
  tournament_id: string | null;
  tournament_slug: string | null;
};

type CountRow = [string, number];

export type RiAnalyticsDashboardSummary = {
  windowDays: number;
  cutoffIso: string;
  rows: RiAnalyticsEmailRow[];
  totalEvents: number;
  latestCreatedAt: string | null;
  uniqueEventNames: number;
  eventCounts: CountRow[];
  pageTypeCounts: CountRow[];
  sourcePageTypeCounts: CountRow[];
  trafficSourceCounts: CountRow[];
  deviceTypeCounts: CountRow[];
  hotelMetrics: {
    moduleViewed: number;
    resultsLoaded: number;
    noResults: number;
    cardClicks: number;
    fallbackClicks: number;
  };
  venueMetrics: {
    detailViews: number;
    mapViews: number;
    tournamentClicks: number;
    directionsClicks: number;
    siteClicks: number;
    rentalsClicks: number;
    nearbyClicks: number;
  };
  tournamentMetrics: {
    directoryViews: number;
    filterApplied: number;
    mapOpened: number;
    resultOpened: number;
    officialSiteClicks: number;
    mapViewed: number;
    mapMarkerSelected: number;
    mapResultSelected: number;
  };
  topVenueIds: CountRow[];
  topTournamentSlugs: CountRow[];
};

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function toRows(counts: Record<string, number>) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function countEvent(rows: RiAnalyticsEmailRow[], eventName: string) {
  return rows.filter((row) => row.event_name === eventName).length;
}

function formatInt(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCountRows(rows: CountRow[], emptyLabel: string, limit = 12) {
  if (rows.length === 0) {
    return `<div style="color:#6b7280;font-size:13px;">${escapeHtml(emptyLabel)}</div>`;
  }

  return `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tbody>
        ${rows
          .slice(0, limit)
          .map(
            ([label, count]) => `
              <tr>
                <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;color:#111827;">${escapeHtml(label)}</td>
                <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;color:#0f172a;text-align:right;font-weight:700;">${formatInt(count)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

export function parseRiAdminDashboardRecipients() {
  const raw = process.env.RI_ADMIN_DASHBOARD_EMAILS || process.env.RI_ADMIN_EMAIL || "";
  return Array.from(
    new Set(
      raw
        .split(/[,\n]/g)
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

export function resolveRiBaseUrl() {
  return (
    (process.env.RI_BASE_URL ?? "").trim() ||
    (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

export async function loadRiAnalyticsDashboardSummary(windowDays = 7): Promise<RiAnalyticsDashboardSummary> {
  const cutoffIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await (supabaseAdmin.from("ri_analytics_events" as any) as any)
    .select("created_at,event_name,page_type,source_page_type,traffic_source,device_type,venue_id,tournament_id,tournament_slug")
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) throw error;

  const rows = ((data ?? []) as RiAnalyticsEmailRow[]) || [];
  const eventCounts = toRows(countBy(rows.map((row) => row.event_name)));
  const pageTypeCounts = toRows(countBy(rows.map((row) => row.page_type || "unknown")));
  const sourcePageTypeCounts = toRows(countBy(rows.map((row) => row.source_page_type || "unknown")));
  const trafficSourceCounts = toRows(countBy(rows.map((row) => row.traffic_source || "unknown")));
  const deviceTypeCounts = toRows(countBy(rows.map((row) => row.device_type || "unknown")));
  const topVenueIds = toRows(countBy(rows.map((row) => row.venue_id || "").filter(Boolean)));
  const topTournamentSlugs = toRows(countBy(rows.map((row) => row.tournament_slug || "").filter(Boolean)));

  return {
    windowDays,
    cutoffIso,
    rows,
    totalEvents: rows.length,
    latestCreatedAt: rows[0]?.created_at ?? null,
    uniqueEventNames: eventCounts.length,
    eventCounts,
    pageTypeCounts,
    sourcePageTypeCounts,
    trafficSourceCounts,
    deviceTypeCounts,
    hotelMetrics: {
      moduleViewed: countEvent(rows, "ri_venue_hotels_module_viewed"),
      resultsLoaded: countEvent(rows, "ri_venue_hotel_results_loaded"),
      noResults: countEvent(rows, "ri_venue_hotel_no_results"),
      cardClicks: countEvent(rows, "ri_venue_hotel_card_clicked"),
      fallbackClicks: countEvent(rows, "ri_venue_hotels_cta_clicked"),
    },
    venueMetrics: {
      detailViews: countEvent(rows, "ri_venue_detail_viewed"),
      mapViews: countEvent(rows, "ri_venue_map_viewed"),
      tournamentClicks: countEvent(rows, "ri_venue_tournament_clicked"),
      directionsClicks: countEvent(rows, "ri_venue_directions_clicked"),
      siteClicks: countEvent(rows, "ri_venue_site_clicked"),
      rentalsClicks: countEvent(rows, "ri_venue_rentals_clicked"),
      nearbyClicks: countEvent(rows, "ri_venue_nearby_place_clicked"),
    },
    tournamentMetrics: {
      directoryViews: countEvent(rows, "ri_tournament_directory_viewed"),
      filterApplied: countEvent(rows, "ri_tournament_filter_applied"),
      mapOpened: countEvent(rows, "ri_tournament_map_opened"),
      resultOpened: countEvent(rows, "ri_tournament_result_opened"),
      officialSiteClicks: countEvent(rows, "ri_tournament_official_site_clicked"),
      mapViewed: countEvent(rows, "ri_tournament_map_viewed"),
      mapMarkerSelected: countEvent(rows, "ri_tournament_map_marker_selected"),
      mapResultSelected: countEvent(rows, "ri_tournament_map_result_selected"),
    },
    topVenueIds,
    topTournamentSlugs,
  };
}

export function buildRiAnalyticsDashboardEmail(summary: RiAnalyticsDashboardSummary) {
  const subject = `RI Analytics — last ${summary.windowDays} days`;
  const baseUrl = resolveRiBaseUrl();
  const adminUrl = `${baseUrl}/admin/analytics`;
  const latestLabel = summary.latestCreatedAt ? new Date(summary.latestCreatedAt).toLocaleString() : "—";

  const metricCard = (label: string, value: number | string) => `
    <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;min-width:160px;">
      <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(label)}</div>
      <div style="font-size:24px;font-weight:700;color:#111827;">${typeof value === "number" ? formatInt(value) : escapeHtml(value)}</div>
    </div>
  `;

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;padding:24px;">
      <div style="max-width:980px;margin:0 auto;">
        <h1 style="margin:0 0 8px;">RefereeInsights analytics digest</h1>
        <p style="margin:0 0 18px;color:#475569;">
          Last ${summary.windowDays} days of persisted RI product events. Localhost traffic is excluded.
          <a href="${adminUrl}" style="color:#2563eb;">Open admin analytics</a>
        </p>

        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:22px;">
          ${metricCard("Window", `${summary.windowDays} days`)}
          ${metricCard("Events", summary.totalEvents)}
          ${metricCard("Unique events", summary.uniqueEventNames)}
          ${metricCard("Latest", latestLabel)}
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">
          <section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
            <h2 style="margin:0 0 10px;font-size:16px;">Venue hotel metrics</h2>
            ${renderCountRows(
              [
                ["ri_venue_hotels_module_viewed", summary.hotelMetrics.moduleViewed],
                ["ri_venue_hotel_results_loaded", summary.hotelMetrics.resultsLoaded],
                ["ri_venue_hotel_no_results", summary.hotelMetrics.noResults],
                ["ri_venue_hotel_card_clicked", summary.hotelMetrics.cardClicks],
                ["ri_venue_hotels_cta_clicked", summary.hotelMetrics.fallbackClicks],
              ],
              "No venue-hotel events yet.",
              10
            )}
          </section>

          <section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
            <h2 style="margin:0 0 10px;font-size:16px;">Venue engagement</h2>
            ${renderCountRows(
              [
                ["ri_venue_detail_viewed", summary.venueMetrics.detailViews],
                ["ri_venue_map_viewed", summary.venueMetrics.mapViews],
                ["ri_venue_tournament_clicked", summary.venueMetrics.tournamentClicks],
                ["ri_venue_directions_clicked", summary.venueMetrics.directionsClicks],
                ["ri_venue_site_clicked", summary.venueMetrics.siteClicks],
                ["ri_venue_rentals_clicked", summary.venueMetrics.rentalsClicks],
                ["ri_venue_nearby_place_clicked", summary.venueMetrics.nearbyClicks],
              ],
              "No venue engagement events yet.",
              10
            )}
          </section>

          <section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
            <h2 style="margin:0 0 10px;font-size:16px;">Tournament engagement</h2>
            ${renderCountRows(
              [
                ["ri_tournament_directory_viewed", summary.tournamentMetrics.directoryViews],
                ["ri_tournament_filter_applied", summary.tournamentMetrics.filterApplied],
                ["ri_tournament_map_opened", summary.tournamentMetrics.mapOpened],
                ["ri_tournament_result_opened", summary.tournamentMetrics.resultOpened],
                ["ri_tournament_official_site_clicked", summary.tournamentMetrics.officialSiteClicks],
                ["ri_tournament_map_viewed", summary.tournamentMetrics.mapViewed],
                ["ri_tournament_map_marker_selected", summary.tournamentMetrics.mapMarkerSelected],
                ["ri_tournament_map_result_selected", summary.tournamentMetrics.mapResultSelected],
              ],
              "No tournament engagement events yet.",
              10
            )}
          </section>

          <section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
            <h2 style="margin:0 0 10px;font-size:16px;">Top events</h2>
            ${renderCountRows(summary.eventCounts, "No events yet.")}
          </section>

          <section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
            <h2 style="margin:0 0 10px;font-size:16px;">Page types</h2>
            ${renderCountRows(summary.pageTypeCounts, "No page types yet.")}
          </section>

          <section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
            <h2 style="margin:0 0 10px;font-size:16px;">Source page types</h2>
            ${renderCountRows(summary.sourcePageTypeCounts, "No source page types yet.")}
          </section>

          <section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
            <h2 style="margin:0 0 10px;font-size:16px;">Traffic sources</h2>
            ${renderCountRows(summary.trafficSourceCounts, "No traffic sources yet.")}
          </section>

          <section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
            <h2 style="margin:0 0 10px;font-size:16px;">Device types</h2>
            ${renderCountRows(summary.deviceTypeCounts, "No device types yet.")}
          </section>

          <section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
            <h2 style="margin:0 0 10px;font-size:16px;">Top venues</h2>
            ${renderCountRows(summary.topVenueIds, "No venue-linked events yet.", 8)}
          </section>

          <section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
            <h2 style="margin:0 0 10px;font-size:16px;">Top tournament slugs</h2>
            ${renderCountRows(summary.topTournamentSlugs, "No tournament-linked events yet.", 8)}
          </section>
        </div>
      </div>
    </div>
  `;

  const text = [
    `RefereeInsights analytics digest — last ${summary.windowDays} days`,
    `Events: ${formatInt(summary.totalEvents)}`,
    `Unique events: ${formatInt(summary.uniqueEventNames)}`,
    `Latest: ${latestLabel}`,
    "",
    "Venue hotel metrics:",
    `- module viewed: ${formatInt(summary.hotelMetrics.moduleViewed)}`,
    `- results loaded: ${formatInt(summary.hotelMetrics.resultsLoaded)}`,
    `- no results: ${formatInt(summary.hotelMetrics.noResults)}`,
    `- hotel card clicked: ${formatInt(summary.hotelMetrics.cardClicks)}`,
    `- fallback CTA clicked: ${formatInt(summary.hotelMetrics.fallbackClicks)}`,
    "",
    `Admin analytics: ${adminUrl}`,
  ].join("\n");

  return { subject, html, text };
}

export async function sendRiAnalyticsDashboardEmail(recipients = parseRiAdminDashboardRecipients()) {
  if (!recipients.length) {
    throw new Error("No RI admin dashboard email recipients configured.");
  }

  const summary = await loadRiAnalyticsDashboardSummary();
  const { subject, html, text } = buildRiAnalyticsDashboardEmail(summary);
  await sendEmailAlert({
    to: recipients,
    subject,
    html,
    text,
  });

  return { recipients, summary };
}
