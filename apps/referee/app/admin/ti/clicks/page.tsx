import Link from "next/link";

import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import ClicksTableClient from "./ClicksTableClient";

export const runtime = "nodejs";

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function toCount(res: { error: any; count?: number | null }) {
  return res.error ? 0 : res.count ?? 0;
}

type TopTournamentRow = {
  tournament_id: string;
  view_count: number;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
};

type TopVenueRow = {
  tournament_id: string;
  view_count: number;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
};

type TopDimensionRow = { sport?: string; state?: string; view_count?: number; open_count?: number };

export default async function TiClicksPage() {
  await requireAdmin();

  const now = new Date();
  const todayStartUtc = startOfUtcDay(now);
  const yesterdayStartUtc = new Date(todayStartUtc.getTime() - 24 * 60 * 60 * 1000);
  const window7dStartUtc = new Date(todayStartUtc.getTime() - 7 * 24 * 60 * 60 * 1000);
  const window30dStartUtc = new Date(todayStartUtc.getTime() - 30 * 24 * 60 * 60 * 1000);

  const todayIso = todayStartUtc.toISOString();
  const yesterdayIso = yesterdayStartUtc.toISOString();
  const window7dIso = window7dStartUtc.toISOString();
  const window30dIso = window30dStartUtc.toISOString();

  const events: Array<{ key: string; label: string }> = [
    // Discovery
    { key: "map_viewed", label: "Map: viewed" },
    { key: "homepage_cta_clicked", label: "Homepage: CTA clicked" },
    { key: "homepage_sport_chip_clicked", label: "Homepage: sport chip clicked" },
    { key: "venue_page_viewed", label: "Venue page viewed" },
    { key: "weekend_page_opened", label: "Weekend page opened" },
    // Tournament detail
    { key: "tournament_detail_page_viewed", label: "Tournament detail: page viewed" },
    { key: "tournament_detail_venue_map_clicked", label: "Tournament detail: venue map clicked" },
    { key: "tournament_detail_weekend_plan_clicked", label: "Tournament detail: weekend plan clicked" },
    { key: "tournament_detail_travel_search_clicked", label: "Tournament detail: travel search clicked" },
    // Directory
    { key: "tournament_directory_page_viewed", label: "Tournament directory: page viewed" },
    { key: "search_submitted", label: "Search submitted" },
    { key: "tournament_card_plan_weekend_clicked", label: "Tournament directory card: plan weekend clicked" },
    // Tournament map
    { key: "tournament_map_cta_clicked", label: "Tournament map CTA clicked" },
    { key: "tournament_map_loaded_from_venue", label: "Tournament map: loaded from venue" },
    { key: "tournament_map_back_to_tournament_clicked", label: "Tournament map: back to tournament clicked" },
    { key: "tournament_map_weekend_plan_clicked", label: "Tournament map: weekend plan clicked" },
    { key: "tournament_map_add_to_planner_clicked", label: "Tournament map: add to planner clicked" },
    // Venue map
    { key: "venue_map_opened", label: "Venue map opened" },
    { key: "venue_map_loaded", label: "Venue map loaded" },
    { key: "venue_select", label: "Venue map: venue selected" },
    { key: "directions_click", label: "Venue map: directions clicked" },
    { key: "hotels_click", label: "Venue map: hotels clicked" },
    { key: "venue_view_click", label: "Venue map: view venue clicked" },
    { key: "nearest_airport_click", label: "Venue map: nearest airport clicked" },
    { key: "venue_map_hotels_clicked", label: "Map panel hotels clicked" },
    { key: "venue_hotels_cta_clicked", label: "Venue hotels CTA clicked" },
    // Venue directory
    { key: "venue_directory_plan_map_click", label: "Venue directory: plan map clicked" },
    { key: "venue_directory_view_venue_click", label: "Venue directory: view venue clicked" },
    // Weekend share
    { key: "weekend_share_clicked", label: "Weekend share clicked" },
    { key: "weekend_share_venue_map_clicked", label: "Weekend share: venue map clicked" },
    { key: "weekend_share_travel_clicked", label: "Weekend share: travel clicked" },
    { key: "weekend_share_planner_hub_clicked", label: "Weekend share: planner hub clicked" },
    { key: "weekend_share_directions_clicked", label: "Weekend share: directions clicked" },
    { key: "weekend_share_airport_directions_clicked", label: "Weekend share: airport directions clicked" },
    { key: "weekend_share_owls_eye_directions_clicked", label: "Weekend share: Owl's Eye directions clicked" },
    // Weekend planner
    { key: "weekend_planner_saved_tournament_clicked", label: "Weekend planner: saved open tournament clicked" },
    { key: "weekend_planner_saved_weekend_plan_clicked", label: "Weekend planner: saved weekend plan clicked" },
    { key: "weekend_planner_saved_venue_map_clicked", label: "Weekend planner: saved venue map clicked" },
    { key: "weekend_planner_saved_travel_clicked", label: "Weekend planner: saved travel clicked" },
    // Weekend planner (Stage 2.7)
    { key: "planner_calendar_feed_connect_succeeded", label: "Planner: calendar connect succeeded" },
    { key: "planner_calendar_feed_connect_failed", label: "Planner: calendar connect failed" },
    { key: "planner_calendar_feed_limit_reached", label: "Planner: calendar feed limit reached" },
    { key: "planner_calendar_feed_refresh_clicked", label: "Planner: calendar refresh clicked" },
    { key: "planner_calendar_feed_refresh_succeeded", label: "Planner: calendar refresh succeeded" },
    { key: "planner_calendar_feed_refresh_failed", label: "Planner: calendar refresh failed" },
    { key: "planner_view_toggle_clicked", label: "Planner: view toggle clicked" },
    { key: "planner_calendar_timezone_changed", label: "Planner: calendar timezone changed" },
    { key: "planner_load_more_clicked", label: "Planner: load more clicked" },
    { key: "planner_manual_event_created", label: "Planner: manual event created" },
    { key: "planner_manual_event_updated", label: "Planner: manual event updated" },
    { key: "planner_manual_event_deleted", label: "Planner: manual event deleted" },
    { key: "planner_duplicate_keep_separate_clicked", label: "Planner: duplicate keep separate clicked" },
    { key: "planner_duplicate_merge_modal_opened", label: "Planner: merge modal opened" },
    { key: "planner_duplicate_merge_succeeded", label: "Planner: merge succeeded" },
    { key: "planner_duplicate_merge_failed", label: "Planner: merge failed" },
    { key: "planner_weekend_pro_gate_viewed", label: "Planner: Weekend Pro gate viewed" },
    { key: "planner_weekend_pro_gate_clicked", label: "Planner: Weekend Pro gate clicked" },
    { key: "planner_map_view_opened", label: "Planner: map opened" },
    { key: "planner_calendar_event_detail_opened", label: "Planner: calendar event detail opened" },
    // Conversion
    { key: "partner_click_clicked", label: "Partner click: outbound clicked" },
    { key: "premium_modal_viewed", label: "Premium modal viewed" },
    { key: "premium_cta_clicked", label: "Premium CTA clicked" },
    { key: "tier_gate_hit", label: "Tier gate hit" },
    // Owl's Eye
    { key: "owls_eye_unlock_prompt_shown", label: "Owl's Eye unlock prompt shown" },
    { key: "owls_eye_full_opened", label: "Owl's Eye full opened" },
    { key: "owls_eye_category_expanded", label: "Owl's Eye category expanded" },
    { key: "owls_eye_category_pins_enabled", label: "Owl's Eye category pins enabled" },
    { key: "owls_eye_result_selected", label: "Owl's Eye result selected" },
    { key: "owls_eye_directions_clicked", label: "Owl's Eye directions clicked" },
    { key: "owls_eye_limited_continue", label: "Owl's Eye limited continue" },
    { key: "owls_eye_preview_shown", label: "Owl's Eye preview shown" },
    { key: "owls_eye_preview_pin_click", label: "Owl's Eye preview pin clicked" },
    { key: "owls_eye_preview_directions_click", label: "Owl's Eye preview directions clicked" },
    { key: "owls_eye_preview_upgrade_click", label: "Owl's Eye preview upgrade clicked" },
    { key: "owls_eye_preview_hotel_booking_click", label: "Owl's Eye preview hotel booking clicked" },
    // Book Travel
    { key: "book_travel_viewed", label: "Book travel: page viewed" },
    { key: "book_travel_hotels_clicked", label: "Book travel: hotels clicked" },
    { key: "book_travel_vrbo_clicked", label: "Book travel: vrbo clicked" },
    { key: "book_travel_shared", label: "Book travel: shared" },
    { key: "book_travel_search_by_city_clicked", label: "Book travel: search by city clicked" },
    { key: "book_travel_add_event_clicked", label: "Book travel: add event clicked" },
    { key: "book_travel_tournament_directory_clicked", label: "Book travel: tournament directory clicked" },
    { key: "book_travel_weekend_pro_upsell_clicked", label: "Book travel: weekend pro upsell clicked" },
  ];

  const counts = await Promise.all(
    events.map(async (evt) => {
      const [todayRes, yesterdayRes, total7dRes, total30dRes] = await Promise.all([
        supabaseAdmin
          .from("ti_map_events" as any)
          .select("id", { count: "exact", head: true })
          .eq("event_name", evt.key)
          .gte("created_at", todayIso),
        supabaseAdmin
          .from("ti_map_events" as any)
          .select("id", { count: "exact", head: true })
          .eq("event_name", evt.key)
          .gte("created_at", yesterdayIso)
          .lt("created_at", todayIso),
        supabaseAdmin
          .from("ti_map_events" as any)
          .select("id", { count: "exact", head: true })
          .eq("event_name", evt.key)
          .gte("created_at", window7dIso)
          .lt("created_at", todayIso),
        supabaseAdmin
          .from("ti_map_events" as any)
          .select("id", { count: "exact", head: true })
          .eq("event_name", evt.key)
          .gte("created_at", window30dIso)
          .lt("created_at", todayIso),
      ]);

      return {
        key: evt.key,
        label: evt.label,
        today: toCount(todayRes as any),
        yesterday: toCount(yesterdayRes as any),
        last7d: toCount(total7dRes as any),
        last30d: toCount(total30dRes as any),
      };
    })
  );

  // Outbound click counts from ti_outbound_clicks (server-side, all pages)
  const [hotelsYesterdayRes, hotels7dRes, vrboYesterdayRes, vrbo7dRes] = await Promise.all([
    supabaseAdmin.from("ti_outbound_clicks" as any).select("id", { count: "exact", head: true }).eq("destination_type", "hotels").gte("created_at", yesterdayIso).lt("created_at", todayIso),
    supabaseAdmin.from("ti_outbound_clicks" as any).select("id", { count: "exact", head: true }).eq("destination_type", "hotels").gte("created_at", window7dIso).lt("created_at", todayIso),
    supabaseAdmin.from("ti_outbound_clicks" as any).select("id", { count: "exact", head: true }).eq("destination_type", "vrbo").gte("created_at", yesterdayIso).lt("created_at", todayIso),
    supabaseAdmin.from("ti_outbound_clicks" as any).select("id", { count: "exact", head: true }).eq("destination_type", "vrbo").gte("created_at", window7dIso).lt("created_at", todayIso),
  ]);

  const outbound = {
    hotels: { yesterday: toCount(hotelsYesterdayRes as any), last7d: toCount(hotels7dRes as any) },
    vrbo: { yesterday: toCount(vrboYesterdayRes as any), last7d: toCount(vrbo7dRes as any) },
    // Fanatics goes through /go/partner/[id] → ti_map_events partner_click_clicked (no ti_outbound_clicks row).
    // Currently the only active partner, so partner_click_clicked total ≈ fanatics clicks.
    fanatics: {
      yesterday: counts.find((r) => r.key === "partner_click_clicked")?.yesterday ?? 0,
      last7d: counts.find((r) => r.key === "partner_click_clicked")?.last7d ?? 0,
    },
  };

  // RPC calls for top viewed (JSONB aggregations need server-side functions)
  const [topTournamentsRes, topVenuesRes, topSportsRes, topStatesRes] = await Promise.all([
    (supabaseAdmin as any).rpc("admin_top_viewed_tournaments", { since_iso: window30dIso, result_limit: 10 }),
    (supabaseAdmin as any).rpc("admin_top_viewed_venues", { since_iso: window30dIso, result_limit: 10 }),
    (supabaseAdmin as any).rpc("admin_top_sports_by_views", { since_iso: window30dIso, result_limit: 5 }),
    (supabaseAdmin as any).rpc("admin_top_states_by_venue_opens", { since_iso: window30dIso, result_limit: 5 }),
  ]);

  const topTournaments: TopTournamentRow[] = topTournamentsRes.error ? [] : ((topTournamentsRes.data ?? []) as TopTournamentRow[]);
  const topVenues: TopVenueRow[] = topVenuesRes.error ? [] : ((topVenuesRes.data ?? []) as TopVenueRow[]);
  const topSports: TopDimensionRow[] = topSportsRes.error ? [] : ((topSportsRes.data ?? []) as TopDimensionRow[]);
  const topStates: TopDimensionRow[] = topStatesRes.error ? [] : ((topStatesRes.data ?? []) as TopDimensionRow[]);

  // KPI tile helpers
  function sumByKeys(keys: string[], field: "today" | "yesterday" | "last7d" | "last30d") {
    return counts.filter((r) => keys.includes(r.key)).reduce((acc, r) => acc + r[field], 0);
  }

  const kpi = {
    detailViews: counts.find((r) => r.key === "tournament_detail_page_viewed") ?? { today: 0, yesterday: 0, last7d: 0, last30d: 0 },
    venueMapOpens: counts.find((r) => r.key === "venue_map_opened") ?? { today: 0, yesterday: 0, last7d: 0, last30d: 0 },
    weekendPlanClicks: {
      yesterday: sumByKeys(["tournament_detail_weekend_plan_clicked", "tournament_map_weekend_plan_clicked"], "yesterday"),
      last7d: sumByKeys(["tournament_detail_weekend_plan_clicked", "tournament_map_weekend_plan_clicked"], "last7d"),
    },
    travelSearchClicks: {
      yesterday: sumByKeys(
        ["tournament_detail_travel_search_clicked", "weekend_share_travel_clicked", "book_travel_hotels_clicked", "book_travel_vrbo_clicked"],
        "yesterday"
      ),
      last7d: sumByKeys(
        ["tournament_detail_travel_search_clicked", "weekend_share_travel_clicked", "book_travel_hotels_clicked", "book_travel_vrbo_clicked"],
        "last7d"
      ),
    },
    owlsEyeOpens: counts.find((r) => r.key === "owls_eye_full_opened") ?? { today: 0, yesterday: 0, last7d: 0, last30d: 0 },
    premiumCtaClicks: counts.find((r) => r.key === "premium_cta_clicked") ?? { today: 0, yesterday: 0, last7d: 0, last30d: 0 },
  };

  // Funnel: directory → detail → venue map → weekend plan → travel
  const funnel = [
    { label: "Directory views", value: counts.find((r) => r.key === "tournament_directory_page_viewed")?.yesterday ?? 0 },
    { label: "Detail views", value: counts.find((r) => r.key === "tournament_detail_page_viewed")?.yesterday ?? 0 },
    { label: "Venue map opens", value: counts.find((r) => r.key === "venue_map_opened")?.yesterday ?? 0 },
    {
      label: "Weekend plan clicks",
      value: sumByKeys(["tournament_detail_weekend_plan_clicked", "tournament_map_weekend_plan_clicked"], "yesterday"),
    },
    {
      label: "Travel search clicks",
      value: sumByKeys(["tournament_detail_travel_search_clicked", "weekend_share_travel_clicked"], "yesterday"),
    },
  ];

  const tileStyle: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fff" };
  const tileLabelStyle: React.CSSProperties = { fontSize: 12, textTransform: "uppercase", fontWeight: 800, color: "#6b7280" };
  const tileValueStyle: React.CSSProperties = { fontSize: 30, fontWeight: 950, lineHeight: 1.1, marginTop: 4 };
  const tileMetaStyle: React.CSSProperties = { marginTop: 6, fontSize: 12, color: "#6b7280", fontWeight: 800 };

  const title = "TI Clicks / Engagement";

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 10 }}>{title}</h1>
      <div style={{ marginBottom: 12 }}>
        <AdminNav />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Link href="/admin" className="cta secondary" style={{ padding: "8px 12px" }}>
          ← Back to Admin
        </Link>
        <Link href="/admin/ti/revenue" className="cta secondary" style={{ padding: "8px 12px" }}>
          Revenue →
        </Link>
        <Link href="/admin/ti/outbound" className="cta secondary" style={{ padding: "8px 12px" }}>
          Outbound →
        </Link>
      </div>

      {/* Window info */}
      <div style={{ ...tileStyle, marginBottom: 16 }}>
        <div style={tileLabelStyle}>Window</div>
        <div style={{ marginTop: 6, fontSize: 13, color: "#111", fontWeight: 800 }}>
          Yesterday: {yesterdayStartUtc.toISOString().slice(0, 10)} (UTC) • Last 7 days: {window7dStartUtc.toISOString().slice(0, 10)} →{" "}
          {todayStartUtc.toISOString().slice(0, 10)} (UTC) • Last 30 days: {window30dStartUtc.toISOString().slice(0, 10)} →{" "}
          {todayStartUtc.toISOString().slice(0, 10)} (UTC)
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
          Source: `public.ti_map_events` (persisted by TI `/api/analytics` allowlist). Localhost events are skipped unless
          `ENABLE_TI_ANALYTICS_TRACKING=true`.
        </div>
      </div>

      {/* KPI health tiles */}
      <div style={{ fontSize: 13, fontWeight: 900, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        Health — Yesterday
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div style={tileStyle}>
          <div style={tileLabelStyle}>Tournament views</div>
          <div style={tileValueStyle}>{kpi.detailViews.yesterday.toLocaleString("en-US")}</div>
          <div style={tileMetaStyle}>7d avg {Math.round(kpi.detailViews.last7d / 7).toLocaleString("en-US")} / day</div>
        </div>
        <div style={tileStyle}>
          <div style={tileLabelStyle}>Venue map opens</div>
          <div style={tileValueStyle}>{kpi.venueMapOpens.yesterday.toLocaleString("en-US")}</div>
          <div style={tileMetaStyle}>7d avg {Math.round(kpi.venueMapOpens.last7d / 7).toLocaleString("en-US")} / day</div>
        </div>
        <div style={tileStyle}>
          <div style={tileLabelStyle}>Weekend plan clicks</div>
          <div style={tileValueStyle}>{kpi.weekendPlanClicks.yesterday.toLocaleString("en-US")}</div>
          <div style={tileMetaStyle}>7d avg {Math.round(kpi.weekendPlanClicks.last7d / 7).toLocaleString("en-US")} / day</div>
        </div>
        <div style={tileStyle}>
          <div style={tileLabelStyle}>Travel search clicks</div>
          <div style={tileValueStyle}>{kpi.travelSearchClicks.yesterday.toLocaleString("en-US")}</div>
          <div style={tileMetaStyle}>7d avg {Math.round(kpi.travelSearchClicks.last7d / 7).toLocaleString("en-US")} / day</div>
        </div>
        <div style={tileStyle}>
          <div style={tileLabelStyle}>Owl's Eye opens</div>
          <div style={tileValueStyle}>{kpi.owlsEyeOpens.yesterday.toLocaleString("en-US")}</div>
          <div style={tileMetaStyle}>7d avg {Math.round(kpi.owlsEyeOpens.last7d / 7).toLocaleString("en-US")} / day</div>
        </div>
        <div style={tileStyle}>
          <div style={tileLabelStyle}>Premium CTA clicks</div>
          <div style={tileValueStyle}>{kpi.premiumCtaClicks.yesterday.toLocaleString("en-US")}</div>
          <div style={tileMetaStyle}>7d avg {Math.round(kpi.premiumCtaClicks.last7d / 7).toLocaleString("en-US")} / day</div>
        </div>
      </div>

      {/* Outbound clicks */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Outbound Clicks — Yesterday
        </div>
        <Link href="/admin/ti/revenue" className="cta secondary" style={{ padding: "6px 10px", fontSize: 12 }}>
          Full revenue →
        </Link>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div style={tileStyle}>
          <div style={tileLabelStyle}>Hotels clicks</div>
          <div style={tileValueStyle}>{outbound.hotels.yesterday.toLocaleString("en-US")}</div>
          <div style={tileMetaStyle}>7d avg {Math.round(outbound.hotels.last7d / 7).toLocaleString("en-US")} / day • all pages</div>
        </div>
        <div style={tileStyle}>
          <div style={tileLabelStyle}>Vrbo clicks</div>
          <div style={tileValueStyle}>{outbound.vrbo.yesterday.toLocaleString("en-US")}</div>
          <div style={tileMetaStyle}>7d avg {Math.round(outbound.vrbo.last7d / 7).toLocaleString("en-US")} / day • all pages</div>
        </div>
        <div style={tileStyle}>
          <div style={tileLabelStyle}>Fanatics clicks</div>
          <div style={tileValueStyle}>{outbound.fanatics.yesterday.toLocaleString("en-US")}</div>
          <div style={tileMetaStyle}>7d avg {Math.round(outbound.fanatics.last7d / 7).toLocaleString("en-US")} / day • partner_click_clicked</div>
        </div>
      </div>

      {/* Conversion funnel */}
      <div style={{ fontSize: 13, fontWeight: 900, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        Conversion funnel — Yesterday
      </div>
      <div style={{ ...tileStyle, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "stretch", gap: 0, overflowX: "auto" }}>
          {funnel.map((step, i) => {
            const prevValue = i > 0 ? funnel[i - 1].value : null;
            const dropPct = prevValue != null && prevValue > 0 ? Math.round((step.value / prevValue) * 100) : null;
            return (
              <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                <div
                  style={{
                    padding: "10px 14px",
                    textAlign: "center",
                    minWidth: 110,
                  }}
                >
                  <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 800, textTransform: "uppercase", marginBottom: 4 }}>
                    {step.label}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 950, color: "#111" }}>{step.value.toLocaleString("en-US")}</div>
                  {dropPct != null ? (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        fontWeight: 900,
                        color: dropPct >= 20 ? "#16a34a" : dropPct >= 5 ? "#b45309" : "#b91c1c",
                      }}
                    >
                      {dropPct}% through-rate
                    </div>
                  ) : null}
                </div>
                {i < funnel.length - 1 ? (
                  <div style={{ fontSize: 18, color: "#d1d5db", fontWeight: 900, padding: "0 2px", flexShrink: 0 }}>→</div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "#9ca3af", fontWeight: 800 }}>
          Through-rate = step ÷ previous step (yesterday only; zeros are expected on low-traffic days)
        </div>
      </div>

      {/* Event counts table */}
      <div style={{ fontSize: 13, fontWeight: 900, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        Event counts
      </div>
      <ClicksTableClient rows={counts} />

      {/* Top viewed: tournaments + venues */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 16,
          marginTop: 20,
          marginBottom: 20,
        }}
      >
        <div style={tileStyle}>
          <div style={tileLabelStyle}>Top 10 viewed tournaments — last 30d</div>
          {topTournamentsRes.error ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>
              RPC error — apply migration `20260525_admin_analytics_rpcs.sql` first.
            </div>
          ) : topTournaments.length === 0 ? (
            <div style={tileMetaStyle}>No data yet</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
              <tbody>
                {topTournaments.map((row) => (
                  <tr key={row.tournament_id} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "6px 0", fontSize: 13, fontWeight: 800, color: "#111" }}>
                      {row.name ?? row.tournament_id}
                      {row.start_date ? (
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginTop: 1 }}>
                          {row.start_date}{row.end_date && row.end_date !== row.start_date ? ` – ${row.end_date}` : ""}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: "6px 0", textAlign: "right", fontSize: 13, fontWeight: 950, color: "#374151", whiteSpace: "nowrap" }}>
                      {Number(row.view_count).toLocaleString("en-US")} views
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={tileStyle}>
          <div style={tileLabelStyle}>Top 10 tournament venue maps — last 30d</div>
          {topVenuesRes.error ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>
              RPC error — apply migration `20260527_admin_venue_map_rpc_fix.sql` first.
            </div>
          ) : topVenues.length === 0 ? (
            <div style={tileMetaStyle}>No data yet</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
              <tbody>
                {topVenues.map((row) => (
                  <tr key={row.tournament_id} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "6px 0", fontSize: 13, fontWeight: 800, color: "#111" }}>
                      {row.name ?? row.tournament_id}
                      {row.start_date ? (
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginTop: 1 }}>
                          {row.start_date}{row.end_date && row.end_date !== row.start_date ? ` – ${row.end_date}` : ""}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: "6px 0", textAlign: "right", fontSize: 13, fontWeight: 950, color: "#374151", whiteSpace: "nowrap" }}>
                      {Number(row.view_count).toLocaleString("en-US")} opens
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Dimension snapshot */}
      <div style={{ fontSize: 13, fontWeight: 900, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        Dimension snapshot — last 30d
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 16 }}>
        <div style={tileStyle}>
          <div style={tileLabelStyle}>Top sports by tournament views</div>
          {topSportsRes.error ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>RPC error — apply migration first.</div>
          ) : topSports.length === 0 ? (
            <div style={tileMetaStyle}>No data yet</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
              <tbody>
                {topSports.map((row) => (
                  <tr key={row.sport} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "5px 0", fontSize: 13, fontWeight: 800, color: "#111", textTransform: "capitalize" }}>
                      {row.sport}
                    </td>
                    <td style={{ padding: "5px 0", textAlign: "right", fontSize: 13, fontWeight: 950, color: "#374151" }}>
                      {Number(row.view_count).toLocaleString("en-US")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={tileStyle}>
          <div style={tileLabelStyle}>Top states by venue map opens</div>
          {topStatesRes.error ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>RPC error — apply migration first.</div>
          ) : topStates.length === 0 ? (
            <div style={tileMetaStyle}>No data yet</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
              <tbody>
                {topStates.map((row) => (
                  <tr key={row.state} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "5px 0", fontSize: 13, fontWeight: 800, color: "#111" }}>{row.state}</td>
                    <td style={{ padding: "5px 0", textAlign: "right", fontSize: 13, fontWeight: 950, color: "#374151" }}>
                      {Number(row.open_count).toLocaleString("en-US")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
