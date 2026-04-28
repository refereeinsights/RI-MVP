import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

function parseDateRange(params: SearchParams): { fromIso: string; toIso: string; label: string } {
  const range = params.range ?? "7d";
  const now = new Date();

  if (params.from && params.to) {
    return { fromIso: `${params.from}T00:00:00Z`, toIso: `${params.to}T23:59:59Z`, label: `${params.from} – ${params.to}` };
  }
  if (range === "today") {
    const d = now.toISOString().slice(0, 10);
    return { fromIso: `${d}T00:00:00Z`, toIso: `${d}T23:59:59Z`, label: "Today" };
  }
  if (range === "30d") {
    const from = new Date(now.getTime() - 30 * 86400_000);
    return { fromIso: from.toISOString(), toIso: now.toISOString(), label: "Last 30 days" };
  }
  // default: 7d
  const from = new Date(now.getTime() - 7 * 86400_000);
  return { fromIso: from.toISOString(), toIso: now.toISOString(), label: "Last 7 days" };
}

export default async function ApiUsagePage({ searchParams }: { searchParams?: SearchParams }) {
  await requireAdmin();

  const { fromIso, toIso, label } = parseDateRange(searchParams ?? {});
  const range = searchParams?.range ?? "7d";

  const { data: rows, error } = await supabaseAdmin
    .from("external_api_calls" as any)
    .select("api,operation,surface,status,latency_ms")
    .gte("called_at", fromIso)
    .lte("called_at", toIso)
    .limit(50000);

  // Aggregate in-process — avoids needing a DB function and keeps the query simple.
  const buckets = new Map<string, { calls: number; errors: number; latencies: number[] }>();
  for (const r of (rows ?? []) as Array<{ api: string; operation: string; surface: string; status: string; latency_ms: number | null }>) {
    const key = `${r.api}||${r.operation}||${r.surface}`;
    if (!buckets.has(key)) buckets.set(key, { calls: 0, errors: 0, latencies: [] });
    const b = buckets.get(key)!;
    b.calls++;
    if (r.status === "error") b.errors++;
    if (typeof r.latency_ms === "number") b.latencies.push(r.latency_ms);
  }

  const agg: AggRow[] = Array.from(buckets.entries()).map(([key, b]) => {
    const [api, operation, surface] = key.split("||");
    const avg = b.latencies.length ? Math.round(b.latencies.reduce((a, v) => a + v, 0) / b.latencies.length) : null;
    return { api, operation, surface, calls: b.calls, errors: b.errors, avg_latency_ms: avg };
  }).sort((a, b) => b.calls - a.calls);

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

  const rangeLinks = [
    { label: "Today", value: "today" },
    { label: "7 days", value: "7d" },
    { label: "30 days", value: "30d" },
  ];

  const cellStyle: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid #e5e7eb", fontSize: 13 };
  const headStyle: React.CSSProperties = { ...cellStyle, fontWeight: 600, background: "#f9fafb", color: "#374151", whiteSpace: "nowrap" };
  const totalsCellStyle: React.CSSProperties = { ...cellStyle, fontWeight: 700, background: "#eff6ff", color: "#1e40af" };

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <AdminNav />
      <h2 style={{ margin: "16px 0 4px", fontSize: 20, fontWeight: 700 }}>External API Usage</h2>

      {/* Date filter */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        {rangeLinks.map((r) => (
          <a
            key={r.value}
            href={`/admin/api-usage?range=${r.value}`}
            style={{
              padding: "4px 14px", borderRadius: 6, fontSize: 13, textDecoration: "none",
              background: range === r.value ? "#1e40af" : "#f3f4f6",
              color: range === r.value ? "#fff" : "#374151",
              border: "1px solid",
              borderColor: range === r.value ? "#1e40af" : "#e5e7eb",
            }}
          >
            {r.label}
          </a>
        ))}
        <span style={{ fontSize: 13, color: "#6b7280" }}>{label}</span>
        {error && <span style={{ fontSize: 12, color: "#dc2626" }}>Query error: {error.message}</span>}
      </div>

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
    </div>
  );
}
