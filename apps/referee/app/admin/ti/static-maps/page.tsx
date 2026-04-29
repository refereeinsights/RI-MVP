import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import ManualStaticMapRunPanel from "./ManualStaticMapRunPanel";

export const runtime = "nodejs";

const JOB_KEY = "ti_static_map_generator_v1";

type RunRow = {
  id: number;
  started_at: string;
  scanned: number;
  processed: number;
  updated: number;
  skipped_no_coords: number;
  skipped_up_to_date: number;
  failures: number;
  ms: number;
  error: string | null;
};

type ErrorTournamentRow = {
  id: string;
  slug: string | null;
  name: string | null;
  static_map_error: string | null;
  static_map_updated_at: string | null;
};

export default async function StaticMapsAdminPage() {
  await requireAdmin();

  const [runsResp, errorsResp] = await Promise.all([
    supabaseAdmin
      .from("cron_job_results" as any)
      .select("id,started_at,scanned,processed,updated,skipped_no_coords,skipped_up_to_date,failures,ms,error")
      .eq("job_key", JOB_KEY)
      .order("started_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("tournaments" as any)
      .select("id,slug,name,static_map_error,static_map_updated_at")
      .eq("status", "published")
      .eq("is_canonical", true)
      .eq("static_map_status", "error")
      .order("static_map_updated_at", { ascending: false })
      .limit(200),
  ]);

  const runs = ((runsResp.data ?? []) as RunRow[]);

  // Lifetime totals across all runs.
  const totals = runs.reduce(
    (acc, r) => ({
      runs: acc.runs + 1,
      scanned: acc.scanned + (r.scanned ?? 0),
      processed: acc.processed + (r.processed ?? 0),
      updated: acc.updated + (r.updated ?? 0),
      skipped_no_coords: acc.skipped_no_coords + (r.skipped_no_coords ?? 0),
      skipped_up_to_date: acc.skipped_up_to_date + (r.skipped_up_to_date ?? 0),
      failures: acc.failures + (r.failures ?? 0),
    }),
    { runs: 0, scanned: 0, processed: 0, updated: 0, skipped_no_coords: 0, skipped_up_to_date: 0, failures: 0 }
  );

  // Status breakdown — paginate to avoid max_rows=1000 cap.
  const statusCounts: Record<string, number> = {};
  {
    let page = 0;
    while (true) {
      const { data: rawStatus } = await supabaseAdmin
        .from("tournaments" as any)
        .select("static_map_status")
        .eq("status", "published")
        .eq("is_canonical", true)
        .range(page * 1000, page * 1000 + 999);
      const rows = (rawStatus ?? []) as Array<{ static_map_status: string | null }>;
      for (const r of rows) {
        const key = r.static_map_status ?? "missing";
        statusCounts[key] = (statusCounts[key] ?? 0) + 1;
      }
      if (rows.length < 1000) break;
      page++;
    }
  }
  const totalTournaments = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  const errorTournaments = ((errorsResp.data ?? []) as ErrorTournamentRow[]);

  const fmt = (n: number) => n.toLocaleString();
  const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);
  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
      });
    } catch { return iso; }
  };

  const statusOrder = ["ready", "missing", "processing", "queued", "error"];
  const statusColor: Record<string, string> = {
    ready: "#16a34a",
    missing: "#6b7280",
    processing: "#2563eb",
    queued: "#d97706",
    error: "#dc2626",
  };

  const cellStyle: React.CSSProperties = {
    padding: "6px 10px", borderBottom: "1px solid #e5e7eb", fontSize: 13, whiteSpace: "nowrap",
  };
  const headStyle: React.CSSProperties = {
    ...cellStyle, fontWeight: 600, background: "#f9fafb", color: "#374151",
  };
  const totalsCellStyle: React.CSSProperties = {
    ...cellStyle, fontWeight: 700, background: "#eff6ff", color: "#1e40af",
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <AdminNav />
      <h2 style={{ margin: "16px 0 20px", fontSize: 20, fontWeight: 700 }}>TI Static Maps — Cron Dashboard</h2>

      <ManualStaticMapRunPanel />

      {/* Status breakdown */}
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>
        Tournament Status ({fmt(totalTournaments)} published canonical)
      </h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
        {statusOrder
          .filter((s) => statusCounts[s] !== undefined)
          .map((s) => (
            <div
              key={s}
              style={{
                padding: "10px 18px", borderRadius: 8, background: "#fff",
                border: `1px solid ${statusColor[s] ?? "#e5e7eb"}`,
                minWidth: 100, textAlign: "center",
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, color: statusColor[s] ?? "#374151" }}>
                {fmt(statusCounts[s] ?? 0)}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2, textTransform: "capitalize" }}>{s}</div>
            </div>
          ))}
      </div>

      {/* Lifetime totals */}
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>
        Lifetime Totals ({fmt(totals.runs)} runs logged)
      </h3>
      {runs.length === 0 ? (
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 28 }}>
          No runs logged yet — results will appear after the cron fires and the migration is applied.
        </p>
      ) : (
        <div style={{ overflowX: "auto", marginBottom: 28 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <thead>
              <tr>
                {["Scanned", "Processed", "Updated", "No Coords", "Up to Date", "Failures"].map((h) => (
                  <th key={h} style={headStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={totalsCellStyle}>{fmt(totals.scanned)}</td>
                <td style={totalsCellStyle}>{fmt(totals.processed)}</td>
                <td style={totalsCellStyle}>{fmt(totals.updated)}</td>
                <td style={totalsCellStyle}>{fmt(totals.skipped_no_coords)}</td>
                <td style={totalsCellStyle}>{fmt(totals.skipped_up_to_date)}</td>
                <td style={{ ...totalsCellStyle, color: totals.failures > 0 ? "#dc2626" : "#1e40af" }}>
                  {fmt(totals.failures)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Run history */}
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>
        Run History (last {runs.length})
      </h3>
      {runs.length === 0 ? null : (
        <div style={{ overflowX: "auto", marginBottom: 28 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <thead>
              <tr>
                {["Started", "Scanned", "Processed", "Updated", "No Coords", "Up to Date", "Failures", "Duration"].map((h) => (
                  <th key={h} style={headStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td style={cellStyle}>{fmtDate(r.started_at)}</td>
                  <td style={cellStyle}>{fmt(r.scanned)}</td>
                  <td style={cellStyle}>{fmt(r.processed)}</td>
                  <td style={{ ...cellStyle, color: r.updated > 0 ? "#16a34a" : undefined, fontWeight: r.updated > 0 ? 600 : undefined }}>
                    {fmt(r.updated)}
                  </td>
                  <td style={cellStyle}>{fmt(r.skipped_no_coords)}</td>
                  <td style={cellStyle}>{fmt(r.skipped_up_to_date)}</td>
                  <td style={{ ...cellStyle, color: r.failures > 0 ? "#dc2626" : undefined, fontWeight: r.failures > 0 ? 600 : undefined }}>
                    {fmt(r.failures)}
                  </td>
                  <td style={cellStyle}>{fmtMs(r.ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Error list */}
      {errorTournaments.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px", color: "#dc2626" }}>
            Error Tournaments ({fmt(errorTournaments.length)})
          </h3>
          <div style={{ overflowX: "auto", marginBottom: 28 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", background: "#fff", border: "1px solid #fca5a5", borderRadius: 8 }}>
              <thead>
                <tr>
                  {["Name", "Slug", "Error", "Last Attempted"].map((h) => (
                    <th key={h} style={{ ...headStyle, background: "#fef2f2" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {errorTournaments.map((t) => (
                  <tr key={t.id}>
                    <td style={cellStyle}>{t.name ?? "—"}</td>
                    <td style={{ ...cellStyle, fontFamily: "monospace", fontSize: 12 }}>
                      <a href={`/admin/tournaments/${t.slug}`} style={{ color: "#2563eb" }}>{t.slug ?? t.id}</a>
                    </td>
                    <td style={{ ...cellStyle, color: "#dc2626", maxWidth: 400, whiteSpace: "normal", wordBreak: "break-word" }}>
                      {t.static_map_error ?? "—"}
                    </td>
                    <td style={cellStyle}>{fmtDate(t.static_map_updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
