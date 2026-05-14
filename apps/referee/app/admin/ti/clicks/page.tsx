import Link from "next/link";

import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function toCount(res: { error: any; count?: number | null }) {
  return res.error ? 0 : res.count ?? 0;
}

export default async function TiClicksPage() {
  await requireAdmin();

  const now = new Date();
  const todayStartUtc = startOfUtcDay(now);
  const yesterdayStartUtc = new Date(todayStartUtc.getTime() - 24 * 60 * 60 * 1000);
  const window30dStartUtc = new Date(todayStartUtc.getTime() - 30 * 24 * 60 * 60 * 1000);

  const yesterdayIso = yesterdayStartUtc.toISOString();
  const todayIso = todayStartUtc.toISOString();
  const window30dIso = window30dStartUtc.toISOString();

  const events: Array<{ key: string; label: string }> = [
    { key: "tournament_detail_venue_map_clicked", label: "Tournament detail: venue map clicked" },
    { key: "tournament_detail_weekend_plan_clicked", label: "Tournament detail: weekend plan clicked" },
    { key: "tournament_detail_travel_search_clicked", label: "Tournament detail: travel search clicked" },
    { key: "tournament_map_cta_clicked", label: "Tournament map CTA clicked" },
    { key: "tournament_map_back_to_tournament_clicked", label: "Tournament map: back to tournament clicked" },
    { key: "tournament_map_weekend_plan_clicked", label: "Tournament map: weekend plan clicked" },
    { key: "tournament_map_add_to_planner_clicked", label: "Tournament map: add to planner clicked" },
    { key: "venue_map_opened", label: "Venue map opened" },
    { key: "venue_map_loaded", label: "Venue map loaded" },
    { key: "venue_map_hotels_clicked", label: "Map panel hotels clicked" },
    { key: "weekend_share_clicked", label: "Weekend share clicked" },
    { key: "weekend_share_venue_map_clicked", label: "Weekend share: venue map clicked" },
    { key: "weekend_share_travel_clicked", label: "Weekend share: travel clicked" },
    { key: "weekend_share_planner_hub_clicked", label: "Weekend share: planner hub clicked" },
    { key: "weekend_share_directions_clicked", label: "Weekend share: directions clicked" },
    { key: "weekend_share_airport_directions_clicked", label: "Weekend share: airport directions clicked" },
    { key: "weekend_share_owls_eye_directions_clicked", label: "Weekend share: Owl’s Eye directions clicked" },
    { key: "weekend_planner_saved_tournament_clicked", label: "Weekend planner: saved open tournament clicked" },
    { key: "weekend_planner_saved_weekend_plan_clicked", label: "Weekend planner: saved weekend plan clicked" },
    { key: "weekend_planner_saved_venue_map_clicked", label: "Weekend planner: saved venue map clicked" },
    { key: "weekend_planner_saved_travel_clicked", label: "Weekend planner: saved travel clicked" },
    { key: "partner_click_clicked", label: "Partner click: outbound clicked" },
    { key: "premium_modal_viewed", label: "Premium modal viewed" },
    { key: "premium_cta_clicked", label: "Premium CTA clicked" },
    { key: "owls_eye_unlock_prompt_shown", label: "Owl’s Eye unlock prompt shown" },
    { key: "owls_eye_full_opened", label: "Owl’s Eye full opened" },
    { key: "owls_eye_category_expanded", label: "Owl’s Eye category expanded" },
    { key: "owls_eye_category_pins_enabled", label: "Owl’s Eye category pins enabled" },
    { key: "owls_eye_result_selected", label: "Owl’s Eye result selected" },
    { key: "owls_eye_directions_clicked", label: "Owl’s Eye directions clicked" },
  ];

  const counts = await Promise.all(
    events.map(async (evt) => {
      const [yesterdayRes, total30dRes] = await Promise.all([
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
          .gte("created_at", window30dIso)
          .lt("created_at", todayIso),
      ]);

      return {
        key: evt.key,
        label: evt.label,
        yesterday: toCount(yesterdayRes as any),
        last30d: toCount(total30dRes as any),
      };
    })
  );

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

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          background: "#fff",
          padding: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900, textTransform: "uppercase" }}>Window</div>
        <div style={{ marginTop: 6, fontSize: 13, color: "#111", fontWeight: 800 }}>
          Yesterday: {yesterdayStartUtc.toISOString().slice(0, 10)} (UTC) • Last 30 days: {window30dStartUtc.toISOString().slice(0, 10)} →{" "}
          {todayStartUtc.toISOString().slice(0, 10)} (UTC)
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
          Source: `public.ti_map_events` (persisted by TI `/api/analytics` allowlist). Localhost events are skipped unless `ENABLE_TI_ANALYTICS_TRACKING=true`.
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Event</th>
              <th style={{ textAlign: "right", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Yesterday</th>
              <th style={{ textAlign: "right", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Last 30d</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((row) => (
              <tr key={row.key} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={{ padding: "10px 8px", fontWeight: 900, color: "#111", minWidth: 320 }}>{row.label}</td>
                <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 950 }}>{row.yesterday.toLocaleString("en-US")}</td>
                <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 950 }}>{row.last30d.toLocaleString("en-US")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
