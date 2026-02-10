import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type Search = {
  sport?: string;
  state?: string | string[];
  start?: string;
  end?: string;
};

const DEFAULT_STATES = ["WA", "OR", "CA", "AZ", "NV", "CO", "UT", "ID", "MT"];
const ALL_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

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
  const stateParamRaw = searchParams.state ?? "";
  const start = searchParams.start || todayIso();
  const end = searchParams.end ?? "";
  const stateTokens = Array.isArray(stateParamRaw)
    ? stateParamRaw.flatMap((s) => s.split(","))
    : String(stateParamRaw).split(",");
  const normalizedStates = stateTokens.map((s) => s.trim().toUpperCase()).filter(Boolean);
  const useAllStates = normalizedStates.includes("ALL");
  const states = useAllStates ? ALL_STATES : (normalizedStates.length ? normalizedStates : DEFAULT_STATES);
  const stateParam = useAllStates ? "ALL" : states.join(",");
  const baseParams = new URLSearchParams();
  if (sport) baseParams.set("sport", sport);
  if (stateParam) baseParams.set("state", stateParam);

  const supabase = supabaseAdmin;
  let tQuery = supabase
    .from("tournaments" as any)
    .select("id,name,start_date,state,city,status,source_url,official_website_url,venue,address,sport")
    .gte("start_date", start);
  if (end) tQuery = tQuery.lte("start_date", end);
  if (sport) tQuery = tQuery.eq("sport", sport);
  if (states.length) tQuery = tQuery.in("state", states);
  const tournamentsRes = await tQuery;
  const tournaments = tournamentsRes.data ?? [];

  const ids = tournaments.map((t: any) => t.id);

  let byStateQuery = supabase
    .from("tournaments" as any)
    .select("id,name,start_date,state,city,status,source_url,official_website_url,venue,address,sport")
    .gte("start_date", start);
  if (end) byStateQuery = byStateQuery.lte("start_date", end);
  if (sport) byStateQuery = byStateQuery.eq("sport", sport);
  const byStateRes = await byStateQuery;
  const byStateTournaments = byStateRes.data ?? [];
  const byStateIds = byStateTournaments.map((t: any) => t.id);

  const jobsRes = ids.length
    ? await supabase.from("tournament_enrichment_jobs" as any).select("tournament_id,status").in("tournament_id", ids)
    : { data: [] as any[], error: null };
  const jobs = jobsRes.data ?? [];

  const byStateJobsRes = byStateIds.length
    ? await supabase.from("tournament_enrichment_jobs" as any).select("tournament_id,status").in("tournament_id", byStateIds)
    : { data: [] as any[], error: null };
  const byStateJobs = byStateJobsRes.data ?? [];

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
  const withSource = tournaments.filter((t: any) => t.official_website_url).length;
  const missingOfficial = total - withSource;
  const withVenue = tournaments.filter((t: any) => t.venue || t.address).length;

  const jobsByTid = new Map<string, any[]>();
  jobs.forEach((j: any) => {
    const arr = jobsByTid.get(j.tournament_id) ?? [];
    arr.push(j);
    jobsByTid.set(j.tournament_id, arr);
  });
  const byStateJobsByTid = new Map<string, any[]>();
  byStateJobs.forEach((j: any) => {
    const arr = byStateJobsByTid.get(j.tournament_id) ?? [];
    arr.push(j);
    byStateJobsByTid.set(j.tournament_id, arr);
  });
  const jobsDone = Array.from(jobsByTid.values()).filter((arr) => arr.some((j) => j.status === "done")).length;

  const enrichedPct = total ? Math.round((jobsDone / total) * 100) : 0;
  const sourcePct = total ? Math.round((withSource / total) * 100) : 0;
  const venuePct = total ? Math.round((withVenue / total) * 100) : 0;
  const compPct = total ? Math.round((new Set(comps.map((c: any) => c.tournament_id)).size / total) * 100) : 0;

  const sportCounts = tournaments.reduce(
    (acc: Record<string, number>, t: any) => {
      const key = (t.sport || "unknown").toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {}
  );

  // Top sources (run rows in last 30 days)
  const thirtyAgo = addDays(-30);
  const runsRes = await supabase
    .from("tournament_sources" as any)
    .select("id,source_url,url,extracted_json,fetched_at")
    .gte("fetched_at", thirtyAgo)
    .not("fetched_at", "is", null);
  const runs = (runsRes.data ?? []).filter((r: any) => r.fetched_at);

  const topSourceMap = new Map<
    string,
    { discovered: number; imported: number; lastRun: string | null; lastAction: string | null }
  >();
  runs.forEach((run: any) => {
    const key = run.source_url || run.url;
    if (!key) return;
    const ex = run.extracted_json || {};
    const discovered = Number(ex.discovered_count ?? 0) || 0;
    const imported = Number(ex.imported_count ?? 0) || 0;
    const row = topSourceMap.get(key) ?? { discovered: 0, imported: 0, lastRun: null, lastAction: null };
    row.discovered += discovered;
    row.imported += imported;
    if (!row.lastRun || (run.fetched_at && row.lastRun < run.fetched_at)) {
      row.lastRun = run.fetched_at;
      row.lastAction = ex.action ?? null;
    }
    topSourceMap.set(key, row);
  });
  const topSources = Array.from(topSourceMap.entries())
    .sort((a, b) => (b[1].discovered || b[1].imported) - (a[1].discovered || a[1].imported))
    .slice(0, 5);

  const byStateMap = new Map<
    string,
    { total: number; venue: number; enriched: number; errors: number; stalePending: number; sports: Record<string, number> }
  >();
  const staleDays = 21;
  const staleCutoff = addDays(-staleDays);
  const sportKeys = new Set<string>();
  byStateTournaments.forEach((t: any) => {
    const key = t.state || "Unknown";
    const stateRow = byStateMap.get(key) ?? { total: 0, venue: 0, enriched: 0, errors: 0, stalePending: 0, sports: {} };
    stateRow.total += 1;
    if (t.venue || t.address) stateRow.venue += 1;
    const jobArr = byStateJobsByTid.get(t.id) ?? [];
    if (jobArr.some((j) => j.status === "done")) stateRow.enriched += 1;
    if (jobArr.some((j) => j.status === "error")) stateRow.errors += 1;
    if (t.status === "draft" && t.start_date && t.start_date < staleCutoff) stateRow.stalePending += 1;
    const sportKey = (t.sport || "unknown").toLowerCase();
    sportKeys.add(sportKey);
    stateRow.sports[sportKey] = (stateRow.sports[sportKey] || 0) + 1;
    byStateMap.set(key, stateRow);
  });
  const sportColumns = Array.from(sportKeys).sort((a, b) => a.localeCompare(b));

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
          <select name="sport" defaultValue={sport} style={{ padding: 6, borderRadius: 8, border: "1px solid #ccc" }}>
            <option value="">All</option>
            <option value="soccer">Soccer</option>
            <option value="basketball">Basketball</option>
            <option value="football">Football</option>
          </select>
        </label>
        <details style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8, background: "#fff" }}>
          <summary style={{ fontSize: 12, fontWeight: 700, cursor: "pointer" }}>States</summary>
          <div style={{ marginTop: 8 }}>
            <select
              name="state"
              multiple
              defaultValue={useAllStates ? ["ALL"] : states}
              size={6}
              style={{ padding: 6, borderRadius: 8, border: "1px solid #ccc", minWidth: 220 }}
            >
              <option value="ALL">All states</option>
              {ALL_STATES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
              Tip: Hold Cmd/Ctrl to multi-select. Choose “All states” to include every state.
            </div>
          </div>
        </details>
        <label style={{ fontSize: 12, fontWeight: 700 }}>
          Start
          <input type="date" name="start" defaultValue={start} style={{ padding: 6, borderRadius: 8, border: "1px solid #ccc" }} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700 }}>
          End
          <input type="date" name="end" defaultValue={end} style={{ padding: 6, borderRadius: 8, border: "1px solid #ccc" }} />
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <a
            href={`/admin/tournaments/dashboard?${baseParams.toString()}`}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #9ca3af", background: "#f9fafb", color: "#111827", fontWeight: 700, textDecoration: "none" }}
          >
            Clear dates
          </a>
          <a
            href={`/admin/tournaments/dashboard?${(() => {
              const params = new URLSearchParams(baseParams);
              const year = new Date().getFullYear();
              params.set("start", `${year}-01-01`);
              params.set("end", `${year}-12-31`);
              return params.toString();
            })()}`}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #0f172a", background: "#0f172a", color: "#fff", fontWeight: 800, textDecoration: "none" }}
          >
            This year
          </a>
        </div>
        <button style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#0f172a", color: "#fff", fontWeight: 800, alignSelf: "flex-end" }}>
          Apply
        </button>
      </form>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Upcoming tournaments", value: total },
          { label: "Pending", value: pending },
          { label: "Approved", value: approved },
          { label: "Official website", value: withSource },
          { label: "% with official website", value: `${sourcePct}%` },
          { label: "% with venue/address", value: `${venuePct}%` },
          { label: "Enrichment success", value: `${enrichedPct}%` },
          { label: "% with comp accepted", value: `${compPct || "0"}%` },
        ].map((card) => (
          <div key={card.label} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fff" }}>
            <div style={{ fontSize: 12, color: "#555", display: "flex", alignItems: "center", gap: 6 }}>
              {card.label}
              {card.label === "Official website" && (
                <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 999, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#334155" }}>
                  {start} → {end || "Future"}
                </span>
              )}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{card.value}</div>
            {card.label === "Official website" && (
              <div style={{ marginTop: 4, fontSize: 11, color: "#64748b" }}>
                Missing in range: {missingOfficial}
              </div>
            )}
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 0 }}>Tournaments by sport</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 20 }}>
        {Object.entries(sportCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([key, value]) => (
            <div key={key} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fff" }}>
              <div style={{ fontSize: 12, color: "#555" }}>{key}</div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{value}</div>
            </div>
          ))}
        {!Object.keys(sportCounts).length && (
          <div style={{ color: "#666" }}>No tournaments in range.</div>
        )}
      </div>

      <h2 style={{ marginTop: 0 }}>Top sources (last 30d)</h2>
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fff", marginBottom: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Source URL", "Action", "Discovered", "Imported", "Yield", "Last run"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid #eee" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topSources.map(([url, row]) => {
              const yieldPct = (row.discovered || row.imported) ? Math.round((row.imported / Math.max(row.discovered || 1, 1)) * 100) : 0;
              return (
                <tr key={url}>
                  <td style={{ padding: "6px 4px", maxWidth: 260, wordBreak: "break-all" }}>{url}</td>
                  <td style={{ padding: "6px 4px", fontSize: 12, color: "#444" }}>{row.lastAction ?? "—"}</td>
                  <td style={{ padding: "6px 4px" }}>{row.discovered}</td>
                  <td style={{ padding: "6px 4px" }}>{row.imported}</td>
                  <td style={{ padding: "6px 4px" }}>{yieldPct}%</td>
                  <td style={{ padding: "6px 4px" }}>{row.lastRun ? new Date(row.lastRun).toLocaleString() : "—"}</td>
                </tr>
              );
            })}
            {!topSources.length && (
              <tr>
                <td colSpan={6} style={{ padding: 8, color: "#666" }}>
                  No recent source runs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 0 }}>By state</h2>
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fff", marginBottom: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["State", "Tournaments", ...sportColumns.map((s) => `${s}`), "% Enriched", "% Venue", "Errors", "Pending >21d"].map((h) => (
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
                {sportColumns.map((s) => (
                  <td key={`${st}-${s}`} style={{ padding: "6px 4px" }}>
                    {row.sports[s] ?? 0}
                  </td>
                ))}
                <td style={{ padding: "6px 4px" }}>{row.total ? Math.round((row.enriched / row.total) * 100) : 0}%</td>
                <td style={{ padding: "6px 4px" }}>{row.total ? Math.round((row.venue / row.total) * 100) : 0}%</td>
                <td style={{ padding: "6px 4px" }}>{row.errors}</td>
                <td style={{ padding: "6px 4px" }}>{row.stalePending}</td>
              </tr>
            ))}
            {!byStateMap.size && (
              <tr>
                <td colSpan={sportColumns.length + 6} style={{ padding: 8, color: "#666" }}>
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
