import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

type DraftRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  official_website_url: string | null;
  source_url: string | null;
  start_date: string | null;
  end_date: string | null;
  venue: string | null;
  address: string | null;
  team_fee: string | null;
  level: string | null;
  summary: string | null;
};

const HELP = process.argv.includes("--help") || process.argv.includes("-h");
const APPLY = process.argv.includes("--apply");

const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : 50;

function printHelp() {
  console.log(
    [
      "Fix USSSA draft uploads that use directory URLs like .../events/ by resolving to a specific .../event/... page.",
      "- Uses the tournament city/state to pick the unique matching event in the directory listing.",
      "- Updates the draft row with url/name/dates/venue/address/fee/level when high-confidence.",
      "- Rejects any prior pending enrichment candidates for that tournament (to avoid wrong suggestions).",
      "",
      "Usage:",
      "  TMPDIR=./tmp node --import tsx scripts/ops/fix_usssa_directory_drafts.ts [--limit=50]",
      "  TMPDIR=./tmp node --import tsx scripts/ops/fix_usssa_directory_drafts.ts --apply [--limit=50]",
      "",
      "Env required:",
      "  NEXT_PUBLIC_SUPABASE_URL",
      "  SUPABASE_SERVICE_ROLE_KEY",
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

function normalizeLower(value: unknown) {
  return clean(value).toLowerCase();
}

function buildOutPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join("/tmp", `ri_usssa_fix_directory_drafts_${stamp}.csv`);
}

function toCsvRow(values: Record<string, string>) {
  const cols = Object.keys(values);
  const esc = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return cols.map((c) => esc(values[c] ?? "")).join(",");
}

function isEventsDirectoryUrl(url: string) {
  const u = clean(url);
  return /\/events\/?$/i.test(u);
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
      headers: { "user-agent": "RI-USSSA-FixDirectoryDrafts/1.0", accept: "text/html,application/xhtml+xml" },
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

function parseEventJsonLd($: cheerio.CheerioAPI) {
  const scripts = $("script[type='application/ld+json']").toArray().slice(0, 24);
  for (const script of scripts) {
    const raw = clean($(script).html() || "");
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
      if (!type.includes("event")) continue;

      const start = clean(item.startDate);
      const end = clean(item.endDate);
      const venueName = clean(item?.location?.name);
      const street = clean(item?.location?.address?.streetAddress);
      const priceRaw = clean(item?.offers?.price);

      const price = priceRaw && /^\d+(\.\d+)?$/.test(priceRaw) ? `$${Number(priceRaw).toFixed(0)}` : null;
      const startIso = start ? new Date(start).toISOString().slice(0, 10) : null;
      const endIso = end ? new Date(end).toISOString().slice(0, 10) : null;

      return {
        name: clean(item.name) || null,
        start_date: startIso,
        end_date: endIso ?? startIso,
        venue: venueName || null,
        street_address: street || null,
        team_fee: price,
      };
    }
  }
  return null;
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

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: draftsRaw, error: draftsErr } = await supabase
    .from("tournaments" as any)
    .select("id,name,city,state,official_website_url,source_url,start_date,end_date,venue,address,team_fee,level,summary")
    .eq("status", "draft")
    .or("official_website_url.ilike.%usssa.%,source_url.ilike.%usssa.%")
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (draftsErr) throw new Error(draftsErr.message);
  const drafts = (draftsRaw ?? []) as DraftRow[];

  const targets = drafts
    .filter((d) => isEventsDirectoryUrl(d.official_website_url ?? d.source_url ?? ""))
    .slice(0, LIMIT);

  const outPath = buildOutPath();
  const report: Array<Record<string, string>> = [];

  let scanned = 0;
  let updated = 0;
  let rejectedCandidates = 0;

  for (const draft of targets) {
    scanned += 1;
    const seedUrl = clean(draft.official_website_url) || clean(draft.source_url);
    const city = clean(draft.city);
    const state = clean(draft.state).toUpperCase();

    if (!seedUrl || !city || state.length !== 2) {
      report.push({
        tournament_id: draft.id,
        name: clean(draft.name) || draft.id,
        seed_url: seedUrl,
        status: "skip_missing_city_state",
        event_url: "",
      });
      continue;
    }

    const html = await fetchHtml(seedUrl);
    if (!html) {
      report.push({
        tournament_id: draft.id,
        name: clean(draft.name) || draft.id,
        seed_url: seedUrl,
        status: "fetch_failed",
        event_url: "",
      });
      continue;
    }

    const $ = cheerio.load(html);
    const matches: Array<{ title: string; href: string; meta: string[] }> = [];
    $(".events-item-wrapper").each((_idx, wrap) => {
      const title = clean($(wrap).find(".events-list-elem-title a").first().text() || "");
      const href = clean($(wrap).find(".events-list-elem-title a").first().attr("href") || "");
      const list = $(wrap)
        .find(".events-list-elem-list li")
        .toArray()
        .map((li) => clean($(li).text() || ""));
      const loc = list.find((t) => /,\s*[A-Z]{2}$/.test(t));
      if (!loc) return;
      if (normalizeLower(loc) !== normalizeLower(`${city}, ${state}`)) return;
      if (!href || !/^https?:\/\//i.test(href)) return;
      const meta = $(wrap)
        .find(".events-list-elem-info li")
        .toArray()
        .map((li) => clean($(li).text() || ""))
        .filter(Boolean);
      matches.push({ title, href, meta });
    });

    if (matches.length !== 1) {
      report.push({
        tournament_id: draft.id,
        name: clean(draft.name) || draft.id,
        seed_url: seedUrl,
        status: matches.length ? `ambiguous_${matches.length}` : "no_match",
        event_url: matches[0]?.href ?? "",
      });
      continue;
    }

    const eventUrl = matches[0].href;
    const eventHtml = await fetchHtml(eventUrl);
    if (!eventHtml) {
      report.push({
        tournament_id: draft.id,
        name: clean(draft.name) || draft.id,
        seed_url: seedUrl,
        status: "event_fetch_failed",
        event_url: eventUrl,
      });
      continue;
    }

    const $e = cheerio.load(eventHtml);
    const j = parseEventJsonLd($e);
    if (!j?.start_date || !j?.end_date) {
      report.push({
        tournament_id: draft.id,
        name: clean(draft.name) || draft.id,
        seed_url: seedUrl,
        status: "event_no_jsonld",
        event_url: eventUrl,
      });
      continue;
    }

    const patch: Record<string, unknown> = {};
    // Always narrow the official URL from /events/ -> /event/... for this high-confidence match.
    patch.official_website_url = eventUrl;

    // Preserve original title for review.
    const originalName = clean(draft.name);
    const nextName = clean(j.name) ? `${clean(j.name)} ${j.start_date.slice(0, 4)}` : originalName;
    if (nextName && nextName !== originalName) patch.name = nextName;

    if (isBlank(draft.start_date)) patch.start_date = j.start_date;
    if (isBlank(draft.end_date)) patch.end_date = j.end_date;
    if (isBlank(draft.venue) && clean(j.venue)) patch.venue = j.venue;
    if (clean(j.street_address)) patch.address = j.street_address;
    if (isBlank(draft.team_fee) && clean(j.team_fee)) patch.team_fee = j.team_fee;

    const levelText = matches[0].meta?.[0] ? "" : "";
    // Level often appears in the directory listing "10U - 14U" but JSON-LD doesn't include it.
    const listText = clean(
      $(".events-item-wrapper")
        .find(`a[href='${eventUrl}']`)
        .closest(".events-item-wrapper")
        .find(".events-list-elem-list li")
        .toArray()
        .map((li) => clean($(li).text() || ""))
        .join(" | ")
    );
    void levelText;
    const inferredLevel = listText.match(/\b(\d{1,2}U\s*-\s*\d{1,2}U)\b/i)?.[1] ?? null;
    if (isBlank(draft.level) && inferredLevel) patch.level = inferredLevel.replace(/\s+/g, " ");

    // Put a note in summary so reviewers know what changed.
    const note = `USSSA: resolved directory URL to event page ${eventUrl}.`;
    const priorNameNote = originalName && patch.name ? `Original upload name: ${originalName}.` : "";
    const priorUrlNote = seedUrl && seedUrl !== eventUrl ? `Original URL: ${seedUrl}.` : "";
    const nextSummary = [clean(draft.summary), note, priorNameNote, priorUrlNote].filter(Boolean).join("\n");
    if (nextSummary !== clean(draft.summary)) patch.summary = nextSummary;

    if (APPLY) {
      const upd = await supabase.from("tournaments" as any).update(patch).eq("id", draft.id);
      if (upd.error) throw new Error(upd.error.message);

      const nowIso = new Date().toISOString();
      const reject = async (table: string) => {
        const res = await supabase
          .from(table as any)
          .update({ rejected_at: nowIso })
          .eq("tournament_id", draft.id)
          .is("accepted_at", null)
          .is("rejected_at", null);
        if (res.error) throw new Error(res.error.message);
        // PostgREST doesn't return count by default; do a best-effort head count.
      };
      await reject("tournament_venue_candidates");
      await reject("tournament_date_candidates");
      await reject("tournament_attribute_candidates");
      rejectedCandidates += 1;

      updated += 1;
    }

    report.push({
      tournament_id: draft.id,
      name: clean(draft.name) || draft.id,
      seed_url: seedUrl,
      status: APPLY ? "updated" : "dry_run_updated",
      event_url: eventUrl,
    });
  }

  const cols = ["tournament_id", "name", "seed_url", "status", "event_url"];
  fs.writeFileSync(outPath, `${cols.join(",")}\n${report.map((r) => toCsvRow(r)).join("\n")}\n`, "utf8");

  console.log(
    [
      "",
      "Done.",
      `- apply: ${APPLY ? "yes" : "no"}`,
      `- scanned: ${scanned}`,
      `- updated: ${updated}`,
      `- rejected_candidates_tournaments: ${rejectedCandidates}`,
      `- csv: ${outPath}`,
    ].join("\n")
  );

  if (!APPLY) console.log("Run again with --apply to write updates.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

