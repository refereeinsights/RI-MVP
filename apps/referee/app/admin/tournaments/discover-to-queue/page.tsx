import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { atlasSearch, getSearchProviderName, type AtlasSearchResult } from "@/server/atlas/search";
import { ensureRegistryRow, getSkipReason, normalizeSourceUrl } from "@/server/admin/sources";
import { createTournamentFromUrl } from "@/server/admin/pasteUrl";
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;

type Candidate = AtlasSearchResult & {
  canonical: string;
  host: string;
  normalized: string;
  alreadyKnown: boolean;
  registrySkipReason: string | null;
};

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function buildQueries(params: { sport: string; state: string; years: number[] }) {
  const sport = params.sport.trim().toLowerCase();
  const state = params.state.trim().toUpperCase();
  const years = params.years.length ? params.years : [new Date().getFullYear()];

  const baseTerms = [
    `${state} ${sport} youth tournament`,
    `${state} ${sport} tournament`,
    `${sport} tournament ${state}`,
    `${state} ${sport} tournament registration`,
  ];

  const siteHints = [
    `site:gotsport.com ${state} ${sport} tournament`,
    sport === "soccer" || sport === "futsal" ? `site:gotsoccer.com ${state} tournament` : null,
    sport === "baseball" || sport === "softball" ? `site:usssa.com ${state} ${sport} tournament` : null,
    `site:tourneymachine.com ${state} ${sport} tournament`,
  ].filter(Boolean) as string[];

  const withYears = (terms: string[]) =>
    years.flatMap((y) => terms.map((t) => `${t} ${y}`.trim()));

  // Keep the set small; Brave rate limits and has a 400-char query constraint.
  return [...withYears(baseTerms).slice(0, 6), ...withYears(siteHints).slice(0, 6)];
}

async function fetchExistingUrlSets(urls: string[]) {
  const canonicals = Array.from(new Set(urls.map((u) => u.trim()).filter(Boolean))).slice(0, 500);
  if (!canonicals.length) return { knownNormalized: new Set<string>(), knownTournamentUrls: new Set<string>() };

  const normalized = canonicals.map((u) => normalizeSourceUrl(u).normalized);

  const [registryRes, tournamentsSourceRes, tournamentsOfficialRes] = await Promise.all([
    supabaseAdmin
      .from("tournament_sources" as any)
      .select("normalized_url,review_status,is_active,ignore_until,tournament_id")
      .in("normalized_url", normalized)
      .limit(5000),
    supabaseAdmin
      .from("tournaments" as any)
      .select("source_url,official_website_url")
      .in("source_url", canonicals)
      .limit(5000),
    supabaseAdmin
      .from("tournaments" as any)
      .select("source_url,official_website_url")
      .in("official_website_url", canonicals)
      .limit(5000),
  ]);

  const knownNormalized = new Set<string>();
  for (const row of (registryRes.data ?? []) as any[]) {
    const n = String(row?.normalized_url ?? "").trim();
    if (n) knownNormalized.add(n);
  }

  const knownTournamentUrls = new Set<string>();
  for (const row of [...((tournamentsSourceRes.data ?? []) as any[]), ...((tournamentsOfficialRes.data ?? []) as any[])]) {
    const s = String(row?.source_url ?? "").trim();
    const o = String(row?.official_website_url ?? "").trim();
    if (s) knownTournamentUrls.add(normalizeSourceUrl(s).canonical);
    if (o) knownTournamentUrls.add(normalizeSourceUrl(o).canonical);
  }

  return { knownNormalized, knownTournamentUrls };
}

async function discoverCandidates(params: {
  sport: string;
  state: string;
  perQueryLimit: number;
  years: number[];
}) {
  const queries = buildQueries({ sport: params.sport, state: params.state, years: params.years });
  const results: AtlasSearchResult[] = [];
  for (const q of queries) {
    const rows = await atlasSearch(q, params.perQueryLimit);
    results.push(...rows);
  }

  const deduped = new Map<string, Candidate>();
  for (const row of results) {
    const url = String(row.url ?? "").trim();
    if (!url) continue;
    const { canonical, host, normalized } = normalizeSourceUrl(url);
    if (!canonical) continue;
    if (!deduped.has(normalized)) {
      deduped.set(normalized, {
        ...row,
        url: canonical,
        canonical,
        host,
        normalized,
        alreadyKnown: false,
        registrySkipReason: null,
      });
    }
  }

  const list = Array.from(deduped.values());
  const existing = await fetchExistingUrlSets(list.map((c) => c.canonical));

  // Pull registry rows for skip status in a batch.
  const registryRowsRes = await supabaseAdmin
    .from("tournament_sources" as any)
    .select("id,normalized_url,is_active,review_status,ignore_until")
    .in(
      "normalized_url",
      list.map((c) => c.normalized)
    )
    .limit(5000);
  const registryByNormalized = new Map<string, any>();
  for (const row of (registryRowsRes.data ?? []) as any[]) {
    const n = String(row?.normalized_url ?? "").trim();
    if (!n) continue;
    registryByNormalized.set(n, row);
  }

  return list
    .map((c) => {
      const reg = registryByNormalized.get(c.normalized) ?? null;
      const registrySkipReason = getSkipReason(reg);
      const alreadyKnown =
        existing.knownTournamentUrls.has(c.canonical) ||
        existing.knownNormalized.has(c.normalized);
      return { ...c, alreadyKnown, registrySkipReason };
    })
    .sort((a, b) => {
      if (a.alreadyKnown !== b.alreadyKnown) return a.alreadyKnown ? 1 : -1;
      if (Boolean(a.registrySkipReason) !== Boolean(b.registrySkipReason)) return a.registrySkipReason ? 1 : -1;
      return (a.domain ?? a.host).localeCompare(b.domain ?? b.host);
    });
}

async function queueSelectedAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const redirectTo = String(formData.get("redirect_to") || "/admin/tournaments/discover-to-queue");
  const sportRaw = String(formData.get("sport") || "soccer").trim().toLowerCase();
  const sport = (SPORT_OPTIONS as readonly string[]).includes(sportRaw) ? sportRaw : "soccer";
  const overrideSkip = String(formData.get("override_skip") || "") === "on";

  const urls = formData.getAll("url").map((v) => String(v || "").trim()).filter(Boolean);
  if (!urls.length) {
    redirect(`${redirectTo}?notice=${encodeURIComponent("Select at least one URL to queue.")}`);
  }

  let queued = 0;
  let skipped = 0;
  let errors = 0;
  const errorSamples: string[] = [];

  for (const rawUrl of urls) {
    const { canonical } = normalizeSourceUrl(rawUrl);
    if (!canonical) continue;
    try {
      const { row } = await ensureRegistryRow(canonical, {
        source_url: canonical,
        source_type: "other",
        sport,
        is_active: true,
        review_status: "untested",
      });
      const skipReason = getSkipReason(row);
      if (skipReason && !overrideSkip) {
        skipped += 1;
        continue;
      }

      await supabaseAdmin
        .from("tournament_sources" as any)
        .update({ last_tested_at: new Date().toISOString() })
        .eq("id", row.id);

      await createTournamentFromUrl({ url: canonical, sport: sport as any, status: "draft", source: "external_crawl" });
      queued += 1;
    } catch (err: any) {
      errors += 1;
      if (errorSamples.length < 3) {
        errorSamples.push(`${canonical}: ${String(err?.message ?? "unknown error")}`);
      }
    }
  }

  const parts: string[] = [];
  parts.push(`Queued ${queued}.`);
  if (skipped) parts.push(`Skipped ${skipped} (source guard).`);
  if (errors) parts.push(`Errors ${errors}.`);
  if (errorSamples.length) parts.push(`Sample: ${errorSamples.join(" | ")}`);

  redirect(`${redirectTo}?notice=${encodeURIComponent(parts.join(" ").trim())}`);
}

export default async function DiscoverToQueuePage({
  searchParams,
}: {
  searchParams?: { sport?: string; state?: string; run?: string; per_query?: string; years?: string; notice?: string };
}) {
  await requireAdmin();

  const sportRaw = String(searchParams?.sport ?? "soccer").trim().toLowerCase();
  const sport = (SPORT_OPTIONS as readonly string[]).includes(sportRaw) ? sportRaw : "soccer";

  const stateRaw = String(searchParams?.state ?? "").trim().toUpperCase();
  const state = (US_STATES as readonly string[]).includes(stateRaw) ? stateRaw : "";

  const perQueryLimit = clampInt(searchParams?.per_query ?? "8", 3, 12, 8);
  const run = String(searchParams?.run ?? "").trim() === "1";
  const notice = String(searchParams?.notice ?? "").trim();

  const yearsRaw = String(searchParams?.years ?? "").trim();
  const years = yearsRaw
    ? yearsRaw
        .split(",")
        .map((y) => Number(String(y).trim()))
        .filter((y) => Number.isFinite(y) && y >= 2024 && y <= 2030)
    : [new Date().getFullYear(), new Date().getFullYear() + 1];

  const provider = getSearchProviderName();

  const candidates = run && state ? await discoverCandidates({ sport, state, perQueryLimit, years }) : [];

  return (
    <main style={{ padding: 18, maxWidth: 1100, margin: "0 auto" }}>
      <AdminNav />

      <h1 style={{ margin: "12px 0 0 0" }}>Discover → Queue</h1>
      <p style={{ margin: "6px 0 0 0", color: "#64748b", fontSize: 13 }}>
        Uses Atlas search ({provider}) to find new tournament URLs for a sport + state, then queues selected URLs into the uploads approval queue.
      </p>

      {notice ? (
        <div
          style={{
            marginTop: 12,
            border: "1px solid #bbf7d0",
            background: "#ecfdf3",
            borderRadius: 12,
            padding: "10px 12px",
            color: "#166534",
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          {notice}
        </div>
      ) : null}

      <form method="GET" action="/admin/tournaments/discover-to-queue" style={{ marginTop: 14, display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: 12 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
            Sport
            <select name="sport" defaultValue={sport} style={{ padding: 10, borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff" }}>
              {SPORT_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
            State
            <select name="state" defaultValue={state} style={{ padding: 10, borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff" }}>
              <option value="">Select…</option>
              {US_STATES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
            Per-query results
            <input name="per_query" defaultValue={String(perQueryLimit)} inputMode="numeric" style={{ padding: 10, borderRadius: 10, border: "1px solid #cbd5e1" }} />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
            Years (comma-separated)
            <input name="years" defaultValue={years.join(",")} placeholder="2026,2027" style={{ padding: 10, borderRadius: 10, border: "1px solid #cbd5e1" }} />
          </label>
        </div>

        <input type="hidden" name="run" value="1" />

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="submit" style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: "#0f172a", color: "#fff", fontWeight: 900 }}>
            Discover URLs
          </button>
          <a href="/admin?tab=tournament-uploads" style={{ fontSize: 13, color: "#1d4ed8", fontWeight: 800, textDecoration: "none" }}>
            Back to uploads
          </a>
        </div>
      </form>

      {run && !state ? (
        <div style={{ marginTop: 14, border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: 12, padding: "10px 12px", color: "#475569", fontSize: 13 }}>
          Select a state, then run discovery.
        </div>
      ) : null}

      {candidates.length ? (
        <form action={queueSelectedAction} style={{ marginTop: 16 }}>
          <input type="hidden" name="redirect_to" value="/admin/tournaments/discover-to-queue" />
          <input type="hidden" name="sport" value={sport} />

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Candidates ({candidates.length})</h2>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, color: "#0f172a" }}>
              <input type="checkbox" name="override_skip" />
              Override source skip guard
            </label>
          </div>

          <div style={{ marginTop: 10, border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#f8fafc" }}>
                  <th style={{ padding: "10px 10px", fontSize: 12, borderBottom: "1px solid #e2e8f0", width: 46 }}>Pick</th>
                  <th style={{ padding: "10px 10px", fontSize: 12, borderBottom: "1px solid #e2e8f0" }}>Result</th>
                  <th style={{ padding: "10px 10px", fontSize: 12, borderBottom: "1px solid #e2e8f0", width: 220 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const disabled = c.alreadyKnown || Boolean(c.registrySkipReason);
                  const status = c.alreadyKnown
                    ? "Already in DB/registry"
                    : c.registrySkipReason
                    ? c.registrySkipReason
                    : "New";
                  return (
                    <tr key={c.normalized}>
                      <td style={{ padding: "10px 10px", borderTop: "1px solid #eef2f7", verticalAlign: "top" }}>
                        <input type="checkbox" name="url" value={c.canonical} defaultChecked={!disabled} disabled={disabled} />
                      </td>
                      <td style={{ padding: "10px 10px", borderTop: "1px solid #eef2f7", verticalAlign: "top" }}>
                        <div style={{ fontWeight: 900, fontSize: 13, color: "#0f172a" }}>{c.title ?? c.domain ?? c.host}</div>
                        <div style={{ marginTop: 2, fontSize: 12, color: "#475569" }}>{c.snippet ?? ""}</div>
                        <div style={{ marginTop: 6, fontSize: 12 }}>
                          <a href={c.canonical} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", textDecoration: "none" }}>
                            {c.host}
                          </a>
                        </div>
                      </td>
                      <td style={{ padding: "10px 10px", borderTop: "1px solid #eef2f7", verticalAlign: "top", fontSize: 12, color: disabled ? "#64748b" : "#0f172a", fontWeight: 800 }}>
                        {status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #0f172a", background: "#0f172a", color: "#fff", fontWeight: 900 }}>
              Queue selected URLs
            </button>
          </div>
        </form>
      ) : null}
    </main>
  );
}
