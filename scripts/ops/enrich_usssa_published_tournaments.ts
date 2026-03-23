import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

type TournamentRow = {
  id: string;
  name: string | null;
  status: string | null;
  is_canonical: boolean | null;
  enrichment_skip: boolean | null;
  official_website_url: string | null;
  source_url: string | null;
  city: string | null;
  state: string | null;
  team_fee: string | null;
  level: string | null;
  start_date: string | null;
  end_date: string | null;
  venue: string | null;
  address: string | null;
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
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : 200;
const OFFSET_ARG = process.argv.find((arg) => arg.startsWith("--offset="));
const OFFSET = OFFSET_ARG ? Number(OFFSET_ARG.split("=")[1]) : 0;

const COOLDOWN_DAYS_ARG = process.argv.find((arg) => arg.startsWith("--cooldown_days="));
const COOLDOWN_DAYS = COOLDOWN_DAYS_ARG ? Number(COOLDOWN_DAYS_ARG.split("=")[1]) : 10;

function printHelp() {
  console.log(
    [
      "USSSA enrichment pass for published canonical tournaments (no local server required).",
      "- Inserts date/venue/address/level/team_fee candidates for admin review.",
      "",
      "Usage:",
      "  TMPDIR=./tmp node --import tsx scripts/ops/enrich_usssa_published_tournaments.ts [--limit=200] [--offset=0] [--cooldown_days=10]",
      "  TMPDIR=./tmp node --import tsx scripts/ops/enrich_usssa_published_tournaments.ts --apply [--limit=200] [--offset=0] [--cooldown_days=10]",
      "",
      "Env required:",
      "  NEXT_PUBLIC_SUPABASE_URL",
      "  SUPABASE_SERVICE_ROLE_KEY",
      "",
      "Notes:",
      "- Uses fees_venue_scraped_at cooldown when available; set --cooldown_days=0 to force rescan.",
      "- Skips tournaments that already have pending candidates for team_fee/level/address.",
      "- Writes a CSV report to /tmp.",
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

function normalizeLower(value: unknown) {
  return clean(value).toLowerCase();
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
  return Array.from(new Set(out)).slice(0, 8);
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
  return rows.slice(0, 30);
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
      headers: { "user-agent": "RI-USSSA-PublishedEnrichment/1.0", accept: "text/html,application/xhtml+xml" },
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

function buildOutPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join("/tmp", `ri_usssa_published_enrichment_${stamp}.csv`);
}

function toCsvRow(values: Record<string, string>) {
  const cols = Object.keys(values);
  const esc = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return cols.map((c) => esc(values[c] ?? "")).join(",");
}

function isMissingCooldownColumnError(message: string | undefined): boolean {
  if (!message) return false;
  return (
    /column .*fees_venue_scraped_at.* does not exist/i.test(message) ||
    /could not find the 'fees_venue_scraped_at' column/i.test(message)
  );
}

const USSSA_EVENT_OR_FILTER =
  [
    "official_website_url.ilike.%usssa.com/event/%",
    "source_url.ilike.%usssa.com/event/%",
    "official_website_url.ilike.%fastpitch.usssa.com/event/%",
    "source_url.ilike.%fastpitch.usssa.com/event/%",
    // Include /events/ to catch directory links that should be fixed (but we only insert candidates).
    "official_website_url.ilike.%usssa.com/events/%",
    "source_url.ilike.%usssa.com/events/%",
    "official_website_url.ilike.%fastpitch.usssa.com/events/%",
    "source_url.ilike.%fastpitch.usssa.com/events/%",
  ].join(",");

function dedupeKeyAttr(r: AttrCandidateInsert) {
  return `${r.tournament_id}|${r.attribute_key}|${normalizeLower(r.attribute_value)}|${normalizeLower(r.source_url ?? "")}`;
}
function dedupeKeyDate(r: DateCandidateInsert) {
  return `${r.tournament_id}|${r.start_date ?? ""}|${r.end_date ?? ""}|${normalizeLower(r.source_url ?? "")}`;
}
function dedupeKeyVenue(r: VenueCandidateInsert) {
  return `${r.tournament_id}|${normalizeLower(r.venue_name ?? "")}|${normalizeLower(r.address_text)}|${normalizeLower(r.source_url ?? "")}`;
}

async function loadExistingTournamentIds(supabase: ReturnType<typeof createClient>, ids: string[]) {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data, error } = await supabase.from("tournaments" as any).select("id").in("id", chunk).limit(5000);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ id: string | null }>) {
      const id = String(row.id ?? "");
      if (id) out.add(id);
    }
  }
  return out;
}

async function insertInChunks<T extends Record<string, unknown>>(args: {
  supabase: ReturnType<typeof createClient>;
  table: string;
  rows: T[];
  chunkSize: number;
}) {
  let inserted = 0;
  for (let i = 0; i < args.rows.length; i += args.chunkSize) {
    const chunk = args.rows.slice(i, i + args.chunkSize);
    const res = await args.supabase.from(args.table as any).insert(chunk).select("id");
    if (res.error) throw new Error(res.error.message);
    inserted += res.data?.length ?? 0;
  }
  return inserted;
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
  if (!Number.isFinite(COOLDOWN_DAYS) || COOLDOWN_DAYS < 0 || COOLDOWN_DAYS > 365) throw new Error("--cooldown_days must be 0-365");

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const candidatePoolSize = Math.min(8000, LIMIT * 25);
  const cooldownCutoffMs = Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

  const pendingIds = new Set<string>();
  const pendingAttributeRows = await supabase
    .from("tournament_attribute_candidates" as any)
    .select("tournament_id")
    .in("attribute_key", ["team_fee", "level", "address"])
    .is("accepted_at", null)
    .is("rejected_at", null)
    .limit(20000);
  ((pendingAttributeRows.data ?? []) as Array<{ tournament_id: string | null }>).forEach((r) => {
    if (r.tournament_id) pendingIds.add(String(r.tournament_id));
  });

  const withCooldownSelect =
    "id,name,status,is_canonical,enrichment_skip,official_website_url,source_url,city,state,team_fee,level,start_date,end_date,venue,address,fees_venue_scraped_at";
  const withoutCooldownSelect =
    "id,name,status,is_canonical,enrichment_skip,official_website_url,source_url,city,state,team_fee,level,start_date,end_date,venue,address";

  let primary = await supabase
    .from("tournaments" as any)
    .select(withCooldownSelect)
    .eq("status", "published")
    .eq("is_canonical", true)
    .eq("enrichment_skip", false)
    .or(USSSA_EVENT_OR_FILTER)
    .order("fees_venue_scraped_at", { ascending: true, nullsFirst: true })
    .limit(candidatePoolSize);
  if (primary.error && isMissingCooldownColumnError(primary.error.message)) {
    primary = await supabase
      .from("tournaments" as any)
      .select(withoutCooldownSelect)
      .eq("status", "published")
      .eq("is_canonical", true)
      .eq("enrichment_skip", false)
      .or(USSSA_EVENT_OR_FILTER)
      .order("updated_at", { ascending: false })
      .limit(candidatePoolSize);
  }
  if (primary.error) throw new Error(primary.error.message);

  const tournaments = (primary.data ?? []) as TournamentRow[];

  let skipped_recent = 0;
  let skipped_pending = 0;

  const selected = tournaments
    .filter((t) => {
      if (pendingIds.has(String(t.id))) {
        skipped_pending += 1;
        return false;
      }
      const lastScraped = (t as any).fees_venue_scraped_at ?? null;
      if (!lastScraped || COOLDOWN_DAYS === 0) return true;
      const lastMs = new Date(lastScraped).getTime();
      if (Number.isFinite(lastMs) && lastMs > cooldownCutoffMs) {
        skipped_recent += 1;
        return false;
      }
      return true;
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
  let insertedAttrs = 0;
  let insertedDates = 0;
  let insertedVenues = 0;
  let skippedDuplicates = 0;

  const attemptedTournamentIds: string[] = [];

  for (const t of selected) {
    const pageUrl = clean(t.official_website_url) || clean(t.source_url);
    if (!pageUrl) continue;
    attempted += 1;
    attemptedTournamentIds.push(t.id);

    const html = await fetchHtml(pageUrl);
    if (!html) {
      report.push({
        tournament_id: t.id,
        name: clean(t.name) || t.id,
        url: pageUrl,
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
    if (start || end) {
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
    if (age) {
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
    if (fee) {
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

    if (j.address_text) {
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

    if (j.venue_name && j.address_text) {
      venueCandidates.push({
        tournament_id: t.id,
        venue_name: j.venue_name,
        address_text: j.address_text,
        venue_url: null,
        source_url: pageUrl,
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
        venueCandidates.push({
          tournament_id: t.id,
          venue_name: row.venue_name,
          address_text: row.address_text,
          venue_url: venueUrl,
          source_url: venueUrl,
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
    const k = dedupeKeyAttr(a);
    if (attrSeen.has(k)) continue;
    attrSeen.add(k);
    uniqueAttrs.push(a);
  }

  const uniqueDates: DateCandidateInsert[] = [];
  const dateSeen = new Set<string>();
  for (const d of dateCandidates) {
    const k = dedupeKeyDate(d);
    if (dateSeen.has(k)) continue;
    dateSeen.add(k);
    uniqueDates.push(d);
  }

  const uniqueVenues: VenueCandidateInsert[] = [];
  const venueSeen = new Set<string>();
  for (const v of venueCandidates) {
    const k = dedupeKeyVenue(v);
    if (venueSeen.has(k)) continue;
    venueSeen.add(k);
    uniqueVenues.push(v);
  }

  if (APPLY) {
    const validTournamentIds = await loadExistingTournamentIds(supabase, attemptedTournamentIds);
    const validAttrs = uniqueAttrs.filter((r) => validTournamentIds.has(r.tournament_id));
    const validDates = uniqueDates.filter((r) => validTournamentIds.has(r.tournament_id));
    const validVenues = uniqueVenues.filter((r) => validTournamentIds.has(r.tournament_id));

    if (uniqueAttrs.length) {
      const tournamentIds = Array.from(new Set(validAttrs.map((r) => r.tournament_id)));
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
      const toInsert = validAttrs.filter((row) => {
        const k = dedupeKeyAttr(row);
        const exists = existingKeys.has(k);
        if (exists) skippedDuplicates += 1;
        return !exists;
      });
      if (toInsert.length) {
        insertedAttrs += await insertInChunks({
          supabase,
          table: "tournament_attribute_candidates",
          rows: toInsert as any,
          chunkSize: 500,
        });
      }
    }

    if (uniqueDates.length) {
      const tournamentIds = Array.from(new Set(validDates.map((r) => r.tournament_id)));
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
      const toInsert = validDates.filter((row) => {
        const k = dedupeKeyDate(row);
        const exists = existingKeys.has(k);
        if (exists) skippedDuplicates += 1;
        return !exists;
      });
      if (toInsert.length) {
        insertedDates += await insertInChunks({
          supabase,
          table: "tournament_date_candidates",
          rows: toInsert as any,
          chunkSize: 500,
        });
      }
    }

    if (uniqueVenues.length) {
      const tournamentIds = Array.from(new Set(validVenues.map((r) => r.tournament_id)));
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
      const toInsert = validVenues.filter((row) => {
        const k = dedupeKeyVenue(row);
        const exists = existingKeys.has(k);
        if (exists) skippedDuplicates += 1;
        return !exists;
      });
      if (toInsert.length) {
        insertedVenues += await insertInChunks({
          supabase,
          table: "tournament_venue_candidates",
          rows: toInsert as any,
          chunkSize: 500,
        });
      }
    }

    if (attemptedTournamentIds.length) {
      const nowIso = new Date().toISOString();
      const stamp = await supabase
        .from("tournaments" as any)
        .update({ fees_venue_scraped_at: nowIso })
        .in("id", attemptedTournamentIds);
      if (stamp.error && !isMissingCooldownColumnError(stamp.error.message)) throw new Error(stamp.error.message);
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
      `- cooldown_days: ${COOLDOWN_DAYS}`,
      `- pool_loaded: ${tournaments.length}`,
      `- skipped_recent: ${skipped_recent}`,
      `- skipped_pending: ${skipped_pending}`,
      `- selected: ${selected.length}`,
      `- attempted: ${attempted}`,
      `- pages_fetched: ${pagesFetched}`,
      `- unique_attrs: ${uniqueAttrs.length}`,
      `- unique_dates: ${uniqueDates.length}`,
      `- unique_venues: ${uniqueVenues.length}`,
      `- inserted_attrs: ${insertedAttrs}`,
      `- inserted_dates: ${insertedDates}`,
      `- inserted_venues: ${insertedVenues}`,
      `- skipped_duplicates: ${skippedDuplicates}`,
      `- csv: ${outPath}`,
    ].join("\n")
  );

  if (!APPLY) console.log("Run again with --apply to insert candidates.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
