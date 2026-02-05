import { atlasSearch } from "@/server/atlas/search";
import { normalizeSourceUrl } from "@/server/admin/sources";

export type UrlCandidateInput = {
  url: string;
  title: string | null;
  snippet: string | null;
  domain: string | null;
};

export type TournamentUrlContext = {
  id: string;
  name: string | null;
  state: string | null;
  city: string | null;
  sport: string | null;
  host_org: string | null;
};

export type UrlCandidate = UrlCandidateInput & {
  normalized: string;
  score: number;
  matched_fields: Record<string, any>;
  final_url?: string | null;
  content_type?: string | null;
  http_status?: number | null;
};

const MAX_RESULTS_PER_QUERY = 5;
const AUTO_APPLY_THRESHOLD = 0.85;

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "by",
  "of",
  "tournament",
  "cup",
  "classic",
  "series",
  "open",
  "invitation",
  "invite",
  "showcase",
]);

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\\s]/g, " ")
    .split(/\\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function makeQueries(ctx: TournamentUrlContext) {
  const queries: string[] = [];
  const name = ctx.name?.trim() || "";
  const state = ctx.state?.trim() || "";
  const city = ctx.city?.trim() || "";
  const sport = ctx.sport?.trim() || "";
  const host = ctx.host_org?.trim() || "";

  if (name) {
    queries.push(`\"${name}\" ${city} ${state} ${sport} tournament`);
    queries.push(`\"${name}\" ${state} ${sport}`);
  }
  if (host) {
    queries.push(`\"${host}\" ${state} ${sport} tournament`);
  }
  return Array.from(new Set(queries.map((q) => q.trim()).filter(Boolean)));
}

function scoreCandidate(ctx: TournamentUrlContext, input: UrlCandidateInput) {
  const text = `${input.title ?? ""} ${input.snippet ?? ""} ${input.url}`.toLowerCase();
  const nameTokens = ctx.name ? tokenize(ctx.name) : [];
  const hostTokens = ctx.host_org ? tokenize(ctx.host_org) : [];

  const hits = (tokens: string[]) => tokens.filter((t) => text.includes(t)).length;
  const nameHits = nameTokens.length ? hits(nameTokens) / nameTokens.length : 0;
  const hostHits = hostTokens.length ? hits(hostTokens) / hostTokens.length : 0;
  const cityHit = ctx.city ? (text.includes(ctx.city.toLowerCase()) ? 1 : 0) : 0;
  const stateHit = ctx.state ? (text.includes(ctx.state.toLowerCase()) ? 1 : 0) : 0;
  const sportHit = ctx.sport ? (text.includes(ctx.sport.toLowerCase()) ? 1 : 0) : 0;
  const keywordHit =
    text.includes("tournament") || text.includes("registration") || text.includes("schedule") ? 1 : 0;

  let score =
    0.45 * nameHits +
    0.2 * hostHits +
    0.15 * stateHit +
    0.1 * cityHit +
    0.05 * sportHit +
    0.05 * keywordHit;

  if (score > 1) score = 1;
  return {
    score,
    matched_fields: {
      name_hits: nameHits,
      host_hits: hostHits,
      city_hit: cityHit,
      state_hit: stateHit,
      sport_hit: sportHit,
      keyword_hit: keywordHit,
    },
  };
}

async function validateCandidate(url: string) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "RI-UrlDiscovery/1.0" },
    });
    clearTimeout(timeout);
    const contentType = resp.headers.get("content-type");
    return {
      ok: resp.ok,
      status: resp.status,
      final_url: resp.url,
      content_type: contentType,
    };
  } catch {
    return { ok: false, status: null, final_url: null, content_type: null };
  }
}

export async function findTournamentUrlCandidates(ctx: TournamentUrlContext) {
  const queries = makeQueries(ctx);
  const results: UrlCandidate[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    const rows = await atlasSearch(query, MAX_RESULTS_PER_QUERY);
    for (const row of rows) {
      const normalized = normalizeSourceUrl(row.url).normalized;
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      const { score, matched_fields } = scoreCandidate(ctx, row);
      results.push({
        ...row,
        normalized,
        score,
        matched_fields,
      });
    }
  }

  // Validate and re-score with html bonus
  for (const candidate of results) {
    const validation = await validateCandidate(candidate.normalized);
    candidate.final_url = validation.final_url;
    candidate.content_type = validation.content_type;
    candidate.http_status = validation.status ?? null;
    if (validation.ok && (validation.content_type || "").includes("text/html")) {
      candidate.score = Math.min(1, candidate.score + 0.1);
      candidate.matched_fields.validation = "html_ok";
    } else if (validation.ok) {
      candidate.score = Math.max(0, candidate.score - 0.05);
      candidate.matched_fields.validation = "non_html";
    } else {
      candidate.score = Math.max(0, candidate.score - 0.1);
      candidate.matched_fields.validation = "fetch_failed";
    }
  }

  results.sort((a, b) => b.score - a.score);
  return {
    candidates: results,
    auto_apply_threshold: AUTO_APPLY_THRESHOLD,
  };
}
