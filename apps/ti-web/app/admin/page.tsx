import Link from "next/link";
import { requireTiOutreachAdmin } from "@/lib/outreachAdmin";
import { loadAdminDashboardEmailTiles } from "@/lib/adminDashboardEmail";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatInt(value: unknown) {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function formatDelta(value: unknown) {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(n) || n === 0) return "";
  return n > 0 ? `+${formatInt(n)}` : `-${formatInt(Math.abs(n))}`;
}

function Tile({
  label,
  value,
  delta,
  tone = "neutral",
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: "neutral" | "info" | "warn" | "success";
}) {
  const bg =
    tone === "warn" ? "#fef3c7" : tone === "success" ? "#ecfdf3" : tone === "info" ? "#eff6ff" : "#f8fafc";
  const border =
    tone === "warn" ? "#fde68a" : tone === "success" ? "#bbf7d0" : tone === "info" ? "#bfdbfe" : "#e2e8f0";
  const color =
    tone === "warn" ? "#92400e" : tone === "success" ? "#166534" : tone === "info" ? "#1d4ed8" : "#0f172a";

  return (
    <div style={{ border: `1px solid ${border}`, background: bg, borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color, marginTop: 2, lineHeight: 1.1 }}>{value}</div>
      {delta ? (
        <div style={{ marginTop: 4, fontSize: 12, color: "#64748b", fontWeight: 800 }}>{delta} yesterday</div>
      ) : (
        <div style={{ marginTop: 4, fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>&nbsp;</div>
      )}
    </div>
  );
}

async function countEventSince(eventName: string, sinceIso: string) {
  const { count, error } = await supabaseAdmin
    .from("ti_map_events" as any)
    .select("id", { count: "exact", head: true })
    .gte("created_at", sinceIso)
    .eq("event_name", eventName);

  if (error) return { ok: false as const, count: 0, error: error.message };
  return { ok: true as const, count: count ?? 0, error: null as string | null };
}

export default async function TiAdminDashboardPage() {
  await requireTiOutreachAdmin("/admin");

  const tiles = await loadAdminDashboardEmailTiles();
  const generatedAtIso = new Date().toISOString();

  const dbTotal = Number((tiles as any)?.tournaments_db?.total ?? 0) || 0;
  const publishedTotal = Number((tiles as any)?.public_directory?.total ?? tiles?.canonical?.total ?? 0) || 0;
  const publishedNew = Number((tiles as any)?.public_directory?.new_yesterday ?? tiles?.canonical?.new_yesterday ?? 0) || 0;
  const missingVenuesTotal = Number(tiles?.missing_venues?.total ?? 0) || 0;
  const missingVenuesNew = Number(tiles?.missing_venues?.new_yesterday ?? 0) || 0;
  const owlsEyeTotal = Number(tiles?.owls_eye?.venues_reviewed_total ?? 0) || 0;
  const owlsEyeNew = Number(tiles?.owls_eye?.venues_reviewed_new_yesterday ?? 0) || 0;
  const venueCheckTotal = Number(tiles?.venue_check?.submissions_total ?? 0) || 0;
  const venueCheckNew = Number(tiles?.venue_check?.submissions_new_yesterday ?? 0) || 0;
  const tiInsiderTotal = Number(tiles?.ti_users?.insider_total ?? 0) || 0;
  const tiInsiderNew = Number(tiles?.ti_users?.insider_new_yesterday ?? 0) || 0;
  const tiWeekendTotal = Number(tiles?.ti_users?.weekend_pro_total ?? 0) || 0;
  const tiWeekendNew = Number(tiles?.ti_users?.weekend_pro_new_yesterday ?? 0) || 0;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [views7d, filter7d, stateClicks7d, cta7d, chip7d, recentRes] = await Promise.all([
    countEventSince("map_viewed", since),
    countEventSince("map_filter_changed", since),
    countEventSince("map_state_clicked", since),
    countEventSince("homepage_cta_clicked", since),
    countEventSince("homepage_sport_chip_clicked", since),
    supabaseAdmin
      .from("ti_map_events" as any)
      .select("created_at,event_name,page_type,sport,state,cta,filter_name,old_value,new_value,href")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const recentEventsOk = !recentRes.error;
  const recentEvents = (recentRes.data ?? []) as Array<{
    created_at?: string | null;
    event_name?: string | null;
    page_type?: string | null;
    sport?: string | null;
    state?: string | null;
    cta?: string | null;
    filter_name?: string | null;
    old_value?: string | null;
    new_value?: string | null;
    href?: string | null;
  }>;

  const mapEventsReady = views7d.ok && filter7d.ok && stateClicks7d.ok && recentEventsOk;

  return (
    <main className="ti-shell" style={{ paddingBottom: 40 }}>
      <section className="bodyCard" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
          <h1 style={{ margin: 0 }}>Admin</h1>
          <div style={{ fontSize: 12, color: "#64748b" }}>Updated: {generatedAtIso}</div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
          <Link href="/admin/dashboard-email">Admin Dashboard Email</Link>
          <Link href="/admin/outreach-dashboard">Outreach Dashboard</Link>
          <Link href="/heatmap?sport=all">Public Heatmap</Link>
        </div>

        <h2 style={{ margin: "6px 0 0 0", fontSize: 16 }}>Today’s Tiles</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <Tile label="Total tournaments in DB" value={formatInt(dbTotal)} tone="info" />
          <Tile
            label="Published (public directory)"
            value={formatInt(publishedTotal)}
            delta={formatDelta(publishedNew)}
            tone="info"
          />
          <Tile label="Missing venues" value={formatInt(missingVenuesTotal)} delta={formatDelta(missingVenuesNew)} tone="warn" />
          <Tile
            label="Owl's Eye venues reviewed"
            value={formatInt(owlsEyeTotal)}
            delta={formatDelta(owlsEyeNew)}
            tone="success"
          />
          <Tile
            label="Venue check submissions"
            value={formatInt(venueCheckTotal)}
            delta={formatDelta(venueCheckNew)}
            tone="success"
          />
          <div style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              TI users
            </div>
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 900, color: "#166534", lineHeight: 1.2 }}>
              Insider: {formatInt(tiInsiderTotal)} {formatDelta(tiInsiderNew) ? `(${formatDelta(tiInsiderNew)} yesterday)` : ""}
            </div>
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 900, color: "#166534", lineHeight: 1.2 }}>
              Weekend Pro: {formatInt(tiWeekendTotal)}{" "}
              {formatDelta(tiWeekendNew) ? `(${formatDelta(tiWeekendNew)} yesterday)` : ""}
            </div>
          </div>
        </div>

        <h2 style={{ margin: "10px 0 0 0", fontSize: 16 }}>Map Analytics (last 7 days)</h2>
        {!mapEventsReady ? (
          <div style={{ border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: 12, padding: "10px 12px" }}>
            Map event storage is not available yet. Apply migration `supabase/migrations/20260409_ti_map_analytics_events.sql`.
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <Tile label="Map views" value={formatInt(views7d.count)} tone="info" />
              <Tile label="Sport filter changes" value={formatInt(filter7d.count)} tone="neutral" />
              <Tile label="State clicks" value={formatInt(stateClicks7d.count)} tone="success" />
              <Tile label="Homepage CTA clicks" value={formatInt(cta7d.count)} tone="neutral" />
              <Tile label="Sport chip clicks" value={formatInt(chip7d.count)} tone="neutral" />
            </div>

            <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "10px 12px", background: "#f8fafc", fontWeight: 800, fontSize: 13 }}>
                Recent events
              </div>
              <div style={{ overflowX: "auto", background: "#fff" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: "left", background: "#ffffff" }}>
                      <th style={{ padding: "8px 10px", borderBottom: "1px solid #e2e8f0" }}>Time</th>
                      <th style={{ padding: "8px 10px", borderBottom: "1px solid #e2e8f0" }}>Event</th>
                      <th style={{ padding: "8px 10px", borderBottom: "1px solid #e2e8f0" }}>Page</th>
                      <th style={{ padding: "8px 10px", borderBottom: "1px solid #e2e8f0" }}>Sport</th>
                      <th style={{ padding: "8px 10px", borderBottom: "1px solid #e2e8f0" }}>State</th>
                      <th style={{ padding: "8px 10px", borderBottom: "1px solid #e2e8f0" }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentEvents.map((row, idx) => {
                      const time = row.created_at ? new Date(row.created_at).toLocaleString() : "—";
                      const details =
                        row.event_name === "map_filter_changed"
                          ? `${row.filter_name ?? ""}: ${row.old_value ?? ""} → ${row.new_value ?? ""}`.trim()
                          : row.event_name === "homepage_cta_clicked"
                          ? `cta=${row.cta ?? ""}`.trim()
                          : row.href
                          ? row.href
                          : "";
                      return (
                        <tr key={`${row.created_at ?? "t"}-${idx}`}>
                          <td style={{ padding: "8px 10px", borderTop: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>
                            {time}
                          </td>
                          <td style={{ padding: "8px 10px", borderTop: "1px solid #e2e8f0" }}>{row.event_name ?? "—"}</td>
                          <td style={{ padding: "8px 10px", borderTop: "1px solid #e2e8f0" }}>{row.page_type ?? "—"}</td>
                          <td style={{ padding: "8px 10px", borderTop: "1px solid #e2e8f0" }}>{row.sport ?? "—"}</td>
                          <td style={{ padding: "8px 10px", borderTop: "1px solid #e2e8f0" }}>{row.state ?? "—"}</td>
                          <td style={{ padding: "8px 10px", borderTop: "1px solid #e2e8f0", maxWidth: 520 }}>
                            <span style={{ color: "#475569" }}>{details}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

