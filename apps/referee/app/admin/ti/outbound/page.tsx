import Link from "next/link";

import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SPORT_OPTIONS, US_STATES } from "@/server/admin/discoverToQueue";

export const runtime = "nodejs";

type PageProps = {
  searchParams?: {
    q?: string;
    state?: string;
    sport?: string;
    page?: string;
  };
};

type SportCountRow = {
  sport: string | null;
  click_count: number | null;
};

type TopVenueRow = {
  venue_id: string;
  venue_name: string | null;
  city: string | null;
  state: string | null;
  click_count: number | null;
  last_clicked_at: string | null;
  total_count: number | null;
};

type TopTournamentRow = {
  tournament_id: string;
  tournament_slug: string | null;
  tournament_name: string | null;
  state: string | null;
  sport: string | null;
  click_count: number | null;
  last_clicked_at: string | null;
  total_count: number | null;
};

function toInt(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildHref(basePath: string, params: Record<string, string | null | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val === null || val === undefined || val === "") continue;
    qs.set(key, val);
  }
  const suffix = qs.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}

export default async function OutboundTrackingPage({ searchParams }: PageProps) {
  await requireAdmin();

  const q = (searchParams?.q ?? "").trim();
  const stateRaw = (searchParams?.state ?? "").trim().toUpperCase();
  const sportRaw = (searchParams?.sport ?? "").trim().toLowerCase();
  const page = Math.max(1, toInt((searchParams?.page ?? "").trim(), 1));
  const limit = 50;
  const offset = (page - 1) * limit;

  const stateFilter = (US_STATES as readonly string[]).includes(stateRaw) ? stateRaw : "";
  const sportFilter = (SPORT_OPTIONS as readonly string[]).includes(sportRaw) ? sportRaw : "";

  const officialTotalClicksRes = await supabaseAdmin
    .from("ti_outbound_clicks" as any)
    .select("id", { count: "exact", head: true })
    .eq("destination_type", "tournament_official");
  const officialTotalClicksCode = (officialTotalClicksRes as any)?.error?.code;
  const officialTotalClicksFallbackRes =
    officialTotalClicksRes.error && (officialTotalClicksCode === "42703" || officialTotalClicksCode === "PGRST204")
      ? await supabaseAdmin.from("ti_outbound_clicks" as any).select("id", { count: "exact", head: true })
      : null;
  const officialTotalClicksFinalRes = officialTotalClicksFallbackRes ?? officialTotalClicksRes;

  const hotelTotalClicksRes = await supabaseAdmin
    .from("ti_outbound_clicks" as any)
    .select("id", { count: "exact", head: true })
    .eq("destination_type", "hotels");
  const hotelTotalClicksCode = (hotelTotalClicksRes as any)?.error?.code;

  const vrboTotalClicksRes = await supabaseAdmin
    .from("ti_outbound_clicks" as any)
    .select("id", { count: "exact", head: true })
    .eq("destination_type", "vrbo");
  const vrboTotalClicks = vrboTotalClicksRes.error ? 0 : vrboTotalClicksRes.count ?? 0;

  const [sportCountsRes, topTournamentsRes, topVenuesRes] = await Promise.all([
    (supabaseAdmin as any).rpc("list_ti_outbound_clicks_sport_counts_v1", {
      p_state: null,
    }),
    (supabaseAdmin as any).rpc("list_ti_outbound_clicks_top_tournaments_v1", {
      p_limit: limit,
      p_offset: offset,
      p_q: q || null,
      p_state: stateFilter || null,
      p_sport: sportFilter || null,
    }),
    (supabaseAdmin as any).rpc("list_ti_outbound_clicks_hotels_top_venues_v1", {
      p_limit: 25,
      p_offset: 0,
      p_q: q || null,
      p_state: stateFilter || null,
    }),
  ]);

  const officialTotalClicks = officialTotalClicksFinalRes.error ? 0 : officialTotalClicksFinalRes.count ?? 0;
  const hotelTotalClicks = hotelTotalClicksRes.error ? 0 : hotelTotalClicksRes.count ?? 0;
  const rpcSchemaHint =
    "Hint: apply `supabase/migrations/20260412_ti_outbound_clicks_admin_rpcs.sql` and reload the PostgREST schema cache.";
  const hotelsRpcSchemaHint =
    "Hint: apply `supabase/migrations/20260420_ti_outbound_clicks_hotels.sql` + `supabase/migrations/20260420_ti_outbound_clicks_hotels_admin_rpcs.sql` and reload the PostgREST schema cache.";

  const sportCounts: SportCountRow[] = sportCountsRes.error
    ? []
    : ((sportCountsRes.data ?? []) as SportCountRow[]);

  const topRows: TopTournamentRow[] = topTournamentsRes.error
    ? []
    : ((topTournamentsRes.data ?? []) as TopTournamentRow[]);
  const totalTopCount = Number(topRows[0]?.total_count ?? 0) || 0;
  const totalPages = totalTopCount > 0 ? Math.ceil(totalTopCount / limit) : 1;

  const venueRows: TopVenueRow[] = topVenuesRes.error ? [] : ((topVenuesRes.data ?? []) as TopVenueRow[]);
  const totalVenueCount = Number(venueRows[0]?.total_count ?? 0) || 0;

  const title = "Outbound Tracking";

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
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 14,
            background: "#fff",
          }}
        >
          <div style={{ fontSize: 12, textTransform: "uppercase", fontWeight: 800, color: "#6b7280" }}>
            Total official URL clicks
          </div>
          <div style={{ fontSize: 34, fontWeight: 950, lineHeight: 1.1 }}>{officialTotalClicks}</div>
          {officialTotalClicksFinalRes.error ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
              Failed to load total clicks: {officialTotalClicksFinalRes.error.message}
            </div>
          ) : null}
        </div>
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 14,
            background: "#fff",
          }}
        >
          <div style={{ fontSize: 12, textTransform: "uppercase", fontWeight: 800, color: "#6b7280" }}>
            Total hotel clicks (Booking)
          </div>
          <div style={{ fontSize: 34, fontWeight: 950, lineHeight: 1.1 }}>{hotelTotalClicks}</div>
          {hotelTotalClicksRes.error ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
              Failed to load hotel clicks: {hotelTotalClicksRes.error.message}
              {hotelTotalClicksRes.error.message.includes("column") ? ` (${hotelsRpcSchemaHint})` : ""}
            </div>
          ) : null}
        </div>
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 14,
            background: "#fff",
          }}
        >
          <div style={{ fontSize: 12, textTransform: "uppercase", fontWeight: 800, color: "#6b7280" }}>
            Total VRBO clicks
          </div>
          <div style={{ fontSize: 34, fontWeight: 950, lineHeight: 1.1 }}>{vrboTotalClicks}</div>
          {vrboTotalClicksRes.error ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
              Failed to load VRBO clicks: {vrboTotalClicksRes.error.message}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, textTransform: "uppercase", fontWeight: 900, color: "#6b7280", marginBottom: 8 }}>
          Clicks by sport
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {sportCountsRes.error ? (
            <span style={{ fontSize: 13, color: "#b91c1c" }}>
              Failed to load sport counts: {sportCountsRes.error.message}
              {sportCountsRes.error.message.includes("Could not find the function") ? ` (${rpcSchemaHint})` : ""}
            </span>
          ) : null}
          {sportCounts.map((row) => {
            const sport = (row.sport ?? "").trim().toLowerCase();
            const label = sport ? sport : "unknown";
            const count = Number(row.click_count ?? 0) || 0;
            const active = sport && sport === sportFilter;
            const href = buildHref("/admin/ti/outbound", {
              q,
              state: stateFilter || null,
              sport: sport || null,
              page: "1",
            });
            return (
              <a
                key={`${label}`}
                href={href}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 999,
                  border: "1px solid #111",
                  background: active ? "#111" : "#fff",
                  color: active ? "#fff" : "#111",
                  fontWeight: 900,
                  textDecoration: "none",
                  fontSize: 13,
                }}
              >
                {label}
                <span
                  style={{
                    minWidth: 20,
                    height: 20,
                    borderRadius: 999,
                    background: active ? "#fff" : "#111",
                    color: active ? "#111" : "#fff",
                    fontSize: 11,
                    fontWeight: 900,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 6px",
                  }}
                >
                  {count}
                </span>
              </a>
            );
          })}
          {(q || stateFilter || sportFilter) && (
            <a
              href="/admin/ti/outbound"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 10px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#fff",
                color: "#111",
                fontWeight: 900,
                textDecoration: "none",
                fontSize: 13,
              }}
            >
              Clear filters
            </a>
          )}
        </div>
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
        <div style={{ fontSize: 12, textTransform: "uppercase", fontWeight: 900, color: "#6b7280", marginBottom: 10 }}>
          Top tournaments
        </div>

        <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end", marginBottom: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>Search</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="Tournament name"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                minWidth: 260,
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>State</label>
            <select
              name="state"
              defaultValue={stateFilter}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }}
            >
              <option value="">All</option>
              {Array.from(US_STATES).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>Sport</label>
            <select
              name="sport"
              defaultValue={sportFilter}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }}
            >
              <option value="">All</option>
              {Array.from(SPORT_OPTIONS).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <input type="hidden" name="page" value="1" />

          <button className="cta" type="submit" style={{ padding: "10px 14px" }}>
            Apply
          </button>
        </form>

        {topTournamentsRes.error ? (
          <div style={{ color: "#b91c1c", fontSize: 13 }}>
            Failed to load top tournaments: {topTournamentsRes.error.message}
            {topTournamentsRes.error.message.includes("Could not find the function") ? ` (${rpcSchemaHint})` : ""}
          </div>
        ) : null}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Tournament</th>
                <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>State</th>
                <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Sport</th>
                <th style={{ textAlign: "right", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Clicks</th>
                <th style={{ textAlign: "right", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>
                  Last clicked
                </th>
              </tr>
            </thead>
            <tbody>
              {topRows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "12px 8px", color: "#6b7280", fontSize: 13 }}>
                    No rows.
                  </td>
                </tr>
              ) : (
                topRows.map((row) => (
                  <tr key={row.tournament_id} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 8px", fontWeight: 900, color: "#111", minWidth: 260 }}>
                      {row.tournament_name ?? row.tournament_slug ?? row.tournament_id}
                    </td>
                    <td style={{ padding: "10px 8px", color: "#111", fontWeight: 800 }}>{row.state ?? ""}</td>
                    <td style={{ padding: "10px 8px", color: "#111", fontWeight: 800 }}>{row.sport ?? ""}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 950 }}>
                      {Number(row.click_count ?? 0) || 0}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", color: "#6b7280", fontWeight: 800 }}>
                      {row.last_clicked_at ? new Date(row.last_clicked_at).toLocaleDateString() : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 800 }}>
            Showing {topRows.length} of {totalTopCount}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={buildHref("/admin/ti/outbound", {
                q,
                state: stateFilter || null,
                sport: sportFilter || null,
                page: String(Math.max(1, page - 1)),
              })}
              style={{
                pointerEvents: page <= 1 ? "none" : "auto",
                opacity: page <= 1 ? 0.5 : 1,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                textDecoration: "none",
                fontWeight: 900,
                color: "#111",
              }}
            >
              Prev
            </a>
            <div style={{ padding: "8px 10px", fontWeight: 900, color: "#111" }}>
              Page {page} / {Math.max(1, totalPages)}
            </div>
            <a
              href={buildHref("/admin/ti/outbound", {
                q,
                state: stateFilter || null,
                sport: sportFilter || null,
                page: String(Math.min(totalPages, page + 1)),
              })}
              style={{
                pointerEvents: page >= totalPages ? "none" : "auto",
                opacity: page >= totalPages ? 0.5 : 1,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                textDecoration: "none",
                fontWeight: 900,
                color: "#111",
              }}
            >
              Next
            </a>
          </div>
        </div>
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
        <div style={{ fontSize: 12, textTransform: "uppercase", fontWeight: 900, color: "#6b7280", marginBottom: 10 }}>
          Top venues (Hotels / Booking)
        </div>

        {topVenuesRes.error ? (
          <div style={{ color: "#b91c1c", fontSize: 13 }}>
            Failed to load top venues: {topVenuesRes.error.message}
            {topVenuesRes.error.message.includes("Could not find the function") ? ` (${hotelsRpcSchemaHint})` : ""}
          </div>
        ) : null}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Venue</th>
                <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>City</th>
                <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>State</th>
                <th style={{ textAlign: "right", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Clicks</th>
                <th style={{ textAlign: "right", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>
                  Last clicked
                </th>
              </tr>
            </thead>
            <tbody>
              {venueRows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "12px 8px", color: "#6b7280", fontSize: 13 }}>
                    No rows.
                  </td>
                </tr>
              ) : (
                venueRows.map((row) => (
                  <tr key={row.venue_id} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 8px", fontWeight: 900, color: "#111", minWidth: 260 }}>
                      {row.venue_name ?? row.venue_id}
                    </td>
                    <td style={{ padding: "10px 8px", color: "#111", fontWeight: 800 }}>{row.city ?? ""}</td>
                    <td style={{ padding: "10px 8px", color: "#111", fontWeight: 800 }}>{row.state ?? ""}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 950 }}>
                      {Number(row.click_count ?? 0) || 0}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", color: "#6b7280", fontWeight: 800 }}>
                      {row.last_clicked_at ? new Date(row.last_clicked_at).toLocaleDateString() : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
          Showing {venueRows.length} of {totalVenueCount}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#6b7280" }}>
        Data source: `public.ti_outbound_clicks` (created by `supabase/migrations/20260412_ti_outbound_clicks.sql`).
      </div>
    </div>
  );
}
