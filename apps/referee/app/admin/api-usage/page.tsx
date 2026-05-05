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

  // RPC aggregates server-side — no raw-row fetch, no PostgREST max_rows=1000 cap.
  const { data: rpcRows, error } = await (supabaseAdmin as any)
    .rpc("api_usage_summary", { from_ts: fromIso, to_ts: toIso });

  const MAP_LOAD_EVENTS = ["venue_map_opened", "venue_map_loaded"] as const;
  const { data: tiEventRpcRows } = await (supabaseAdmin as any)
    .rpc("ti_map_event_summary", {
      from_ts: fromIso,
      to_ts: toIso,
      event_names: [...MAP_LOAD_EVENTS],
    });

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
  ];

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

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
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
    </div>
  );
}
