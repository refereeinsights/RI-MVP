import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeSourceUrl, upsertRegistry } from "@/server/admin/sources";
import { redirect } from "next/navigation";
import RunDiscovery from "./RunDiscovery";

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

const SOURCE_TYPE_OPTIONS = [
  "tournament_platform",
  "governing_body",
  "league",
  "club",
  "directory",
  "association_directory",
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

type SearchParams = {
  notice?: string;
  target?: string;
  sport?: string | string[];
  state?: string | string[];
  metro?: string | string[];
  etype?: string | string[];
  pay?: string;
  hotel?: string;
  meals?: string;
  pdf?: string;
  custom?: string;
};

function asArray(val: string | string[] | undefined): string[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function buildQueriesFromParams(params: SearchParams): string[] {
  const target = (params.target ?? "tournament").toString();
  const sports = asArray(params.sport).filter(Boolean);
  const states = asArray(params.state).filter(Boolean);
  const eventTypes = asArray(params.etype).filter(Boolean);
  const includePay = params.pay === "on";
  const includeHotel = params.hotel === "on";
  const includeMeals = params.meals === "on";
  const pdfFirst = params.pdf === "on";
  const MAX_QUERY_LEN = 400; // Brave enforces 400 chars.
  const SAFE_QUERY_LEN = 380; // Leave headroom for provider-specific encoding.

  const baseTerms =
    target === "assignor"
      ? ['("assignor" OR "referee assignor" OR "assigning" OR "assignments")', '("referee" OR "officials")']
      : ['("tournament" OR "event schedule" OR "tournament schedule" OR "tournament director")'];
  const extras: string[] = [];
  if (eventTypes.length) extras.push(`(${eventTypes.map((e) => `"${e}"`).join(" OR ")})`);
  if (includePay) extras.push('("referee pay" OR "officials pay" OR "referee fees" OR "referee rates")');
  if (includeHotel) extras.push("(hotel OR housing OR lodging)");
  if (includeMeals) extras.push('("meals" OR "per diem" OR stipend)');
  if (sports.length) extras.push(`(${sports.join(" OR ")})`);

  const negatives =
    target === "assignor"
      ? "-casino -gambling -booking -concert -tickets -ticketsale"
      : "-casino -gambling -booking -concert -tickets -assignor -assignors -refereeassignor -arbiter";
  const pdf = pdfFirst ? "(filetype:pdf OR filetype:doc OR filetype:docx)" : "";

  const baseBody = [...baseTerms, ...extras].join(" AND ");
  if (!baseBody) return [];

  const makeQuery = (stateChunk: string[] | null) => {
    const stateClause =
      stateChunk && stateChunk.length ? `(${stateChunk.map((s) => `"${s}"`).join(" OR ")})` : "";
    const body = [baseBody, stateClause].filter(Boolean).join(" AND ");
    return [body, pdf, negatives].filter(Boolean).join(" ");
  };

  if (!states.length) {
    return [makeQuery(null)].slice(0, 10);
  }

  const full = makeQuery(states);
  if (full.length <= MAX_QUERY_LEN) {
    return [full].slice(0, 10);
  }

  // Too many states: split into multiple queries with state chunks that fit provider limits.
  let chunkSize = Math.min(12, states.length);
  while (chunkSize > 1) {
    const probe = makeQuery(states.slice(0, chunkSize));
    if (probe.length <= SAFE_QUERY_LEN) break;
    chunkSize -= 1;
  }
  if (chunkSize <= 1) chunkSize = 1;

  const queries = chunkArray(states, chunkSize).map((chunk) => makeQuery(chunk));
  return queries.slice(0, 10);
}

type CustomQuery = {
  query: string;
  query_type: "custom";
  source: "manual";
};

function parseCustomQueries(raw: string | undefined) {
  const warnings: string[] = [];
  if (!raw) return { queries: [] as CustomQuery[], warnings };
  const lines = raw
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const queries: CustomQuery[] = [];
  lines.forEach((line) => {
    if (line.length > 300) {
      warnings.push(`Skipped a line over 300 characters.`);
      return;
    }
    if (/^https?:\/\//i.test(line)) {
      warnings.push(`Custom query looks like a URL: ${line}`);
    }
    queries.push({ query: line, query_type: "custom", source: "manual" });
  });
  return { queries, warnings };
}

async function addToMaster(formData: FormData) {
  "use server";
  await requireAdmin();
  const raw = String(formData.get("urls") || "");
  const source_type = String(formData.get("source_type") || "").trim() || null;
  const sport = String(formData.get("sport_default") || "").trim() || null;
  if (!source_type || !sport) {
    redirect(
      `/admin/tournaments/sources/discover?notice=${encodeURIComponent(
        "Sport and source type are required."
      )}`
    );
  }
  const state = String(formData.get("state_default") || "").trim() || null;
  const city = String(formData.get("city_default") || "").trim() || null;
  const notesPrefix = String(formData.get("notes_prefix") || "").trim();
  const urls = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let added = 0;
  for (const u of urls) {
    const { canonical } = normalizeSourceUrl(u);
    await upsertRegistry({
      source_url: canonical,
      source_type,
      sport,
      state,
      city,
      notes: notesPrefix ? `${notesPrefix} ${canonical}` : null,
      review_status: "needs_review",
    });
    added++;
  }
  redirect(
    `/admin/tournaments/sources/discover?notice=${encodeURIComponent(`Added ${added} URL${added === 1 ? "" : "s"}`)}`
  );
}

export default async function DiscoverPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const notice = searchParams.notice ?? "";
  const target = (searchParams.target ?? "tournament").toString();

  const metroMarketsResp = await supabaseAdmin
    .from("metro_markets" as any)
    .select("id,slug,name")
    .order("name", { ascending: true });
  const metroMarkets = (metroMarketsResp.data ?? []) as Array<{ id: string; slug: string; name: string }>;
  const metroIds = metroMarkets.map((m) => m.id).filter(Boolean);
  const metroStatesResp =
    metroIds.length > 0
      ? await supabaseAdmin
          .from("metro_market_states" as any)
          .select("metro_market_id,state")
          .in("metro_market_id", metroIds)
      : ({ data: [], error: null } as any);
  const metroStatesRows = (metroStatesResp.data ?? []) as Array<{ metro_market_id: string; state: string }>;
  const metroStatesBySlug = (() => {
    const idToSlug = new Map(metroMarkets.map((m) => [m.id, m.slug]));
    const map = new Map<string, string[]>();
    for (const row of metroStatesRows) {
      const slug = idToSlug.get(row.metro_market_id);
      if (!slug) continue;
      const state = String(row.state || "").trim().toUpperCase();
      if (!state) continue;
      const list = map.get(slug) ?? [];
      if (!list.includes(state)) list.push(state);
      map.set(slug, list);
    }
    for (const [slug, states] of map.entries()) {
      states.sort();
      map.set(slug, states);
    }
    return map;
  })();

  const selectedMetroSlugs = asArray(searchParams.metro)
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const selectedMetroStates = selectedMetroSlugs.flatMap((slug) => metroStatesBySlug.get(slug) ?? []);
  const expandedStatesForQuery = Array.from(
    new Set([...asArray(searchParams.state).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean), ...selectedMetroStates])
  );
  const builderQueries = buildQueriesFromParams({ ...(searchParams as any), state: expandedStatesForQuery } as SearchParams);

  const { queries: customQueries, warnings } = parseCustomQueries(searchParams.custom);
  const mergedQueries = Array.from(new Set([...builderQueries, ...customQueries.map((q) => q.query)]));

  const selectedSports = asArray(searchParams.sport).filter(Boolean);
  const sportForRecs = selectedSports.length === 1 ? selectedSports[0] : null;
  const seedRecResp = await (supabaseAdmin as any).rpc("get_admin_tournament_seed_source_recommendations_v1", {
    p_sport: sportForRecs,
    p_limit: 15,
    p_low_volume_cutoff: 40,
  });
  const seedRecs = (seedRecResp?.data ?? null) as
    | {
        low_volume_states?: Array<{
          state: string;
          tournament_count: number;
          distinct_source_domains: number;
        }>;
        top_domains_by_state?: Record<string, Array<{ domain: string; count: number }>>;
        keep_seed_sources?: Array<{
          state: string | null;
          source_url: string;
          source_type: string | null;
          sport: string | null;
        }>;
      }
    | null;
  const lowStates = Array.isArray(seedRecs?.low_volume_states) ? seedRecs!.low_volume_states! : [];
  const lowStateMap = new Map(lowStates.map((s) => [String(s.state || "").toUpperCase(), s]));
  const topDomainsByState = (seedRecs?.top_domains_by_state ?? {}) as Record<
    string,
    Array<{ domain: string; count: number }>
  >;
  const keepSeedSources = Array.isArray(seedRecs?.keep_seed_sources) ? seedRecs!.keep_seed_sources! : [];

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 12 }}>Discover sources</h1>
      {notice && (
        <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", padding: 8, borderRadius: 8, marginBottom: 12 }}>
          {notice}
        </div>
      )}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr", marginBottom: 24 }}>
        {lowStates.length > 0 && (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Low-volume states (seed targets)</h2>
            <p style={{ margin: "6px 0 10px", fontSize: 12, color: "#475569" }}>
              Based on published canonical tournaments. Use these to focus discovery on states we currently under-cover.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {lowStates.slice(0, 10).map((row) => {
                const state = String(row.state || "").toUpperCase();
                const domains = Array.isArray(topDomainsByState[state]) ? topDomainsByState[state] : [];
                return (
                  <div key={state} style={{ display: "grid", gap: 4, padding: 8, borderRadius: 10, border: "1px solid #f1f5f9" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                      <div style={{ fontWeight: 900 }}>{state}</div>
                      <div style={{ fontSize: 12, color: "#475569" }}>
                        tournaments: {row.tournament_count} · domains: {row.distinct_source_domains}
                      </div>
                    </div>
                    {domains.length > 0 && (
                      <div style={{ fontSize: 12, color: "#334155" }}>
                        Top domains:{" "}
                        {domains
                          .slice(0, 5)
                          .map((d) => `${d.domain} (${d.count})`)
                          .join(", ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {keepSeedSources.length > 0 && (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Existing keep seed sources</h2>
            <p style={{ margin: "6px 0 10px", fontSize: 12, color: "#475569" }}>
              These are already marked <code>keep</code> in <code>tournament_sources</code> and can be used as seed URLs.
            </p>
            <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
              {keepSeedSources.slice(0, 40).map((row, idx) => {
                const state = (row.state || "").toString().trim().toUpperCase();
                const stateLabel = state ? state : "NATIONAL";
                const href = state ? `/admin/tournaments/sources?filter=keep&state=${encodeURIComponent(state)}` : `/admin/tournaments/sources?filter=keep`;
                return (
                  <div key={`${row.source_url}_${idx}`} style={{ display: "grid", gap: 2, padding: 8, border: "1px solid #f1f5f9", borderRadius: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <a href={href} style={{ fontWeight: 800, color: "#0f172a", textDecoration: "underline" }}>
                        {stateLabel}
                      </a>
                      <div style={{ color: "#475569" }}>{row.source_type || "—"}</div>
                    </div>
                    <div style={{ wordBreak: "break-word" }}>{row.source_url}</div>
                  </div>
                );
              })}
              {keepSeedSources.length > 40 && (
                <div style={{ color: "#475569" }}>Showing 40 of {keepSeedSources.length}.</div>
              )}
            </div>
          </div>
        )}
        <form method="get" style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Search query builder</h2>
          <div style={{ display: "grid", gap: 8, marginTop: 8, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Target
              <select name="target" defaultValue={target} style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}>
                <option value="tournament">Tournament sources</option>
                <option value="assignor">Assignor sources</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Sports
              <select name="sport" multiple style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db", minHeight: 90 }}>
                {SPORT_OPTIONS.map((s) => (
                  <option key={s} value={s} selected={asArray(searchParams.sport).includes(s)}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              States
              <select name="state" multiple style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db", minHeight: 90 }}>
                {US_STATES.map((s) => {
                  const low = lowStateMap.get(s);
                  const label = low ? `${s} (low: ${low.tournament_count})` : s;
                  return (
                    <option key={s} value={s} selected={asArray(searchParams.state).includes(s)}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Regions / metros
              <select name="metro" multiple style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db", minHeight: 90 }}>
                {metroMarkets.map((m) => {
                  const states = metroStatesBySlug.get(m.slug) ?? [];
                  const suffix = states.length > 1 ? ` (${states.join(", ")})` : states.length === 1 ? ` (${states[0]})` : "";
                  return (
                    <option key={m.slug} value={m.slug} selected={selectedMetroSlugs.includes(m.slug)}>
                      {m.name}
                      {suffix}
                    </option>
                  );
                })}
              </select>
              {selectedMetroStates.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 12, color: "#475569", fontWeight: 600 }}>
                  Expands to states: {Array.from(new Set(selectedMetroStates)).sort().join(", ")}
                </div>
              )}
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Event types
              <select name="etype" multiple style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db", minHeight: 90 }}>
                {["tournament", "showcase", "invitational", "cup", "classic"].map((s) => (
                  <option key={s} value={s} selected={asArray(searchParams.etype).includes(s)}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: "grid", gap: 6, paddingTop: 18 }}>
              {[
                ["pay", "Pay terms"],
                ["hotel", "Hotel / housing"],
                ["meals", "Meals / per diem"],
                ["pdf", "PDF-first"],
              ].map(([name, label]) => (
                <label key={name} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" name={name} defaultChecked={(searchParams as any)[name] === "on"} /> {label}
                </label>
              ))}
            </div>
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, marginTop: 10 }}>
            Custom search query (advanced, optional)
            <textarea
              name="custom"
              rows={4}
              defaultValue={searchParams.custom ?? ""}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db", width: "100%" }}
              placeholder="one query per line"
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
            Generate queries
          </button>
          {warnings.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              {warnings.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 8,
                    border: "1px solid #fde68a",
                    borderRadius: 8,
                    background: "#fffbeb",
                    fontSize: 12,
                  }}
                >
                  {msg}
                </div>
              ))}
            </div>
          )}
          {mergedQueries.length > 0 && (
            <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
              {mergedQueries.map((q, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 8,
                    border: "1px dashed #d1d5db",
                    borderRadius: 8,
                    background: "#f9fafb",
                    fontSize: 13,
                  }}
                >
                  {q}
                </div>
              ))}
            </div>
          )}
          <RunDiscovery
            queries={mergedQueries}
            sportOptions={SPORT_OPTIONS}
            sourceTypeOptions={SOURCE_TYPE_OPTIONS}
            defaultTarget={target}
          />
        </form>

        <form action={addToMaster} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Paste candidate URLs</h2>
          <div style={{ display: "grid", gap: 8, marginTop: 8, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Default source type
              <select name="source_type" required style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}>
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
              <select name="sport_default" required style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}>
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
              <input name="state_default" placeholder="WA" style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              City
              <input name="city_default" placeholder="Seattle" style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Notes prefix
              <input name="notes_prefix" placeholder="#discovered_via:manual_search" style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, marginTop: 8 }}>
            URLs (one per line)
            <textarea
              name="urls"
              rows={8}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db", width: "100%" }}
              placeholder="https://example.com/events&#10;https://club.com/calendar"
            />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="submit"
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: "#0f172a",
                color: "#fff",
                fontWeight: 800,
              }}
            >
              Add to master list
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
