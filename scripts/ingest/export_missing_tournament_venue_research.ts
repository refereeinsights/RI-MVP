import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type TournamentRow = {
  id: string;
  name: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  official_website_url: string | null;
  source_url: string | null;
  is_demo?: boolean | null;
  tournament_director?: string | null;
};

type OutputA = {
  tournament_id: string;
  tournament_name: string;
  sport: string;
  city: string;
  state: string;
  start_date: string;
  end_date: string;
  official_url: string;
  source_url: string;
  organizer_name: string;
  organizer_guess: string;
  organizer_domain: string;
  source_domain: string;
  platform_type: string;
  metro_cluster: string;
  priority_tier: string;
  research_group_key: string;
};

type GroupSummary = {
  research_group_key: string;
  organizer_guess: string;
  organizer_domain: string;
  state: string;
  metro_cluster: string;
  sport: string;
  tournament_count: number;
  priority_tier: string;
  sample_tournaments: string;
};

function argValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}.`);
  return v;
}

function cleanText(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : "";
}

function normalizeCity(value: string) {
  const raw = cleanText(value);
  if (!raw) return "";
  const tokens = raw
    .toLowerCase()
    .split(/[\s/]+/g)
    .filter(Boolean)
    .map((t) => t.replace(/[^a-z0-9'-]/g, ""));
  const out = tokens
    .map((t) => {
      if (!t) return "";
      if (t.includes("-")) {
        return t
          .split("-")
          .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : ""))
          .join("-");
      }
      return t[0].toUpperCase() + t.slice(1);
    })
    .join(" ");
  return out.trim();
}

const STATE_ABBR: Record<string, string> = {
  ALABAMA: "AL",
  ALASKA: "AK",
  ARIZONA: "AZ",
  ARKANSAS: "AR",
  CALIFORNIA: "CA",
  COLORADO: "CO",
  CONNECTICUT: "CT",
  DELAWARE: "DE",
  FLORIDA: "FL",
  GEORGIA: "GA",
  HAWAII: "HI",
  IDAHO: "ID",
  ILLINOIS: "IL",
  INDIANA: "IN",
  IOWA: "IA",
  KANSAS: "KS",
  KENTUCKY: "KY",
  LOUISIANA: "LA",
  MAINE: "ME",
  MARYLAND: "MD",
  MASSACHUSETTS: "MA",
  MICHIGAN: "MI",
  MINNESOTA: "MN",
  MISSISSIPPI: "MS",
  MISSOURI: "MO",
  MONTANA: "MT",
  NEBRASKA: "NE",
  NEVADA: "NV",
  "NEW HAMPSHIRE": "NH",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW YORK": "NY",
  "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND",
  OHIO: "OH",
  OKLAHOMA: "OK",
  OREGON: "OR",
  PENNSYLVANIA: "PA",
  "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN",
  TEXAS: "TX",
  UTAH: "UT",
  VERMONT: "VT",
  VIRGINIA: "VA",
  WASHINGTON: "WA",
  "WEST VIRGINIA": "WV",
  WISCONSIN: "WI",
  WYOMING: "WY",
  "DISTRICT OF COLUMBIA": "DC",
};

function normalizeState(value: string) {
  const raw = cleanText(value).toUpperCase();
  if (!raw) return "";
  if (raw.length === 2) return raw;
  const compact = raw.replace(/\s+/g, " ").trim();
  return STATE_ABBR[compact] ?? compact.slice(0, 2);
}

function safeUrlDomain(url: string) {
  const raw = cleanText(url);
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return rootDomain(u.hostname);
  } catch {
    return "";
  }
}

function rootDomain(hostname: string) {
  const host = cleanText(hostname).toLowerCase().replace(/^\.+|\.+$/g, "");
  const h = host.startsWith("www.") ? host.slice(4) : host;
  const parts = h.split(".").filter(Boolean);
  if (parts.length <= 2) return h;

  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  const third = parts[parts.length - 3];
  const commonSecond = new Set(["co", "com", "org", "net", "gov", "edu"]);
  if (tld.length === 2 && commonSecond.has(sld) && third) {
    return `${third}.${sld}.${tld}`;
  }
  return `${sld}.${tld}`;
}

function platformTypeFromDomain(domain: string) {
  const d = cleanText(domain).toLowerCase();
  if (!d) return "unknown";
  if (d.includes("usssa")) return "usssa";
  if (d.endsWith("sportsengine.com") || d.includes("sportsengine")) return "sportsengine";
  if (d.endsWith("gotsport.com") || d.includes("gotsport")) return "gotsport";
  if (d.endsWith("sincsports.com") || d.includes("sincsports")) return "sincsports";
  if (d.endsWith("leagueapps.com") || d.includes("leagueapps")) return "leagueapps";
  if (d.endsWith("tourneymachine.com") || d.includes("tourneymachine")) return "tourneymachine";
  if (d.endsWith("usclubsoccer.org")) return "usclubsoccer";

  // State association heuristic (intentionally narrow to avoid false positives).
  if (d.endsWith("soccer.org") && !d.endsWith("usclubsoccer.org")) return "state_association";

  // Otherwise, treat as an official club/organizer site (non-platform).
  return "official_club_site";
}

type MetroRule = { cluster: string; state: string; cities: string[] };
const METRO_RULES: MetroRule[] = [
  {
    cluster: "Phoenix Metro",
    state: "AZ",
    cities: [
      "Phoenix",
      "Mesa",
      "Tempe",
      "Scottsdale",
      "Chandler",
      "Gilbert",
      "Glendale",
      "Peoria",
      "Avondale",
      "Surprise",
      "Goodyear",
      "Buckeye",
      "Queen Creek",
    ],
  },
  {
    cluster: "Puget Sound",
    state: "WA",
    cities: [
      "Seattle",
      "Tacoma",
      "Bellevue",
      "Everett",
      "Renton",
      "Kent",
      "Auburn",
      "Federal Way",
      "Redmond",
      "Kirkland",
      "Issaquah",
      "Lynnwood",
      "Shoreline",
      "Bothell",
      "Puyallup",
    ],
  },
  {
    cluster: "Chicagoland",
    state: "IL",
    cities: ["Chicago", "Aurora", "Naperville", "Joliet", "Schaumburg", "Elgin", "Evanston", "Waukegan"],
  },
  {
    cluster: "Twin Cities",
    state: "MN",
    cities: ["Minneapolis", "Saint Paul", "St Paul", "Bloomington", "Eagan", "Woodbury", "Plymouth", "Maple Grove"],
  },
  {
    cluster: "DFW",
    state: "TX",
    cities: ["Dallas", "Fort Worth", "Arlington", "Plano", "Frisco", "McKinney", "Irving", "Garland", "Denton"],
  },
  {
    cluster: "Orlando Metro",
    state: "FL",
    cities: ["Orlando", "Kissimmee", "Sanford", "Winter Park", "Clermont", "Lake Buena Vista"],
  },
  {
    cluster: "South Florida",
    state: "FL",
    cities: ["Miami", "Fort Lauderdale", "Hollywood", "Boca Raton", "West Palm Beach", "Hialeah", "Homestead"],
  },
];

function metroCluster(city: string, state: string) {
  const c = normalizeCity(city);
  const s = normalizeState(state);
  if (!c || !s) return "";
  for (const rule of METRO_RULES) {
    if (rule.state !== s) continue;
    if (rule.cities.some((rc) => normalizeCity(rc) === c)) return rule.cluster;
  }
  return "";
}

function computeResearchGroupKey(params: {
  organizer_domain: string;
  organizer_guess: string;
  state: string;
  sport: string;
  metro_cluster: string;
}) {
  const organizerDomain = cleanText(params.organizer_domain);
  const organizerGuess = cleanText(params.organizer_guess);
  const state = normalizeState(params.state);
  const sport = cleanText(params.sport);
  const metro = cleanText(params.metro_cluster).replace(/\s+/g, "");

  if (organizerDomain && state) return `${organizerDomain}__${state}`;
  if (organizerGuess && metro) return `${organizerGuess.replace(/\s+/g, "")}__${metro}`;
  if (state && sport && metro) return `${state}__${sport}__${metro}`;
  if (state) return `${state}`;
  return "UNKNOWN";
}

function computePriorityTier(params: {
  official_url: string;
  city: string;
  state: string;
  organizer_domain: string;
  is_repeat_organizer: boolean;
  platform_type: string;
}) {
  const official = !!cleanText(params.official_url);
  const city = !!cleanText(params.city);
  const state = !!cleanText(params.state);
  const organizerDomain = !!cleanText(params.organizer_domain);
  const repeat = params.is_repeat_organizer;
  const platform = cleanText(params.platform_type);

  if (official && city && state && organizerDomain && repeat) return "A";
  if (official && city && state) return "B";
  if (official && (city || state || organizerDomain)) return "C";

  // Generic listing pages / weak signals.
  if (!official && (platform === "unknown" || platform === "official_club_site")) return "D";
  return "D";
}

function compareTier(a: string, b: string) {
  const order: Record<string, number> = { A: 1, B: 2, C: 3, D: 4 };
  return (order[a] ?? 99) - (order[b] ?? 99);
}

function csvCell(value: unknown) {
  const v = String(value ?? "");
  if (v.includes("\"") || v.includes(",") || v.includes("\n") || v.includes("\r")) {
    return `"${v.replace(/\"/g, "\"\"")}"`;
  }
  return v;
}

function writeCsvFile(filePath: string, rows: Array<Record<string, unknown>>, headers: string[]) {
  const lines: string[] = [];
  lines.push(headers.map(csvCell).join(","));
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell((row as any)[h] ?? "")).join(","));
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

async function loadTournamentVenueLinkIds(
  supabase: ReturnType<typeof createClient>,
  tournamentIds: string[]
): Promise<Set<string>> {
  if (!tournamentIds.length) return new Set<string>();
  const out = new Set<string>();
  const chunkSize = 50;
  for (let i = 0; i < tournamentIds.length; i += chunkSize) {
    const chunk = tournamentIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("tournament_venues" as any)
      .select("tournament_id")
      .in("tournament_id", chunk)
      .limit(20000);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ tournament_id: string | null }>) {
      const tid = cleanText(row?.tournament_id);
      if (tid) out.add(tid);
    }
  }
  return out;
}

async function loadPublishedCanonicalTournaments(
  supabase: ReturnType<typeof createClient>,
  params: { state?: string; sport?: string; limit?: number; includeDemos?: boolean }
) {
  const pageSize = 500;
  const limit = params.limit ?? 0;
  let offset = 0;

  const rows: TournamentRow[] = [];

  // Select shape: prefer grabbing `tournament_director` and `is_demo` when present, but keep fallbacks if schema differs.
  let includeDirector = true;
  let includeIsDemo = true;

  const selectBase = "id,name,sport,city,state,start_date,end_date,official_website_url,source_url";
  const makeSelect = () =>
    [
      selectBase,
      includeIsDemo ? "is_demo" : null,
      includeDirector ? "tournament_director" : null,
    ]
      .filter(Boolean)
      .join(",");

  while (true) {
    let base = supabase
      .from("tournaments" as any)
      .select(makeSelect())
      .eq("status", "published")
      .eq("is_canonical", true)
      .range(offset, offset + pageSize - 1);

    if (params.state) base = base.eq("state", params.state);
    if (params.sport) base = base.eq("sport", params.sport);

    const page = await base;
    if (page.error) {
      const msg = page.error.message ?? "";
      const lowered = msg.toLowerCase();
      if (includeDirector && lowered.includes("tournament_director")) {
        includeDirector = false;
        continue;
      }
      if (includeIsDemo && lowered.includes("is_demo")) {
        includeIsDemo = false;
        continue;
      }
      throw page.error;
    }

    const raw = (page.data ?? []) as TournamentRow[];
    const rawLen = raw.length;
    let batch = raw.filter((r) => cleanText(r?.id));
    if (!params.includeDemos) {
      batch = batch.filter((r) => (r as any).is_demo !== true);
    }
    rows.push(...batch);

    // Stop pagination based on the raw returned row count, not after filtering, or we can
    // terminate early when a page contains null-ish ids or filtered demo rows.
    if (rawLen < pageSize) break;
    offset += pageSize;
    if (limit > 0 && rows.length >= limit) break;
  }

  return limit > 0 ? rows.slice(0, limit) : rows;
}

async function main() {
  const homeDir = process.env.HOME ? String(process.env.HOME) : "";
  const defaultOutDir = homeDir ? path.join(homeDir, "Downloads", "ri-venue-research") : "tmp/venue-research";
  const outDir = argValue("out-dir") ?? defaultOutDir;
  const stateFilter = argValue("state") ? normalizeState(argValue("state") as string) : "";
  const sportFilter = cleanText(argValue("sport"));
  const limit = Number(argValue("limit") ?? "0") || 0;
  const includeDemos = hasFlag("include-demos");
  const debug = hasFlag("debug");

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    [
      "[DRY-RUN] Export missing tournament venues (linked coverage).",
      `supabase=${supabaseUrl}`,
      stateFilter ? `state=${stateFilter}` : null,
      sportFilter ? `sport=${sportFilter}` : null,
      limit ? `limit=${limit}` : null,
      includeDemos ? "includeDemos=true" : null,
      debug ? "debug=true" : null,
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (debug) {
    const { count: publishedCount, error: publishedCountErr } = await supabase
      .from("tournaments" as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("is_canonical", true);
    if (publishedCountErr) throw publishedCountErr;

    const { count: linkCount, error: linkCountErr } = await supabase
      .from("tournament_venues" as any)
      .select("tournament_id", { count: "exact", head: true });
    if (linkCountErr) throw linkCountErr;

    console.log(`[debug] published canonical tournaments: ${publishedCount ?? 0}`);
    console.log(`[debug] tournament_venues rows: ${linkCount ?? 0}`);
  }

  const tournaments = await loadPublishedCanonicalTournaments(supabase, {
    state: stateFilter || undefined,
    sport: sportFilter || undefined,
    limit: limit || undefined,
    includeDemos,
  });

  const ids = tournaments.map((t) => t.id);
  const linked = await loadTournamentVenueLinkIds(supabase, ids);
  const missing = tournaments.filter((t) => !linked.has(t.id));
  if (debug) {
    console.log(`[debug] loaded tournaments rows: ${tournaments.length}`);
    console.log(`[debug] tournaments with >=1 linked venue: ${linked.size}`);
    console.log(`[debug] missing linked venue coverage: ${missing.length}`);
  }

  // Repeat organizer heuristic: organizer_domain count >= 3
  const organizerDomainCounts = new Map<string, number>();
  for (const t of missing) {
    const organizerDomain = safeUrlDomain(t.official_website_url ?? "");
    if (!organizerDomain) continue;
    organizerDomainCounts.set(organizerDomain, (organizerDomainCounts.get(organizerDomain) ?? 0) + 1);
  }

  const outputA: OutputA[] = missing.map((t) => {
    const tournament_id = cleanText(t.id);
    const tournament_name = cleanText(t.name);
    const sport = cleanText(t.sport);
    const city = normalizeCity(cleanText(t.city));
    const state = normalizeState(cleanText(t.state));
    const start_date = cleanText(t.start_date);
    const end_date = cleanText(t.end_date);
    const official_url = cleanText(t.official_website_url);
    const source_url = cleanText(t.source_url);
    const organizer_name = cleanText((t as any).tournament_director ?? "");
    const organizer_domain = safeUrlDomain(official_url);
    const source_domain = safeUrlDomain(source_url);

    const organizerPlatform = platformTypeFromDomain(organizer_domain);
    const sourcePlatform = platformTypeFromDomain(source_domain);
    const platform_type = organizerPlatform !== "official_club_site" ? organizerPlatform : sourcePlatform;

    const organizer_guess = organizer_name || organizer_domain || "";
    const metro_cluster = metroCluster(city, state);

    const isRepeatOrganizer = organizer_domain ? (organizerDomainCounts.get(organizer_domain) ?? 0) >= 3 : false;

    const priority_tier = computePriorityTier({
      official_url,
      city,
      state,
      organizer_domain,
      is_repeat_organizer: isRepeatOrganizer,
      platform_type,
    });

    const research_group_key = computeResearchGroupKey({
      organizer_domain,
      organizer_guess,
      state,
      sport,
      metro_cluster,
    });

    return {
      tournament_id,
      tournament_name: tournament_name.trim(),
      sport,
      city,
      state,
      start_date,
      end_date,
      official_url,
      source_url,
      organizer_name,
      organizer_guess,
      organizer_domain,
      source_domain,
      platform_type,
      metro_cluster,
      priority_tier,
      research_group_key,
    };
  });

  const groupCounts = new Map<string, number>();
  for (const r of outputA) groupCounts.set(r.research_group_key, (groupCounts.get(r.research_group_key) ?? 0) + 1);

  outputA.sort((a, b) => {
    const tier = compareTier(a.priority_tier, b.priority_tier);
    if (tier !== 0) return tier;

    const ga = groupCounts.get(a.research_group_key) ?? 0;
    const gb = groupCounts.get(b.research_group_key) ?? 0;
    if (ga !== gb) return gb - ga;

    if (a.state !== b.state) return a.state.localeCompare(b.state);
    if (a.organizer_domain !== b.organizer_domain) return a.organizer_domain.localeCompare(b.organizer_domain);
    return a.tournament_name.localeCompare(b.tournament_name);
  });

  const byGroup = new Map<string, OutputA[]>();
  for (const r of outputA) {
    const k = r.research_group_key;
    byGroup.set(k, [...(byGroup.get(k) ?? []), r]);
  }

  const summaries: GroupSummary[] = Array.from(byGroup.entries())
    .map(([key, rows]) => {
      const top = rows[0];
      const tier = rows.slice().sort((a, b) => compareTier(a.priority_tier, b.priority_tier))[0]?.priority_tier ?? "D";
      const sample = rows
        .slice(0, 6)
        .map((r) => r.tournament_name || r.tournament_id)
        .filter(Boolean)
        .join(" | ");

      return {
        research_group_key: key,
        organizer_guess: top?.organizer_guess ?? "",
        organizer_domain: top?.organizer_domain ?? "",
        state: top?.state ?? "",
        metro_cluster: top?.metro_cluster ?? "",
        sport: top?.sport ?? "",
        tournament_count: rows.length,
        priority_tier: tier,
        sample_tournaments: sample,
      };
    })
    .sort((a, b) => {
      const tier = compareTier(a.priority_tier, b.priority_tier);
      if (tier !== 0) return tier;
      if (a.tournament_count !== b.tournament_count) return b.tournament_count - a.tournament_count;
      if (a.state !== b.state) return a.state.localeCompare(b.state);
      return a.research_group_key.localeCompare(b.research_group_key);
    });

  const outputAPath = path.join(outDir, "missing_tournament_venue_research.csv");
  writeCsvFile(outputAPath, outputA as any, [
    "tournament_id",
    "tournament_name",
    "sport",
    "city",
    "state",
    "start_date",
    "end_date",
    "official_url",
    "source_url",
    "organizer_name",
    "organizer_guess",
    "organizer_domain",
    "source_domain",
    "platform_type",
    "metro_cluster",
    "priority_tier",
    "research_group_key",
  ]);

  const outputBPath = path.join(outDir, "tournament_research_group_summary.csv");
  writeCsvFile(outputBPath, summaries as any, [
    "research_group_key",
    "organizer_guess",
    "organizer_domain",
    "state",
    "metro_cluster",
    "sport",
    "tournament_count",
    "priority_tier",
    "sample_tournaments",
  ]);

  console.log(`Wrote ${outputA.length} tournament row(s): ${outputAPath}`);
  console.log(`Wrote ${summaries.length} group summary row(s): ${outputBPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
