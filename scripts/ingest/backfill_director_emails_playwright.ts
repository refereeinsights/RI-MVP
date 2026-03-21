import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

type TournamentRow = {
  id: string;
  name: string | null;
  sport: string | null;
  start_date: string | null;
  official_website_url: string | null;
  tournament_director_email: string | null;
};

type BackfillResult = {
  tournament_id: string;
  sport: string;
  tournament_name: string;
  start_date: string;
  official_website_url: string;
  found_email: string;
  applied: "yes" | "no";
  reason: string;
  fetched_urls: string;
};

const APPLY = process.argv.includes("--apply");
const HEADFUL = process.argv.includes("--headed") || process.argv.includes("--headful");
const REPORT_DOMAINS = process.argv.includes("--report-domains");
const HELP = process.argv.includes("--help") || process.argv.includes("-h");

const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : 200;
const OFFSET_ARG = process.argv.find((arg) => arg.startsWith("--offset="));
const OFFSET = OFFSET_ARG ? Number(OFFSET_ARG.split("=")[1]) : 0;

const SPORT_ARG = process.argv.find((arg) => arg.startsWith("--sport="));
const SPORT = (SPORT_ARG ? SPORT_ARG.split("=")[1] : "volleyball").trim().toLowerCase();

const DOMAINS_ARG = process.argv.find((arg) => arg.startsWith("--domains="));
const DOMAINS = new Set(
  (DOMAINS_ARG ? DOMAINS_ARG.split("=").slice(1).join("=") : "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
);

const PLACEHOLDER_EMAIL_VALUES = new Set(["null", "none", "n/a", "na", "unknown", "tbd", "-", "noreply", "no-reply"]);
const BLOCKED_EMAIL_DOMAINS = new Set<string>([
  "sentry-next.wixpress.com",
  "sentry.wixpress.com",
  "sentry.io",
  "wixpress.com",
  "teamtravelsource.com",
]);

const DEFAULT_ALLOWED_DOMAINS = new Set<string>([
  // Safe defaults; override via --domains=...
  "hubsportscenter.org",
]);

function printHelp() {
  console.log(
    [
      "Backfill tournament_director_email using Playwright (handles Cloudflare / JS-rendered sites better than fetch()).",
      "",
      "Usage:",
      "  node --import tsx scripts/ingest/backfill_director_emails_playwright.ts --report-domains",
      "  node --import tsx scripts/ingest/backfill_director_emails_playwright.ts --sport=volleyball --domains=hubsportscenter.org --limit=200",
      "  node --import tsx scripts/ingest/backfill_director_emails_playwright.ts --sport=volleyball --domains=hubsportscenter.org --limit=200 --apply",
      "",
      "Flags:",
      "  --report-domains   Print the top official_website_url domains in the selected range (no browser).",
      "  --domains=...      Comma-separated allowlist of domains to scrape. If omitted, uses a safe default list.",
      "  --apply            Write tournament_director_email back to Supabase (never overwrites existing non-empty values).",
      "  --headed           Run Chromium headed (useful if a site requires a human challenge).",
      "  --sport=...        Defaults to volleyball.",
      "  --limit=...        Defaults to 200.",
      "  --offset=...       Defaults to 0.",
      "",
      "Env required:",
      "  NEXT_PUBLIC_SUPABASE_URL",
      "  SUPABASE_SERVICE_ROLE_KEY",
      "",
      "Notes:",
      "- If Chromium isn't installed, run: npx playwright install chromium",
      "- Outputs a CSV report in /tmp.",
    ].join("\n")
  );
}

if (HELP) {
  printHelp();
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, key, { auth: { persistSession: false } });

function clean(value: string | null | undefined) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : "";
}

function normalizeDomain(value: string) {
  const v = value.trim().toLowerCase();
  return v.startsWith("www.") ? v.slice(4) : v;
}

function getDomainFromUrl(value: string) {
  try {
    return normalizeDomain(new URL(value).hostname);
  } catch {
    return "";
  }
}

function isValidEmail(value: string) {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (PLACEHOLDER_EMAIL_VALUES.has(v)) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return false;
  const local = v.split("@")[0] ?? "";
  const domain = v.split("@")[1] ?? "";
  if (PLACEHOLDER_EMAIL_VALUES.has(local)) return false;
  if (domain && BLOCKED_EMAIL_DOMAINS.has(normalizeDomain(domain))) return false;
  return true;
}

function scoreEmail(email: string) {
  const v = email.trim().toLowerCase();
  const local = v.split("@")[0] ?? "";
  let score = 0;
  if (/(tournament|director|event|scheduler)/.test(local)) score += 10;
  if (/(contact|info|admin|office|support|registrar)/.test(local)) score += 6;
  if (/(webmaster|privacy|abuse|donotreply|noreply|no-reply|sentry)/.test(local)) score -= 10;
  if (/\./.test(local)) score += 1;
  return score;
}

function extractEmailsFromText(text: string) {
  const emails = new Set<string>();
  const plain = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  for (const p of plain) {
    const cleaned = p.trim().toLowerCase();
    if (isValidEmail(cleaned)) emails.add(cleaned);
  }

  // Cloudflare Email Protection: <a class="__cf_email__" data-cfemail="...">[email&nbsp;protected]</a>
  // https://developers.cloudflare.com/fundamentals/reference/email-obfuscation/
  const cf = text.match(/data-cfemail=\"([0-9a-fA-F]+)\"/g) ?? [];
  for (const token of cf) {
    const m = token.match(/data-cfemail=\"([0-9a-fA-F]+)\"/);
    const hex = m?.[1] ?? "";
    const decoded = decodeCloudflareEmail(hex);
    if (decoded && isValidEmail(decoded)) emails.add(decoded.trim().toLowerCase());
  }

  return Array.from(emails);
}

function decodeCloudflareEmail(hex: string) {
  const cleanHex = (hex || "").trim().toLowerCase();
  if (cleanHex.length < 4 || cleanHex.length % 2 !== 0) return "";
  const bytes: number[] = [];
  for (let i = 0; i < cleanHex.length; i += 2) {
    const b = Number.parseInt(cleanHex.slice(i, i + 2), 16);
    if (!Number.isFinite(b)) return "";
    bytes.push(b);
  }
  const key = bytes[0] ?? 0;
  const out: number[] = [];
  for (const b of bytes.slice(1)) out.push(b ^ key);
  try {
    return String.fromCharCode(...out);
  } catch {
    return "";
  }
}

function toCsvRow(values: Record<string, string>) {
  const cols = Object.keys(values);
  const esc = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return cols.map((c) => esc(values[c] ?? "")).join(",");
}

function buildOutPath(sport: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join("/tmp", `ti_${sport}_backfill_director_emails_playwright_${stamp}.csv`);
}

async function loadMissingEmailTournaments() {
  const from = OFFSET;
  const to = OFFSET + Math.max(1, LIMIT) - 1;
  const { data, error } = await supabase
    .from("tournaments")
    .select("id,name,sport,start_date,official_website_url,tournament_director_email")
    .eq("sport", SPORT)
    .order("start_date", { ascending: true, nullsFirst: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as TournamentRow[];
  return rows.filter((row) => clean(row.tournament_director_email) === "");
}

async function runDomainReport(rows: TournamentRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const u = clean(row.official_website_url);
    const d = u ? getDomainFromUrl(u) : "";
    const key = d || "(missing_url)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  console.log(`Missing director emails (sport=${SPORT}) by official_website_url domain:`);
  for (const [domain, count] of sorted.slice(0, 60)) {
    console.log(`- ${domain}: ${count}`);
  }
}

async function main() {
  if (!Number.isFinite(LIMIT) || LIMIT <= 0) throw new Error("--limit must be a positive number");
  if (!Number.isFinite(OFFSET) || OFFSET < 0) throw new Error("--offset must be >= 0");

  const rows = await loadMissingEmailTournaments();
  if (rows.length === 0) {
    console.log(`No tournaments found for sport=${SPORT} missing tournament_director_email in the selected range.`);
    return;
  }

  if (REPORT_DOMAINS) {
    await runDomainReport(rows);
    return;
  }

  const allowedDomains = DOMAINS.size ? DOMAINS : DEFAULT_ALLOWED_DOMAINS;
  console.log(
    `Backfill director emails (Playwright): sport=${SPORT}, apply=${APPLY ? "yes" : "no"}, headed=${
      HEADFUL ? "yes" : "no"
    }, allowed_domains=${Array.from(allowedDomains).sort().join(",") || "(none)"}`
  );

  if (APPLY && allowedDomains.size === 0) {
    throw new Error("Refusing to run with --apply and no allowed domains. Pass --domains=example.com,other.com");
  }

  const browser = await chromium.launch({ headless: !HEADFUL });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (compatible; TI-DirectorEmailBackfill/1.0)",
  });

  let scanned = 0;
  let skippedDomain = 0;
  let missingUrl = 0;
  let navFailed = 0;
  let found = 0;
  let applied = 0;

  const results: BackfillResult[] = [];

  for (const row of rows) {
    scanned += 1;
    const officialUrl = clean(row.official_website_url);
    const domain = officialUrl ? getDomainFromUrl(officialUrl) : "";
    if (!officialUrl) {
      missingUrl += 1;
      results.push({
        tournament_id: row.id,
        sport: SPORT,
        tournament_name: clean(row.name) || row.id,
        start_date: clean(row.start_date),
        official_website_url: "",
        found_email: "",
        applied: "no",
        reason: "missing_official_website_url",
        fetched_urls: "",
      });
      continue;
    }

    if (!domain || !allowedDomains.has(domain)) {
      skippedDomain += 1;
      results.push({
        tournament_id: row.id,
        sport: SPORT,
        tournament_name: clean(row.name) || row.id,
        start_date: clean(row.start_date),
        official_website_url: officialUrl,
        found_email: "",
        applied: "no",
        reason: `skipped_domain:${domain || "unknown"}`,
        fetched_urls: "",
      });
      continue;
    }

    const fetchedUrls: string[] = [];
    const page = await context.newPage();
    try {
      fetchedUrls.push(officialUrl);
      const resp = await page.goto(officialUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      // Some challenges need extra time after DOMContentLoaded.
      try {
        await page.waitForLoadState("networkidle", { timeout: 15_000 });
      } catch {
        // ignore
      }

      const status = resp?.status() ?? 0;
      if (status >= 400 && status !== 404) {
        // 403 Cloudflare challenges may still contain content, but often need human solve.
        // We'll still try to extract emails from the rendered page.
      }

      // mailto first
      const mailtoEmails = await page
        .$eval("body", () => "")
        .then(async () => {
          const mails = await page.$$eval("a[href^='mailto:']", (els) =>
            els
              .map((el) => (el as HTMLAnchorElement).getAttribute("href") || "")
              .map((href) => href.replace(/^mailto:/i, "").split("?")[0] || "")
          );
          return mails;
        })
        .catch(() => []);

      const emails = new Set<string>();
      for (const e of mailtoEmails) {
        const cleaned = String(e || "").trim().toLowerCase();
        if (isValidEmail(cleaned)) emails.add(cleaned);
      }

      const content = await page.content().catch(() => "");
      for (const e of extractEmailsFromText(content)) emails.add(e);

      // Follow a same-domain contact-ish link if we didn't find anything.
      if (emails.size === 0) {
        const contactUrls = await page
          .$$eval("a[href]", (els) =>
            els
              .map((el) => (el as HTMLAnchorElement).getAttribute("href") || "")
              .filter(Boolean)
              .slice(0, 200)
          )
          .catch(() => []);

        const base = officialUrl;
        const baseDomain = domain;
        const candidates: string[] = [];
        for (const href of contactUrls) {
          const lower = href.toLowerCase();
          if (!/(contact|about|staff|directory)/.test(lower)) continue;
          if (lower.startsWith("mailto:") || lower.startsWith("tel:") || lower.startsWith("javascript:")) continue;
          try {
            const resolved = new URL(href, base).toString();
            const d = getDomainFromUrl(resolved);
            if (d && d === baseDomain) candidates.push(resolved);
          } catch {
            // ignore
          }
        }
        const follow = Array.from(new Set(candidates)).slice(0, 2);
        for (const u of follow) {
          fetchedUrls.push(u);
          const r2 = await page.goto(u, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => null);
          try {
            await page.waitForLoadState("networkidle", { timeout: 10_000 });
          } catch {
            // ignore
          }
          if (r2) {
            const c2 = await page.content().catch(() => "");
            for (const e of extractEmailsFromText(c2)) emails.add(e);
            const mail2 = await page
              .$$eval("a[href^='mailto:']", (els) =>
                els
                  .map((el) => (el as HTMLAnchorElement).getAttribute("href") || "")
                  .map((href) => href.replace(/^mailto:/i, "").split("?")[0] || "")
              )
              .catch(() => []);
            for (const e of mail2) {
              const cleaned = String(e || "").trim().toLowerCase();
              if (isValidEmail(cleaned)) emails.add(cleaned);
            }
          }
        }
      }

      const uniqueEmails = Array.from(emails).filter(isValidEmail);
      if (uniqueEmails.length === 0) {
        results.push({
          tournament_id: row.id,
          sport: SPORT,
          tournament_name: clean(row.name) || row.id,
          start_date: clean(row.start_date),
          official_website_url: officialUrl,
          found_email: "",
          applied: "no",
          reason: "no_email_found",
          fetched_urls: fetchedUrls.join(" "),
        });
        continue;
      }

      uniqueEmails.sort((a, b) => scoreEmail(b) - scoreEmail(a));
      const best = uniqueEmails[0]!;
      found += 1;

      let didApply: "yes" | "no" = "no";
      let reason = "found_email";

      if (APPLY) {
        const { error } = await supabase
          .from("tournaments")
          .update({ tournament_director_email: best })
          .eq("id", row.id)
          .is("tournament_director_email", null);

        if (error) {
          const { error: error2 } = await supabase
            .from("tournaments")
            .update({ tournament_director_email: best })
            .eq("id", row.id)
            .eq("tournament_director_email", "");
          if (error2) {
            reason = `apply_failed:${error2.message}`;
          } else {
            didApply = "yes";
            applied += 1;
          }
        } else {
          didApply = "yes";
          applied += 1;
        }
      }

      results.push({
        tournament_id: row.id,
        sport: SPORT,
        tournament_name: clean(row.name) || row.id,
        start_date: clean(row.start_date),
        official_website_url: officialUrl,
        found_email: best,
        applied: didApply,
        reason,
        fetched_urls: fetchedUrls.join(" "),
      });
    } catch (err: any) {
      navFailed += 1;
      results.push({
        tournament_id: row.id,
        sport: SPORT,
        tournament_name: clean(row.name) || row.id,
        start_date: clean(row.start_date),
        official_website_url: officialUrl,
        found_email: "",
        applied: "no",
        reason: `nav_failed:${String(err?.message || err || "unknown")}`,
        fetched_urls: fetchedUrls.join(" "),
      });
    } finally {
      await page.close().catch(() => {});
    }
  }

  await context.close();
  await browser.close();

  const outPath = buildOutPath(SPORT);
  const header = Object.keys({
    tournament_id: "",
    sport: "",
    tournament_name: "",
    start_date: "",
    official_website_url: "",
    found_email: "",
    applied: "",
    reason: "",
    fetched_urls: "",
  });
  const lines = [header.join(",")];
  for (const r of results) {
    lines.push(
      toCsvRow({
        tournament_id: r.tournament_id,
        sport: r.sport,
        tournament_name: r.tournament_name,
        start_date: r.start_date,
        official_website_url: r.official_website_url,
        found_email: r.found_email,
        applied: r.applied,
        reason: r.reason,
        fetched_urls: r.fetched_urls,
      })
    );
  }
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");

  console.log("");
  console.log("Done.");
  console.log(`- scanned: ${scanned}`);
  console.log(`- skipped_domain: ${skippedDomain}`);
  console.log(`- missing_official_url: ${missingUrl}`);
  console.log(`- nav_failed: ${navFailed}`);
  console.log(`- found_email: ${found}`);
  console.log(`- applied: ${applied}`);
  console.log(`- csv: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
