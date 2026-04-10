import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { atlasSearch, type AtlasSearchResult } from "@/server/atlas/search";
import { createTournamentFromUrl } from "@/server/admin/pasteUrl";
import { ensureRegistryRow, getSkipReason, normalizeSourceUrl } from "@/server/admin/sources";

export const SPORT_OPTIONS = [
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

export const US_STATES = [
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

export const STATE_NAME_BY_ABBR: Record<(typeof US_STATES)[number], string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

export type Candidate = AtlasSearchResult & {
  canonical: string;
  host: string;
  normalized: string;
  alreadyKnown: boolean;
  registrySkipReason: string | null;
};

const BLOCKED_HOST_SUFFIXES = ["wikipedia.org", "wikidata.org", "fifa.com"] as const;
const BLOCKED_HOST_SUBSTRINGS = ["worldcup", "world-cup"] as const;

const CANADA_JUNK_TERMS = [
  "canada",
  "ontario",
  "quebec",
  "alberta",
  "british columbia",
  "saskatchewan",
  "manitoba",
  "nova scotia",
  "newfoundland",
  "labrador",
] as const;

function isBlockedHost(host: string) {
  const h = host.trim().toLowerCase();
  if (!h) return false;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => h === suffix || h.endsWith(`.${suffix}`))) return true;
  if (BLOCKED_HOST_SUBSTRINGS.some((s) => h.includes(s))) return true;
  return false;
}

function containsUppercaseAbbrToken(text: string, abbr: string) {
  if (!abbr || abbr.length !== 2) return false;
  return new RegExp(`\\b${abbr}\\b`).test(text);
}

function normalizeForMatch(input: string) {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function looksLikeWrongLocation(params: { selectedState: string; title: string | null; snippet: string | null; url: string }) {
  const selected = params.selectedState.trim().toUpperCase();
  const selectedName = (STATE_NAME_BY_ABBR as any)[selected] as string | undefined;
  const raw = `${params.title ?? ""} ${params.snippet ?? ""} ${params.url ?? ""}`.trim();
  const text = normalizeForMatch(raw);

  if (CANADA_JUNK_TERMS.some((t) => text.includes(t))) return true;

  const mentionsSelected =
    (selectedName ? text.includes(selectedName.toLowerCase()) : false) || containsUppercaseAbbrToken(raw, selected);
  if (mentionsSelected) return false;

  for (const abbr of US_STATES) {
    if (abbr === selected) continue;
    const otherName = STATE_NAME_BY_ABBR[abbr].toLowerCase();
    if (otherName && text.includes(otherName)) {
      return true;
    }
  }

  return false;
}

export async function fetchUpcomingCountsByStateForSport(sport: string) {
  const normalizedSport = sport.trim().toLowerCase();
  if (!normalizedSport) return new Map<string, number>();

  const res = await supabaseAdmin.rpc("get_public_directory_tournament_counts_by_state_sport" as any, {
    p_sport: normalizedSport,
  });

  if (res.error) return new Map<string, number>();

  const map = new Map<string, number>();
  for (const row of (res.data ?? []) as any[]) {
    const state = String(row?.state ?? "").trim().toUpperCase();
    const count = Number(row?.count ?? 0);
    if (state && Number.isFinite(count)) map.set(state, count);
  }
  return map;
}

export function buildQueries(params: { sport: string; state: string; years: number[] }) {
  const sport = params.sport.trim().toLowerCase();
  const state = params.state.trim().toUpperCase();
  const stateName = (STATE_NAME_BY_ABBR as any)[state] ? STATE_NAME_BY_ABBR[state as (typeof US_STATES)[number]] : state;
  const years = params.years.length ? params.years : [new Date().getFullYear()];

  const baseTerms = [
    `future youth ${sport} tournaments in ${stateName}`,
    `upcoming youth ${sport} tournaments in ${stateName}`,
    `youth ${sport} tournament in ${stateName}`,
    `${stateName} youth ${sport} tournament registration`,
  ];

  const negative =
    'United States -Canada -Ontario -Quebec -Alberta -Manitoba -Saskatchewan -"British Columbia" -worldcup -"world cup"';

  const siteHints = [
    `site:gotsport.com ${stateName} ${sport} tournament`,
    sport === "soccer" || sport === "futsal" ? `site:gotsoccer.com ${stateName} tournament` : null,
    sport === "baseball" || sport === "softball" ? `site:usssa.com ${stateName} ${sport} tournament` : null,
    `site:tourneymachine.com ${stateName} ${sport} tournament`,
  ].filter(Boolean) as string[];

  const withYears = (terms: string[]) => years.flatMap((y) => terms.map((t) => `${t} ${y} ${negative}`.trim()));

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

export async function discoverCandidates(params: { sport: string; state: string; perQueryLimit: number; years: number[] }) {
  const queries = buildQueries({ sport: params.sport, state: params.state, years: params.years });
  const results: AtlasSearchResult[] = [];
  for (const q of queries) {
    const rows = await atlasSearch(q, params.perQueryLimit);
    results.push(...rows);
  }

  const deduped = new Map<string, Candidate>();
  let blockedCount = 0;
  let wrongLocationCount = 0;
  for (const row of results) {
    const url = String(row.url ?? "").trim();
    if (!url) continue;
    const { canonical, host, normalized } = normalizeSourceUrl(url);
    if (!canonical) continue;
    if (isBlockedHost(host)) {
      blockedCount += 1;
      continue;
    }
    if (looksLikeWrongLocation({ selectedState: params.state, title: row.title, snippet: row.snippet, url: canonical })) {
      wrongLocationCount += 1;
      continue;
    }
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

  const candidates = list
    .map((c) => {
      const reg = registryByNormalized.get(c.normalized) ?? null;
      const registrySkipReason = getSkipReason(reg);
      const alreadyKnown = existing.knownTournamentUrls.has(c.canonical) || existing.knownNormalized.has(c.normalized);
      return { ...c, alreadyKnown, registrySkipReason };
    })
    .sort((a, b) => {
      if (a.alreadyKnown !== b.alreadyKnown) return a.alreadyKnown ? 1 : -1;
      if (Boolean(a.registrySkipReason) !== Boolean(b.registrySkipReason)) return a.registrySkipReason ? 1 : -1;
      return (a.domain ?? a.host).localeCompare(b.domain ?? b.host);
    });

  return { candidates, blockedCount, wrongLocationCount };
}

export async function queueDiscoveredUrls(params: { sport: string; urls: string[]; overrideSkip: boolean }) {
  const sport = params.sport.trim().toLowerCase();
  const overrideSkip = Boolean(params.overrideSkip);
  const urls = Array.from(new Set(params.urls.map((u) => String(u || "").trim()).filter(Boolean))).slice(0, 200);

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
        source_type: "atlas_discovery",
        sport,
        is_active: true,
        review_status: "untested",
      });

      // Tag existing registry rows too (but don't clobber curated types).
      // This lets us filter "what came through Discover→Queue" even when the URL already existed.
      try {
        await supabaseAdmin
          .from("tournament_sources" as any)
          .update({ source_type: "atlas_discovery" })
          .eq("id", row.id)
          .in("source_type", [null, "other"]);
      } catch {
        // If an environment hasn't applied the CHECK constraint migration yet, avoid breaking queueing.
      }
      const skipReason = getSkipReason(row);
      if (skipReason && !overrideSkip) {
        skipped += 1;
        continue;
      }

      await supabaseAdmin.from("tournament_sources" as any).update({ last_tested_at: new Date().toISOString() }).eq("id", row.id);

      await createTournamentFromUrl({ url: canonical, sport: sport as any, status: "draft", source: "external_crawl" });
      queued += 1;
    } catch (err: any) {
      errors += 1;
      if (errorSamples.length < 3) {
        errorSamples.push(`${canonical}: ${String(err?.message ?? "unknown error")}`);
      }
    }
  }

  return { queued, skipped, errors, errorSamples };
}
