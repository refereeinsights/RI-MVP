import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function parseDotenv(contents) {
  const out = {};
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
    if (!process.env[k] && typeof v === "string") process.env[k] = v;
  }
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(
    d.getSeconds()
  )}`;
}

function esc(value) {
  if (value === null || value === undefined) return "";
  const s = String(value).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

function normalizeUrlKey(u) {
  return String(u ?? "")
    .trim()
    .replace(/#.*$/, "")
    .replace(/\?.*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function cleanText(input) {
  return String(input ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: "follow", signal: controller.signal });
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function extractLinks(html, baseUrl) {
  const out = [];
  const re = /<a[^>]+href="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (!href) continue;
    try {
      const abs = new URL(href, baseUrl).toString();
      out.push(abs);
    } catch {
      // ignore
    }
  }
  return out;
}

function isLikelyBasketballTournamentUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== "toptiersports.net") return false;
    const p = u.pathname.toLowerCase();
    if (p === "/basketball/" || p === "/basketball") return false;
    if (p.includes("@")) return false;
    if (p.includes("mailto:")) return false;
    if (p.includes("/category/") || p.includes("/tag/") || p.includes("/wp-")) return false;
    if (p.includes("/about") || p.includes("/contact") || p.includes("/privacy") || p.includes("/rankings")) return false;
    if (p.includes("tournament-rules")) return false;
    // Prefer the canonical basketball tournament slug format.
    if (!/^\/basketball-[a-z0-9-]+\/?$/.test(p)) return false;
    // Most tournament pages include "basketball" in the URL, or a tournament-y keyword.
    return (
      p.includes("basketball") ||
      /tournament|showdown|shoot|jam|classic|invite|series|hoops|tip|shootout|turkey|slam|summer|winter|spring|fall/.test(p)
    );
  } catch {
    return false;
  }
}

function parseExposurePointers(pageHtml) {
  const exposureDomain = pageHtml.match(/https?:\/\/([a-z]+)\.exposureevents\.com\//i)?.[1]?.toLowerCase() ?? null;
  const eventId = pageHtml.match(/eventid=(\d{4,})/i)?.[1] ?? null;
  return { exposureDomain, eventId };
}

function parseExposureVenues(html) {
  const re =
    /<div><span class=\"org\">([\s\S]*?)<\/span>\s*(?:<span>\(([\s\S]*?)\)<\/span>)?<\/div>[\s\S]*?<div class=\"street-address\">([\s\S]*?)<\/div>[\s\S]*?<span class=\"locality\">([\s\S]*?)<\/span>,\s*<span class=\"region\">([\s\S]*?)<\/span>,\s*<span class=\"postal-code\">([\s\S]*?)<\/span>[\s\S]*?<a[^>]*href=\"([^\"]+)\"/gi;
  const venues = [];
  for (const m of html.matchAll(re)) {
    venues.push({
      name: cleanText(m[1]),
      address1: cleanText(m[3]) || null,
      city: cleanText(m[4]) || null,
      state: cleanText(m[5]) || null,
      zip: cleanText(m[6]) || null,
      venueUrl: m[7] || null,
    });
  }
  return venues;
}

function isSurc(venue) {
  const blob = `${venue.name ?? ""} ${venue.address1 ?? ""} ${venue.city ?? ""} ${venue.state ?? ""} ${venue.zip ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  return (
    blob.includes("surc") ||
    blob.includes("cwu") ||
    (blob.includes("university") && blob.includes("way")) ||
    (blob.includes("ellensburg") && blob.includes("wa"))
  );
}

async function findTournamentInDb(supabase, url) {
  const key = normalizeUrlKey(url);
  if (!key) return null;
  // Use ilike to handle trailing slashes / protocol variance.
  const { data, error } = await supabase
    .from("tournaments")
    .select("id,name,slug,start_date,end_date,city,state")
    .or(`source_url.ilike.%${key}%,official_website_url.ilike.%${key}%`)
    .limit(1);
  if (error) throw error;
  return (data ?? [])[0] ?? null;
}

async function main() {
  loadEnvLocal();

  const startUrl = process.env.TOP_TIER_BASKETBALL_URL || "https://toptiersports.net/basketball/";
  const maxTournamentPages = Number(process.env.TOP_TIER_BASKETBALL_MAX_PAGES || "80");
  const outPath =
    process.env.TOP_TIER_BASKETBALL_LOCATIONS_CSV ||
    path.resolve(process.cwd(), "tmp", `top_tier_basketball_locations_${stamp()}.csv`);

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const listingHtml = await fetchText(startUrl, 25000);
  const links = extractLinks(listingHtml, startUrl).filter(isLikelyBasketballTournamentUrl);
  const unique = Array.from(new Set(links.map((u) => normalizeUrlKey(u)).filter(Boolean))).slice(0, maxTournamentPages);
  const urls = unique.map((k) => {
    // best effort restore scheme/host
    if (k.startsWith("http")) return k;
    return `https://toptiersports.net${k.startsWith("/") ? "" : "/"}${k}`;
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const headers = [
    "tournament_page_url",
    "page_title",
    "exposure_domain",
    "event_id",
    "venue_name",
    "venue_address1",
    "venue_city",
    "venue_state",
    "venue_zip",
    "venue_url",
    "is_surc",
    "db_tournament_id",
    "db_tournament_name",
  ];
  const lines = [headers.join(",")];

  let pagesFetched = 0;
  let exposureFound = 0;
  let venuesRows = 0;
  let surcRows = 0;
  let missingInDb = 0;

  for (const pageUrl of urls) {
    pagesFetched += 1;
    let pageHtml = "";
    try {
      pageHtml = await fetchText(pageUrl, 25000);
    } catch (err) {
      lines.push([pageUrl, "", "", "", "", "", "", "", "", "", "", "", ""].map(esc).join(","));
      continue;
    }
    const title = cleanText(pageHtml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "") || "";
    const { exposureDomain, eventId } = parseExposurePointers(pageHtml);
    if (!exposureDomain || !eventId) {
      const dbT = await findTournamentInDb(supabase, pageUrl);
      if (!dbT) missingInDb += 1;
      lines.push(
        [pageUrl, title, exposureDomain ?? "", eventId ?? "", "", "", "", "", "", "", "", dbT?.id ?? "", dbT?.name ?? ""]
          .map(esc)
          .join(",")
      );
      continue;
    }

    exposureFound += 1;
    const venuesUrl = `https://${exposureDomain}.exposureevents.com/widgets/v1/venues?eventid=${eventId}&header=true&menu=true`;
    let venuesHtml = "";
    try {
      venuesHtml = await fetchText(venuesUrl, 25000);
    } catch {
      venuesHtml = "";
    }
    const venues = venuesHtml ? parseExposureVenues(venuesHtml) : [];
    const dbT = await findTournamentInDb(supabase, pageUrl);
    if (!dbT) missingInDb += 1;

    if (!venues.length) {
      lines.push(
        [pageUrl, title, exposureDomain, eventId, "", "", "", "", "", "", "", dbT?.id ?? "", dbT?.name ?? ""]
          .map(esc)
          .join(",")
      );
      continue;
    }

    for (const v of venues) {
      const surc = isSurc(v);
      venuesRows += 1;
      if (surc) surcRows += 1;
      lines.push(
        [
          pageUrl,
          title,
          exposureDomain,
          eventId,
          v.name,
          v.address1,
          v.city,
          v.state,
          v.zip,
          v.venueUrl,
          surc ? "1" : "0",
          dbT?.id ?? "",
          dbT?.name ?? "",
        ]
          .map(esc)
          .join(",")
      );
    }
  }

  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        startUrl,
        outPath,
        tournamentPagesConsidered: urls.length,
        pagesFetched,
        exposureFound,
        venueRows: venuesRows,
        surcRows,
        missingInDb,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("[audit-top-tier-basketball-locations] fatal", err?.message ?? err);
  process.exit(1);
});
