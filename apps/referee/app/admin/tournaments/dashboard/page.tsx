import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSportValidationCounts } from "@/lib/validation/getSportValidationCounts";

export const runtime = "nodejs";

type OutreachCampaignSummary = {
  campaignId: string;
  sport: string;
  createdAt: string | null;
  total: number;
  preview: number;
  sent: number;
  error: number;
  variantA: number;
  variantB: number;
};

type Search = {
  sport?: string;
  state?: string | string[];
  start?: string;
  end?: string;
};

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

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizedPlan(value: string | null | undefined) {
  const plan = (value ?? "").trim().toLowerCase();
  if (!plan || plan === "free") return "insider";
  return plan;
}

function Tile({ label, value, tone }: { label: string; value: number | string; tone?: "warn" | "info" | "success" }) {
  const bg =
    tone === "warn" ? "#fef3c7" : tone === "success" ? "#ecfdf3" : tone === "info" ? "#eff6ff" : "#f9fafb";
  const color =
    tone === "warn" ? "#92400e" : tone === "success" ? "#166534" : tone === "info" ? "#1d4ed8" : "#111827";
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid rgba(0,0,0,0.06)",
        background: bg,
        minWidth: 120,
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

export default async function TournamentsDashboard({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const validationCountsPromise = getSportValidationCounts();
  const sport = searchParams.sport ?? "";
  const stateParamRaw = searchParams.state ?? "";
  const start = searchParams.start || todayIso();
  const end = searchParams.end ?? "";
  const stateTokens = Array.isArray(stateParamRaw)
    ? stateParamRaw.flatMap((s) => s.split(","))
    : String(stateParamRaw).split(",");
  const normalizedStates = stateTokens.map((s) => s.trim().toUpperCase()).filter(Boolean);
  const useAllStates = normalizedStates.length === 0 || normalizedStates.includes("ALL");
  const states = useAllStates ? ALL_STATES : normalizedStates;
  const stateParam = useAllStates ? "ALL" : states.join(",");
  const baseParams = new URLSearchParams();
  if (sport) baseParams.set("sport", sport);
  if (stateParam) baseParams.set("state", stateParam);

  const supabase = supabaseAdmin;
  let tQuery = supabase
    .from("tournaments" as any)
    .select("id,name,start_date,end_date,state,city,status,source_url,official_website_url,venue,address,sport,tournament_director_email")
    .or(`start_date.gte.${start},start_date.is.null`);
  if (end) tQuery = tQuery.lte("start_date", end);
  if (sport) tQuery = tQuery.eq("sport", sport);
  if (states.length) tQuery = tQuery.in("state", states);
  const tournamentsRes = await tQuery;
  const tournaments = tournamentsRes.data ?? [];

  const ids = tournaments.map((t: any) => t.id);

  let byStateQuery = supabase
    .from("tournaments" as any)
    .select("id,name,start_date,end_date,state,city,status,source_url,official_website_url,venue,address,sport,tournament_director_email")
    .or(`start_date.gte.${start},start_date.is.null`);
  if (end) byStateQuery = byStateQuery.lte("start_date", end);
  if (sport) byStateQuery = byStateQuery.eq("sport", sport);
  const byStateRes = await byStateQuery;
  const byStateTournaments = byStateRes.data ?? [];
  const byStateIds = byStateTournaments.map((t: any) => t.id);

  let sportTileQuery = supabase
    .from("tournaments" as any)
    .select("id,sport,start_date,end_date,state,tournament_director_email,venue,address,status,is_canonical")
    .eq("status", "published")
    .eq("is_canonical", true)
    .or(`start_date.gte.${start},start_date.is.null`);
  if (end) sportTileQuery = sportTileQuery.lte("start_date", end);
  if (sport) sportTileQuery = sportTileQuery.eq("sport", sport);
  if (states.length) sportTileQuery = sportTileQuery.in("state", states);
  const sportTileRes = await sportTileQuery;
  const sportTileTournaments = sportTileRes.data ?? [];
  const sportTileIds = sportTileTournaments.map((t: any) => t.id).filter(Boolean);

  const sportTileVenueRes = sportTileIds.length
    ? await supabaseAdmin
        .from("tournament_venues" as any)
        .select("tournament_id,venue_id")
        .in("tournament_id", sportTileIds)
    : { data: [] as any[], error: null };
  const sportTileVenueLinks = sportTileVenueRes.data ?? [];
  const linkedVenueCounts = new Map<string, number>();
  sportTileVenueLinks.forEach((row: any) => {
    if (!row.tournament_id || !row.venue_id) return;
    linkedVenueCounts.set(String(row.tournament_id), (linkedVenueCounts.get(String(row.tournament_id)) ?? 0) + 1);
  });

  let staffVerifiedQuery = supabase
    .from("tournaments" as any)
    .select("id", { count: "exact", head: true })
    .gte("tournament_staff_verified_at", todayIso());
  if (sport) staffVerifiedQuery = staffVerifiedQuery.eq("sport", sport);
  if (states.length) staffVerifiedQuery = staffVerifiedQuery.in("state", states);
  const staffVerifiedRes = await staffVerifiedQuery;
  const staffVerifiedToday = staffVerifiedRes.count ?? 0;

  let staffVerifiedTotalQuery = supabase
    .from("tournaments" as any)
    .select("id", { count: "exact", head: true })
    .eq("tournament_staff_verified", true);
  if (sport) staffVerifiedTotalQuery = staffVerifiedTotalQuery.eq("sport", sport);
  if (states.length) staffVerifiedTotalQuery = staffVerifiedTotalQuery.in("state", states);
  const staffVerifiedTotalRes = await staffVerifiedTotalQuery;
  const staffVerifiedTotal = staffVerifiedTotalRes.count ?? 0;

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
  const venueIdsInScope = new Set(
    tournaments
      .map((t: any) => t.id)
      .filter(Boolean)
  );

  // Distinct venues linked to tournaments in current scope that have Owl's Eye run history.
  let owlVenueCount = 0;
  if (venueIdsInScope.size > 0) {
    try {
      const { data: tvRows } = await supabaseAdmin
        .from("tournament_venues" as any)
        .select("tournament_id,venue_id")
        .in("tournament_id", Array.from(venueIdsInScope));
      const linkedVenueIds = Array.from(
        new Set(((tvRows as Array<{ venue_id: string }> | null) ?? []).map((row) => row.venue_id).filter(Boolean))
      );
      if (linkedVenueIds.length > 0) {
        const { data: owlRows } = await supabaseAdmin
          .from("owls_eye_runs" as any)
          .select("venue_id,status")
          .in("venue_id", linkedVenueIds)
          .in("status", ["running", "complete"]);
        owlVenueCount = new Set(((owlRows as Array<{ venue_id: string }> | null) ?? []).map((row) => row.venue_id)).size;
      }
    } catch {
      owlVenueCount = 0;
    }
  }

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

  const sportTileMap = new Map<
    string,
    {
      total: number;
      upcoming: number;
      missingDirectorEmail: number;
      missingDates: number;
      missingVenues: number;
    }
  >();
  const today = todayIso();
  sportTileTournaments.forEach((t: any) => {
    const key = (t.sport || "unknown").toLowerCase();
    const row = sportTileMap.get(key) ?? {
      total: 0,
      upcoming: 0,
      missingDirectorEmail: 0,
      missingDates: 0,
      missingVenues: 0,
    };
    row.total += 1;
    const effectiveDate = t.end_date ?? t.start_date ?? null;
    if (effectiveDate && effectiveDate >= today) row.upcoming += 1;
    if (!hasText(t.tournament_director_email)) row.missingDirectorEmail += 1;
    if (!hasText(t.start_date) || !hasText(t.end_date)) row.missingDates += 1;
    const hasLinkedVenue = (linkedVenueCounts.get(String(t.id)) ?? 0) > 0;
    const hasFallbackVenue = hasText(t.venue) || hasText(t.address);
    if (!hasLinkedVenue && !hasFallbackVenue) row.missingVenues += 1;
    sportTileMap.set(key, row);
  });

  const [tiUsersRes, outreachRes] = await Promise.all([
    (supabaseAdmin.from("ti_users" as any) as any).select("id,plan,subscription_status"),
    (supabaseAdmin.from("email_outreach_previews" as any) as any)
      .select("campaign_id,sport,variant,status,created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const tiUsers = tiUsersRes.data ?? [];
  const validationCounts = await validationCountsPromise;
  const tiSummary = tiUsers.reduce(
    (acc: { insider: number; weekendPro: number }, row: any) => {
      const plan = normalizedPlan(row.plan);
      if (plan === "weekend_pro") acc.weekendPro += 1;
      else acc.insider += 1;
      return acc;
    },
    { insider: 0, weekendPro: 0 }
  );

  const outreachRows = outreachRes.data ?? [];
  const outreachSentTotal = outreachRows.filter((row: any) => row.status === "sent").length;
  const outreachCampaigns = (
    Array.from(
      outreachRows.reduce((acc, row: any) => {
        const key = `${row.campaign_id ?? "unknown"}|${row.sport ?? "unknown"}`;
        const existing =
          acc.get(key) ??
          {
            campaignId: row.campaign_id ?? "unknown",
            sport: row.sport ?? "unknown",
            createdAt: row.created_at ?? null,
            total: 0,
            preview: 0,
            sent: 0,
            error: 0,
            variantA: 0,
            variantB: 0,
          };
        existing.total += 1;
        if (row.status === "sent") existing.sent += 1;
        else if (row.status === "error") existing.error += 1;
        else existing.preview += 1;
        if (row.variant === "A") existing.variantA += 1;
        if (row.variant === "B") existing.variantB += 1;
        if (!existing.createdAt || (row.created_at && existing.createdAt < row.created_at)) {
          existing.createdAt = row.created_at;
        }
        acc.set(key, existing);
        return acc;
      }, new Map<string, OutreachCampaignSummary>()).values()
    ) as OutreachCampaignSummary[]
  )
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
    .slice(0, 8);

  // Top sources (log rows in last 30 days)
  const thirtyAgo = addDays(-30);
  const runsRes = await supabase
    .from("tournament_source_logs" as any)
    .select("id,source_url,fetched_at,extracted_json")
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <Tile label="Sport validated" value={validationCounts.confirmed + validationCounts.rule_confirmed} />
        <Tile label="Rule confirmed" value={validationCounts.rule_confirmed} />
        <Tile label="Needs review" value={validationCounts.needs_review} />
        <Tile label="Conflicts" value={validationCounts.conflict} tone="warn" />
        <Tile label="Unknown" value={validationCounts.unknown} tone="info" />
        <Tile label="Unconfirmed" value={validationCounts.unconfirmed} />
      </div>
      <form style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 700 }}>
          Sport
          <select name="sport" defaultValue={sport} style={{ padding: 6, borderRadius: 8, border: "1px solid #ccc" }}>
            <option value="">All</option>
            <option value="soccer">Soccer</option>
            <option value="basketball">Basketball</option>
            <option value="football">Football</option>
            <option value="baseball">Baseball</option>
            <option value="softball">Softball</option>
            <option value="lacrosse">Lacrosse</option>
            <option value="hockey">Hockey</option>
            <option value="volleyball">Volleyball</option>
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
          { label: "Staff verified today", value: staffVerifiedToday },
          { label: "Staff verified total", value: staffVerifiedTotal },
          { label: "Official website", value: withSource },
          { label: "% with official website", value: `${sourcePct}%` },
          { label: "% with venue/address", value: `${venuePct}%` },
          { label: "Enrichment success", value: `${enrichedPct}%` },
          { label: "% with comp accepted", value: `${compPct || "0"}%` },
          { label: "Venues with Owl's Eye", value: owlVenueCount },
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
            {card.label === "Venues with Owl's Eye" && (
              <div style={{ marginTop: 6 }}>
                <a
                  href="/admin/venues?owl=with_data"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 700, textDecoration: "none" }}
                >
                  Open Owl&apos;s Eye venues
                </a>
              </div>
            )}
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 0 }}>Tournaments by sport</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 20 }}>
        {Array.from(sportTileMap.entries())
          .sort((a, b) => b[1].upcoming - a[1].upcoming || b[1].total - a[1].total)
          .map(([key, value]) => (
            <div key={key} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fff" }}>
              <div style={{ fontSize: 12, color: "#555", textTransform: "capitalize" }}>{key}</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{value.upcoming}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>Upcoming tournaments</div>
              <div style={{ display: "grid", gap: 4, fontSize: 12, color: "#334155" }}>
                <div>Total tournaments: <strong>{value.total}</strong></div>
                <div>Missing director email: <strong>{value.missingDirectorEmail}</strong></div>
                <div>Missing dates: <strong>{value.missingDates}</strong></div>
                <div>Missing venues: <strong>{value.missingVenues}</strong></div>
              </div>
            </div>
          ))}
        {!sportTileMap.size && (
          <div style={{ color: "#666" }}>No tournaments in range.</div>
        )}
      </div>

      <h2 style={{ marginTop: 0 }}>TournamentInsights</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 12 }}>
        <div style={{ border: "1px solid #dbeafe", borderRadius: 12, padding: 16, background: "#eff6ff", textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 700 }}>Total TI Insider</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a" }}>{tiSummary.insider}</div>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "#fff", textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>Recent outreach campaigns</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a" }}>{outreachCampaigns.length}</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Latest {Math.min(outreachCampaigns.length, 8)} campaign groups</div>
        </div>
        <div style={{ border: "1px solid #ede9fe", borderRadius: 12, padding: 16, background: "#f5f3ff", textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#7c3aed", fontWeight: 700 }}>Total Weekend Pro</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a" }}>{tiSummary.weekendPro}</div>
        </div>
        <div style={{ border: "1px solid #dcfce7", borderRadius: 12, padding: 16, background: "#f0fdf4", textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#15803d", fontWeight: 700 }}>Total outreach sent</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a" }}>{outreachSentTotal}</div>
        </div>
        <div style={{ border: "1px solid #fee2e2", borderRadius: 12, padding: 16, background: "#fef2f2", textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700 }}>Total tournaments verified</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a" }}>{staffVerifiedTotal}</div>
        </div>
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fff", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>TI outreach campaigns</h3>
          <a href="https://www.tournamentinsights.com/admin/outreach-previews?sport=soccer" target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", textDecoration: "none" }}>
            Open TI outreach previews
          </a>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Campaign", "Sport", "Preview", "Sent", "Errors", "Variant A", "Variant B", "Latest"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid #eee" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {outreachCampaigns.map((row) => (
              <tr key={`${row.campaignId}-${row.sport}`}>
                <td style={{ padding: "6px 4px" }}>{row.campaignId}</td>
                <td style={{ padding: "6px 4px", textTransform: "capitalize" }}>{row.sport}</td>
                <td style={{ padding: "6px 4px" }}>{row.preview}</td>
                <td style={{ padding: "6px 4px" }}>{row.sent}</td>
                <td style={{ padding: "6px 4px" }}>{row.error}</td>
                <td style={{ padding: "6px 4px" }}>{row.variantA}</td>
                <td style={{ padding: "6px 4px" }}>{row.variantB}</td>
                <td style={{ padding: "6px 4px" }}>{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</td>
              </tr>
            ))}
            {!outreachCampaigns.length && (
              <tr>
                <td colSpan={8} style={{ padding: 8, color: "#666" }}>
                  No TI outreach campaign records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
            {Array.from(byStateMap.entries())
              .sort((a, b) => (b[1].total ?? 0) - (a[1].total ?? 0))
              .map(([st, row]) => (
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
