import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

type Row = {
  id: string;
  status: string | null;
  name: string | null;
  source_url: string | null;
  official_website_url: string | null;
  updated_at: string | null;
};

const APPLY = process.argv.includes("--apply");
const HELP = process.argv.includes("--help") || process.argv.includes("-h");

const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : 500;
const OFFSET_ARG = process.argv.find((arg) => arg.startsWith("--offset="));
const OFFSET = OFFSET_ARG ? Number(OFFSET_ARG.split("=")[1]) : 0;

function loadEnvLocalIfMissing() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2] || "";
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function clean(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : "";
}

function isBlank(value: unknown) {
  return !clean(value);
}

function normalizeUrl(raw: string): string | null {
  const v = clean(raw);
  if (!v) return null;
  try {
    const url = new URL(v);
    if (!/^https?:$/i.test(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isPerfectGameUrl(raw: unknown) {
  const v = normalizeUrl(String(raw ?? ""));
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.hostname.toLowerCase().endsWith("perfectgame.org");
  } catch {
    return false;
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  const input = normalizeUrl(url);
  if (!input) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const resp = await fetch(input, {
      method: "GET",
      redirect: "follow",
      cache: "no-cache",
      signal: controller.signal,
      headers: { "user-agent": "RI-PGNWOfficialUrl/1.0", accept: "text/html,application/xhtml+xml" },
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) return null;
    const html = await resp.text();
    if (!html) return null;
    return html.slice(0, 1024 * 1024);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractPerfectGameOfficialUrlFromHtml(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);

  const candidates: string[] = [];
  $("a[href]").each((_idx, el) => {
    const hrefRaw = clean($(el).attr("href") || "");
    if (!hrefRaw) return;
    let abs: string | null = null;
    try {
      abs = new URL(hrefRaw, base).toString();
    } catch {
      return;
    }
    if (!abs) return;
    if (!isPerfectGameUrl(abs)) return;
    if (!/GroupedEvents\.aspx\?gid=\d+|Events\/Default\.aspx\?event=\d+|Events\/Locations\.aspx\?event=\d+/i.test(abs)) return;
    candidates.push(abs);
  });

  // Prefer GroupedEvents gid pages (registration/schedules).
  const grouped = candidates.find((u) => /GroupedEvents\.aspx\?gid=\d+/i.test(u));
  if (grouped) return grouped;

  // Fallback to the first event page.
  const event = candidates.find((u) => /Events\/Default\.aspx\?event=\d+/i.test(u));
  if (event) return event;

  // Last resort: locations page.
  const loc = candidates.find((u) => /Events\/Locations\.aspx\?event=\d+/i.test(u));
  return loc ?? null;
}

function buildOutPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join("/tmp", `ri_pgnw_official_url_update_${stamp}.csv`);
}

function toCsvRow(values: Record<string, string>) {
  const cols = Object.keys(values);
  const esc = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return cols.map((c) => esc(values[c] ?? "")).join(",");
}

function printHelp() {
  console.log(
    [
      "Update official_website_url for draft upload tournaments whose name starts with PGNW and whose source_url points at PerfectGame.",
      "",
      "Usage:",
      "  TMPDIR=./tmp node --import tsx scripts/ops/update_pgnw_official_urls.ts [--limit=500] [--offset=0]",
      "  TMPDIR=./tmp node --import tsx scripts/ops/update_pgnw_official_urls.ts --apply [--limit=500] [--offset=0]",
      "",
      "Env required:",
      "  NEXT_PUBLIC_SUPABASE_URL",
      "  SUPABASE_SERVICE_ROLE_KEY",
    ].join("\n")
  );
}

async function main() {
  if (HELP) {
    printHelp();
    return;
  }

  if (!Number.isFinite(LIMIT) || LIMIT <= 0) throw new Error("--limit must be positive");
  if (!Number.isFinite(OFFSET) || OFFSET < 0) throw new Error("--offset must be >= 0");

  loadEnvLocalIfMissing();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const outPath = buildOutPath();
  const report: Array<Record<string, string>> = [];

  const { data, error } = await supabase
    .from("tournaments" as any)
    .select("id,status,name,source_url,official_website_url,updated_at")
    .eq("status", "draft")
    .ilike("name", "PGNW%")
    .order("updated_at", { ascending: false })
    .range(OFFSET, OFFSET + LIMIT - 1);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Row[];

  let scanned = 0;
  let eligible = 0;
  let updated = 0;
  let skipped = 0;
  let fetched = 0;

  for (const row of rows) {
    scanned += 1;
    const sourceUrl = normalizeUrl(clean(row.source_url)) ?? "";
    const officialUrl = normalizeUrl(clean(row.official_website_url)) ?? "";

    if (officialUrl && isPerfectGameUrl(officialUrl)) {
      report.push({
        tournament_id: row.id,
        name: clean(row.name) || row.id,
        status: clean(row.status),
        action: "already_set",
        source_url: sourceUrl,
        official_website_url_before: officialUrl,
        official_website_url_after: officialUrl,
      });
      continue;
    }

    // Resolve the PerfectGame official URL.
    let nextOfficial: string | null = null;
    if (sourceUrl && isPerfectGameUrl(sourceUrl)) {
      nextOfficial = sourceUrl;
    } else if (sourceUrl) {
      const html = await fetchHtml(sourceUrl);
      if (html) {
        fetched += 1;
        nextOfficial = extractPerfectGameOfficialUrlFromHtml(html, sourceUrl);
      }
    }

    if (!nextOfficial) {
      skipped += 1;
      report.push({
        tournament_id: row.id,
        name: clean(row.name) || row.id,
        status: clean(row.status),
        action: "skipped_no_perfectgame_link_found",
        source_url: sourceUrl,
        official_website_url_before: officialUrl,
        official_website_url_after: officialUrl,
      });
      continue;
    }

    eligible += 1;

    // Override official website to the PerfectGame URL.
    const patch = { official_website_url: nextOfficial };

    if (!APPLY) {
      updated += 1;
      report.push({
        tournament_id: row.id,
        name: clean(row.name) || row.id,
        status: clean(row.status),
        action: "dry_run_update",
        source_url: sourceUrl,
        official_website_url_before: officialUrl,
        official_website_url_after: nextOfficial,
      });
      continue;
    }

    const { error: updErr } = await supabase.from("tournaments" as any).update(patch).eq("id", row.id);
    if (updErr) {
      report.push({
        tournament_id: row.id,
        name: clean(row.name) || row.id,
        status: clean(row.status),
        action: "update_failed",
        source_url: sourceUrl,
        official_website_url_before: officialUrl,
        official_website_url_after: nextOfficial,
        error: updErr.message.slice(0, 200),
      });
      continue;
    }

    updated += 1;
    report.push({
      tournament_id: row.id,
      name: clean(row.name) || row.id,
      status: clean(row.status),
      action: "updated",
      source_url: sourceUrl,
      official_website_url_before: officialUrl,
      official_website_url_after: nextOfficial,
    });
  }

  const header = Object.keys({
    tournament_id: "",
    name: "",
    status: "",
    action: "",
    source_url: "",
    official_website_url_before: "",
    official_website_url_after: "",
    error: "",
  });
  const rowsCsv = [
    header.join(","),
    ...report.map((r) =>
      toCsvRow(
        header.reduce(
          (acc, k) => {
            acc[k] = String(r[k] ?? "");
            return acc;
          },
          {} as Record<string, string>
        )
      )
    ),
  ].join("\n");
  fs.writeFileSync(outPath, rowsCsv);

  console.log(
    [
      "",
      "Done.",
      `- apply: ${APPLY ? "yes" : "no"}`,
      `- scanned: ${scanned}`,
      `- eligible: ${eligible}`,
      `- fetched: ${fetched}`,
      `- updated: ${updated}`,
      `- skipped: ${skipped}`,
      `- csv: ${outPath}`,
    ].join("\n")
  );
}

main().catch((err) => {
  console.error("Error:", err?.message || err);
  process.exit(1);
});
