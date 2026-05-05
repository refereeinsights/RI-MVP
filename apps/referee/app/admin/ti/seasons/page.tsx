import Link from "next/link";

import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type PageProps = {
  searchParams?: {
    season_year?: string;
    action?: string;
    confidence?: string;
    source?: string;
  };
};

type ScanRow = {
  id: string;
  tournament_id: string;
  season_year: number;
  scanned_at: string;
  update_action: string;
  source_checked: string | null;
  source_url_found: string | null;
  official_website_url_found: string | null;
  confidence: string | null;
  notes: string | null;
  error: string | null;
};

type TournamentRow = {
  id: string;
  slug: string | null;
  name: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  source_url: string | null;
  official_website_url: string | null;
  tournament_association: string | null;
};

type Tile = { label: string; value: number; href: string; tone: "neutral" | "good" | "warn" | "bad" };

function clean(value: string | undefined) {
  const v = (value ?? "").trim();
  return v.length ? v : null;
}

function asSeasonYear(raw: string | undefined) {
  const v = Number(clean(raw) ?? "2027");
  if (!Number.isFinite(v)) return 2027;
  return Math.max(2000, Math.min(2100, Math.floor(v)));
}

function asOneOf(raw: string | undefined, allowed: string[], fallback: string) {
  const v = clean(raw);
  if (!v) return fallback;
  return allowed.includes(v) ? v : fallback;
}

function pill(text: string, bg: string) {
  return (
    <span style={{ fontSize: 12, fontWeight: 900, padding: "2px 8px", borderRadius: 999, background: bg, color: "#111827" }}>
      {text}
    </span>
  );
}

function actionPill(action: string) {
  const a = (action ?? "").trim();
  if (a === "updated" || a === "updated_existing_2027") return pill(a, "#bbf7d0");
  if (a === "needs_review") return pill(a, "#fde68a");
  if (a === "no_2027_found") return pill(a, "#e5e7eb");
  if (a === "failed_url") return pill(a, "#fecaca");
  if (a === "unscanned") return pill(a, "#e0e7ff");
  return pill(a || "unknown", "#e5e7eb");
}

function fmtTs(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().replace("T", " ").replace("Z", "Z");
}

export default async function TiSeasonsReviewPage({ searchParams }: PageProps) {
  await requireAdmin();

  const seasonYear = asSeasonYear(searchParams?.season_year);
  const action = asOneOf(
    searchParams?.action,
    ["all", "updated", "updated_existing_2027", "needs_review", "no_2027_found", "possible_duplicate", "failed_url", "unscanned"],
    "all"
  );
  const confidence = asOneOf(searchParams?.confidence, ["all", "high", "medium", "low"], "all");
  const source = asOneOf(searchParams?.source, ["all", "source_url", "official_website_url", "web_search"], "all");

  const todayIso = new Date().toISOString().slice(0, 10);

  // Summary tiles (counts).
  const pastCountRes = await supabaseAdmin
    .from("tournaments" as any)
    .select("id", { count: "exact", head: true })
    .eq("is_canonical", true)
    .lt("start_date", todayIso);
  if (pastCountRes.error) throw pastCountRes.error;
  const pastTotal = pastCountRes.count ?? 0;

  const scannedCountRes = await supabaseAdmin
    .from("tournament_season_scan_log" as any)
    .select("id", { count: "exact", head: true })
    .eq("season_year", seasonYear);
  if (scannedCountRes.error) throw scannedCountRes.error;
  const scannedTotal = scannedCountRes.count ?? 0;

  const foundCountRes = await supabaseAdmin
    .from("tournament_season_scan_log" as any)
    .select("id", { count: "exact", head: true })
    .eq("season_year", seasonYear)
    .in("update_action", ["updated", "updated_existing_2027"]);
  if (foundCountRes.error) throw foundCountRes.error;
  const foundTotal = foundCountRes.count ?? 0;

  const noFoundCountRes = await supabaseAdmin
    .from("tournament_season_scan_log" as any)
    .select("id", { count: "exact", head: true })
    .eq("season_year", seasonYear)
    .eq("update_action", "no_2027_found");
  if (noFoundCountRes.error) throw noFoundCountRes.error;
  const noFoundTotal = noFoundCountRes.count ?? 0;

  const remainingTotal = Math.max(0, pastTotal - scannedTotal);

  const title = `TI Seasons (${seasonYear})`;

  const filtersBase = (next: Record<string, string>) => {
    const qs = new URLSearchParams();
    qs.set("season_year", String(seasonYear));
    qs.set("action", next.action ?? action);
    qs.set("confidence", next.confidence ?? confidence);
    qs.set("source", next.source ?? source);
    return `/admin/ti/seasons?${qs.toString()}`;
  };

  const tiles: Tile[] = [
    { label: "Past tournaments", value: pastTotal, href: filtersBase({ action: "all" }), tone: "neutral" },
    { label: "2027 dates found", value: foundTotal, href: filtersBase({ action: "updated" }), tone: "good" },
    { label: "Scanned (no 2027)", value: noFoundTotal, href: filtersBase({ action: "no_2027_found" }), tone: "neutral" },
    { label: "Remaining to scan", value: remainingTotal, href: filtersBase({ action: "unscanned" }), tone: "warn" },
  ];

  let scans: ScanRow[] = [];
  let tournamentsById = new Map<string, TournamentRow>();

  if (action === "unscanned") {
    // Fetch a larger window, filter out those already scanned, then show the first 250 remaining.
    const candidatesRes = await supabaseAdmin
      .from("tournaments" as any)
      .select("id,slug,name,sport,city,state,start_date,end_date,source_url,official_website_url,tournament_association")
      .eq("is_canonical", true)
      .lt("start_date", todayIso)
      .order("start_date", { ascending: false })
      .limit(800);
    if (candidatesRes.error) throw candidatesRes.error;
    const candidates: TournamentRow[] = (candidatesRes.data ?? []) as any;
    const candidateIds = candidates.map((c) => String(c.id));

    const scannedRes = await supabaseAdmin
      .from("tournament_season_scan_log" as any)
      .select("tournament_id")
      .eq("season_year", seasonYear)
      .in("tournament_id", candidateIds);
    if (scannedRes.error) throw scannedRes.error;
    const scannedIds = new Set<string>((scannedRes.data ?? []).map((r: any) => String(r.tournament_id)));

    const unscanned = candidates.filter((c) => !scannedIds.has(String(c.id))).slice(0, 250);
    tournamentsById = new Map(unscanned.map((t) => [String(t.id), t]));
    scans = unscanned.map((t) => ({
      id: `unscanned:${t.id}`,
      tournament_id: String(t.id),
      season_year: seasonYear,
      scanned_at: "",
      update_action: "unscanned",
      source_checked: null,
      source_url_found: null,
      official_website_url_found: null,
      confidence: null,
      notes: null,
      error: null,
    }));
  } else {
    let scanQ = supabaseAdmin
      .from("tournament_season_scan_log" as any)
      .select(
        "id,tournament_id,season_year,scanned_at,update_action,source_checked,source_url_found,official_website_url_found,confidence,notes,error"
      )
      .eq("season_year", seasonYear)
      .order("scanned_at", { ascending: false })
      .limit(250);

    if (action !== "all") scanQ = scanQ.eq("update_action", action);
    if (confidence !== "all") scanQ = scanQ.eq("confidence", confidence);
    if (source !== "all") scanQ = scanQ.eq("source_checked", source);

    const scansRes = await scanQ;
    if (scansRes.error) throw scansRes.error;
    scans = (scansRes.data ?? []) as any;

    const tournamentIds = Array.from(new Set(scans.map((s) => s.tournament_id).filter(Boolean)));
    if (tournamentIds.length) {
      const tRes = await supabaseAdmin
        .from("tournaments" as any)
        .select("id,slug,name,sport,city,state,start_date,end_date,source_url,official_website_url,tournament_association")
        .in("id", tournamentIds);
      if (tRes.error) throw tRes.error;
      for (const row of (tRes.data ?? []) as any[]) {
        tournamentsById.set(String(row.id), row as TournamentRow);
      }
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 1250, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 10 }}>{title}</h1>
      <div style={{ marginBottom: 12 }}>
        <AdminNav />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <Link href="/admin" className="cta secondary" style={{ padding: "8px 12px" }}>
          ← Back to Admin
        </Link>
        <Link href="/admin/ti/quality" className="cta secondary" style={{ padding: "8px 12px" }}>
          Quality →
        </Link>
        <Link href="/admin/api-usage" className="cta secondary" style={{ padding: "8px 12px" }}>
          API usage →
        </Link>
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
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          {tiles.map((t) => {
            const bg =
              t.tone === "good" ? "#ecfdf5" : t.tone === "warn" ? "#fffbeb" : t.tone === "bad" ? "#fef2f2" : "#fff";
            const border =
              t.tone === "good" ? "#86efac" : t.tone === "warn" ? "#f59e0b" : t.tone === "bad" ? "#fecaca" : "#e5e7eb";
            const color =
              t.tone === "good" ? "#166534" : t.tone === "warn" ? "#92400e" : t.tone === "bad" ? "#991b1b" : "#111827";
            return (
              <Link
                key={t.label}
                href={t.href}
                style={{
                  minWidth: 200,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: `1px solid ${border}`,
                  background: bg,
                  textDecoration: "none",
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 950, color }}>{t.value.toLocaleString()}</div>
                <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900, marginTop: 2 }}>{t.label}</div>
              </Link>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900, textTransform: "uppercase" }}>Filters</div>
        <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>Action:</div>
          {["all", "updated", "updated_existing_2027", "needs_review", "no_2027_found", "failed_url", "unscanned"].map((v) => (
            <Link
              key={v}
              href={filtersBase({ action: v })}
              className="cta secondary"
              style={{
                padding: "6px 10px",
                borderColor: action === v ? "#111827" : undefined,
                color: "#111827",
                fontWeight: 900,
              }}
            >
              {v}
            </Link>
          ))}
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>Confidence:</div>
          {["all", "high", "medium", "low"].map((v) => (
            <Link
              key={v}
              href={filtersBase({ confidence: v })}
              className="cta secondary"
              style={{
                padding: "6px 10px",
                borderColor: confidence === v ? "#111827" : undefined,
                color: "#111827",
                fontWeight: 900,
              }}
            >
              {v}
            </Link>
          ))}
          <div style={{ marginLeft: 8, fontSize: 12, fontWeight: 900, color: "#111827" }}>Source:</div>
          {["all", "source_url", "official_website_url", "web_search"].map((v) => (
            <Link
              key={v}
              href={filtersBase({ source: v })}
              className="cta secondary"
              style={{
                padding: "6px 10px",
                borderColor: source === v ? "#111827" : undefined,
                color: "#111827",
                fontWeight: 900,
              }}
            >
              {v}
            </Link>
          ))}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
          This is a review surface for the 2027 season scanner. It does not modify tournament records.
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Tournament</th>
              <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Outcome</th>
              <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Scan</th>
              <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Source</th>
              <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {scans.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "12px 8px", color: "#6b7280", fontSize: 13 }}>
                  No scan results for these filters yet.
                </td>
              </tr>
            ) : (
              scans.map((s) => {
                const t = tournamentsById.get(s.tournament_id);
                const publicHref = t?.slug ? `/tournaments/${t.slug}` : null;
                const checkedUrl = s.source_url_found || s.official_website_url_found || null;
                return (
                  <tr key={s.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 8px", minWidth: 360 }}>
                      <div style={{ fontWeight: 950, color: "#111" }}>{t?.name ?? "Unknown tournament"}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
                        {(t?.sport ?? "—") + " • " + [t?.city, t?.state].filter(Boolean).join(", ")}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
                        2026: {t?.start_date ?? "—"} → {t?.end_date ?? "—"}
                      </div>
                      <div style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {publicHref ? (
                          <Link href={publicHref} className="cta secondary" style={{ padding: "6px 10px" }}>
                            Open tournament →
                          </Link>
                        ) : null}
                        {checkedUrl ? (
                          <a href={checkedUrl} target="_blank" rel="noopener noreferrer" className="cta secondary" style={{ padding: "6px 10px" }}>
                            Source found ↗
                          </a>
                        ) : null}
                      </div>
                    </td>

                    <td style={{ padding: "10px 8px", minWidth: 220 }}>
                      <div>{actionPill(s.update_action)}</div>
                      <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {s.confidence ? pill(s.confidence, "#bfdbfe") : pill("—", "#e5e7eb")}
                        {s.source_checked ? pill(s.source_checked, "#e5e7eb") : pill("—", "#e5e7eb")}
                      </div>
                    </td>

                    <td style={{ padding: "10px 8px", fontSize: 12, color: "#111", minWidth: 200 }}>
                      <div style={{ fontWeight: 900 }}>{fmtTs(s.scanned_at)}</div>
                      {s.error ? (
                        <div style={{ marginTop: 6, color: "#b91c1c", fontWeight: 800 }}>{s.error}</div>
                      ) : null}
                    </td>

                    <td style={{ padding: "10px 8px", fontSize: 12, color: "#111", minWidth: 260 }}>
                      {checkedUrl ? (
                        <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                          {checkedUrl}
                        </div>
                      ) : (
                        <div style={{ color: "#6b7280" }}>—</div>
                      )}
                    </td>

                    <td style={{ padding: "10px 8px", fontSize: 12, color: "#111", minWidth: 320 }}>
                      {s.notes ? <div style={{ fontWeight: 800 }}>{s.notes}</div> : <div style={{ color: "#6b7280" }}>—</div>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
