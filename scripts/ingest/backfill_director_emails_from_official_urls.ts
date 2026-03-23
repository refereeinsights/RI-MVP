import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type TournamentRow = {
  id: string;
  name: string | null;
  sport: string | null;
  start_date: string | null;
  official_website_url: string | null;
  tournament_director: string | null;
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

// Safe defaults - expand via --domains=... once we decide the source list.
const DEFAULT_ALLOWED_DOMAINS = new Set<string>([
  "cevaregion.org",
  "rmrvolleyball.org",
  "usavolleyball.org",
  "jvavolleyball.org",
  "aauvolleyball.org",
  "ncva.com",
]);

const PLACEHOLDER_EMAIL_VALUES = new Set(["null", "none", "n/a", "na", "unknown", "tbd", "-", "noreply", "no-reply"]);
const BLOCKED_EMAIL_DOMAINS = new Set<string>([
  // Common false-positives / monitoring or platform addresses that are not actual tournament contacts.
  "sentry-next.wixpress.com",
  "sentry.wixpress.com",
  "sentry.io",
  "wixpress.com",
  "teamtravelsource.com",
]);

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

function decodeBasicHtmlEntities(input: string) {
  const text = String(input ?? "");
  const named: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&quot;": '"',
    "&#34;": '"',
    "&apos;": "'",
    "&#39;": "'",
    "&lt;": "<",
    "&gt;": ">",
  };
  let out = text.replace(/&(nbsp|amp|quot|apos|lt|gt);|&#(?:34|39);/g, (m) => named[m] ?? m);
  out = out
    .replace(/&#x([0-9a-fA-F]+);/g, (_full, hex) => {
      const n = Number.parseInt(String(hex), 16);
      if (!Number.isFinite(n)) return _full;
      try {
        return String.fromCharCode(n);
      } catch {
        return _full;
      }
    })
    .replace(/&#([0-9]{1,6});/g, (_full, dec) => {
      const n = Number.parseInt(String(dec), 10);
      if (!Number.isFinite(n)) return _full;
      try {
        return String.fromCharCode(n);
      } catch {
        return _full;
      }
    });
  return out;
}

function stripHtmlTags(input: string) {
  return String(input ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function extractObfuscatedEmailsFromText(text: string): string[] {
  const out = new Set<string>();
  const t = normalizeDomain(normalizeDomain(decodeBasicHtmlEntities(text)).replace(/\s+/g, " "));

  // Examples:
  // - john [at] example [dot] org
  // - john(at)example(dot)org
  // - john at example dot org
  const pattern =
    /\b([a-z0-9._%+-]{1,64})\s*(?:\(|\[)?\s*(?:at)\s*(?:\)|\])?\s*([a-z0-9.-]{1,190})\s*(?:\(|\[)?\s*(?:dot)\s*(?:\)|\])?\s*([a-z]{2,24})(\b|\s)/gi;
  for (const m of t.matchAll(pattern)) {
    const local = (m[1] ?? "").trim();
    const domainLeft = (m[2] ?? "").trim().replace(/\s+/g, "");
    const tld = (m[3] ?? "").trim();
    const candidate = `${local}@${domainLeft}.${tld}`.toLowerCase();
    if (isValidEmail(candidate)) out.add(candidate);
  }

  return Array.from(out);
}

function printHelp() {
  // NOTE: In some CI/sandbox environments, tsx needs TMPDIR pointed at a writable directory.
  // Example: TMPDIR=/tmp npx tsx scripts/ingest/backfill_director_emails_from_official_urls.ts --report-domains
  console.log(
    [
      "Backfill tournament_director_email by scraping official_website_url pages for emails.",
      "",
      "Usage:",
      "  TMPDIR=/tmp npx tsx scripts/ingest/backfill_director_emails_from_official_urls.ts [--sport=volleyball] [--limit=200] [--offset=0] [--report-domains]",
      "  TMPDIR=/tmp npx tsx scripts/ingest/backfill_director_emails_from_official_urls.ts --sport=volleyball --domains=cevaregion.org,rmrvolleyball.org --limit=200",
      "  TMPDIR=/tmp npx tsx scripts/ingest/backfill_director_emails_from_official_urls.ts --sport=volleyball --domains=cevaregion.org,rmrvolleyball.org --limit=200 --apply",
      "",
      "Flags:",
      "  --report-domains   Print the top official_website_url domains in the selected range (no scraping).",
      "  --domains=...      Comma-separated allowlist of domains to scrape. If omitted, uses a safe default list.",
      "  --apply            Write tournament_director_email back to Supabase (never overwrites existing non-empty values).",
      "  --sport=...        Defaults to volleyball.",
      "  --limit=...        Defaults to 200.",
      "  --offset=...       Defaults to 0.",
      "",
      "Env required for Supabase access:",
      "  NEXT_PUBLIC_SUPABASE_URL",
      "  SUPABASE_SERVICE_ROLE_KEY",
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
  if (/(contact|info|admin|office|support)/.test(local)) score += 6;
  if (/(webmaster|privacy|abuse|donotreply|noreply|no-reply)/.test(local)) score -= 10;
  // Prefer personal-ish emails over catch-all only slightly; we can refine later.
  if (/\./.test(local)) score += 1;
  return score;
}

function extractEmailsFromHtml(html: string) {
  const emails = new Set<string>();

  const variants: Array<unknown> = [html, decodeBasicHtmlEntities(html)];
  for (const vHtmlRaw of variants) {
    const vHtml = String(vHtmlRaw ?? "");
    // mailto:
    const mailtos = vHtml.match(/mailto:([^\s"'<>]+)/gi) ?? [];
    for (const m of mailtos) {
      const raw = m.replace(/^mailto:/i, "").split("?")[0] ?? "";
      const cleaned = raw.trim().toLowerCase();
      if (isValidEmail(cleaned)) emails.add(cleaned);
    }

    // Cloudflare Email Protection
    const cfTokens = vHtml.match(/data-cfemail\s*=\s*["']?([0-9a-fA-F]+)["']?/g) ?? [];
    for (const token of cfTokens) {
      const m = token.match(/data-cfemail\s*=\s*["']?([0-9a-fA-F]+)["']?/i);
      const hex = m?.[1] ?? "";
      const decoded = decodeCloudflareEmail(hex);
      const cleaned = decoded.trim().toLowerCase();
      if (decoded && isValidEmail(cleaned)) emails.add(cleaned);
    }
    const cfLinks = vHtml.match(/\/cdn-cgi\/l\/email-protection#([0-9a-fA-F]+)/g) ?? [];
    for (const token of cfLinks) {
      const m = token.match(/email-protection#([0-9a-fA-F]+)/i);
      const hex = m?.[1] ?? "";
      const decoded = decodeCloudflareEmail(hex);
      const cleaned = decoded.trim().toLowerCase();
      if (decoded && isValidEmail(cleaned)) emails.add(cleaned);
    }

    // plain text
    const plain = vHtml.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
    for (const p of plain) {
      const cleaned = p.trim().toLowerCase();
      if (isValidEmail(cleaned)) emails.add(cleaned);
    }

    // common obfuscations: name (at) domain (dot) tld, etc
    const asText = stripHtmlTags(vHtml);
    for (const ob of extractObfuscatedEmailsFromText(asText)) emails.add(ob);
  }

  return Array.from(emails);
}

function extractContactUrls(html: string, baseUrl: string) {
  const out: string[] = [];
  const baseDomain = getDomainFromUrl(baseUrl);
  if (!baseDomain) return out;

  // Find contact-ish links. IMPORTANT: only scan anchors, not <link href=...> assets.
  // Also avoid overly broad keywords (like "tournament") which match theme assets on many sites.
  const keyword = /(contact|contact-us|contacts|about|about-us|staff|directory|board|officials|officers|commissioner)/i;
  const isAssetHref = (href: string) =>
    /\.(?:css|js|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot|map|pdf)(?:\?|#|$)/i.test(href) ||
    /\/wp-content\/|\/wp-includes\//i.test(href);

  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const raw = (m?.[1] ?? "").trim();
    if (!raw) continue;
    const normalized = raw.toLowerCase();
    if (!keyword.test(normalized)) continue;
    if (normalized.startsWith("mailto:") || normalized.startsWith("tel:") || normalized.startsWith("javascript:"))
      continue;
    if (isAssetHref(normalized)) continue;
    try {
      const resolved = new URL(raw, baseUrl).toString();
      const domain = getDomainFromUrl(resolved);
      if (!domain || domain !== baseDomain) continue;
      out.push(resolved);
    } catch {
      // ignore
    }
  }

  // De-dupe while preserving order.
  return Array.from(new Set(out)).slice(0, 3);
}

type FetchedHtml = {
  status: number;
  html: string;
};

async function fetchHtml(url: string): Promise<FetchedHtml | null> {
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-cache",
      headers: { "user-agent": "TI-DirectorEmailBackfill/1.0" },
    });
    // Some sites embed usable contact info on their 404 pages (TopCourt/WordPress, etc.).
    // We accept 404 HTML so we can still extract footer "info@" emails and follow Contact links.
    if (!resp.ok && resp.status !== 404) return null;
    const contentType = resp.headers.get("content-type") ?? "";
    // Some sites omit a useful content-type; accept if the payload looks like HTML.
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) return null;
    const text = await resp.text();
    if (!text) return null;
    if (!/<html|<body|<!doctype/i.test(text) && contentType) return null;
    return { status: resp.status, html: text };
  } catch {
    return null;
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
  return path.join("/tmp", `ti_${sport}_backfill_director_emails_${stamp}.csv`);
}

async function loadMissingEmailTournaments() {
  // NOTE: Supabase "is null" + eq empty both needed.
  const from = OFFSET;
  const to = OFFSET + Math.max(1, LIMIT) - 1;
  const { data, error } = await supabase
    .from("tournaments")
    .select("id,name,sport,start_date,official_website_url,tournament_director,tournament_director_email")
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
  for (const [domain, count] of sorted.slice(0, 40)) {
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
    `Backfill director emails: sport=${SPORT}, apply=${APPLY ? "yes" : "no"}, allowed_domains=${
      Array.from(allowedDomains).sort().join(",") || "(none)"
    }`
  );

  if (APPLY && allowedDomains.size === 0) {
    throw new Error("Refusing to run with --apply and no allowed domains. Pass --domains=example.com,other.com");
  }

  let scanned = 0;
  let skippedDomain = 0;
  let missingUrl = 0;
  let fetchFailed = 0;
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
    const fetched = await fetchHtml(officialUrl);
    fetchedUrls.push(officialUrl);
    if (!fetched) {
      fetchFailed += 1;
      results.push({
        tournament_id: row.id,
        sport: SPORT,
        tournament_name: clean(row.name) || row.id,
        start_date: clean(row.start_date),
        official_website_url: officialUrl,
        found_email: "",
        applied: "no",
        reason: "fetch_failed",
        fetched_urls: fetchedUrls.join(" "),
      });
      continue;
    }

    let emails = extractEmailsFromHtml(fetched.html);
    const followUrls = emails.length ? [] : extractContactUrls(fetched.html, officialUrl);
    for (const nextUrl of followUrls) {
      const nextHtml = await fetchHtml(nextUrl);
      fetchedUrls.push(nextUrl);
      if (!nextHtml) continue;
      emails = emails.concat(extractEmailsFromHtml(nextHtml.html));
    }

    const uniqueEmails = Array.from(new Set(emails)).filter(isValidEmail);
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

      // If it wasn't null but was an empty string, try that too.
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
  }

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
  console.log(`- fetch_failed: ${fetchFailed}`);
  console.log(`- found_email: ${found}`);
  console.log(`- applied: ${applied}`);
  console.log(`- csv: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
