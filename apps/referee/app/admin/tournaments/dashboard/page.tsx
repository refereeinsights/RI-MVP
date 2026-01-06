import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type Search = {
  sport?: string;
  state?: string;
  start?: string;
  end?: string;
};

const DEFAULT_STATES = ["WA", "OR", "CA", "AZ", "NV", "CO", "UT", "ID", "MT"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function TournamentsDashboard({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const sport = searchParams.sport ?? "";
  const stateParam = searchParams.state ?? "";
  const start = searchParams.start || todayIso();
  const end = searchParams.end || addDays(90);
  const states = stateParam ? stateParam.split(",").filter(Boolean) : DEFAULT_STATES;

  const supabase = supabaseAdmin;
  let tQuery = supabase
    .from("tournaments" as any)
    .select("id,name,start_date,state,city,status,source_url,venue,address")
    .gte("start_date", start)
    .lte("start_date", end);
  if (sport) tQuery = tQuery.eq("sport", sport);
  if (states.length) tQuery = tQuery.in("state", states);
  const tournamentsRes = await tQuery;
  const tournaments = tournamentsRes.data ?? [];

  const ids = tournaments.map((t: any) => t.id);

  const jobsRes = ids.length
    ? await supabase.from("tournament_enrichment_jobs" as any).select("tournament_id,status").in("tournament_id", ids)
    : { data: [] as any[], error: null };
  const jobs = jobsRes.data ?? [];

  const compRes = ids.length
    ? await supabase
        .from("tournament_referee_comp_candidates" as any)
        .select("tournament_id,accepted_at")
        .not("accepted_at", "is", null)
        .in("tournament_id", ids)
    : { data: [] as any[], error: null };
  const comps = compRes.data ?? [];

  const total = tournaments.length;
  const pending = tournaments.filter((t: any) => t.status === "draft").length;
  const approved = tournaments.filter((t: any) => t.status === "published").length;
  const withSource = tournaments.filter((t: any) => t.source_url).length;
  const withVenue = tournaments.filter((t: any) => t.venue || t.address).length;

  const jobsByTid = new Map<string, any[]>();
  jobs.forEach((j: any) => {
    const arr = jobsByTid.get(j.tournament_id) ?? [];
    arr.push(j);
    jobsByTid.set(j.tournament_id, arr);
  });
  const jobsDone = Array.from(jobsByTid.values()).filter((arr) => arr.some((j) => j.status === "done")).length;

  const enrichedPct = total ? Math.round((jobsDone / total) * 100) : 0;
  const sourcePct = total ? Math.round((withSource / total) * 100) : 0;
  const venuePct = total ? Math.round((withVenue / total) * 100) : 0;
  const compPct = total ? Math.round((new Set(comps.map((c: any) => c.tournament_id)).size / total) * 100) : 0;

  const byStateMap = new Map<
    string,
    { total: number; venue: number; enriched: number; errors: number; stalePending: number }
  >();
  const staleDays = 21;
  const staleCutoff = addDays(-staleDays);
  tournaments.forEach((t: any) => {
    const key = t.state || "Unknown";
    const stateRow = byStateMap.get(key) ?? { total: 0, venue: 0, enriched: 0, errors: 0, stalePending: 0 };
    stateRow.total += 1;
    if (t.venue || t.address) stateRow.venue += 1;
    const jobArr = jobsByTid.get(t.id) ?? [];
    if (jobArr.some((j) => j.status === "done")) stateRow.enriched += 1;
    if (jobArr.some((j) => j.status === "error")) stateRow.errors += 1;
    if (t.status === "draft" && t.start_date && t.start_date < staleCutoff) stateRow.stalePending += 1;
    byStateMap.set(key, stateRow);
  });

  const needsAttention = tournaments.filter((t: any) => {
    const jobArr = jobsByTid.get(t.id) ?? [];
    const hasError = jobArr.some((j) => j.status === "error");
    const missingSource = !t.source_url;
    const stale = t.status === "draft" && t.start_date && t.start_date < staleCutoff;
    return hasError || missingSource || stale;
  });

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 12 }}>Tournaments Dashboard</h1>
      <form style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 700 }}>
          Sport
          <input name="sport" defaultValue={sport} placeholder="soccer" style={{ padding: 6, borderRadius: 8, border: "1px solid #ccc" }} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700 }}>
          States (comma separated)
          <input name="state" defaultValue={stateParam || DEFAULT_STATES.join(",")} style={{ padding: 6, borderRadius: 8, border: "1px solid #ccc", minWidth: 220 }} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700 }}>
          Start
          <input type="date" name="start" defaultValue={start} style={{ padding: 6, borderRadius: 8, border: "1px solid #ccc" }} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700 }}>
          End
          <input type="date" name="end" defaultValue={end} style={{ padding: 6, borderRadius: 8, border: "1px solid #ccc" }} />
        </label>
        <button style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#0f172a", color: "#fff", fontWeight: 800, alignSelf: "flex-end" }}>
          Apply
        </button>
      </form>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Upcoming tournaments", value: total },
          { label: "Pending", value: pending },
          { label: "Approved", value: approved },
          { label: "% with source URL", value: `${sourcePct}%` },
          { label: "% with venue/address", value: `${venuePct}%` },
          { label: "Enrichment success", value: `${enrichedPct}%` },
          { label: "% with comp accepted", value: `${compPct || "0"}%` },
        ].map((card) => (
          <div key={card.label} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fff" }}>
            <div style={{ fontSize: 12, color: "#555" }}>{card.label}</div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{card.value}</div>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 0 }}>By state</h2>
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fff", marginBottom: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["State", "Tournaments", "% Enriched", "% Venue", "Errors", "Pending >21d"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid #eee" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from(byStateMap.entries()).map(([st, row]) => (
              <tr key={st}>
                <td style={{ padding: "6px 4px" }}>{st}</td>
                <td style={{ padding: "6px 4px" }}>{row.total}</td>
                <td style={{ padding: "6px 4px" }}>{row.total ? Math.round((row.enriched / row.total) * 100) : 0}%</td>
                <td style={{ padding: "6px 4px" }}>{row.total ? Math.round((row.venue / row.total) * 100) : 0}%</td>
                <td style={{ padding: "6px 4px" }}>{row.errors}</td>
                <td style={{ padding: "6px 4px" }}>{row.stalePending}</td>
              </tr>
            ))}
            {!byStateMap.size && (
              <tr>
                <td colSpan={6} style={{ padding: 8, color: "#666" }}>
                  No tournaments in range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 0 }}>Needs attention</h2>
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Name", "Start", "City/State", "Status", "Issues"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid #eee" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {needsAttention.map((t: any) => {
              const jobArr = jobsByTid.get(t.id) ?? [];
              const issues: string[] = [];
              if (!t.source_url) issues.push("Missing URL");
              if (jobArr.some((j) => j.status === "error")) issues.push("Enrichment error");
              if (t.status === "draft" && t.start_date && t.start_date < staleCutoff) issues.push("Pending >21d");
              return (
                <tr key={t.id}>
                  <td style={{ padding: "6px 4px" }}>{t.name}</td>
                  <td style={{ padding: "6px 4px" }}>{t.start_date ?? "—"}</td>
                  <td style={{ padding: "6px 4px" }}>
                    {[t.city, t.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td style={{ padding: "6px 4px" }}>{t.status}</td>
                  <td style={{ padding: "6px 4px" }}>{issues.join(" • ") || "—"}</td>
                </tr>
              );
            })}
            {!needsAttention.length && (
              <tr>
                <td colSpan={5} style={{ padding: 8, color: "#666" }}>
                  Nothing needs attention 🎉
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
