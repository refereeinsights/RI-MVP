import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Link from "next/link";
import { Fragment } from "react";
import {
  normalizeSourceUrl,
  getSkipReason,
} from "@/server/admin/sources";
import SourceLogsClient from "./SourceLogsClient";
import {
  upsertSourceAction,
  updateStatusAction,
  updateMetadataAction,
  updateSourceUrlAction,
  quickActionAction,
  sweepSourceAction,
  runTopTierSweepAction,
} from "./actions";

type Filter = "all" | "untested" | "keep" | "ignored" | "needs_review";
type GroupBy = "none" | "sport" | "state" | "review_status" | "source_type";

export const runtime = "nodejs";

type SearchParams = {
  source_url?: string;
  notice?: string;
  filter?: Filter;
  sort?: string;
  dir?: string;
  q?: string;
  sport?: string;
  state?: string;
  group?: GroupBy;
};

const SPORT_OPTIONS = [
  "soccer",
  "futsal",
  "basketball",
  "baseball",
  "softball",
  "lacrosse",
  "volleyball",
  "football",
  "wrestling",
  "hockey",
  "other",
] as const;

const VENUE_SPORT_BUCKET = "venues";
const SPORT_FILTER_OPTIONS = [...SPORT_OPTIONS, VENUE_SPORT_BUCKET] as const;

const SOURCE_TYPE_OPTIONS = [
  "tournament_platform",
  "governing_body",
  "league",
  "club",
  "directory",
  "association_directory",
] as const;
const TOURNAMENT_SPORTS = SPORT_OPTIONS;

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
}

type AcquisitionTileRow = { domain: string; count: number };
type AcquisitionAssociationRow = { association: string; count: number };
type AcquisitionSportDomainRow = { sport: string; domain: string; count: number };
type AcquisitionTiles = {
  source_domains: AcquisitionTileRow[];
  official_domains: AcquisitionTileRow[];
  associations: AcquisitionAssociationRow[];
  top_domains_by_sport: AcquisitionSportDomainRow[];
};

export default async function SourcesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const overdueSweepCutoffMs = Date.now() - 45 * 24 * 60 * 60 * 1000;
  const notice = searchParams.notice ?? "";
  const selectedUrl = searchParams.source_url ? normalizeSourceUrl(searchParams.source_url).canonical : null;
  const filter: Filter = (searchParams.filter as Filter) || "all";
  const sort = searchParams.sort ?? "review_status";
  const dir = searchParams.dir === "asc" ? "asc" : "desc";
  const q = (searchParams.q ?? "").trim();
  const sportFilter = (searchParams.sport ?? "").trim();
  const stateFilter = (searchParams.state ?? "").trim().toUpperCase();
  const groupBy: GroupBy = (["none", "sport", "state", "review_status", "source_type"].includes(
    searchParams.group ?? ""
  )
    ? searchParams.group
    : "sport") as GroupBy;
  const stickyQueryString = (() => {
    const params = new URLSearchParams();
    if (filter) params.set("filter", filter);
    if (sort) params.set("sort", sort);
    if (dir) params.set("dir", dir);
    if (q) params.set("q", q);
    if (sportFilter) params.set("sport", sportFilter);
    if (stateFilter) params.set("state", stateFilter);
    if (groupBy && groupBy !== "none") params.set("group", groupBy);
    if (selectedUrl) params.set("source_url", selectedUrl);
    return params.toString();
  })();
  const sourcesBasePath = `/admin/tournaments/sources${stickyQueryString ? `?${stickyQueryString}` : ""}`;

  const buildSourcesHref = (extraParams?: Record<string, string | null | undefined>) => {
    const params = new URLSearchParams(stickyQueryString);
    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        if (value === null || value === undefined || value === "") params.delete(key);
        else params.set(key, value);
      }
    }
    return `/admin/tournaments/sources${params.toString() ? `?${params.toString()}` : ""}`;
  };

  const reviewPriority = [
    "needs_review",
    "untested",
    "keep",
    "seasonal",
    "low_yield",
    "manual_html",
    "pdf_only",
    "login_required",
    "paywalled",
    "js_only",
    "blocked_403",
    "dead",
    "deprecated",
    "duplicate_source",
  ];
  const priorityIndex = new Map(reviewPriority.map((s, i) => [s, i]));
  const getPriority = (status?: string | null) =>
    priorityIndex.get((status || "untested").toLowerCase()) ?? reviewPriority.length + 1;

  const isOverdueKeepSweep = (row: any) => {
    if ((row.review_status || "") !== "keep") return false;
    if (!row.last_swept_at) return true;
    const sweptMs = Date.parse(String(row.last_swept_at));
    if (Number.isNaN(sweptMs)) return true;
    return sweptMs < overdueSweepCutoffMs;
  };

  const isVenueBasedSource = (row: any) => {
    const sourceType = String(row?.source_type ?? "").toLowerCase();
    return sourceType === "venue_sweep" || sourceType === "venue_calendar";
  };

  const acquisitionTilesResp = await (supabaseAdmin as any).rpc("get_admin_tournament_acquisition_tiles", {
    p_limit: 8,
  });
  const acquisitionTiles = (acquisitionTilesResp.data ?? null) as AcquisitionTiles | null;

  const registryRes = await supabaseAdmin
    .from("tournament_sources" as any)
    .select(
      "id,source_url,source_type,sport,state,city,notes,is_active,is_custom_source,review_status,review_notes,ignore_until,last_tested_at,last_swept_at,last_sweep_status,last_sweep_summary,fetched_at,created_at"
    )
    .is("tournament_id", null)
    .order("last_swept_at", { ascending: false })
    .order("fetched_at", { ascending: true });
  const registryRows = registryRes.data ?? [];

  const runsRes = selectedUrl
    ? await supabaseAdmin
        .from("tournament_sources" as any)
        .select("id,fetched_at,http_status,extracted_json,source_url,url")
        .eq("source_url", selectedUrl)
        .is("tournament_id", null)
        .not("fetched_at", "is", null)
        .order("fetched_at", { ascending: false })
        .limit(10)
    : { data: [] as any[], error: null };
  const runRows = runsRes.data ?? [];

  const filtered = registryRows.filter((row: any) => {
    if (!row.is_active) return false;
    if (filter === "untested") return (row.review_status || "untested") === "untested";
    if (filter === "keep") return (row.review_status || "") === "keep";
    if (filter === "needs_review") return (row.review_status || "") === "needs_review";
    if (filter === "ignored") {
      const reason = getSkipReason(row);
      return !!reason;
    }
    return true;
  }).filter((row: any) => {
    if (q) {
      const hay = String(row.source_url || "").toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    if (sportFilter) {
      if (sportFilter.toLowerCase() === VENUE_SPORT_BUCKET) {
        if (!isVenueBasedSource(row)) return false;
      } else if (String(row.sport || "").toLowerCase() !== sportFilter.toLowerCase()) {
        return false;
      }
    }
    if (stateFilter && String(row.state || "").toUpperCase() !== stateFilter) return false;
    return true;
  });

  const sorted = filtered.slice().sort((a: any, b: any) => {
    const activeRankA = a.is_active ? 0 : 1;
    const activeRankB = b.is_active ? 0 : 1;
    if (sort === "review_status") {
      if (activeRankA !== activeRankB) return activeRankA - activeRankB;
      const prA = getPriority(a.review_status);
      const prB = getPriority(b.review_status);
      if (prA !== prB) return prA - prB;
      const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (aCreated !== bCreated) return bCreated - aCreated;
      const aTime = a.last_swept_at ? new Date(a.last_swept_at).getTime() : 0;
      const bTime = b.last_swept_at ? new Date(b.last_swept_at).getTime() : 0;
      return bTime - aTime;
    }
    if (sort === "last_swept_at") {
      const aTime = a.last_swept_at ? new Date(a.last_swept_at).getTime() : 0;
      const bTime = b.last_swept_at ? new Date(b.last_swept_at).getTime() : 0;
      return dir === "asc" ? aTime - bTime : bTime - aTime;
    }
    if (sort === "source_url") {
      const cmp = String(a.source_url || "").localeCompare(String(b.source_url || ""), undefined, { sensitivity: "base" });
      return dir === "asc" ? cmp : -cmp;
    }
    if (sort === "custom") {
      const aCustom = a.is_custom_source ? 0 : 1;
      const bCustom = b.is_custom_source ? 0 : 1;
      return dir === "asc" ? aCustom - bCustom : bCustom - aCustom;
    }
    return 0;
  });

  const buildSortHref = (key: string) => {
    const nextDir = sort === key && dir === "asc" ? "desc" : "asc";
    return buildSourcesHref({ sort: key, dir: nextDir });
  };

  const registryColumns: Array<{ key: string; label: string; sortable?: boolean }> = [
    { key: "source_url", label: "Source URL", sortable: true },
    { key: "custom", label: "Custom", sortable: true },
    { key: "source_type", label: "Type" },
    { key: "sport", label: "Sport" },
    { key: "state", label: "State" },
    { key: "city", label: "City" },
    { key: "review_status", label: "Status", sortable: true },
    { key: "is_active", label: "Active" },
    { key: "ignore_until", label: "Ignore until" },
    { key: "last_tested_at", label: "Last tested" },
    { key: "last_swept_at", label: "Last sweep", sortable: true },
    { key: "summary", label: "Summary" },
    { key: "actions", label: "Actions" },
  ];

  const getGroupLabel = (row: any) => {
    if (groupBy === "sport") return isVenueBasedSource(row) ? VENUE_SPORT_BUCKET : row.sport || "Unknown sport";
    if (groupBy === "state") return row.state || "No state";
    if (groupBy === "review_status") return row.review_status || "untested";
    if (groupBy === "source_type") return row.source_type || "Unknown type";
    return "All sources";
  };

  const groupedRows =
    groupBy === "none"
      ? [{ key: "all", label: "All sources", rows: sorted, overdueKeepSweepCount: 0 }]
      : Array.from(
          sorted.reduce((map, row: any) => {
            const label = getGroupLabel(row);
            const current = map.get(label) ?? [];
            current.push(row);
            map.set(label, current);
            return map;
          }, new Map<string, any[]>())
        ).map(([label, rows]) => ({
          key: label,
          label,
          rows,
          overdueKeepSweepCount:
            groupBy === "sport" ? rows.filter((row) => row.is_active && isOverdueKeepSweep(row)).length : 0,
        }));

  const upsertSource = upsertSourceAction.bind(null, stickyQueryString);
  const updateStatus = updateStatusAction.bind(null, stickyQueryString);
  const updateMetadata = updateMetadataAction.bind(null, stickyQueryString);
  const updateSourceUrl = updateSourceUrlAction.bind(null, stickyQueryString);
  const quickAction = quickActionAction.bind(null, sourcesBasePath, stickyQueryString);
  const sweepSource = sweepSourceAction.bind(null, stickyQueryString);
  const runTopTierSweep = runTopTierSweepAction.bind(null, stickyQueryString);

  const renderTopList = (rows: AcquisitionTileRow[] | null | undefined) => {
    const list = (rows ?? []).filter((r) => r?.domain && Number.isFinite(r.count));
    if (!list.length) return <div style={{ color: "#64748b", fontSize: 12 }}>No data yet.</div>;
    return (
      <div style={{ display: "grid", gap: 6 }}>
        {list.slice(0, 8).map((row) => (
          <div key={row.domain} style={{ display: "flex", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.domain}</span>
            <span style={{ color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{row.count}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderAssociations = (rows: AcquisitionAssociationRow[] | null | undefined) => {
    const list = (rows ?? []).filter((r) => r?.association && Number.isFinite(r.count));
    if (!list.length) return <div style={{ color: "#64748b", fontSize: 12 }}>No data yet.</div>;
    return (
      <div style={{ display: "grid", gap: 6 }}>
        {list.slice(0, 8).map((row) => (
          <div key={row.association} style={{ display: "flex", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.association}</span>
            <span style={{ color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{row.count}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderTopDomainsBySport = (rows: AcquisitionSportDomainRow[] | null | undefined) => {
    const list = (rows ?? []).filter((r) => r?.sport && r?.domain && Number.isFinite(r.count));
    if (!list.length) return <div style={{ color: "#64748b", fontSize: 12 }}>No data yet.</div>;

    const bySport = new Map<string, AcquisitionSportDomainRow[]>();
    for (const row of list) {
      const sport = String(row.sport).toLowerCase();
      const existing = bySport.get(sport) ?? [];
      existing.push(row);
      bySport.set(sport, existing);
    }

    return (
      <div style={{ display: "grid", gap: 10 }}>
        {Array.from(bySport.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(0, 8)
          .map(([sport, sportRows]) => (
            <div key={sport} style={{ display: "grid", gap: 4 }}>
              <div style={{ fontWeight: 800, fontSize: 12, textTransform: "capitalize" }}>{sport}</div>
              <div style={{ display: "grid", gap: 4 }}>
                {sportRows.slice(0, 3).map((row) => (
                  <div key={`${sport}:${row.domain}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.domain}</span>
                    <span style={{ color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{row.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    );
  };

  const renderRegistryHeaders = () => (
    <tr>
      {registryColumns.map((col) => (
        <th key={col.label} style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid #eee" }}>
          {col.sortable ? (
            <Link href={buildSortHref(col.key)} style={{ color: "#0f172a", textDecoration: "none", fontWeight: 800 }}>
              {col.label}
            </Link>
          ) : (
            col.label
          )}
        </th>
      ))}
    </tr>
  );

  const renderRegistryRow = (row: any) => {
    const reason = getSkipReason(row);
    const ignore = !!reason;
    const overdueKeepSweep = row.is_active && isOverdueKeepSweep(row);
    return (
      <tr
        key={row.id}
        style={{
          ...(ignore ? { opacity: 0.65 } : undefined),
          ...(row.is_custom_source ? { background: "#ecfdf3" } : undefined),
          ...(overdueKeepSweep ? { background: "#fff1f2" } : undefined),
        }}
      >
        <td
          style={{
            padding: "6px 4px",
            ...(overdueKeepSweep ? { borderLeft: "4px solid #e11d48" } : undefined),
          }}
        >
          <Link href={buildSourcesHref({ source_url: row.source_url })} style={{ color: "#0f172a", fontWeight: 700 }}>
            {row.source_url}
          </Link>
        </td>
        <td style={{ padding: "6px 4px" }}>
          {row.is_custom_source ? (
            <span style={{ fontSize: 11, fontWeight: 800, color: "#065f46" }}>custom</span>
          ) : (
            "—"
          )}
        </td>
        <td style={{ padding: "6px 4px" }}>{row.source_type || "—"}</td>
        <td style={{ padding: "6px 4px" }}>{isVenueBasedSource(row) ? VENUE_SPORT_BUCKET : row.sport || "—"}</td>
        <td style={{ padding: "6px 4px" }}>{row.state || "—"}</td>
        <td style={{ padding: "6px 4px" }}>{row.city || "—"}</td>
        <td style={{ padding: "6px 4px" }}>
          <form action={updateSourceUrl} style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 8 }}>
            <input type="hidden" name="id" value={row.id} />
            <input
              name="new_source_url"
              defaultValue={row.source_url}
              style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 11, flex: 1, minWidth: 0 }}
            />
            <button
              type="submit"
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid #7c3aed",
                background: "#f5f3ff",
                color: "#5b21b6",
                fontSize: 11,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              Update URL
            </button>
          </form>
          <form action={updateMetadata} style={{ display: "grid", gap: 6, marginBottom: 8 }}>
            <input type="hidden" name="id" value={row.id} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(110px,1fr))", gap: 6 }}>
              <select
                name="source_type"
                defaultValue={row.source_type || ""}
                style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
              >
                <option value="">No type</option>
                {SOURCE_TYPE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                name="sport"
                defaultValue={row.sport || ""}
                style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
              >
                <option value="">No sport</option>
                {SPORT_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "80px 1fr auto", gap: 6 }}>
              <input
                name="state"
                defaultValue={row.state || ""}
                placeholder="ST"
                maxLength={2}
                style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
              />
              <input
                name="city"
                defaultValue={row.city || ""}
                placeholder="City"
                style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
              />
              <button
                type="submit"
                style={{
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Meta
              </button>
            </div>
          </form>
          <form action={updateStatus} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="hidden" name="id" value={row.id} />
            <select
              name="review_status"
              defaultValue={row.review_status || "untested"}
              style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db" }}
            >
              {[
                "untested",
                "keep",
                "needs_review",
                "low_yield",
                "manual_html",
                "js_only",
                "login_required",
                "dead",
                "pdf_only",
                "paywalled",
                "blocked_403",
                "duplicate_source",
                "seasonal",
                "deprecated",
              ].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11 }}>
              <input type="checkbox" name="is_active" defaultChecked={!!row.is_active} />
              active
            </label>
            <input type="hidden" name="review_notes" value={row.review_notes ?? ""} />
            <input type="hidden" name="ignore_until" value={row.ignore_until ?? ""} />
            <button
              type="submit"
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: "#f3f4f6",
                fontSize: 12,
              }}
            >
              Save
            </button>
          </form>
        </td>
        <td style={{ padding: "6px 4px" }}>{row.is_active ? "Yes" : "No"}</td>
        <td style={{ padding: "6px 4px" }}>{row.ignore_until ? new Date(row.ignore_until).toLocaleDateString() : "—"}</td>
        <td style={{ padding: "6px 4px" }}>{formatDate(row.last_tested_at)}</td>
        <td style={{ padding: "6px 4px" }}>
          {formatDate(row.last_swept_at)}
          {row.last_sweep_status ? (
            <>
              {" "}
              <SourceLogsClient sourceId={row.id} sourceUrl={row.source_url} status={row.last_sweep_status} compact />
            </>
          ) : null}
        </td>
        <td style={{ padding: "6px 4px", maxWidth: 260 }}>
          {row.last_sweep_summary
            ? (() => {
                let parsed: any = null;
                try {
                  parsed = JSON.parse(row.last_sweep_summary);
                } catch {
                  parsed = null;
                }
                if (!parsed || (!parsed.error_code && !parsed.message)) return row.last_sweep_summary;
                const codeLabel = parsed.error_code ?? "ok";
                const foundCount = parsed.count_found ?? parsed.extracted_count ?? null;
                const urlsCount =
                  parsed.count_with_website ?? parsed.discovered_count ?? parsed.extracted_count ?? null;
                return (
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          padding: "2px 6px",
                          borderRadius: 999,
                          border: "1px solid #0f172a",
                          background: "#f8fafc",
                          fontFamily:
                            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                        }}
                      >
                        {codeLabel}
                      </span>
                      <span style={{ fontSize: 12 }}>{parsed.message}</span>
                      {foundCount != null ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            padding: "2px 6px",
                            borderRadius: 999,
                            border: "1px solid #059669",
                            background: "#ecfdf3",
                            color: "#047857",
                          }}
                        >
                          Tournaments: {foundCount}
                        </span>
                      ) : null}
                      {urlsCount != null ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            padding: "2px 6px",
                            borderRadius: 999,
                            border: "1px solid #1d4ed8",
                            background: "#eff6ff",
                            color: "#1d4ed8",
                          }}
                        >
                          URLs: {urlsCount}
                        </span>
                      ) : null}
                    </div>
                    <details>
                      <summary style={{ cursor: "pointer", fontSize: 11 }}>Details</summary>
                      <pre style={{ margin: "6px 0 0", fontSize: 11, whiteSpace: "pre-wrap" }}>
                        {JSON.stringify(parsed, null, 2)}
                      </pre>
                    </details>
                  </div>
                );
              })()
            : "—"}
        </td>
        <td style={{ padding: "6px 4px" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {ignore ? (
              <span style={{ color: "#991b1b", fontWeight: 700 }}>{reason}</span>
            ) : (
              <form action={sweepSource}>
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="source_url" value={row.source_url} />
                <input type="hidden" name="source_type" value={row.source_type ?? ""} />
                <input type="hidden" name="sport" value={row.sport ?? "soccer"} />
                <button
                  type="submit"
                  style={{
                    padding: "4px 6px",
                    borderRadius: 6,
                    border: "1px solid #2563eb",
                    background: "#eff6ff",
                    color: "#1d4ed8",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Sweep now
                </button>
              </form>
            )}
            <SourceLogsClient sourceId={row.id} sourceUrl={row.source_url} />
            <form action={quickAction}>
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="redirect" value={sourcesBasePath} />
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {[
                  ["keep", "Keep"],
                  ["dead", "Dead"],
                  ["login", "Login"],
                  ["js_only", "JS"],
                  ["paywalled", "Paywall"],
                  ["blocked", "Block7d"],
                  ["clear_block", "Clear"],
                ].map(([action, label]) => (
                  <button
                    key={action}
                    name="action"
                    value={action}
                    type="submit"
                    style={{
                      padding: "4px 6px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      background: "#f9fafb",
                      fontSize: 11,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </form>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 12 }}>Sources</h1>
      {notice && (
        <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", padding: 8, borderRadius: 8, marginBottom: 12 }}>
          {notice}
        </div>
      )}

      <div style={{ marginBottom: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Top source domains</div>
          {acquisitionTilesResp.error ? (
            <div style={{ color: "#b91c1c", fontSize: 12 }}>Failed to load: {acquisitionTilesResp.error.message}</div>
          ) : (
            renderTopList(acquisitionTiles?.source_domains)
          )}
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Top official-site domains</div>
          {acquisitionTilesResp.error ? (
            <div style={{ color: "#b91c1c", fontSize: 12 }}>Failed to load: {acquisitionTilesResp.error.message}</div>
          ) : (
            renderTopList(acquisitionTiles?.official_domains)
          )}
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Top associations</div>
          {acquisitionTilesResp.error ? (
            <div style={{ color: "#b91c1c", fontSize: 12 }}>Failed to load: {acquisitionTilesResp.error.message}</div>
          ) : (
            renderAssociations(acquisitionTiles?.associations)
          )}
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Top domains by sport</div>
          {acquisitionTilesResp.error ? (
            <div style={{ color: "#b91c1c", fontSize: 12 }}>Failed to load: {acquisitionTilesResp.error.message}</div>
          ) : (
            renderTopDomainsBySport(acquisitionTiles?.top_domains_by_sport)
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        {(["all", "untested", "keep", "ignored", "needs_review"] as Filter[]).map((f) => (
          <Link
            key={f}
            href={buildSourcesHref({ filter: f })}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: filter === f ? "#e0f2fe" : "#f9fafb",
              color: "#0f172a",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {f}
          </Link>
        ))}
        <Link
          href="/admin/tournaments/sources/discover"
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #0f172a",
            background: "#0f172a",
            color: "#fff",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Discover
        </Link>
        <Link
          href="/admin?tab=tournament-uploads"
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#f8fafc",
            color: "#0f172a",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Tournament uploads
        </Link>
        <form action={runTopTierSweep} style={{ marginLeft: 8 }}>
          <button
            type="submit"
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #166534",
              background: "#166534",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Run Top Tier Crawl
          </button>
        </form>
        <a
          href="/api/admin/tournaments/sources/export"
          style={{
            marginLeft: "auto",
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#0f172a",
            color: "#fff",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Export CSV
        </a>
      </div>

      <form
        method="GET"
        action="/admin/tournaments/sources"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: 8,
          alignItems: "end",
          marginBottom: 16,
        }}
      >
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
          Search URL
          <input
            name="q"
            defaultValue={q}
            placeholder="usclubsoccer.org"
            style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
          Sport
          <select
            name="sport"
            defaultValue={sportFilter}
            style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
          >
            <option value="">All sports</option>
            {SPORT_FILTER_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
          State
          <input
            name="state"
            defaultValue={stateFilter}
            placeholder="WA"
            style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="submit"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #0f172a",
              background: "#0f172a",
              color: "#fff",
              fontWeight: 700,
            }}
          >
            Apply
          </button>
          <a
            href="/admin/tournaments/sources"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#f9fafb",
              color: "#0f172a",
              fontWeight: 700,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Reset
          </a>
        </div>
        {filter ? <input type="hidden" name="filter" value={filter} /> : null}
        {sort ? <input type="hidden" name="sort" value={sort} /> : null}
        {dir ? <input type="hidden" name="dir" value={dir} /> : null}
        {selectedUrl ? <input type="hidden" name="source_url" value={selectedUrl} /> : null}
      </form>

      <div style={{ display: "grid", gap: 16, marginBottom: 16 }}>
        <form action={upsertSource} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Add / update source</h2>
          <div style={{ display: "grid", gap: 8, marginTop: 8, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Source URL *
              <input
                name="source_url"
                defaultValue={selectedUrl ?? ""}
                required
                style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Source type
              <select name="source_type" required defaultValue="" style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}>
                <option value="">Select type</option>
                {SOURCE_TYPE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Sport
              <select name="sport" required defaultValue="" style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}>
                <option value="">Select sport</option>
                {SPORT_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              State
              <input name="state" placeholder="WA" style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              City
              <input name="city" placeholder="Seattle" style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 700 }}>
              <input type="checkbox" name="is_active" defaultChecked />
              Active
            </label>
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, marginTop: 8 }}>
            Notes
            <textarea
              name="notes"
              rows={2}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db", width: "100%" }}
              placeholder="Internal notes"
            />
          </label>
          <button
            type="submit"
            style={{
              marginTop: 10,
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: "#0f172a",
              color: "#fff",
              fontWeight: 800,
            }}
          >
            Save source
          </button>
        </form>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Registry</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#334155" }}>Group by</span>
            {(["sport", "state", "review_status", "source_type", "none"] as GroupBy[]).map((value) => (
              <Link
                key={value}
                href={buildSourcesHref({ group: value === "none" ? null : value })}
                style={{
                  padding: "5px 9px",
                  borderRadius: 999,
                  border: "1px solid #d1d5db",
                  background: groupBy === value ? "#dbeafe" : "#fff",
                  color: "#0f172a",
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {value === "review_status" ? "status" : value}
              </Link>
            ))}
            <span style={{ fontSize: 12, color: "#64748b" }}>
              {filtered.length} source{filtered.length === 1 ? "" : "s"} visible
            </span>
          </div>

          {groupBy === "none" ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
              <thead>{renderRegistryHeaders()}</thead>
              <tbody>
                {sorted.map(renderRegistryRow)}
                {!filtered.length && (
                  <tr>
                    <td colSpan={registryColumns.length} style={{ padding: 8, color: "#666" }}>
                      No sources yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
          {groupedRows.map((group) => (
            <details
              key={group.key}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                background: "#fff",
                overflow: "hidden",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  listStyle: "none",
                  padding: "10px 12px",
                  background:
                    groupBy === "sport" && group.overdueKeepSweepCount > 0 ? "#fff1f2" : "#f8fafc",
                  fontSize: 13,
                  fontWeight: 800,
                  color: "#334155",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <span>
                  {group.label} ({group.rows.length})
                </span>
                {groupBy === "sport" && group.overdueKeepSweepCount > 0 ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      background: "#e11d48",
                      color: "#fff",
                      borderRadius: 999,
                      padding: "2px 8px",
                    }}
                    title={`${group.overdueKeepSweepCount} keep source${group.overdueKeepSweepCount === 1 ? "" : "s"} overdue for sweep`}
                  >
                    sweep {group.overdueKeepSweepCount}
                  </span>
                ) : null}
              </summary>
              <div style={{ padding: "0 12px 12px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
                  <thead>{renderRegistryHeaders()}</thead>
                  <tbody>{group.rows.map(renderRegistryRow)}</tbody>
                </table>
              </div>
            </details>
          ))}
            </div>
          )}
        </div>

        {selectedUrl && (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Recent runs</h2>
            <div style={{ fontSize: 13, color: "#374151", marginBottom: 6 }}>{selectedUrl}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["Fetched", "HTTP", "Discovered", "Imported", "Warnings"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid #eee" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runRows.map((row: any) => {
                  const ex = row.extracted_json || {};
                  const warnings = Array.isArray(ex.warnings) ? ex.warnings.join(" | ") : ex.warnings || "";
                  return (
                    <tr key={row.id}>
                      <td style={{ padding: "6px 4px" }}>{formatDate(row.fetched_at)}</td>
                      <td style={{ padding: "6px 4px" }}>{row.http_status ?? "—"}</td>
                      <td style={{ padding: "6px 4px" }}>{ex.discovered_count ?? "—"}</td>
                      <td style={{ padding: "6px 4px" }}>{ex.imported_count ?? "—"}</td>
                      <td style={{ padding: "6px 4px" }}>{warnings || "—"}</td>
                    </tr>
                  );
                })}
                {!runRows.length && (
                  <tr>
                    <td colSpan={5} style={{ padding: 8, color: "#666" }}>
                      No runs for this source.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
