import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";
import { extractFromPage } from "../../apps/referee/src/server/enrichment/extract";
import type { DateCandidate } from "../../apps/referee/src/server/enrichment/types";

type DraftRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  official_website_url: string | null;
  source_url: string | null;
  url_fingerprint: string | null;
  name_url_fingerprint: string | null;
  name_state_season_fingerprint: string | null;
  venue: string | null;
  address: string | null;
  zip: string | null;
  summary: string | null;
  tournament_director: string | null;
  tournament_director_email: string | null;
};

type ExistingRow = {
  id: string;
  status: string;
  official_website_url: string | null;
  source_url: string | null;
  venue: string | null;
  address: string | null;
  zip: string | null;
  end_date: string | null;
  summary: string | null;
  tournament_director: string | null;
  tournament_director_email: string | null;
};

type DateCandidateRow = {
  id: string;
  tournament_id: string;
  start_date: string | null;
  end_date: string | null;
  confidence: number | null;
  accepted_at: string | null;
  rejected_at: string | null;
};

const HELP = process.argv.includes("--help") || process.argv.includes("-h");
const APPLY = process.argv.includes("--apply");

const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : 200;

const DATE_CONF_ARG = process.argv.find((arg) => arg.startsWith("--date_conf="));
const DATE_CONF = DATE_CONF_ARG ? Number(DATE_CONF_ARG.split("=")[1]) : 0.75;

function printHelp() {
  console.log(
    [
      "Triage RI draft tournament uploads:",
      "- Detect draft duplicates against published/stale tournaments (by url/name fingerprints)",
      "- Backfill missing dates by scraping and applying best date candidates",
      "",
      "Usage:",
      "  TMPDIR=./tmp node --import tsx scripts/ops/triage_draft_uploads.ts [--limit=200] [--date_conf=0.75]",
      "  TMPDIR=./tmp node --import tsx scripts/ops/triage_draft_uploads.ts --apply [--limit=200] [--date_conf=0.75]",
      "",
      "Env required:",
      "  NEXT_PUBLIC_SUPABASE_URL",
      "  SUPABASE_SERVICE_ROLE_KEY",
      "",
      "Notes:",
      "- Writes a CSV report to /tmp.",
      "- --apply performs DB updates; otherwise it is read-only (but still scrapes external pages via fetch()).",
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

function nowIso() {
  return new Date().toISOString();
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  if (!isHttpUrl(url)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-cache",
      signal: controller.signal,
      headers: { "user-agent": "RI-DraftUpload-Triage/1.0", accept: "text/html,application/xhtml+xml" },
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) return null;
    const text = await resp.text();
    if (!text) return null;
    return text.slice(0, 1024 * 1024);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function pickBestDateCandidate(candidates: DateCandidate[], minConfidence: number): DateCandidate | null {
  const withStart = candidates.filter((c) => !isBlank(c.start_date));
  withStart.sort((a, b) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0));
  const best = withStart[0] ?? null;
  if (!best) return null;
  if (Number(best.confidence ?? 0) < minConfidence) return null;
  return best;
}

function extractYearFromName(name: string): number | null {
  const m = String(name ?? "").match(/\b(20\d{2})\b/);
  if (!m?.[1]) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

function isPlausibleDateForDraft(args: { draftName: string; start_date: string | null; end_date: string | null }) {
  const start = clean(args.start_date);
  if (!start) return false;
  const y = Number(start.slice(0, 4));
  if (!Number.isFinite(y)) return false;

  const targetYear = extractYearFromName(args.draftName);
  const nowYear = new Date().getUTCFullYear();
  const minYear = nowYear - 1;
  const maxYear = nowYear + 2;
  if (targetYear != null) {
    if (y !== targetYear) return false;
  } else {
    if (y < minYear || y > maxYear) return false;
  }

  const end = clean(args.end_date) || start;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;
  if (endMs < startMs) return false;
  const days = (endMs - startMs) / (1000 * 60 * 60 * 24);
  if (days > 10) return false;
  return true;
}

function findDateLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const $ = cheerio.load(html);
  const keyword = /(date|dates|schedule|calendar|event|events|tournament|register|registration)/i;
  const out = new Set<string>();
  $("a[href]").each((_idx, el) => {
    const hrefRaw = ($(el).attr("href") || "").trim();
    if (!hrefRaw) return;
    if (hrefRaw.startsWith("mailto:") || hrefRaw.startsWith("tel:") || hrefRaw.startsWith("javascript:")) return;
    const anchorText = ($(el).text() || "").trim();
    if (!keyword.test(`${hrefRaw} ${anchorText}`)) return;
    try {
      const abs = new URL(hrefRaw, base).toString();
      const parsed = new URL(abs);
      if (parsed.hostname !== base.hostname) return;
      parsed.hash = "";
      out.add(parsed.toString());
    } catch {
      return;
    }
  });
  return Array.from(out).slice(0, 4);
}

async function extractBestDatesFromUrl(args: { url: string; minConfidence: number }) {
  const html = await fetchHtml(args.url);
  if (!html) return { best: null as DateCandidate | null, source_url: args.url, evidence_text: "" };
  const page1 = extractFromPage(html, args.url);
  const best1 = pickBestDateCandidate(page1.dates, args.minConfidence);
  if (best1) return { best: best1, source_url: args.url, evidence_text: best1.evidence_text ?? "" };

  const links = findDateLinks(html, args.url);
  for (const link of links) {
    const html2 = await fetchHtml(link);
    if (!html2) continue;
    const page2 = extractFromPage(html2, link);
    const best2 = pickBestDateCandidate(page2.dates, args.minConfidence);
    if (best2) return { best: best2, source_url: link, evidence_text: best2.evidence_text ?? "" };
  }

  return { best: null as DateCandidate | null, source_url: args.url, evidence_text: "" };
}

function buildOutPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join("/tmp", `ri_draft_upload_triage_${stamp}.csv`);
}

function toCsvRow(values: Record<string, string>) {
  const cols = Object.keys(values);
  const esc = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return cols.map((c) => esc(values[c] ?? "")).join(",");
}

async function main() {
  if (HELP) {
    printHelp();
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const outPath = buildOutPath();
  const report: Array<Record<string, string>> = [];
  const pushReport = (row: Record<string, string>) => report.push(row);

  const safeLimit = Number.isFinite(LIMIT) ? Math.max(1, Math.min(5000, Math.floor(LIMIT))) : 200;

  const { data: draftsRaw, error: draftsErr } = await supabase
    .from("tournaments")
    .select(
      [
        "id",
        "name",
        "city",
        "state",
        "start_date",
        "end_date",
        "official_website_url",
        "source_url",
        "url_fingerprint",
        "name_url_fingerprint",
        "name_state_season_fingerprint",
        "venue",
        "address",
        "zip",
        "summary",
        "tournament_director",
        "tournament_director_email",
      ].join(",")
    )
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(safeLimit);
  if (draftsErr) throw new Error(draftsErr.message);
  const drafts = (draftsRaw ?? []) as DraftRow[];

  let scannedDrafts = 0;
  let duplicateMatched = 0;
  let duplicateArchived = 0;
  let duplicatePatchedExisting = 0;
  let dateMissing = 0;
  let dateCandidatesQueued = 0;
  let dateApplied = 0;

  const patchExistingFromDraft = async (args: { draft: DraftRow; existing: ExistingRow }) => {
    const { draft, existing } = args;
    const patch: Record<string, any> = {};
    const mergeField = (field: keyof ExistingRow, value: unknown) => {
      const current = (existing as any)[field];
      if (!isBlank(current) || isBlank(value)) return;
      patch[field as string] = value;
      (existing as any)[field] = value;
    };

    mergeField("official_website_url", clean(draft.official_website_url) || null);
    mergeField("source_url", clean(draft.source_url) || null);
    mergeField("tournament_director_email", clean(draft.tournament_director_email) || null);
    mergeField("tournament_director", clean(draft.tournament_director) || null);
    mergeField("end_date", clean(draft.end_date) || null);
    mergeField("zip", clean(draft.zip) || null);
    mergeField("summary", clean(draft.summary) || null);
    mergeField("venue", clean(draft.venue) || null);
    mergeField("address", clean(draft.address) || null);

    if (Object.keys(patch).length) {
      if (APPLY) {
        const { error } = await supabase.from("tournaments").update(patch).eq("id", existing.id);
        if (error) throw new Error(error.message);
      }
      duplicatePatchedExisting += 1;
    }

    const archiveNote = `Merged into ${existing.id}.`;
    const archivedSummary = clean(draft.summary) ? `${clean(draft.summary)}\n\n${archiveNote}` : archiveNote;
    if (APPLY) {
      const { error } = await supabase
        .from("tournaments")
        .update({ status: "archived", summary: archivedSummary })
        .eq("id", draft.id);
      if (error) throw new Error(error.message);
    }
    duplicateArchived += 1;
    pushReport({
      kind: "duplicate_archived",
      draft_id: draft.id,
      existing_id: existing.id,
      name: clean(draft.name),
      city: clean(draft.city),
      state: clean(draft.state),
      start_date: clean(draft.start_date),
      end_date: clean(draft.end_date),
      url: clean(draft.official_website_url) || clean(draft.source_url),
      detail: Object.keys(patch).length ? `patched_existing:${Object.keys(patch).join("|")}` : "no_patch",
    });
  };

  for (const draft of drafts) {
    scannedDrafts += 1;

    const urlFp = clean(draft.url_fingerprint);
    const nameUrlFp = clean(draft.name_url_fingerprint);
    const nameSeasonFp = clean(draft.name_state_season_fingerprint);

    let existingRows: ExistingRow[] = [];
    let matchType = "";

    if (urlFp) {
      const { data, error } = await supabase
        .from("tournaments")
        .select(
          "id,status,official_website_url,source_url,venue,address,zip,end_date,summary,tournament_director,tournament_director_email"
        )
        .eq("url_fingerprint", urlFp)
        .in("status", ["published", "stale"])
        .limit(5);
      if (error) throw new Error(error.message);
      existingRows = (data ?? []) as ExistingRow[];
      matchType = "url_fingerprint";
    }

    if (existingRows.length === 0 && nameUrlFp) {
      const { data, error } = await supabase
        .from("tournaments")
        .select(
          "id,status,official_website_url,source_url,venue,address,zip,end_date,summary,tournament_director,tournament_director_email"
        )
        .eq("name_url_fingerprint", nameUrlFp)
        .in("status", ["published", "stale"])
        .limit(5);
      if (error) throw new Error(error.message);
      existingRows = (data ?? []) as ExistingRow[];
      matchType = "name_url_fingerprint";
    }

    if (existingRows.length === 0 && nameSeasonFp) {
      let query = supabase
        .from("tournaments")
        .select(
          "id,status,official_website_url,source_url,venue,address,zip,end_date,summary,tournament_director,tournament_director_email"
        )
        .eq("name_state_season_fingerprint", nameSeasonFp)
        .in("status", ["published", "stale"])
        .limit(5);
      if (!isBlank(draft.city)) query = query.eq("city", draft.city);
      if (!isBlank(draft.state)) query = query.eq("state", draft.state);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      existingRows = (data ?? []) as ExistingRow[];
      matchType = "name_state_season_fingerprint";
    }

    if (existingRows.length === 1) {
      duplicateMatched += 1;
      const existing = existingRows[0]!;
      if (APPLY) {
        await patchExistingFromDraft({ draft, existing });
      } else {
        pushReport({
          kind: "duplicate_candidate",
          draft_id: draft.id,
          existing_id: existing.id,
          name: clean(draft.name),
          city: clean(draft.city),
          state: clean(draft.state),
          start_date: clean(draft.start_date),
          end_date: clean(draft.end_date),
          url: clean(draft.official_website_url) || clean(draft.source_url),
          detail: `match:${matchType}`,
        });
      }
      continue;
    }

    if (existingRows.length > 1) {
      pushReport({
        kind: "duplicate_ambiguous",
        draft_id: draft.id,
        existing_id: "",
        name: clean(draft.name),
        city: clean(draft.city),
        state: clean(draft.state),
        start_date: clean(draft.start_date),
        end_date: clean(draft.end_date),
        url: clean(draft.official_website_url) || clean(draft.source_url),
        detail: `match:${matchType}:count=${existingRows.length}`,
      });
    }
  }

  // Date enrichment + apply for drafts missing dates.
  const dateTargetIds = drafts
    .filter((d) => isBlank(d.start_date) && isBlank(d.end_date))
    .map((d) => d.id)
    .slice(0, safeLimit);
  dateMissing = dateTargetIds.length;

  for (const tournamentId of dateTargetIds) {
    const draft = drafts.find((d) => d.id === tournamentId) ?? null;
    const urlToFetch = clean(draft?.official_website_url) || clean(draft?.source_url);
    if (!urlToFetch) continue;

    const extracted = await extractBestDatesFromUrl({ url: urlToFetch, minConfidence: DATE_CONF });
    dateCandidatesQueued += 1;
    const best = extracted.best;
    if (!best) continue;
    if (!draft?.name) continue;
    if (!isPlausibleDateForDraft({ draftName: draft.name, start_date: best.start_date ?? null, end_date: best.end_date ?? null }))
      continue;

    if (!APPLY) {
      pushReport({
        kind: "date_candidate",
        draft_id: tournamentId,
        existing_id: "",
        name: clean(draft?.name),
        city: clean(draft?.city),
        state: clean(draft?.state),
        start_date: clean(best.start_date),
        end_date: clean(best.end_date),
        url: extracted.source_url,
        detail: `confidence=${Number(best.confidence ?? 0).toFixed(2)}`,
      });
      continue;
    }

    // Be conservative when auto-applying: only auto-apply when the tournament name includes an explicit year
    // (e.g. "2026") and the candidate matches it (enforced by isPlausibleDateForDraft()).
    if (extractYearFromName(draft.name) == null) {
      pushReport({
        kind: "date_candidate",
        draft_id: tournamentId,
        existing_id: "",
        name: clean(draft?.name),
        city: clean(draft?.city),
        state: clean(draft?.state),
        start_date: clean(best.start_date),
        end_date: clean(best.end_date),
        url: extracted.source_url,
        detail: `skipped_apply:no_year_token confidence=${Number(best.confidence ?? 0).toFixed(2)}`,
      });
      continue;
    }

    const { data: tRow, error: tErr } = await supabase
      .from("tournaments" as any)
      .select("start_date,end_date")
      .eq("id", tournamentId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!isBlank(tRow?.start_date) || !isBlank(tRow?.end_date)) continue;

    const start = clean(best.start_date) || null;
    const end = clean(best.end_date) || start;
    if (!start) continue;

    const { error: updErr } = await supabase
      .from("tournaments" as any)
      .update({ start_date: start, end_date: end, updated_at: nowIso() })
      .eq("id", tournamentId);
    if (updErr) throw new Error(updErr.message);

    // Create an accepted candidate row for traceability.
    await supabase.from("tournament_date_candidates" as any).insert({
      tournament_id: tournamentId,
      date_text: clean(best.date_text) || null,
      start_date: start,
      end_date: end,
      source_url: extracted.source_url,
      evidence_text: clean(extracted.evidence_text) || clean(best.evidence_text) || null,
      confidence: best.confidence ?? null,
      accepted_at: nowIso(),
    });

    dateApplied += 1;
    pushReport({
      kind: "date_applied",
      draft_id: tournamentId,
      existing_id: "",
      name: clean(draft?.name),
      city: clean(draft?.city),
      state: clean(draft?.state),
      start_date: start,
      end_date: end ?? "",
      url: extracted.source_url,
      detail: `confidence=${Number(best.confidence ?? 0).toFixed(2)}`,
    });
  }

  const header = Object.keys({
    kind: "",
    draft_id: "",
    existing_id: "",
    name: "",
    city: "",
    state: "",
    start_date: "",
    end_date: "",
    url: "",
    detail: "",
  });
  const lines = [header.join(",")];
  for (const r of report) {
    lines.push(
      toCsvRow({
        kind: r.kind ?? "",
        draft_id: r.draft_id ?? "",
        existing_id: r.existing_id ?? "",
        name: r.name ?? "",
        city: r.city ?? "",
        state: r.state ?? "",
        start_date: r.start_date ?? "",
        end_date: r.end_date ?? "",
        url: r.url ?? "",
        detail: r.detail ?? "",
      })
    );
  }
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");

  console.log("");
  console.log("Done.");
  console.log(`- apply: ${APPLY ? "yes" : "no"}`);
  console.log(`- drafts_loaded: ${drafts.length}`);
  console.log(`- duplicates_matched: ${duplicateMatched}`);
  console.log(`- duplicates_archived: ${duplicateArchived}`);
  console.log(`- existing_patched: ${duplicatePatchedExisting}`);
  console.log(`- missing_dates: ${dateMissing}`);
  console.log(`- date_pages_scraped: ${dateCandidatesQueued}`);
  console.log(`- dates_applied: ${dateApplied}`);
  console.log(`- csv: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
