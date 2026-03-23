import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

type TournamentRow = {
  id: string;
  name: string | null;
  status: string | null;
  official_website_url: string | null;
  source_url: string | null;
  start_date: string | null;
  end_date: string | null;
  venue: string | null;
  address: string | null;
  level: string | null;
  team_fee: string | null;
  fees_venue_scraped_at?: string | null;
};

type DateCandidateInsert = {
  tournament_id: string;
  date_text: string | null;
  start_date: string | null;
  end_date: string | null;
  source_url: string | null;
  evidence_text?: string | null;
  confidence: number | null;
};

type AttrCandidateInsert = {
  tournament_id: string;
  attribute_key: "team_fee" | "level" | "address";
  attribute_value: string;
  source_url: string | null;
  evidence_text?: string | null;
  confidence: number | null;
};

type VenueCandidateInsert = {
  tournament_id: string;
  venue_name: string | null;
  address_text: string;
  venue_url: string | null;
  source_url: string | null;
  evidence_text?: string | null;
  confidence: number | null;
};

const HELP = process.argv.includes("--help") || process.argv.includes("-h");
const APPLY = process.argv.includes("--apply");

const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : 50;
const OFFSET_ARG = process.argv.find((arg) => arg.startsWith("--offset="));
const OFFSET = OFFSET_ARG ? Number(OFFSET_ARG.split("=")[1]) : 0;

const COOLDOWN_DAYS_ARG = process.argv.find((arg) => arg.startsWith("--cooldown_days="));
const COOLDOWN_DAYS = COOLDOWN_DAYS_ARG ? Number(COOLDOWN_DAYS_ARG.split("=")[1]) : 10;

const MIN_CONF_ARG = process.argv.find((arg) => arg.startsWith("--min_conf="));
const MIN_CONF = MIN_CONF_ARG ? Number(MIN_CONF_ARG.split("=")[1]) : 0.75;

const USSSA_EVENT_OR_FILTER =
  [
    "official_website_url.ilike.%usssa.com/event/%",
    "source_url.ilike.%usssa.com/event/%",
    "official_website_url.ilike.%fastpitch.usssa.com/event/%",
    "source_url.ilike.%fastpitch.usssa.com/event/%",
    // Some draft uploads point at USSSA directory pages like /events/ (state associations),
    // so include those and attempt to resolve to a specific /event/ page by name.
    "official_website_url.ilike.%usssa.com/events/%",
    "source_url.ilike.%usssa.com/events/%",
    "official_website_url.ilike.%fastpitch.usssa.com/events/%",
    "source_url.ilike.%fastpitch.usssa.com/events/%",
  ].join(",");

function printHelp() {
  console.log(
    [
      "Enrich RI draft tournament uploads for USSSA events (no local server required).",
      "- Scrapes USSSA event pages and inserts date/venue/address/level/team_fee candidates.",
      "",
      "Usage:",
      "  TMPDIR=./tmp node --import tsx scripts/ops/enrich_usssa_draft_uploads.ts [--limit=50] [--offset=0] [--min_conf=0.75]",
      "  TMPDIR=./tmp node --import tsx scripts/ops/enrich_usssa_draft_uploads.ts --apply [--limit=50] [--offset=0] [--min_conf=0.75]",
      "",
      "Env required:",
      "  NEXT_PUBLIC_SUPABASE_URL",
      "  SUPABASE_SERVICE_ROLE_KEY",
      "",
      "Notes:",
      "- Writes a CSV report to /tmp.",
      "- Uses a cooldown on fees_venue_scraped_at when available; override with --cooldown_days=0 to rescan.",
    ].join("\n")
  );
}

function clean(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : "";
}

function isBlank(value: unknown) {
  return !clean(value);
}

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLower(value: string) {
  return normalizeSpace(value).toLowerCase();
}

function asIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseJsonLd($: cheerio.CheerioAPI): {
  start_date: string | null;
  end_date: string | null;
  venue_name: string | null;
  address_text: string | null;
} {
  const result = {
    start_date: null as string | null,
    end_date: null as string | null,
    venue_name: null as string | null,
    address_text: null as string | null,
  };

  const scripts = $("script[type='application/ld+json']").toArray().slice(0, 24);
  for (const script of scripts) {
    const raw = ($(script).html() || "").trim();
    if (!raw) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const typeRaw = item["@type"];
      const type = Array.isArray(typeRaw) ? typeRaw.join(" ").toLowerCase() : String(typeRaw ?? "").toLowerCase();
      if (!type.includes("sports") && !type.includes("event")) continue;

      result.start_date = result.start_date ?? asIsoDate(item.startDate);
      result.end_date = result.end_date ?? asIsoDate(item.endDate);

      const loc = item.location;
      if (loc && typeof loc === "object") {
        const locName = normalizeSpace(String(loc.name ?? "")) || null;
        result.venue_name = result.venue_name ?? locName;
        const addr = loc.address;
        if (addr && typeof addr === "object") {
          const full = [
            addr.streetAddress,
            [addr.addressLocality, addr.addressRegion].filter(Boolean).join(", "),
            addr.postalCode,
          ]
            .map((v) => String(v ?? "").trim())
            .filter(Boolean)
            .join(", ");
          if (full) result.address_text = result.address_text ?? normalizeSpace(full);
        }
      }
    }
  }
  return result;
}

function extractDateRange(text: string): { start_date: string | null; end_date: string | null } {
  const normalized = text.replace(/[–—]/g, "-").replace(/\s+/g, " ");
  const m = normalized.match(
    /\b([A-Za-z]{3,9})\s+(\d{1,2})\s*-\s*([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(20\d{2})\b/i
  );
  if (!m) return { start_date: null, end_date: null };
  const toMonth = (token: string) => {
    const t = token.toLowerCase().slice(0, 3);
    return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(t);
  };
  const sm = toMonth(m[1]);
  const em = toMonth(m[3]);
  const sd = Number(m[2]);
  const ed = Number(m[4]);
  const y = Number(m[5]);
  if (sm < 0 || em < 0) return { start_date: null, end_date: null };
  const s = new Date(Date.UTC(y, sm, sd));
  const e = new Date(Date.UTC(y, em, ed));
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return { start_date: null, end_date: null };
  return {
    start_date: s.toISOString().slice(0, 10),
    end_date: e.toISOString().slice(0, 10),
  };
}

function extractTeamFee(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ");
  const entryFeePatterns = [
    /\b(?:entry|team)\s*fee\b[^$]{0,60}\$\s*([0-9]{2,5}(?:\.[0-9]{2})?)/i,
    /\$\s*([0-9]{2,5}(?:\.[0-9]{2})?)\s*(?:entry|team)\s*fee/i,
  ];
  for (const pattern of entryFeePatterns) {
    const m = normalized.match(pattern);
    if (m) return `$${m[1].replace(/,/g, "")}`;
  }

  const rows = Array.from(
    normalized.matchAll(
      /\b(?:\d{1,2}U|[A-Za-z]{1,4}\d{1,2}U|\d{1,2}AA|\d{1,2}A)\b[^$]{0,24}\$\s*([0-9]{2,5}(?:\.[0-9]{2})?)/gi
    )
  );
  if (!rows.length) return null;
  const values: string[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(0, 8)) {
    const label = normalizeSpace(String(row[0]).split("$")[0] ?? "").replace(/[^A-Za-z0-9U ]/g, "").trim();
    const fee = `$${String(row[1] ?? "").replace(/,/g, "")}`;
    const value = `${label} ${fee}`.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values.length ? values.join(" | ") : null;
}

function extractAgeGroup(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ");
  const matches = Array.from(
    normalized.matchAll(/\b(?:\d{1,2}U|[A-Za-z]{1,4}\d{1,2}U|\d{1,2}AA|\d{1,2}A)\b/g)
  ).map((m) => String(m[0]).toUpperCase());
  if (!matches.length) return null;
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    if (seen.has(m)) continue;
    seen.add(m);
    ordered.push(m);
    if (ordered.length >= 12) break;
  }
  return ordered.join(", ");
}

function extractVenuePageLinks(pageUrl: string, $: cheerio.CheerioAPI): string[] {
  const out: string[] = [];
  $("a[href]").each((_idx, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (!href) return;
    if (!/(venue|venues|facility|facilities|complex|park|location|locations|field|fields|sites)/i.test(href)) return;
    try {
      const abs = new URL(href, pageUrl).toString();
      if (!/^https?:\/\//i.test(abs)) return;
      out.push(abs);
    } catch {
      return;
    }
  });
  return Array.from(new Set(out)).slice(0, 6);
}

function extractAddressLines(text: string): string[] {
  const pattern =
    /\d{1,5}\s+[A-Za-z0-9.\-#\s]{3,100},\s*[A-Za-z.\s]{2,60},\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?/g;
  const matches = Array.from(text.matchAll(pattern)).map((m) => normalizeSpace(m[0] ?? "")).filter(Boolean);
  const denylist = new Set<string>(["1529 third st. s., jacksonville beach, fl 32250"]);
  const filtered = matches.filter((addr) => !denylist.has(normalizeLower(addr)));
  return Array.from(new Set(filtered));
}

function extractVenueRows($: cheerio.CheerioAPI): Array<{ venue_name: string | null; address_text: string }> {
  const rows: Array<{ venue_name: string | null; address_text: string }> = [];
  const seen = new Set<string>();
  $("li,tr,p,div").each((_idx, el) => {
    const text = normalizeSpace($(el).text() || "");
    if (!text) return;
    const addrs = extractAddressLines(text);
    if (!addrs.length) return;
    const heading = normalizeSpace($(el).find("strong,h2,h3,h4,b").first().text() || "") || null;
    for (const address of addrs) {
      const key = `${(heading ?? "").toLowerCase()}|${address.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ venue_name: heading, address_text: address });
    }
  });
  return rows.slice(0, 40);
}

function isMissingCooldownColumnError(message: string | undefined): boolean {
  if (!message) return false;
  return (
    /column .*fees_venue_scraped_at.* does not exist/i.test(message) ||
    /could not find the 'fees_venue_scraped_at' column/i.test(message)
  );
}

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-cache",
      signal: controller.signal,
      headers: { "user-agent": "RI-USSSA-DraftEnrichment/1.0", accept: "text/html,application/xhtml+xml" },
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) return null;
    const html = await resp.text();
    if (!html) return null;
    return html.slice(0, 1024 * 1024);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function tokenizeName(value: string) {
  return normalizeLower(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 40);
}

function scoreNameMatch(needle: string, haystack: string) {
  const n = new Set(tokenizeName(needle));
  const h = new Set(tokenizeName(haystack));
  if (!n.size || !h.size) return 0;
  let hit = 0;
  for (const t of n) if (h.has(t)) hit += 1;
  const precision = hit / h.size;
  const recall = hit / n.size;
  return (2 * precision * recall) / (precision + recall || 1);
}

function extractCandidateEventLinks($: cheerio.CheerioAPI, baseUrl: string) {
  const out = new Set<string>();
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  $("a[href]")
    .toArray()
    .forEach((el) => {
      const href = clean($(el).attr("href") || "");
      if (!href) return;
      if (!/\/event\//i.test(href)) return;
      try {
        const abs = new URL(href, base).toString();
        const u = new URL(abs);
        if (u.hostname.replace(/^www\./, "").toLowerCase() !== base.hostname.replace(/^www\./, "").toLowerCase()) return;
        u.hash = "";
        out.add(u.toString());
      } catch {
        return;
      }
    });
  return Array.from(out).slice(0, 60);
}

async function resolveEventUrl(args: { seedUrl: string; tournamentName: string | null }) {
  if (/\/event\//i.test(args.seedUrl)) return { url: args.seedUrl, html: await fetchHtml(args.seedUrl), resolved: true };
  const seedHtml = await fetchHtml(args.seedUrl);
  if (!seedHtml) return { url: args.seedUrl, html: null, resolved: false };
  if (!/\/events?\//i.test(args.seedUrl)) return { url: args.seedUrl, html: seedHtml, resolved: true };

  const name = clean(args.tournamentName);
  if (!name) return { url: args.seedUrl, html: seedHtml, resolved: true };

  const $ = cheerio.load(seedHtml);
  const links = extractCandidateEventLinks($, args.seedUrl);
  if (!links.length) return { url: args.seedUrl, html: seedHtml, resolved: true };

  // Rank by anchor text first (cheap), then confirm by fetching the best few.
  const ranked = links
    .map((href) => {
      const anchorText = clean($(`a[href='${href.replace(/'/g, "\\'")}']`).first().text() || "");
      return { href, score: scoreNameMatch(name, `${href} ${anchorText}`) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  for (const candidate of ranked) {
    if (candidate.score < 0.2) continue;
    const html = await fetchHtml(candidate.href);
    if (!html) continue;
    const $c = cheerio.load(html);
    const title = clean($c("title").text() || "");
    const body = clean($c("h1,h2").first().text() || "");
    const score = Math.max(candidate.score, scoreNameMatch(name, `${title} ${body} ${candidate.href}`));
    if (score >= 0.35) return { url: candidate.href, html, resolved: true };
  }

  return { url: args.seedUrl, html: seedHtml, resolved: true };
}

function buildOutPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join("/tmp", `ri_usssa_draft_enrichment_${stamp}.csv`);
}

function toCsvRow(values: Record<string, string>) {
  const cols = Object.keys(values);
  const esc = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return cols.map((c) => esc(values[c] ?? "")).join(",");
}

function dedupeKeyAttr(r: AttrCandidateInsert) {
  return `${r.tournament_id}|${r.attribute_key}|${normalizeLower(r.attribute_value)}|${normalizeLower(r.source_url ?? "")}`;
}
function dedupeKeyDate(r: DateCandidateInsert) {
  return `${r.tournament_id}|${r.start_date ?? ""}|${r.end_date ?? ""}|${normalizeLower(r.source_url ?? "")}`;
}
function dedupeKeyVenue(r: VenueCandidateInsert) {
  return `${r.tournament_id}|${normalizeLower(r.venue_name ?? "")}|${normalizeLower(r.address_text)}|${normalizeLower(r.source_url ?? "")}`;
}

async function main() {
  if (HELP) {
    printHelp();
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  if (!Number.isFinite(LIMIT) || LIMIT <= 0) throw new Error("--limit must be positive");
  if (!Number.isFinite(OFFSET) || OFFSET < 0) throw new Error("--offset must be >= 0");
  if (!Number.isFinite(MIN_CONF) || MIN_CONF <= 0 || MIN_CONF > 1) throw new Error("--min_conf must be (0,1]");
  if (!Number.isFinite(COOLDOWN_DAYS) || COOLDOWN_DAYS < 0 || COOLDOWN_DAYS > 365) throw new Error("--cooldown_days must be 0-365");

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const candidatePoolSize = Math.min(5000, LIMIT * 30);
  const cooldownCutoffMs = Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

  const { data: pendingAttrRows } = await supabase
    .from("tournament_attribute_candidates" as any)
    .select("tournament_id")
    .in("attribute_key", ["team_fee", "level", "address"])
    .is("accepted_at", null)
    .is("rejected_at", null)
    .limit(20000);
  const pendingIds = new Set<string>();
  ((pendingAttrRows ?? []) as Array<{ tournament_id: string | null }>).forEach((r) => {
    if (r.tournament_id) pendingIds.add(String(r.tournament_id));
  });

  const withCooldownSelect =
    "id,name,status,official_website_url,source_url,start_date,end_date,venue,address,level,team_fee,fees_venue_scraped_at";
  const withoutCooldownSelect =
    "id,name,status,official_website_url,source_url,start_date,end_date,venue,address,level,team_fee";

  let draftsResp = await supabase
    .from("tournaments" as any)
    .select(withCooldownSelect)
    .eq("status", "draft")
    .or(USSSA_EVENT_OR_FILTER)
    .order("fees_venue_scraped_at", { ascending: true, nullsFirst: true })
    .limit(candidatePoolSize);
  if (draftsResp.error && isMissingCooldownColumnError(draftsResp.error.message)) {
    draftsResp = await supabase
      .from("tournaments" as any)
      .select(withoutCooldownSelect)
      .eq("status", "draft")
      .or(USSSA_EVENT_OR_FILTER)
      .order("updated_at", { ascending: false })
      .limit(candidatePoolSize);
  }
  if (draftsResp.error) throw new Error(draftsResp.error.message);
  const drafts = (draftsResp.data ?? []) as TournamentRow[];

  const selected = drafts
    .filter((t) => !pendingIds.has(String(t.id)))
    .filter((t) => {
      const lastScraped = (t as any).fees_venue_scraped_at ?? null;
      if (!lastScraped || COOLDOWN_DAYS === 0) return true;
      const lastMs = new Date(lastScraped).getTime();
      return !Number.isFinite(lastMs) || lastMs <= cooldownCutoffMs;
    })
    .filter((t) => {
      return (
        isBlank(t.team_fee) ||
        isBlank(t.level) ||
        isBlank(t.start_date) ||
        isBlank(t.end_date) ||
        isBlank(t.venue) ||
        isBlank(t.address)
      );
    })
    .slice(OFFSET, OFFSET + LIMIT);

  const outPath = buildOutPath();
  const report: Array<Record<string, string>> = [];

  const dateCandidates: DateCandidateInsert[] = [];
  const attrCandidates: AttrCandidateInsert[] = [];
  const venueCandidates: VenueCandidateInsert[] = [];

  let attempted = 0;
  let pagesFetched = 0;
  let insertedDates = 0;
  let insertedAttrs = 0;
  let insertedVenues = 0;
  let skippedDuplicate = 0;

  const attemptedTournamentIds: string[] = [];

  for (const t of selected) {
    const seedUrl = clean(t.official_website_url) || clean(t.source_url);
    if (!seedUrl) continue;
    attempted += 1;
    attemptedTournamentIds.push(t.id);

    const resolved = await resolveEventUrl({ seedUrl, tournamentName: t.name });
    const pageUrl = resolved.url;
    const html = resolved.html;
    if (!html) {
      report.push({
        tournament_id: t.id,
        name: clean(t.name) || t.id,
        url: seedUrl,
        status: "fetch_failed",
        found: "",
      });
      continue;
    }
    pagesFetched += 1;

    const found: string[] = [];
    const $ = cheerio.load(html);
    const text = normalizeSpace($.text() || "");

    const j = parseJsonLd($);
    const textDates = extractDateRange(text);
    const start = j.start_date ?? textDates.start_date;
    const end = j.end_date ?? textDates.end_date ?? start;
    if ((start || end) && Number(MIN_CONF) <= 0.85) {
      dateCandidates.push({
        tournament_id: t.id,
        date_text: null,
        start_date: start,
        end_date: end,
        source_url: pageUrl,
        evidence_text: j.start_date || j.end_date ? "json-ld" : "text",
        confidence: 0.85,
      });
      found.push("dates");
    }

    const age = extractAgeGroup(text);
    if (age && Number(MIN_CONF) <= 0.75) {
      attrCandidates.push({
        tournament_id: t.id,
        attribute_key: "level",
        attribute_value: age,
        source_url: pageUrl,
        evidence_text: "text",
        confidence: 0.75,
      });
      found.push("level");
    }

    const fee = extractTeamFee(text);
    if (fee && Number(MIN_CONF) <= 0.8) {
      attrCandidates.push({
        tournament_id: t.id,
        attribute_key: "team_fee",
        attribute_value: fee,
        source_url: pageUrl,
        evidence_text: "text",
        confidence: 0.8,
      });
      found.push("team_fee");
    }

    if (j.address_text && Number(MIN_CONF) <= 0.8) {
      attrCandidates.push({
        tournament_id: t.id,
        attribute_key: "address",
        attribute_value: j.address_text,
        source_url: pageUrl,
        evidence_text: "json-ld",
        confidence: 0.8,
      });
      found.push("address");
    }

    if (j.venue_name && j.address_text && Number(MIN_CONF) <= 0.82) {
      venueCandidates.push({
        tournament_id: t.id,
        venue_name: j.venue_name,
        address_text: j.address_text,
        source_url: pageUrl,
        venue_url: null,
        evidence_text: "json-ld",
        confidence: 0.82,
      });
      found.push("venue_candidates");
    }

    const venuePages = extractVenuePageLinks(pageUrl, $);
    for (const venueUrl of venuePages) {
      const venueHtml = await fetchHtml(venueUrl);
      if (!venueHtml) continue;
      pagesFetched += 1;
      const $v = cheerio.load(venueHtml);
      const rows = extractVenueRows($v);
      for (const row of rows) {
        if (Number(MIN_CONF) > 0.8) continue;
        venueCandidates.push({
          tournament_id: t.id,
          venue_name: row.venue_name,
          address_text: row.address_text,
          source_url: venueUrl,
          venue_url: venueUrl,
          evidence_text: "venue-page",
          confidence: 0.8,
        });
      }
      if (rows.length) found.push("venue_candidates");
    }

      report.push({
        tournament_id: t.id,
        name: clean(t.name) || t.id,
        url: pageUrl,
        status: found.length ? "ok" : "no_signals",
        found: Array.from(new Set(found)).join("|"),
      });
  }

  const uniqueAttrs: AttrCandidateInsert[] = [];
  const attrSeen = new Set<string>();
  for (const a of attrCandidates) {
    if (Number(a.confidence ?? 0) < MIN_CONF) continue;
    const k = dedupeKeyAttr(a);
    if (attrSeen.has(k)) continue;
    attrSeen.add(k);
    uniqueAttrs.push(a);
  }

  const uniqueDates: DateCandidateInsert[] = [];
  const dateSeen = new Set<string>();
  for (const d of dateCandidates) {
    if (Number(d.confidence ?? 0) < MIN_CONF) continue;
    const k = dedupeKeyDate(d);
    if (dateSeen.has(k)) continue;
    dateSeen.add(k);
    uniqueDates.push(d);
  }

  const uniqueVenues: VenueCandidateInsert[] = [];
  const venueSeen = new Set<string>();
  for (const v of venueCandidates) {
    if (Number(v.confidence ?? 0) < MIN_CONF) continue;
    const k = dedupeKeyVenue(v);
    if (venueSeen.has(k)) continue;
    venueSeen.add(k);
    uniqueVenues.push(v);
  }

  if (APPLY) {
    if (uniqueAttrs.length) {
      const tournamentIds = Array.from(new Set(uniqueAttrs.map((r) => r.tournament_id)));
      const { data: existingRows, error: existingError } = await supabase
        .from("tournament_attribute_candidates" as any)
        .select("tournament_id,attribute_key,attribute_value,source_url")
        .in("tournament_id", tournamentIds)
        .in("attribute_key", ["team_fee", "level", "address"]);
      if (existingError) throw new Error(existingError.message);
      const existingKeys = new Set(
        ((existingRows ?? []) as Array<any>).map(
          (r) =>
            `${String(r.tournament_id)}|${String(r.attribute_key)}|${normalizeLower(String(r.attribute_value ?? ""))}|${normalizeLower(
              String(r.source_url ?? "")
            )}`
        )
      );
      const toInsert = uniqueAttrs.filter((row) => {
        const k = dedupeKeyAttr(row);
        const exists = existingKeys.has(k);
        if (exists) skippedDuplicate += 1;
        return !exists;
      });
      if (toInsert.length) {
        const res = await supabase.from("tournament_attribute_candidates" as any).insert(toInsert).select("id");
        if (res.error) throw new Error(res.error.message);
        insertedAttrs += res.data?.length ?? 0;
      }
    }

    if (uniqueDates.length) {
      const tournamentIds = Array.from(new Set(uniqueDates.map((r) => r.tournament_id)));
      const { data: existingRows, error: existingError } = await supabase
        .from("tournament_date_candidates" as any)
        .select("tournament_id,start_date,end_date,source_url")
        .in("tournament_id", tournamentIds);
      if (existingError) throw new Error(existingError.message);
      const existingKeys = new Set(
        ((existingRows ?? []) as Array<any>).map(
          (r) => `${String(r.tournament_id)}|${String(r.start_date ?? "")}|${String(r.end_date ?? "")}|${normalizeLower(String(r.source_url ?? ""))}`
        )
      );
      const toInsert = uniqueDates.filter((row) => {
        const k = dedupeKeyDate(row);
        const exists = existingKeys.has(k);
        if (exists) skippedDuplicate += 1;
        return !exists;
      });
      if (toInsert.length) {
        const res = await supabase.from("tournament_date_candidates" as any).insert(toInsert).select("id");
        if (res.error) throw new Error(res.error.message);
        insertedDates += res.data?.length ?? 0;
      }
    }

    if (uniqueVenues.length) {
      const tournamentIds = Array.from(new Set(uniqueVenues.map((r) => r.tournament_id)));
      const { data: existingRows, error: existingError } = await supabase
        .from("tournament_venue_candidates" as any)
        .select("tournament_id,venue_name,address_text,source_url")
        .in("tournament_id", tournamentIds);
      if (existingError) throw new Error(existingError.message);
      const existingKeys = new Set(
        ((existingRows ?? []) as Array<any>).map(
          (r) =>
            `${String(r.tournament_id)}|${normalizeLower(String(r.venue_name ?? ""))}|${normalizeLower(String(r.address_text ?? ""))}|${normalizeLower(
              String(r.source_url ?? "")
            )}`
        )
      );
      const toInsert = uniqueVenues.filter((row) => {
        const k = dedupeKeyVenue(row);
        const exists = existingKeys.has(k);
        if (exists) skippedDuplicate += 1;
        return !exists;
      });
      if (toInsert.length) {
        const res = await supabase.from("tournament_venue_candidates" as any).insert(toInsert).select("id");
        if (res.error) throw new Error(res.error.message);
        insertedVenues += res.data?.length ?? 0;
      }
    }

    if (attemptedTournamentIds.length) {
      const nowIso = new Date().toISOString();
      const stamp = await supabase
        .from("tournaments" as any)
        .update({ fees_venue_scraped_at: nowIso })
        .in("id", attemptedTournamentIds);
      if (stamp.error && !isMissingCooldownColumnError(stamp.error.message)) {
        throw new Error(stamp.error.message);
      }
    }
  }

  const cols = ["tournament_id", "name", "url", "status", "found"];
  fs.writeFileSync(outPath, `${cols.join(",")}\n${report.map((r) => toCsvRow(r)).join("\n")}\n`, "utf8");

  console.log(
    [
      "",
      "Done.",
      `- apply: ${APPLY ? "yes" : "no"}`,
      `- limit: ${LIMIT}`,
      `- offset: ${OFFSET}`,
      `- min_conf: ${MIN_CONF}`,
      `- selected: ${selected.length}`,
      `- attempted: ${attempted}`,
      `- pages_fetched: ${pagesFetched}`,
      `- unique_attrs: ${uniqueAttrs.length}`,
      `- unique_dates: ${uniqueDates.length}`,
      `- unique_venues: ${uniqueVenues.length}`,
      `- inserted_attrs: ${insertedAttrs}`,
      `- inserted_dates: ${insertedDates}`,
      `- inserted_venues: ${insertedVenues}`,
      `- skipped_duplicates: ${skippedDuplicate}`,
      `- csv: ${outPath}`,
    ].join("\n")
  );

  if (!APPLY) {
    console.log("Run again with --apply to insert candidates.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
