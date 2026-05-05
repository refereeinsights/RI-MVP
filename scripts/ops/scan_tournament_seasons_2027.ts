import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

// NOTE: Do not statically import `atlasSearch` here.
// `atlasSearch` depends on `trackExternalCall` which imports `supabaseAdmin` at module-load time.
// In ops scripts, env vars from `.env.local` are not automatically loaded, so a static import can
// throw before `loadEnvLocal()` runs. We dynamically import after env is loaded in `main()`.

type AtlasSearchResult = {
  url: string;
  title: string | null;
  snippet: string | null;
  domain: string | null;
};

type UpdateAction =
  | "updated"
  | "updated_existing_2027"
  | "no_2027_found"
  | "needs_review"
  | "possible_duplicate"
  | "failed_url";

type Confidence = "high" | "medium" | "low";
type SourceChecked = "source_url" | "official_website_url" | "web_search";

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
  is_canonical: boolean | null;
};

function parseDotenv(contents: string) {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const parsed = parseDotenv(fs.readFileSync(envPath, "utf8"));
  for (const [k, v] of Object.entries(parsed)) {
    if (!process.env[k]) process.env[k] = v;
  }
}

function argValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function clean(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function todayIsoDateUtc() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  return d.toISOString().slice(0, 10);
}

function safeUrl(value: string | null) {
  const u = clean(value);
  if (!u) return null;
  if (!u.startsWith("http://") && !u.startsWith("https://")) return null;
  return u;
}

function looksLikeJsShell(html: string) {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ");
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return true;
  // Heuristic: if the HTML has almost no visible text, it’s likely a JS-rendered shell.
  return cleaned.length < 250;
}

const MONTHS: Array<{ name: string; idx: number }> = [
  { name: "january", idx: 1 },
  { name: "february", idx: 2 },
  { name: "march", idx: 3 },
  { name: "april", idx: 4 },
  { name: "may", idx: 5 },
  { name: "june", idx: 6 },
  { name: "july", idx: 7 },
  { name: "august", idx: 8 },
  { name: "september", idx: 9 },
  { name: "october", idx: 10 },
  { name: "november", idx: 11 },
  { name: "december", idx: 12 },
];

function monthFromToken(token: string) {
  const t = token.toLowerCase();
  const m = MONTHS.find((x) => x.name.startsWith(t));
  return m?.idx ?? null;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

type ExactDateHit = {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  evidence: string;
};

function extractExact2027DateRangeFromText(text: string): ExactDateHit | null {
  const normalized = text.replace(/\s+/g, " ");
  if (!/\b2027\b/.test(normalized)) return null;

  // Common patterns:
  // "March 10-12, 2027"
  // "Mar 10 – 12, 2027"
  // "Mar 10-12 2027"
  // "Mar 10, 2027 - Mar 12, 2027"
  const monthToken = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)";

  const m1 = normalized.match(
    new RegExp(`${monthToken}\\s+(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s*,?\\s*2027`, "i")
  );
  if (m1) {
    const month = monthFromToken(m1[1]) ?? null;
    const d1 = Number(m1[2]);
    const d2 = Number(m1[3]);
    if (month && d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31) {
      const start = `2027-${pad2(month)}-${pad2(d1)}`;
      const end = `2027-${pad2(month)}-${pad2(d2)}`;
      return { start, end, evidence: m1[0].slice(0, 180) };
    }
  }

  const m2 = normalized.match(
    new RegExp(`${monthToken}\\s+(\\d{1,2})\\s*,\\s*2027\\s*[-–]\\s*${monthToken}\\s+(\\d{1,2})\\s*,\\s*2027`, "i")
  );
  if (m2) {
    const monthA = monthFromToken(m2[1]) ?? null;
    const dayA = Number(m2[2]);
    const monthB = monthFromToken(m2[3]) ?? null;
    const dayB = Number(m2[4]);
    if (monthA && monthB && dayA >= 1 && dayA <= 31 && dayB >= 1 && dayB <= 31) {
      const start = `2027-${pad2(monthA)}-${pad2(dayA)}`;
      const end = `2027-${pad2(monthB)}-${pad2(dayB)}`;
      return { start, end, evidence: m2[0].slice(0, 180) };
    }
  }

  return null;
}

function confidenceFromDomain(domain: string | null): Confidence {
  // In V1, use a conservative mapping:
  // - default to medium for “found by search / secondary” until reviewers refine.
  // - the caller can override to high when the source is clearly official/platform.
  const d = (domain ?? "").toLowerCase();
  if (!d) return "medium";
  if (/(gotsport|sincsports|tourneymachine|tournamentmachine|advancedeventsystems|aes|sportsengine)/.test(d)) return "high";
  return "medium";
}

function extractDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function fetchText(url: string) {
  const resp = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "TournamentInsightsSeasonScanner/1.0 (+https://www.tournamentinsights.com)",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  const body = await resp.text();
  return { ok: resp.ok, status: resp.status, body };
}

function stripHtmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchQueries(t: TournamentRow) {
  const name = clean(t.name) ?? "";
  const state = clean(t.state) ?? "";
  const city = clean(t.city) ?? "";
  const assoc = clean(t.tournament_association);

  const queries: string[] = [];
  if (name && state) queries.push(`${name} ${state} 2027`);
  if (name && city) queries.push(`${name} ${city} 2027`);
  if (assoc) queries.push(`${assoc} tournament 2027`);
  if (name) queries.push(`${name} registration 2027`);
  if (name) queries.push(`${name} GotSport 2027`);
  if (name) queries.push(`${name} SincSports 2027`);
  if (name) queries.push(`${name} TourneyCentral 2027`);
  return queries;
}

async function main() {
  loadEnvLocal();

  const APPLY = hasFlag("apply");
  const FORCE = hasFlag("force");
  const limit = Number(clean(argValue("limit")) ?? "50");
  const offset = Number(clean(argValue("offset")) ?? "0");
  const seasonYear = Number(clean(argValue("season_year")) ?? "2027");
  const outPath =
    clean(argValue("out")) || path.resolve(process.cwd(), "tmp", `season_scan_${seasonYear}_${Date.now()}.csv`);

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or .env.local)");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { atlasSearch, getSearchProviderName } = await import("../../apps/referee/src/server/atlas/search");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const cols = [
    "tournament_id",
    "tournament_slug",
    "tournament_name",
    "old_start_date",
    "old_end_date",
    "new_season_year",
    "new_start_date",
    "new_end_date",
    "source_checked",
    "source_url_found",
    "official_website_url_found",
    "update_action",
    "confidence",
    "notes",
    "error",
  ];
  fs.writeFileSync(outPath, `${cols.join(",")}\n`, "utf8");

  const today = todayIsoDateUtc();

  const tRes = await supabase
    .from("tournaments" as any)
    .select(
      "id,slug,name,sport,city,state,start_date,end_date,source_url,official_website_url,tournament_association,is_canonical"
    )
    .eq("is_canonical", true)
    .lt("start_date", today)
    .order("start_date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (tRes.error) throw tRes.error;
  const tournaments: TournamentRow[] = (tRes.data ?? []) as any;

  let scanned = 0;
  let updated = 0;
  let needsReview = 0;
  let noFound = 0;
  let possibleDup = 0;
  let failed = 0;

  for (const t of tournaments) {
    scanned += 1;

    let updateAction: UpdateAction = "no_2027_found";
    let confidence: Confidence | null = null;
    let sourceChecked: SourceChecked | null = null;
    let sourceUrlFound: string | null = null;
    let officialUrlFound: string | null = null;
    let newStart: string | null = null;
    let newEnd: string | null = null;
    let notes: string | null = null;
    let error: string | null = null;

    const tournamentId = String(t.id);

    try {
      // Skip previously scanned unless forced.
      if (!FORCE) {
        const scanExisting = await supabase
          .from("tournament_season_scan_log" as any)
          .select("id")
          .eq("tournament_id", tournamentId)
          .eq("season_year", seasonYear)
          .limit(1);
        if (scanExisting.error) throw scanExisting.error;
        if ((scanExisting.data ?? []).length > 0) {
          continue;
        }
      }

      // If season row already exists, this becomes updated_existing_2027 if we update it.
      const seasonExisting = await supabase
        .from("tournament_seasons" as any)
        .select("id")
        .eq("tournament_id", tournamentId)
        .eq("season_year", seasonYear)
        .limit(1);
      if (seasonExisting.error) throw seasonExisting.error;
      const hasExistingSeason = (seasonExisting.data ?? []).length > 0;

      const urlsToCheck: Array<{ kind: SourceChecked; url: string | null }> = [
        { kind: "source_url", url: safeUrl(t.source_url) },
        { kind: "official_website_url", url: safeUrl(t.official_website_url) },
      ];

      let exactHit: ExactDateHit | null = null;
      let jsShellNote: string | null = null;

      for (const u of urlsToCheck) {
        if (!u.url) continue;
        sourceChecked = u.kind;
        const fetched = await fetchText(u.url);
        if (!fetched.ok) {
          jsShellNote = null;
          continue;
        }
        if (looksLikeJsShell(fetched.body)) {
          jsShellNote = "js_rendered_page_no_dates";
          continue;
        }
        const text = stripHtmlToText(fetched.body);
        const hit = extractExact2027DateRangeFromText(text);
        if (hit) {
          exactHit = hit;
          if (u.kind === "source_url") sourceUrlFound = u.url;
          if (u.kind === "official_website_url") officialUrlFound = u.url;
          break;
        }
      }

      if (!exactHit) {
        // Search fallback (Step 3)
        sourceChecked = "web_search";
        const queries = buildSearchQueries(t);
        const providerName = getSearchProviderName();
        for (const q of queries) {
          const cleanedQ = clean(q);
          if (!cleanedQ) continue;
          const results: AtlasSearchResult[] = await atlasSearch(cleanedQ, 8);
          for (const r of results) {
            const url = safeUrl(r.url);
            if (!url) continue;
            const fetched = await fetchText(url);
            if (!fetched.ok) continue;
            if (looksLikeJsShell(fetched.body)) {
              continue;
            }
            const text = stripHtmlToText(fetched.body);
            const hit = extractExact2027DateRangeFromText(text);
            if (!hit) continue;
            exactHit = hit;
            sourceUrlFound = url;
            officialUrlFound = safeUrl(t.official_website_url);
            confidence = confidenceFromDomain(r.domain ?? extractDomain(url));
            notes = `2027 dates verified from ${extractDomain(url) ?? "unknown"} (search:${providerName})`;
            break;
          }
          if (exactHit) break;
        }
        if (!exactHit && jsShellNote) {
          notes = jsShellNote;
        }
      } else {
        const domain = extractDomain(sourceUrlFound ?? officialUrlFound ?? "");
        confidence = "high";
        notes = `2027 dates verified from ${domain ?? "unknown"}`;
      }

      if (exactHit) {
        newStart = exactHit.start;
        newEnd = exactHit.end;
        updateAction = hasExistingSeason ? "updated_existing_2027" : "updated";
        confidence = confidence ?? "high";

        if (APPLY) {
          const upsertSeason = await supabase.from("tournament_seasons" as any).upsert(
            [
              {
                tournament_id: tournamentId,
                season_year: seasonYear,
                start_date: newStart,
                end_date: newEnd,
                source_url: sourceUrlFound,
                official_website_url: officialUrlFound,
                date_precision: "day",
                confidence,
                notes,
              },
            ],
            { onConflict: "tournament_id,season_year" }
          );
          if (upsertSeason.error) throw upsertSeason.error;
        }

        updated += 1;
      } else {
        if (notes && notes.includes("timing")) {
          updateAction = "needs_review";
          confidence = "low";
          needsReview += 1;
        } else {
          updateAction = "no_2027_found";
          noFound += 1;
        }
      }

      if (APPLY) {
        const scanPayload: Record<string, any> = {
          tournament_id: tournamentId,
          season_year: seasonYear,
          update_action: updateAction,
          source_checked: sourceChecked,
          source_url_found: sourceUrlFound,
          official_website_url_found: officialUrlFound,
          confidence,
          notes,
          error,
        };
        if (FORCE) scanPayload.scanned_at = new Date().toISOString();

        const upsertScan = await supabase
          .from("tournament_season_scan_log" as any)
          .upsert([scanPayload], { onConflict: "tournament_id,season_year" });
        if (upsertScan.error) throw upsertScan.error;
      }
    } catch (e: any) {
      updateAction = "failed_url";
      error = String(e?.message ?? e);
      failed += 1;
      if (APPLY) {
        const scanPayload: Record<string, any> = {
          tournament_id: String(t.id),
          season_year: seasonYear,
          update_action: updateAction,
          source_checked: sourceChecked,
          source_url_found: sourceUrlFound,
          official_website_url_found: officialUrlFound,
          confidence,
          notes,
          error,
        };
        if (FORCE) scanPayload.scanned_at = new Date().toISOString();
        await supabase.from("tournament_season_scan_log" as any).upsert([scanPayload], { onConflict: "tournament_id,season_year" });
      }
    }

    // CSV row
    fs.appendFileSync(
      outPath,
      [
        tournamentId,
        t.slug ?? "",
        t.name ?? "",
        t.start_date ?? "",
        t.end_date ?? "",
        String(seasonYear),
        newStart ?? "",
        newEnd ?? "",
        sourceChecked ?? "",
        sourceUrlFound ?? "",
        officialUrlFound ?? "",
        updateAction,
        confidence ?? "",
        notes ?? "",
        error ?? "",
      ]
        .map(csvCell)
        .join(",") + "\n",
      "utf8"
    );

    if (updateAction === "possible_duplicate") possibleDup += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        apply: APPLY,
        force: FORCE,
        season_year: seasonYear,
        provider: getSearchProviderName(),
        limit,
        offset,
        scanned,
        updated,
        needs_review: needsReview,
        no_2027_found: noFound,
        possible_duplicates: possibleDup,
        failed_urls: failed,
        out: outPath,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
