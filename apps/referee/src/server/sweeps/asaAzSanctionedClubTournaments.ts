import * as cheerio from "cheerio";
import { upsertTournamentFromSource } from "@/lib/tournaments/upsertFromSource";
import { buildTournamentSlug } from "@/lib/tournaments/slug";
import { normalizeSourceUrl } from "@/lib/normalizeSourceUrl";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { TournamentRow, TournamentStatus } from "@/lib/types/tournament";
import { queueEnrichmentJobs } from "@/server/enrichment/pipeline";
import { SweepError } from "@/server/admin/sweepDiagnostics";

const ASA_URL = "https://azsoccerassociation.org/sanctioned-club-tournaments/";
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DATE_PATTERN =
  /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{1,2}(?:\s*[-–]\s*\d{1,2})?(?:,?\s*20\d{2})?/i;

const REG_HINTS = [
  { key: "gotsport", match: /(gotsport\.com|got soccer)/i },
  { key: "sportsengine", match: /(sportsengine\.com|sportsengineplay\.com)/i },
  { key: "leagueapps", match: /leagueapps\.com/i },
  { key: "tourneymachine", match: /(tourneymachine\.com|tournamentmachine\.com)/i },
  { key: "eventconnect", match: /eventconnect\.io/i },
  { key: "aes", match: /advancedeventsystems\.com/i },
  { key: "exposure", match: /(exposureevents\.com|exposure basketball)/i },
  { key: "rankone", match: /rankone\.com/i },
  { key: "tournamentscheduler", match: /tournamentscheduler\.com/i },
];

export type AsaTournamentRecord = {
  source_url: string;
  month_label: string | null;
  season_year: number | null;
  tournament_name: string;
  hosting_club: string | null;
  date_range_text: string | null;
  age_groups_text: string | null;
  tournament_director_text: string | null;
  director_is_suspect: boolean;
  tournament_website_url: string | null;
  city: string | null;
  state: string | null;
  scraped_at_iso: string;
  extracted_contacts_emails: string[];
  extracted_contacts_phones: string[];
  extracted_contact_names: string[];
  registration_hints: string[];
};

export type AsaSweepResult = {
  records: AsaTournamentRecord[];
  imported_ids: string[];
  counts: {
    found: number;
    with_website: number;
    with_email: number;
    with_phone: number;
  };
  sample: AsaTournamentRecord[];
};

function matchMonthLabel(text: string) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  for (const month of MONTHS) {
    if (trimmed.toLowerCase().startsWith(month.toLowerCase())) {
      const yearMatch = trimmed.match(/\b(20\d{2})\b/);
      return { label: trimmed, year: yearMatch ? Number(yearMatch[1]) : null };
    }
  }
  return null;
}

function normalizeHeader(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractText($el: cheerio.Cheerio<any>) {
  return $el.text().replace(/\s+/g, " ").trim();
}

function parseCityState(raw: string | null) {
  if (!raw) return { city: null, state: null };
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const match = cleaned.match(/([A-Za-z .'-]{2,})\s*,\s*([A-Z]{2})\b/);
  if (match) {
    return { city: match[1].trim(), state: match[2].trim() };
  }
  return { city: cleaned || null, state: null };
}

function parseDateRange(raw: string | null, monthLabel: string | null): { start: string | null; end: string | null } {
  if (!raw) return { start: null, end: null };
  const text = raw.replace(/\s+/g, " ").trim();
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const fallbackYear = yearMatch ? Number(yearMatch[1]) : monthLabel?.match(/\b(20\d{2})\b/)?.[1];

  const monthRegex = new RegExp(`(${MONTHS.map((m) => m.slice(0, 3)).join("|")})`, "i");
  const rangeMatch = text.match(
    new RegExp(
      `${monthRegex.source}\\s*(\\d{1,2})(?:\\s*[-–]\\s*(?:${monthRegex.source}\\s*)?(\\d{1,2}))?`,
      "i"
    )
  );

  if (!rangeMatch) return { start: null, end: null };
  const monthToken = rangeMatch[1];
  const startDay = rangeMatch[2];
  const endDay = rangeMatch[3] || rangeMatch[2];
  const monthIdx = MONTHS.findIndex((m) => m.toLowerCase().startsWith(monthToken.toLowerCase()));
  if (monthIdx < 0) return { start: null, end: null };
  const year = fallbackYear ? Number(fallbackYear) : null;
  if (!year) return { start: null, end: null };
  const mm = String(monthIdx + 1).padStart(2, "0");
  const start = `${year}-${mm}-${String(Number(startDay)).padStart(2, "0")}`;
  const end = `${year}-${mm}-${String(Number(endDay)).padStart(2, "0")}`;
  return { start, end };
}

function isSuspectDirector(text: string | null) {
  if (!text) return true;
  const lowered = text.toLowerCase();
  return lowered.includes("total tournament time") || lowered.includes("tbd") || lowered.includes("tba") || lowered === "-";
}

function uniqueList(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = value.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function safeNormalizeUrl(raw: string) {
  try {
    const canonical = normalizeSourceUrl(raw).canonical;
    if (!canonical.startsWith("http://") && !canonical.startsWith("https://")) return null;
    return canonical;
  } catch {
    return null;
  }
}

function extractEmails(html: string) {
  const emails = new Set<string>();
  const mailtos = html.match(/mailto:([^"'>?\s]+)/gi) || [];
  for (const entry of mailtos) {
    const val = entry.replace(/mailto:/i, "").trim();
    if (val.includes("@")) emails.add(val);
  }
  const rawMatches = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  rawMatches.forEach((m) => emails.add(m));

  const obfuscated = html.match(/[A-Z0-9._%+-]+\s*(\(|\[)?\s*(at|\@)\s*(\)|\])?\s*[A-Z0-9.-]+\s*(\(|\[)?\s*(dot|\.)\s*(\)|\])?\s*[A-Z]{2,}/gi) || [];
  for (const entry of obfuscated) {
    const cleaned = entry
      .replace(/\s*(\(|\[)?\s*(at|\@)\s*(\)|\])?\s*/gi, "@")
      .replace(/\s*(\(|\[)?\s*(dot|\.)\s*(\)|\])?\s*/gi, ".")
      .replace(/\s+/g, "")
      .trim();
    if (cleaned.includes("@")) emails.add(cleaned);
  }
  return Array.from(emails);
}

function extractPhones(html: string) {
  const phones = new Set<string>();
  const matches = html.match(/(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g) || [];
  for (const match of matches) {
    phones.add(match.trim());
  }
  return Array.from(phones);
}

function extractContactNames(html: string) {
  const names: string[] = [];
  const regex = /(director|coordinator|contact|manager|staff)[^<\n]{0,80}/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    const window = match[0];
    const nameMatch = window.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}/);
    if (nameMatch) names.push(nameMatch[0]);
  }
  return names;
}

function detectRegistrationHints(url: string, html: string) {
  const hints = new Set<string>();
  const host = url.toLowerCase();
  for (const hint of REG_HINTS) {
    if (hint.match.test(host) || hint.match.test(html)) hints.add(hint.key);
  }
  return Array.from(hints);
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const resp = await fetch(url, {
      headers: { "user-agent": "RI-ASA-Sweep/1.0" },
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichTournament(url: string) {
  const html = await fetchText(url);
  if (!html) {
    return {
      emails: [],
      phones: [],
      names: [],
      hints: [],
      date_hint: null as string | null,
    };
  }
  const emails = extractEmails(html);
  const phones = extractPhones(html);
  const names = extractContactNames(html);
  const hints = detectRegistrationHints(url, html);
  const dateHint = findDateInText(html);

  const $ = cheerio.load(html);
  const contactLink = $("a")
    .filter((_, el) => $(el).text().toLowerCase().includes("contact"))
    .first();
  const href = contactLink.attr("href");
  if (href) {
    try {
      const nextUrl = new URL(href, url).toString();
      if (new URL(nextUrl).hostname === new URL(url).hostname) {
        const contactHtml = await fetchText(nextUrl);
        if (contactHtml) {
          extractEmails(contactHtml).forEach((val) => emails.push(val));
          extractPhones(contactHtml).forEach((val) => phones.push(val));
          extractContactNames(contactHtml).forEach((val) => names.push(val));
          detectRegistrationHints(nextUrl, contactHtml).forEach((val) => hints.push(val));
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    emails: uniqueList(emails),
    phones: uniqueList(phones),
    names: uniqueList(names),
    hints: uniqueList(hints),
    date_hint: dateHint,
  };
}

function parseTableLayout(html: string): AsaTournamentRecord[] {
  const $ = cheerio.load(html);
  const records: AsaTournamentRecord[] = [];
  const nowIso = new Date().toISOString();

  const headers = $("h1,h2,h3,h4,h5,h6")
    .filter((_, el) => !!matchMonthLabel($(el).text()))
    .toArray();

  const seenTables = new Set<any>();
  for (const header of headers) {
    const monthInfo = matchMonthLabel($(header).text());
    if (!monthInfo) continue;
    const monthLabel = monthInfo.label;
    let cursor = $(header).next();
    while (cursor.length) {
      if (cursor.is("h1,h2,h3,h4,h5,h6") && matchMonthLabel(cursor.text())) break;
      if (cursor.is("table")) {
        const tableEl = cursor.get(0);
        if (!seenTables.has(tableEl)) {
          seenTables.add(tableEl);
          records.push(...parseTable($, cursor, monthLabel, monthInfo.year, nowIso));
        }
      }
      cursor = cursor.next();
    }
  }

  if (!records.length) {
    const fallbackTables = $("table").toArray();
    for (const table of fallbackTables) {
      if (seenTables.has(table)) continue;
      records.push(...parseTable($, $(table), null, null, nowIso));
    }
  }

  return records;
}

function parseTable(
  $: cheerio.CheerioAPI,
  $table: cheerio.Cheerio<any>,
  monthLabel: string | null,
  seasonYear: number | null,
  nowIso: string
) {
  const records: AsaTournamentRecord[] = [];
  const rows = $table.find("tr").toArray();
  if (!rows.length) return records;

  const headerCells = $(rows[0]).find("th,td").toArray();
  const headers = headerCells.map((cell) => normalizeHeader($(cell).text()));

  const idx = {
    name: headers.findIndex((h) => h.includes("tournament") && h.includes("name")),
    dates: headers.findIndex((h) => h.includes("date")),
    host: headers.findIndex((h) => h.includes("host") || h.includes("club")),
    ages: headers.findIndex((h) => h.includes("age")),
    director: headers.findIndex((h) => h.includes("director")),
    website: headers.findIndex((h) => h.includes("website")),
    location: headers.findIndex((h) => h.includes("location") || h.includes("city")),
  };

  for (let i = 1; i < rows.length; i += 1) {
    const cells = $(rows[i]).find("td");
    if (!cells.length) continue;

    const getCell = (index: number) => {
      if (index < 0) return "";
      return extractText(cells.eq(index));
    };

    const name = getCell(idx.name) || extractText(cells.eq(0));
    if (!name) continue;

    const dateRange = getCell(idx.dates);
    const host = getCell(idx.host);
    const ages = getCell(idx.ages);
    const director = getCell(idx.director);
    const location = getCell(idx.location);

    let website = "";
    if (idx.website >= 0) {
      const cell = cells.eq(idx.website);
      const link = cell.find("a").first();
      website = link.attr("href") || extractText(cell);
    }

    if (!website) {
      const link = $(rows[i])
        .find("a")
        .filter((_, el) => $(el).text().toLowerCase().includes("website"))
        .first();
      website = link.attr("href") || "";
    }

    const normalizedWebsite = website ? safeNormalizeUrl(website) : null;
    const { city, state } = parseCityState(location);

    records.push({
      source_url: ASA_URL,
      month_label: monthLabel,
      season_year: seasonYear,
      tournament_name: name,
      hosting_club: host || null,
      date_range_text: dateRange || null,
      age_groups_text: ages || null,
      tournament_director_text: director || null,
      director_is_suspect: isSuspectDirector(director || null),
      tournament_website_url: normalizedWebsite,
      city,
      state: state || "AZ",
      scraped_at_iso: nowIso,
      extracted_contacts_emails: [],
      extracted_contacts_phones: [],
      extracted_contact_names: [],
      registration_hints: [],
    });
  }

  return records;
}

function splitLines(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function linesFromHtml(html: string) {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]*>/g, "");
  return splitLines(stripped);
}

function linesFromColumn($col: cheerio.Cheerio<any>) {
  const strongs = $col
    .find("strong")
    .map((_, el) => $col.find(el).text().trim())
    .get()
    .filter(Boolean);
  if (strongs.length) return strongs;
  const html = $col.html() || "";
  return linesFromHtml(html);
}

function findDateInText(text: string) {
  const match = text.match(DATE_PATTERN);
  return match ? match[0].trim() : null;
}

function buildRecordFromLines(params: {
  lines: string[];
  monthLabel: string | null;
  seasonYear: number | null;
  nowIso: string;
  website: string | null;
}) {
  let lines = params.lines.filter((line) => !/tournament website/i.test(line));
  if (lines.length === 1) {
    const expanded = lines[0]
      .replace(/(Age Groups?:)/i, "\n$1")
      .replace(/(Director:)/i, "\n$1")
      .replace(/((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\s*\\d{1,2}(?:\\s*[-–]\\s*\\d{1,2})?)/i, "\n$1");
    lines = splitLines(expanded);
  }
  if (!lines.length) return null;

  let director: string | null = null;
  const cleaned: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if (lower.includes("tournament director") || lower.startsWith("director")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx !== -1 && line.slice(colonIdx + 1).trim()) {
        director = line.slice(colonIdx + 1).trim();
      } else if (lines[i + 1]) {
        director = lines[i + 1].trim();
        i += 1;
      }
      continue;
    }
    cleaned.push(line);
  }

  const datePattern = DATE_PATTERN;
  let nameLine =
    cleaned.find((line) => !/age groups?|director|dates?/i.test(line)) ??
    cleaned[0] ??
    "";
  if (datePattern.test(nameLine)) {
    nameLine = nameLine.replace(datePattern, "").replace(/\\s{2,}/g, " ").trim();
  }
  const name = nameLine;
  if (!name) return null;

  const dateLine =
    cleaned.find(
      (line) =>
        /\\b(20\\d{2})\\b/.test(line) ||
        /\\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\b/i.test(line) ||
        /dates?:/i.test(line)
    ) ?? null;
  let resolvedDateLine = dateLine;
  if (!resolvedDateLine) {
    const inline = cleaned.find((line) => datePattern.test(line));
    if (inline) {
      const match = inline.match(datePattern);
      resolvedDateLine = match ? match[0] : inline;
    }
  }
  const ageLine = cleaned.find((line) => /age groups?|ages?/i.test(line)) ?? null;

  let host: string | null = null;
  for (let i = 1; i < cleaned.length; i += 1) {
    const line = cleaned[i];
    if (line === dateLine || line === ageLine) continue;
    if (/tournament director|director/i.test(line)) continue;
    host = line;
    break;
  }

  return {
    source_url: ASA_URL,
    month_label: params.monthLabel,
    season_year: params.seasonYear,
    tournament_name: name,
    hosting_club: host || null,
    date_range_text: resolvedDateLine,
    age_groups_text: ageLine,
    tournament_director_text: director,
    director_is_suspect: isSuspectDirector(director),
    tournament_website_url: params.website,
    city: null,
    state: "AZ",
    scraped_at_iso: params.nowIso,
    extracted_contacts_emails: [],
    extracted_contacts_phones: [],
    extracted_contact_names: [],
    registration_hints: [],
} satisfies AsaTournamentRecord;
}

function parseBlockLayout(html: string): AsaTournamentRecord[] {
  const $ = cheerio.load(html);
  const records: AsaTournamentRecord[] = [];
  const nowIso = new Date().toISOString();

  const headers = $("h1,h2,h3,h4,h5,h6")
    .filter((_, el) => !!matchMonthLabel($(el).text()))
    .toArray();

  for (const header of headers) {
    const monthInfo = matchMonthLabel($(header).text());
    if (!monthInfo) continue;
    let cursor = $(header).next();
    let buffer: string[] = [];

    while (cursor.length) {
      if (cursor.is("h1,h2,h3,h4,h5,h6") && matchMonthLabel(cursor.text())) break;

      const anchors: any[] = [];
      if (cursor.is("a")) anchors.push(cursor.get(0));
      cursor.find("a").each((_, el) => {
        anchors.push(el);
      });

      const text = cursor.clone().find("a").remove().end().text();
      if (text) buffer.push(...splitLines(text));

      for (const anchor of anchors) {
        const anchorText = $(anchor).text().toLowerCase();
        if (!anchorText.includes("tournament website")) continue;
        const href = $(anchor).attr("href") || "";
        const website = safeNormalizeUrl(href);
        const record = buildRecordFromLines({
          lines: buffer,
          monthLabel: monthInfo.label,
          seasonYear: monthInfo.year,
          nowIso,
          website,
        });
        if (record) records.push(record);
        buffer = [];
      }
      cursor = cursor.next();
    }
  }

  return records;
}

function parseColumnsLayout(html: string): AsaTournamentRecord[] {
  const $ = cheerio.load(html);
  const records: AsaTournamentRecord[] = [];
  const nowIso = new Date().toISOString();

  $(".wp-block-columns").each((_, columns) => {
    const $columns = $(columns);
    const header = $columns.prevAll("h1,h2,h3,h4,h5,h6").filter((_, el) => !!matchMonthLabel($(el).text())).first();
    const monthInfo = header.length ? matchMonthLabel(header.text()) : null;

    let textCol: cheerio.Cheerio<any> | null = null;
    let linkCol: cheerio.Cheerio<any> | null = null;

    $columns.find(".wp-block-column").each((_, col) => {
      const $col = $(col);
      const text = $col.text().toLowerCase();
      const links = $col
        .find("a[href]")
        .map((_, el) => $(el).attr("href") || "")
        .get()
        .filter(Boolean);
      const externalLinks = links.filter((href) => {
        const lower = href.toLowerCase();
        return lower.startsWith("http") && !lower.includes("azsoccerassociation.org");
      });
      if (externalLinks.length > 0) linkCol = $col;
      if (
        !textCol &&
        (text.includes("director") ||
          text.includes("age group") ||
          /u\\d{1,2}/i.test(text) ||
          /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\\b/i.test(text))
      ) {
        textCol = $col;
      }
    });

    if (!textCol || !linkCol) return;

    const rawHtml = textCol.html() || "";
    let lines = linesFromColumn(textCol);
    if (!lines.some((line) => DATE_PATTERN.test(line))) {
      const rawText = rawHtml.replace(/<[^>]*>/g, " ");
      const dateHint = findDateInText(rawText);
      if (dateHint) {
        lines = [...lines, dateHint];
      }
    }
    const link = linkCol.find("a[href]").filter((_, el) => {
      const href = $(el).attr("href") || "";
      const lower = href.toLowerCase();
      return lower.startsWith("http") && !lower.includes("azsoccerassociation.org");
    }).first();
    const href = link.attr("href") || "";
    const website = safeNormalizeUrl(href);

    if (!lines.length || !website) return;

    const record = buildRecordFromLines({
      lines,
      monthLabel: monthInfo?.label ?? null,
      seasonYear: monthInfo?.year ?? null,
      nowIso,
      website,
    });
    if (record) records.push(record);
  });

  return records;
}

function parseGlobalAnchors(html: string): AsaTournamentRecord[] {
  const $ = cheerio.load(html);
  const nowIso = new Date().toISOString();
  const records: AsaTournamentRecord[] = [];
  const seen = new Set<string>();
  const isLikelyExternal = (href: string) => {
    const lower = href.toLowerCase();
    if (!lower.startsWith("http")) return false;
    if (lower.includes("azsoccerassociation.org")) return false;
    if (lower.includes("facebook.com") || lower.includes("instagram.com") || lower.includes("twitter.com") || lower.includes("youtube.com")) return false;
    return true;
  };

  const containers = $("p,div,section,article,li,td,tr")
    .filter((_, el) => {
      const text = $(el).text().toLowerCase();
      return (
        text.includes("tournament website") ||
        text.includes("tournament director") ||
        text.includes("age group") ||
        text.includes("age groups") ||
        /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\\b/i.test(text)
      );
    })
    .toArray();

  for (const container of containers) {
    const $container = $(container);
    const anchors = $container.find("a").toArray();
    if (!anchors.length) continue;
    const text = $container.clone().find("a").remove().end().text();
    const lines = splitLines(text);
    const monthHint = matchMonthLabel($("h1,h2,h3,h4,h5,h6").first().text()) ?? null;

    for (const anchor of anchors) {
      const href = $(anchor).attr("href") || "";
      if (!isLikelyExternal(href)) continue;
      const website = safeNormalizeUrl(href);
      if (!website) continue;
      if (seen.has(website)) continue;
      seen.add(website);
      const record = buildRecordFromLines({
        lines,
        monthLabel: monthHint?.label ?? null,
        seasonYear: monthHint?.year ?? null,
        nowIso,
        website,
      });
      if (record) records.push(record);
    }
  }

  if (!records.length) {
    const anchors = $("a").filter((_, el) => $(el).text().toLowerCase().includes("tournament website"));
    anchors.each((_, el) => {
      const href = $(el).attr("href") || "";
      const website = safeNormalizeUrl(href);
      const container = $(el).closest("p,div,section,article,li").first();
      const text = container.clone().find("a").remove().end().text();
      const lines = splitLines(text);
      const record = buildRecordFromLines({
        lines,
        monthLabel: matchMonthLabel($("h1,h2,h3,h4,h5,h6").first().text())?.label ?? null,
        seasonYear: matchMonthLabel($("h1,h2,h3,h4,h5,h6").first().text())?.year ?? null,
        nowIso,
        website,
      });
      if (record) records.push(record);
    });
  }
  return records;
}

function parseAsaRecords(html: string): AsaTournamentRecord[] {
  const tableRecords = parseTableLayout(html);
  if (tableRecords.length) return tableRecords;
  const columnsRecords = parseColumnsLayout(html);
  if (columnsRecords.length) return columnsRecords;
  const blockRecords = parseBlockLayout(html);
  if (blockRecords.length) return blockRecords;
  return parseGlobalAnchors(html);
}

async function enrichRecords(records: AsaTournamentRecord[]) {
  const withWebsite = records.filter((record) => record.tournament_website_url);
  const limit = 2;
  let index = 0;
  const tasks = new Array(limit).fill(0).map(async () => {
    while (index < withWebsite.length) {
      const current = withWebsite[index];
      index += 1;
      await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 500));
      const enriched = await enrichTournament(current.tournament_website_url!);
      current.extracted_contacts_emails = enriched.emails;
      current.extracted_contacts_phones = enriched.phones;
      current.extracted_contact_names = enriched.names;
      current.registration_hints = enriched.hints;
      if (!current.date_range_text && enriched.date_hint) {
        current.date_range_text = enriched.date_hint;
      }
    }
  });
  await Promise.all(tasks);
}

export async function sweepAsaAzSanctionedClubTournaments(params: {
  html: string;
  status: TournamentStatus;
  writeDb?: boolean;
}): Promise<AsaSweepResult> {
  const records = parseAsaRecords(params.html);
  if (!records.length) {
    throw new SweepError("html_received_no_events", "ASA page parsed but no tournaments found", {});
  }

  await enrichRecords(records);

  const counts = {
    found: records.length,
    with_website: records.filter((r) => r.tournament_website_url).length,
    with_email: records.filter((r) => r.extracted_contacts_emails.length).length,
    with_phone: records.filter((r) => r.extracted_contacts_phones.length).length,
  };

  const imported_ids: string[] = [];
  if (params.writeDb) {
    for (const record of records) {
      const { start, end } = parseDateRange(record.date_range_text, record.month_label);
      const slug = buildTournamentSlug({
        name: record.tournament_name,
        city: record.city ?? undefined,
        state: record.state ?? undefined,
      });
      const sourceEventId = record.tournament_website_url
        ? record.tournament_website_url
        : `${record.tournament_name}|${record.date_range_text ?? ""}|${record.month_label ?? ""}`;

      const row: TournamentRow = {
        name: record.tournament_name,
        slug,
        sport: "soccer",
        level: record.hosting_club ?? null,
        sub_type: "admin",
        ref_cash_tournament: false,
        state: record.state ?? "AZ",
        city: record.city ?? "Unknown",
        venue: null,
        address: null,
        start_date: start,
        end_date: end ?? start,
        summary: "Arizona Soccer Association sanctioned club tournament listing.",
        status: params.status,
        source: "external_crawl",
        source_event_id: sourceEventId,
        source_url: ASA_URL,
        source_domain: "azsoccerassociation.org",
        raw: {
          ...record,
          parsed_start_date: start,
          parsed_end_date: end,
        },
      };

      const tournamentId = await upsertTournamentFromSource(row);
      imported_ids.push(tournamentId);

      if (record.tournament_website_url || record.tournament_director_text) {
        await supabaseAdmin
          .from("tournaments" as any)
          .update({
            official_website_url: record.tournament_website_url ?? null,
            tournament_director: record.tournament_director_text ?? null,
          })
          .eq("id", tournamentId);
      }
    }

    if (imported_ids.length) {
      await queueEnrichmentJobs(imported_ids);
    }

    // Backfill state for any existing ASA tournaments (accepted/published or draft) missing AZ.
    await supabaseAdmin
      .from("tournaments" as any)
      .update({ state: "AZ" })
      .eq("source_url", ASA_URL)
      .or("state.is.null,state.eq.")
      .select("id");
  }

  return {
    records,
    imported_ids,
    counts,
    sample: records.slice(0, 5),
  };
}

export function isAsaAzUrl(rawUrl: string) {
  const { canonical } = normalizeSourceUrl(rawUrl);
  const normalized = canonical.replace(/\/+$/, "");
  return normalized === ASA_URL.replace(/\/+$/, "");
}

export function getAsaAzUrl() {
  return ASA_URL;
}
