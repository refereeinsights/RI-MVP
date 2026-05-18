import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import ApiUsageDateFilters from "./ui/ApiUsageDateFilters";
import ApiUsageAlarms from "./ui/ApiUsageAlarms";

export const runtime = "nodejs";

type SearchParams = { from?: string; to?: string; range?: string };

type AggRow = {
  api: string;
  operation: string;
  surface: string;
  calls: number;
  errors: number;
  avg_latency_ms: number | null;
};

type VendorAggRow = {
  api: string;
  calls: number;
  errors: number;
  avg_latency_ms: number | null;
};

type TiEventAggRow = {
  event_name: string;
  calls: number;
};

function startOfUtcDayFromIsoDate(d: string) {
  return `${d}T00:00:00.000Z`;
}

function startOfNextUtcDayFromIsoDate(d: string) {
  const [y, m, day] = d.split("-").map((v) => Number(v));
  const next = new Date(Date.UTC(y, m - 1, day + 1, 0, 0, 0, 0));
  return next.toISOString();
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function startOfNextUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0, 0));
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function startOfUtcWeekMonday(date: Date) {
  const d = startOfUtcDay(date);
  const dow = (d.getUTCDay() + 6) % 7; // Monday=0
  return new Date(d.getTime() - dow * 86400_000);
}

function parseDateRange(params: SearchParams): { fromIso: string; toIso: string; label: string } {
  const range = params.range ?? "7d";
  const now = new Date();

  if (params.from && params.to) {
    return {
      fromIso: startOfUtcDayFromIsoDate(params.from),
      toIso: startOfNextUtcDayFromIsoDate(params.to),
      label: params.from === params.to ? params.from : `${params.from} – ${params.to}`,
    };
  }
  if (range === "today") {
    const d = now.toISOString().slice(0, 10);
    return { fromIso: startOfUtcDayFromIsoDate(d), toIso: startOfNextUtcDayFromIsoDate(d), label: "Today" };
  }
  if (range === "mtd") {
    const from = startOfUtcMonth(now);
    return { fromIso: from.toISOString(), toIso: now.toISOString(), label: "MTD" };
  }
  if (range === "30d") {
    const from = new Date(now.getTime() - 30 * 86400_000);
    return { fromIso: from.toISOString(), toIso: now.toISOString(), label: "Last 30 days" };
  }
  if (range === "week") {
    const from = startOfUtcWeekMonday(now);
    return { fromIso: from.toISOString(), toIso: now.toISOString(), label: "This week" };
  }
  // default: 7d
  const from = new Date(now.getTime() - 7 * 86400_000);
  return { fromIso: from.toISOString(), toIso: now.toISOString(), label: "Last 7 days" };
}

export default async function ApiUsagePage({ searchParams }: { searchParams?: SearchParams }) {
  await requireAdmin();

  const { fromIso, toIso, label } = parseDateRange(searchParams ?? {});
  const range = searchParams?.from && searchParams?.to ? "" : (searchParams?.range ?? "7d");

  const now = new Date();
  const mtdFromIso = startOfUtcMonth(now).toISOString();
  const mtdToIso = now.toISOString();

  // RPC aggregates server-side — no raw-row fetch, no PostgREST max_rows=1000 cap.
  const MAP_LOAD_EVENTS = ["venue_map_opened", "venue_map_loaded"] as const;
  const [{ data: rpcRows, error }, { data: mtdRpcRows }, { data: tiEventRpcRows }] = await Promise.all([
    (supabaseAdmin as any).rpc("api_usage_summary", { from_ts: fromIso, to_ts: toIso }),
    (supabaseAdmin as any).rpc("api_usage_summary", { from_ts: mtdFromIso, to_ts: mtdToIso }),
    (supabaseAdmin as any).rpc("ti_map_event_summary", {
      from_ts: fromIso,
      to_ts: toIso,
      event_names: [...MAP_LOAD_EVENTS],
    }),
  ]);

  const agg: AggRow[] = (rpcRows ?? []).map((r: any) => ({
    api: String(r.api ?? ""),
    operation: String(r.operation ?? ""),
    surface: String(r.surface ?? ""),
    calls: Number(r.calls ?? 0),
    errors: Number(r.errors ?? 0),
    avg_latency_ms: r.avg_latency_ms != null ? Number(r.avg_latency_ms) : null,
  }));

  // Vendor summary — derived from already-aggregated rows, trivially small.
  const vendorBuckets = new Map<string, { calls: number; errors: number; latencies: number[] }>();
  for (const r of agg) {
    if (!vendorBuckets.has(r.api)) vendorBuckets.set(r.api, { calls: 0, errors: 0, latencies: [] });
    const b = vendorBuckets.get(r.api)!;
    b.calls += r.calls;
    b.errors += r.errors;
    if (r.avg_latency_ms != null) b.latencies.push(r.avg_latency_ms);
  }
  const vendorAgg: VendorAggRow[] = Array.from(vendorBuckets.entries())
    .map(([api, b]) => {
      const avg = b.latencies.length ? Math.round(b.latencies.reduce((a, v) => a + v, 0) / b.latencies.length) : null;
      return { api, calls: b.calls, errors: b.errors, avg_latency_ms: avg };
    })
    .sort((a, b) => b.calls - a.calls);

  // MTD vendor totals — used for free-tier gauges regardless of selected date range.
  const mtdVendorTotals = new Map<string, number>();
  for (const r of (mtdRpcRows ?? []) as any[]) {
    const api = String(r.api ?? "");
    mtdVendorTotals.set(api, (mtdVendorTotals.get(api) ?? 0) + Number(r.calls ?? 0));
  }

  const tiEventAgg: TiEventAggRow[] = (tiEventRpcRows ?? []).map((r: any) => ({
    event_name: String(r.event_name ?? ""),
    calls: Number(r.calls ?? 0),
  }));
  const tiEventCountByName = new Map(tiEventAgg.map((r) => [r.event_name, r.calls]));

  const totals = agg.reduce((acc, r) => ({
    calls: acc.calls + r.calls,
    errors: acc.errors + r.errors,
  }), { calls: 0, errors: 0 });

  const fmtMs = (ms: number | null) => ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
  const pct = (n: number, d: number) => d === 0 ? "0%" : `${((n / d) * 100).toFixed(1)}%`;

  const API_COLORS: Record<string, string> = {
    google_places: "#1a73e8",
    mapbox: "#000",
    resend: "#000",
    open_meteo: "#0ea5e9",
    foursquare: "#f94877",
    brave_search: "#fb542b",
    bing_search: "#008373",
    serpapi: "#6366f1",
    overpass: "#3d8c3d",
    timezonedb: "#7c3aed",
  };

  const apiOptions = [
    "google_places",
    "foursquare",
    "mapbox",
    "resend",
    "open_meteo",
    "brave_search",
    "bing_search",
    "serpapi",
    "overpass",
    "timezonedb",
  ];

  type FreeTierEntry = { cap: number | null; label: string; sublabel?: string };
  const FREE_TIER_LIMITS: Record<string, FreeTierEntry> = {
    google_places: { cap: null, label: "~$200 credit/mo", sublabel: "≈6,250 calls at $32/1K" },
    foursquare:    { cap: 100_000, label: "100K/mo" },
    mapbox:        { cap: 100_000, label: "100K/mo" },
    resend:        { cap: 3_000, label: "3K emails/mo" },
    open_meteo:    { cap: null, label: "Free (non-commercial)" },
    brave_search:  { cap: 2_000, label: "2K/mo" },
    bing_search:   { cap: 1_000, label: "1K/mo" },
    serpapi:       { cap: 100, label: "100/mo" },
    overpass:      { cap: null, label: "Free (public, no cap)" },
    timezonedb:    { cap: null, label: "Free (1 req/s, no monthly cap)" },
  };

  const rangeLinks = [
    { label: "Today", value: "today" },
    { label: "7 days", value: "7d" },
    { label: "30 days", value: "30d" },
    { label: "MTD", value: "mtd" },
  ];

  const cellStyle: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid #e5e7eb", fontSize: 13 };
  const headStyle: React.CSSProperties = { ...cellStyle, fontWeight: 600, background: "#f9fafb", color: "#374151", whiteSpace: "nowrap" };
  const totalsCellStyle: React.CSSProperties = { ...cellStyle, fontWeight: 700, background: "#eff6ff", color: "#1e40af" };

  const trackingEnabled =
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_EXTERNAL_API_CALL_TRACKING === "true";

  // keep these in sync with upsertNearbyForRun.ts radiiByCategory + runFsqPrimary
  const OWL_FSQ_COSTS = [
    { category: "food",       typical: 1, worst: 1 },
    { category: "hotel",      typical: 1, worst: 1 },
    { category: "coffee",     typical: 1, worst: 3 },
    { category: "quick_eats", typical: 1, worst: 3 },
    { category: "hangouts",   typical: 1, worst: 3 },
  ];
  const owlFsqTypical = OWL_FSQ_COSTS.reduce((s, r) => s + r.typical, 0);
  const owlFsqWorst   = OWL_FSQ_COSTS.reduce((s, r) => s + r.worst,   0);

  const refCellSm: React.CSSProperties  = { padding: "3px 6px", fontSize: 11, borderBottom: "1px solid #f3f4f6", color: "#374151" };
  const refHeadSm: React.CSSProperties  = { ...refCellSm, fontWeight: 700, background: "#f9fafb", color: "#6b7280", whiteSpace: "nowrap" };
  const refTotalSm: React.CSSProperties = { ...refCellSm, fontWeight: 700, background: "#eff6ff", color: "#1e40af" };

  return (
    <>
      <style>{`
        @media (max-width: 1280px) {
          .api-usage-grid    { grid-template-columns: 1fr !important; }
          .api-usage-sidebar { display: none !important; }
        }
      `}</style>
      {/* outer grid — sidebar + main content */}
      <div className="api-usage-grid" style={{ padding: 24, maxWidth: 1360, display: "grid", gridTemplateColumns: "210px 1fr", gap: 28, alignItems: "start" }}>

        {/* ── LEFT: sticky reference card ─────────────────────────────── */}
        <div className="api-usage-sidebar" style={{ position: "sticky", top: 24, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Full Owl's Eye run — FSQ */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "7px 10px", background: "#fef3c7", borderBottom: "1px solid #fde68a" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e" }}>Owl's Eye run — FSQ</div>
              <div style={{ fontSize: 10, color: "#b45309", marginTop: 1 }}>calls per full venue run</div>
            </div>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={refHeadSm}>category</th>
                  <th style={{ ...refHeadSm, textAlign: "right" }}>typ</th>
                  <th style={{ ...refHeadSm, textAlign: "right" }}>worst</th>
                </tr>
              </thead>
              <tbody>
                {OWL_FSQ_COSTS.map((r) => (
                  <tr key={r.category}>
                    <td style={{ ...refCellSm, fontFamily: "monospace", fontSize: 10 }}>{r.category}</td>
                    <td style={{ ...refCellSm, textAlign: "right" }}>{r.typical}</td>
                    <td style={{ ...refCellSm, textAlign: "right" }}>{r.worst}</td>
                  </tr>
                ))}
                <tr>
                  <td style={refTotalSm}>total</td>
                  <td style={{ ...refTotalSm, textAlign: "right" }}>{owlFsqTypical}</td>
                  <td style={{ ...refTotalSm, textAlign: "right" }}>{owlFsqWorst}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ padding: "5px 8px", fontSize: 10, color: "#9ca3af", borderTop: "1px solid #f3f4f6" }}>
              +up to 7 Google calls when FSQ weak/unavailable (separate budget)
            </div>
          </div>

          {/* Hangouts-only backfill */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "7px 10px", background: "#f0fdf4", borderBottom: "1px solid #bbf7d0" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#166534" }}>Hangouts backfill — FSQ</div>
              <div style={{ fontSize: 10, color: "#15803d", marginTop: 1 }}>per-venue, hangouts category only</div>
            </div>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                {[
                  { label: "typical", value: "1 call" },
                  { label: "worst",   value: "3 calls" },
                ].map((r) => (
                  <tr key={r.label}>
                    <td style={refCellSm}>{r.label}</td>
                    <td style={{ ...refCellSm, textAlign: "right", fontWeight: 600 }}>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: "5px 8px", borderTop: "1px solid #f3f4f6" }}>
              {[
                { budget: 500,   lo: 166,  hi: 500  },
                { budget: 2000,  lo: 666,  hi: 2000 },
                { budget: 10000, lo: 3333, hi: 10000 },
              ].map((r) => (
                <div key={r.budget} style={{ fontSize: 10, color: "#6b7280", lineHeight: 1.6 }}>
                  <span style={{ fontWeight: 600, color: "#374151" }}>{r.budget.toLocaleString()} mo limit</span>
                  {" → "}{r.lo.toLocaleString()}–{r.hi.toLocaleString()} venues
                </div>
              ))}
            </div>
          </div>

          {/* Other calls per full run */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "7px 10px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Other — per run</div>
            </div>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                {[
                  { label: "Overpass",     value: "1 (sporting goods)" },
                  { label: "Mapbox",       value: "0–1 (if no coords)" },
                  { label: "TimezoneDB",   value: "0–1 (if newly geocoded)" },
                  { label: "Airport lookup", value: "0 (static data)" },
                ].map((r) => (
                  <tr key={r.label}>
                    <td style={refCellSm}>{r.label}</td>
                    <td style={{ ...refCellSm, textAlign: "right", fontSize: 10, color: "#6b7280" }}>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── RIGHT: existing page content ────────────────────────────── */}
        <div>
      <AdminNav />
      <h2 style={{ margin: "16px 0 4px", fontSize: 20, fontWeight: 700 }}>External API Usage</h2>

      {!trackingEnabled && (
        <div style={{ margin: "10px 0 18px", padding: "10px 12px", background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 8, color: "#92400e", fontSize: 13 }}>
          Tracking is disabled in development. Set <span style={{ fontFamily: "monospace" }}>ENABLE_EXTERNAL_API_CALL_TRACKING=true</span> on the server to record calls.
        </div>
      )}

      {/* Date filter */}
      <ApiUsageDateFilters rangeLinks={rangeLinks} activeRange={range} label={label} rpcError={error ? String((error as any).message ?? error) : null} />

      {/* Summary tiles */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        {[
          { label: "Total Calls", value: totals.calls.toLocaleString(), color: "#1e40af" },
          { label: "Total Errors", value: totals.errors.toLocaleString(), color: totals.errors > 0 ? "#dc2626" : "#16a34a" },
          { label: "Error Rate", value: pct(totals.errors, totals.calls), color: totals.errors > 0 ? "#dc2626" : "#16a34a" },
        ].map((t) => (
          <div key={t.label} style={{ padding: "10px 18px", borderRadius: 8, background: "#fff", border: "1px solid #e5e7eb", minWidth: 120, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: t.color }}>{t.value}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Vendor summary */}
      {vendorAgg.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#374151" }}>By vendor</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {vendorAgg.map((v) => (
              <div key={v.api} style={{ padding: "8px 12px", borderRadius: 8, background: "#fff", border: "1px solid #e5e7eb", minWidth: 180 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: API_COLORS[v.api] ?? "#111827" }}>{v.api}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{fmtMs(v.avg_latency_ms)}</div>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#374151" }}>
                  {v.calls.toLocaleString()} calls •{" "}
                  <span style={{ color: v.errors > 0 ? "#dc2626" : "#16a34a", fontWeight: v.errors > 0 ? 700 : 600 }}>
                    {pct(v.errors, v.calls)} errors
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Free tier gauges — always MTD, independent of selected date range */}
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#374151" }}>Free tier limits (MTD)</h3>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Month-to-date usage vs monthly free cap. Always current month regardless of date filter above.</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {apiOptions.map((api) => {
            const tier = FREE_TIER_LIMITS[api];
            if (!tier) return null;
            const used = mtdVendorTotals.get(api) ?? 0;
            const pctUsed = tier.cap ? Math.min(100, (used / tier.cap) * 100) : null;
            const barColor = pctUsed == null ? "#9ca3af" : pctUsed >= 90 ? "#dc2626" : pctUsed >= 70 ? "#d97706" : "#16a34a";
            return (
              <div key={api} style={{ padding: "8px 12px", borderRadius: 8, background: "#fff", border: "1px solid #e5e7eb", minWidth: 200 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: API_COLORS[api] ?? "#111827" }}>{api}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{tier.label}</div>
                </div>
                {tier.sublabel && (
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{tier.sublabel}</div>
                )}
                <div style={{ marginTop: 6, fontSize: 12, color: "#374151" }}>
                  {used.toLocaleString()}{tier.cap ? ` / ${tier.cap.toLocaleString()}` : " calls MTD"}
                </div>
                {pctUsed != null && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ height: 4, borderRadius: 2, background: "#e5e7eb", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pctUsed}%`, background: barColor, borderRadius: 2, transition: "width 0.3s" }} />
                    </div>
                    <div style={{ fontSize: 11, color: barColor, marginTop: 2, fontWeight: pctUsed >= 70 ? 700 : 400 }}>
                      {pctUsed.toFixed(1)}% used
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#374151" }}>Map loads (TI)</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {MAP_LOAD_EVENTS.map((name) => (
            <div key={name} style={{ padding: "8px 12px", borderRadius: 8, background: "#fff", border: "1px solid #e5e7eb", minWidth: 220 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{name}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#374151" }}>
                {(tiEventCountByName.get(name) ?? 0).toLocaleString()} events
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Usage table */}
      {agg.length === 0 ? (
        <p style={{ color: "#6b7280", fontSize: 13 }}>
          No data yet — apply the migration and wait for the first API calls to be tracked.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <thead>
              <tr>
                {["API", "Operation", "Surface", "Calls", "Errors", "Error %", "Avg Latency"].map((h) => (
                  <th key={h} style={headStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Totals row */}
              <tr>
                <td style={totalsCellStyle} colSpan={3}>All</td>
                <td style={totalsCellStyle}>{totals.calls.toLocaleString()}</td>
                <td style={{ ...totalsCellStyle, color: totals.errors > 0 ? "#dc2626" : "#1e40af" }}>{totals.errors.toLocaleString()}</td>
                <td style={{ ...totalsCellStyle, color: totals.errors > 0 ? "#dc2626" : "#1e40af" }}>{pct(totals.errors, totals.calls)}</td>
                <td style={totalsCellStyle}>—</td>
              </tr>
              {agg.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...cellStyle, fontWeight: 600, color: API_COLORS[r.api] ?? "#374151" }}>{r.api}</td>
                  <td style={{ ...cellStyle, fontFamily: "monospace", fontSize: 12 }}>{r.operation}</td>
                  <td style={{ ...cellStyle, color: "#6b7280", fontSize: 12 }}>{r.surface}</td>
                  <td style={cellStyle}>{r.calls.toLocaleString()}</td>
                  <td style={{ ...cellStyle, color: r.errors > 0 ? "#dc2626" : undefined, fontWeight: r.errors > 0 ? 600 : undefined }}>
                    {r.errors.toLocaleString()}
                  </td>
                  <td style={{ ...cellStyle, color: r.errors > 0 ? "#dc2626" : "#6b7280" }}>
                    {pct(r.errors, r.calls)}
                  </td>
                  <td style={cellStyle}>{fmtMs(r.avg_latency_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ApiUsageAlarms apiOptions={apiOptions} />
        </div>{/* end right column */}
      </div>{/* end grid */}
    </>
  );
}
