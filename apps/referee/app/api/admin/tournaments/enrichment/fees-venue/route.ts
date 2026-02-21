import { NextResponse } from "next/server";
import { headers } from "next/headers";
import * as cheerio from "cheerio";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

async function ensureAdmin() {
  const headerToken = headers().get("x-admin-secret");
  const envToken = process.env.ADMIN_SECRET;
  if (headerToken && envToken && headerToken === envToken) return true;

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") return null;
  return true;
}

function extractFee(text: string): string | null {
  const normalizedBase = text.replace(/[–—]/g, "-").replace(/\s+/g, " ");
  // Some sites collapse adjacent cells into tokens like `$6109 v 9` / `$66011 v 11`.
  // Split those into `$610 9 v 9` / `$660 11 v 11` before extraction.
  const normalizedStep1 = normalizedBase.replace(
    /(\d{1,2}\/\d{1,2}\/\d{2})(?=(?:7|9|11)\s*v\s*(?:7|9|11))/gi,
    "$1 "
  );
  const normalized = normalizedStep1.replace(
    /\$([0-9]{3,6})\s*((?:7|9|11)\s*v\s*(?:7|9|11))/gi,
    (_full: string, rawAmount: string, formatChunk: string) => {
      const firstFormatNumber = /^((?:7|9|11))\s*v/i.exec(formatChunk)?.[1] ?? "";
      let amount = rawAmount;
      if (firstFormatNumber && amount.endsWith(firstFormatNumber) && amount.length > firstFormatNumber.length + 2) {
        amount = amount.slice(0, -firstFormatNumber.length);
      }
      return `$${amount} ${formatChunk}`;
    }
  );
  const noParking = normalized
    .replace(/parking[^$]{0,64}\$\s*[0-9]{1,4}(?:\.[0-9]{2})?/gi, " ")
    .replace(/\$\s*[0-9]{1,4}(?:\.[0-9]{2})?[^A-Za-z]{0,8}(?:per\s+car|car|vehicle)?[^A-Za-z]{0,8}parking/gi, " ");

  const entries: string[] = [];
  const seen = new Set<string>();
  const maxEntries = 12;

  const normalizeAmount = (raw: string) => `$${raw.replace(/,/g, "")}`;
  const normalizeFormat = (raw: string) => raw.toLowerCase().replace(/\s+/g, "");
  const normalizeAge = (raw: string) =>
    raw
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/U(\d{1,2})\/\d{2,4}-U?(\d{1,2})\/\d{2,4}/g, "U$1-U$2")
      .replace(/U(\d{1,2})-U?(\d{1,2})/g, "U$1-U$2");
  const addEntry = (value: string) => {
    const cleaned = value.trim().replace(/\s+/g, " ");
    if (!cleaned || seen.has(cleaned) || entries.length >= maxEntries) return;
    seen.add(cleaned);
    entries.push(cleaned);
  };
  // `7v7 | U6-U10 | $795` and similar table/card patterns.
  const structured = Array.from(
    noParking.matchAll(
      /(?:\b(\d{1,2}\s*v\s*\d{1,2}|\d{1,2}v\d{1,2}|11v11)\b\s*\|\s*)?(U\s*\d{1,2}(?:\s*\/\s*\d{2,4})?\s*-\s*U?\s*\d{1,2}(?:\s*\/\s*\d{2,4})?|U\s*\d{1,2}\s*\+?)\s*\|\s*\$\s*([0-9]{2,5}(?:\.[0-9]{2})?)(?!\d)/gi
    )
  );
  for (const m of structured) {
    const age = normalizeAge(m[2] ?? "");
    const amount = normalizeAmount(m[3] ?? "");
    addEntry([age, amount].filter(Boolean).join(" "));
  }

  // `U7/2019 - U10/2016: $675` and bullet/list variants.
  const ageRanges = Array.from(
    noParking.matchAll(
      /(U\s*\d{1,2}(?:\s*\/\s*\d{2,4})?\s*-\s*U?\s*\d{1,2}(?:\s*\/\s*\d{2,4})?|U\s*\d{1,2}\s*\+?)\s*[:|]?\s*\$\s*([0-9]{2,5}(?:\.[0-9]{2})?)/gi
    )
  );
  for (const m of ageRanges) {
    if ((m[0] ?? "").includes("|")) continue;
    addEntry([normalizeAge(m[1] ?? ""), normalizeAmount(m[2] ?? "")].filter(Boolean).join(" "));
  }

  // `Entry Fee: 7v7 $845 9v9 $975 11v11 $1045` and table row style formats.
  const formatFees = Array.from(
    noParking.matchAll(
      /\b(\d{1,2}\s*v\s*\d{1,2}|\d{1,2}v\d{1,2}|11v11)\b\s*[:|]?\s*\$\s*([0-9]{2,5}(?:\.[0-9]{2})?)(?!\d)/gi
    )
  );
  for (const m of formatFees) {
    addEntry([normalizeFormat(m[1] ?? ""), normalizeAmount(m[2] ?? "")].filter(Boolean).join(" "));
  }

  if (entries.length) return entries.join(" | ");

  const m = noParking.match(/\$\s*([0-9]{2,5}(?:\.[0-9]{2})?)/);
  return m ? normalizeAmount(m[1]) : null;
}

function extractGames(text: string): string | null {
  const m = text.match(/(\d+)\s*(?:game|gms)\s+guarantee/i);
  return m ? m[1] : null;
}

function extractPlayerParking(text: string): string | null {
  const normalized = text.replace(/[–—]/g, "-").replace(/\s+/g, " ");
  const direct = normalized.match(/parking[^$]{0,48}\$\s*([0-9]{1,4}(?:\.[0-9]{2})?)/i);
  if (direct) return `$${direct[1]}`;
  const reverse = normalized.match(/\$\s*([0-9]{1,4}(?:\.[0-9]{2})?)[^A-Za-z]{0,6}(?:per\s+car|car|vehicle)?[^A-Za-z]{0,6}parking/i);
  if (reverse) return `$${reverse[1]}`;
  if (/\bfree parking\b/i.test(normalized)) return "free";
  return null;
}

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractAddresses(text: string): string[] {
  const pattern =
    /\d{1,5}\s+[A-Za-z0-9.\-#\s]{3,100},\s*[A-Za-z.\s]{2,60},\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?/g;
  const matches = Array.from(text.matchAll(pattern)).map((m) => normalizeSpace(m[0] ?? ""));
  return Array.from(new Set(matches.filter(Boolean)));
}

function inferLocality(addresses: string[]): { city: string; state: string; zip: string } | null {
  for (const addr of addresses) {
    const m = addr.match(/,\s*([A-Za-z.\s]{2,60}),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/);
    if (!m) continue;
    return {
      city: normalizeSpace(m[1] ?? ""),
      state: (m[2] ?? "").trim().toUpperCase(),
      zip: (m[3] ?? "").trim(),
    };
  }
  return null;
}

function extractStreetLike(text: string): string | null {
  const pattern =
    /\d{1,5}\s+[A-Za-z0-9.'#\-\s]{2,90}\b(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pkwy|Parkway|Pl|Place|Cir|Circle|Ter|Terrace|Highway|Hwy)\b\.?/i;
  const m = text.match(pattern);
  return m ? normalizeSpace(m[0]) : null;
}

function extractVenuePageAddresses(
  $: cheerio.CheerioAPI,
  locality: { city: string; state: string; zip: string } | null
): string[] {
  const out = new Set<string>();
  const candidates = $("li, p, td, div, h3, h4")
    .toArray()
    .map((el) => normalizeSpace($(el).text() || ""))
    .filter(Boolean)
    .slice(0, 800);

  for (const text of candidates) {
    for (const full of extractAddresses(text)) out.add(full);
    const street = extractStreetLike(text);
    if (!street || !locality) continue;
    const likelyHasLocality = /,\s*[A-Za-z.\s]{2,40},\s*[A-Z]{2}\s*\d{5}/.test(text);
    if (likelyHasLocality) continue;
    out.add(`${street}, ${locality.city}, ${locality.state} ${locality.zip}`);
  }

  return Array.from(out);
}

function cleanVenueName(raw: string): string | null {
  const text = normalizeSpace(raw)
    .replace(/\b(address|location|directions?)\b[:\-]*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!text) return null;
  if (text.length < 3 || text.length > 120) return null;
  if (/^\d/.test(text)) return null;
  return text;
}

function extractVenueEntriesFromPage(
  $: cheerio.CheerioAPI,
  locality: { city: string; state: string; zip: string } | null
): Array<{ venue_name: string | null; address_text: string }> {
  const entries: Array<{ venue_name: string | null; address_text: string }> = [];
  const dedupe = new Set<string>();

  const nodes = $("li, tr, p, div")
    .toArray()
    .slice(0, 1200);

  for (const node of nodes) {
    const text = normalizeSpace($(node).text() || "");
    if (!text) continue;

    const fullAddresses = extractAddresses(text);
    const partialStreet = fullAddresses.length ? null : extractStreetLike(text);
    const localitySuffix = locality ? `${locality.city}, ${locality.state} ${locality.zip}` : null;
    const addresses = fullAddresses.length
      ? fullAddresses
      : partialStreet && localitySuffix
      ? [`${partialStreet}, ${localitySuffix}`]
      : [];
    if (!addresses.length) continue;

    const rowHeading =
      cleanVenueName($(node).find("strong,h3,h4,b").first().text() || "") ??
      cleanVenueName(text.split(/[|•]/)[0] || "");

    for (const address of addresses) {
      const key = `${(rowHeading ?? "").toLowerCase()}|${address.toLowerCase()}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);
      entries.push({ venue_name: rowHeading, address_text: address });
    }
  }

  return entries;
}

function extractVenueUrl($: cheerio.CheerioAPI): string | null {
  const anchors = $("a[href]");
  for (const el of anchors) {
    const href = $(el).attr("href") || "";
    if (/google\.com\/maps|maps\.apple|waze\.com/i.test(href)) {
      return href;
    }
  }
  return null;
}

function detectVenuePageUrl(currentUrl: string, $: cheerio.CheerioAPI): string | null {
  const selfPath = new URL(currentUrl).pathname.toLowerCase();
  if (/(^|\/)(venue|venues|location|locations)(\/|$)/.test(selfPath)) return currentUrl;

  const anchors = $("a[href]");
  for (const el of anchors) {
    const href = ($(el).attr("href") || "").trim();
    if (!href) continue;
    if (/(^|\/)(venue|venues|location|locations)(\/|$)/i.test(href)) {
      try {
        return new URL(href, currentUrl).toString();
      } catch {
        continue;
      }
    }
  }
  return null;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-cache",
      headers: { "user-agent": "RI-FeesVenue-Scraper/2.0" },
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(contentType)) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

function normalizeUrl(raw: string, base: URL): string | null {
  try {
    const url = new URL(raw, base);
    if (!/^https?:$/i.test(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function rankInternalLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const priorityPatterns = [
    /venue|venues|location|locations|field|fields|facility|facilities|complex|park|maps?|directions/i,
    /fees?|pricing|registration|format|entry|cost|guaranteed/i,
    /tournament|event|about|details|rules|travel|hotel/i,
  ];

  const scored: Array<{ href: string; score: number }> = [];
  const seen = new Set<string>();

  $("a[href]").each((_idx, el) => {
    const hrefRaw = ($(el).attr("href") || "").trim();
    if (!hrefRaw || hrefRaw.startsWith("mailto:") || hrefRaw.startsWith("tel:") || hrefRaw.startsWith("javascript:")) return;
    const normalized = normalizeUrl(hrefRaw, base);
    if (!normalized) return;
    const parsed = new URL(normalized);
    if (parsed.hostname !== base.hostname) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);

    const anchorText = ($(el).text() || "").trim();
    const combined = `${anchorText} ${parsed.pathname} ${parsed.search}`;
    let score = 0;
    for (let i = 0; i < priorityPatterns.length; i += 1) {
      if (priorityPatterns[i].test(combined)) score += 10 - i * 2;
    }
    if (/[?#]/.test(hrefRaw)) score -= 1;
    scored.push({ href: normalized, score });
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.href);
}

async function fetchTournamentPages(seedUrl: string, maxPages = 6): Promise<Array<{ url: string; html: string }>> {
  const pages: Array<{ url: string; html: string }> = [];
  const queue: string[] = [seedUrl];
  const seen = new Set<string>();

  while (queue.length > 0 && pages.length < maxPages) {
    const nextUrl = queue.shift()!;
    if (seen.has(nextUrl)) continue;
    seen.add(nextUrl);

    const html = await fetchHtml(nextUrl);
    if (!html) continue;
    pages.push({ url: nextUrl, html });
    if (pages.length >= maxPages) break;

    const $ = cheerio.load(html);
    const ranked = rankInternalLinks($, nextUrl);
    for (const href of ranked) {
      if (queue.length + pages.length >= maxPages * 3) break;
      if (!seen.has(href) && !queue.includes(href)) queue.push(href);
    }
  }

  return pages;
}

function isMissingCooldownColumnError(message: string | undefined): boolean {
  if (!message) return false;
  return (
    /column .*fees_venue_scraped_at.* does not exist/i.test(message) ||
    /could not find the 'fees_venue_scraped_at' column/i.test(message)
  );
}

export async function POST(request: Request) {
  const isAdmin = await ensureAdmin();
  if (!isAdmin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "10");
  const cappedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 50)) : 10;
  const candidatePoolSize = Math.min(cappedLimit * 20, 1000);
  const nowIso = new Date().toISOString();
  const cooldownDays = 10;
  const cooldownCutoffMs = Date.now() - cooldownDays * 24 * 60 * 60 * 1000;

  const fetchTargetTournaments = async () => {
    const withCooldownSelect = "id,name,official_website_url,source_url,fees_venue_scraped_at";
    const withoutCooldownSelect = "id,name,official_website_url,source_url";

    const primary = await supabaseAdmin
      .from("tournaments" as any)
      .select(withCooldownSelect)
      .eq("status", "published")
      .eq("is_canonical", true)
      .eq("enrichment_skip", false)
      .or("team_fee.is.null,games_guaranteed.is.null,player_parking.is.null,venue.is.null,address.is.null,venue_url.is.null")
      .order("fees_venue_scraped_at", { ascending: true, nullsFirst: true })
      .limit(candidatePoolSize);

    if (!primary.error) return primary;

    if (isMissingCooldownColumnError(primary.error.message)) {
      const retryWithoutCooldown = await supabaseAdmin
        .from("tournaments" as any)
        .select(withoutCooldownSelect)
        .eq("status", "published")
        .eq("is_canonical", true)
        .eq("enrichment_skip", false)
        .or("team_fee.is.null,games_guaranteed.is.null,player_parking.is.null,venue.is.null,address.is.null,venue_url.is.null")
        .limit(candidatePoolSize);
      if (!retryWithoutCooldown.error) return retryWithoutCooldown;
      if (!/column .* does not exist/i.test(retryWithoutCooldown.error.message)) return retryWithoutCooldown;
    } else if (!/column .* does not exist/i.test(primary.error.message)) {
      return primary;
    }

    // Backward-compatible fallback for environments where fee/venue columns are not migrated yet.
    const fallback = await supabaseAdmin
      .from("tournaments" as any)
      .select(withCooldownSelect)
      .eq("status", "published")
      .eq("is_canonical", true)
      .eq("enrichment_skip", false)
      .or("official_website_url.not.is.null,source_url.not.is.null")
      .order("fees_venue_scraped_at", { ascending: true, nullsFirst: true })
      .limit(candidatePoolSize);
    if (!fallback.error) return fallback;
    if (isMissingCooldownColumnError(fallback.error.message)) {
      return supabaseAdmin
        .from("tournaments" as any)
        .select(withoutCooldownSelect)
        .eq("status", "published")
        .eq("is_canonical", true)
        .eq("enrichment_skip", false)
        .or("official_website_url.not.is.null,source_url.not.is.null")
        .limit(candidatePoolSize);
    }
    return fallback;
  };

  const { data: tournaments, error } = await fetchTargetTournaments();

  if (error) {
    return NextResponse.json({ error: "fetch_tournaments_failed", detail: error.message }, { status: 500 });
  }

  const selected: any[] = [];
  let skipped_recent = 0;
  let skipped_pending = 0;
  const { data: pendingRows } = await supabaseAdmin
    .from("tournament_attribute_candidates" as any)
    .select("tournament_id")
    .is("accepted_at", null)
    .is("rejected_at", null)
    .in("attribute_key", ["team_fee", "games_guaranteed", "player_parking", "address", "venue_url"])
    .limit(10000);
  const pendingTournamentIds = new Set(
    ((pendingRows ?? []) as Array<{ tournament_id: string | null }>).map((r) => String(r.tournament_id ?? "")).filter(Boolean)
  );
  for (const t of (tournaments as any[] | null) ?? []) {
    if (pendingTournamentIds.has(String((t as any).id ?? ""))) {
      skipped_pending += 1;
      continue;
    }
    const lastScraped = (t as any).fees_venue_scraped_at;
    if (lastScraped) {
      const lastMs = new Date(lastScraped).getTime();
      if (Number.isFinite(lastMs) && lastMs > cooldownCutoffMs) {
        skipped_recent += 1;
        continue;
      }
    }
    selected.push(t);
    if (selected.length >= cappedLimit) break;
  }

  const candidates: Array<{ tournament_id: string; attribute_key: string; attribute_value: string; source_url: string | null }> = [];
  const venueCandidates: Array<{
    tournament_id: string;
    venue_name: string | null;
    address_text: string;
    source_url: string | null;
    venue_url: string | null;
  }> = [];
  const summary: Array<{ tournament_id: string; name: string | null; found: string[] }> = [];
  const attemptedTournamentIds: string[] = [];
  let attempted = 0;
  let pagesFetched = 0;

  for (const t of selected) {
    const url = (t as any).official_website_url || (t as any).source_url;
    if (!url) continue;
    attempted += 1;
    attemptedTournamentIds.push(t.id);
    const pages = await fetchTournamentPages(url, 6);
    pagesFetched += pages.length;
    if (!pages.length) continue;
    const found: string[] = [];
    const inferredAddressPool: string[] = [];
    const venuePageAddressPool: string[] = [];
    const venueEntriesPool: Array<{ venue_name: string | null; address_text: string; source_url: string }> = [];
    const venueUrlCandidates = new Set<string>();
    const foundByKey = new Set<string>();

    for (const page of pages) {
      const $ = cheerio.load(page.html);
      const text = $.text().replace(/\s+/g, " ");

      const fee = extractFee(text);
      if (fee && !foundByKey.has("team_fee")) {
        candidates.push({ tournament_id: t.id, attribute_key: "team_fee", attribute_value: fee, source_url: page.url });
        found.push("team_fee");
        foundByKey.add("team_fee");
      }

      const games = extractGames(text);
      if (games && !foundByKey.has("games_guaranteed")) {
        candidates.push({
          tournament_id: t.id,
          attribute_key: "games_guaranteed",
          attribute_value: games,
          source_url: page.url,
        });
        found.push("games_guaranteed");
        foundByKey.add("games_guaranteed");
      }

      const playerParking = extractPlayerParking(text);
      if (playerParking && !foundByKey.has("player_parking")) {
        candidates.push({
          tournament_id: t.id,
          attribute_key: "player_parking",
          attribute_value: playerParking,
          source_url: page.url,
        });
        found.push("player_parking");
        foundByKey.add("player_parking");
      }

      extractAddresses(text).forEach((addr) => inferredAddressPool.push(addr));
      detectVenuePageUrl(page.url, $) && venueUrlCandidates.add(detectVenuePageUrl(page.url, $)!);

      const venueUrl = extractVenueUrl($);
      if (venueUrl) venueUrlCandidates.add(venueUrl);

      const locality = inferLocality(inferredAddressPool);
      if (/(^|\/)(venue|venues|location|locations)(\/|$)/i.test(new URL(page.url).pathname)) {
        extractVenuePageAddresses($, locality).forEach((addr) => venuePageAddressPool.push(addr));
        extractVenueEntriesFromPage($, locality).forEach((entry) =>
          venueEntriesPool.push({ ...entry, source_url: page.url })
        );
      }

      if (venueUrlCandidates.size > 0 && !foundByKey.has("venue_url")) {
        for (const urlCandidate of venueUrlCandidates) {
          candidates.push({
            tournament_id: t.id,
            attribute_key: "venue_url",
            attribute_value: urlCandidate,
            source_url: page.url,
          });
        }
        found.push("venue_url");
        foundByKey.add("venue_url");
      }

      if (foundByKey.size >= 5) break;
    }

    const allAddresses = Array.from(new Set([...inferredAddressPool, ...venuePageAddressPool])).slice(0, 12);
    if (allAddresses.length) {
      for (const address of allAddresses) {
        candidates.push({
          tournament_id: t.id,
          attribute_key: "address",
          attribute_value: address,
          source_url: url,
        });
      }
      found.push("address");
      foundByKey.add("address");
    }
    if (venueEntriesPool.length) {
      const entryDedup = new Set<string>();
      for (const entry of venueEntriesPool.slice(0, 30)) {
        const key = `${(entry.venue_name ?? "").toLowerCase()}|${entry.address_text.toLowerCase()}|${entry.source_url}`;
        if (entryDedup.has(key)) continue;
        entryDedup.add(key);
        venueCandidates.push({
          tournament_id: t.id,
          venue_name: entry.venue_name,
          address_text: entry.address_text,
          source_url: entry.source_url,
          venue_url: Array.from(venueUrlCandidates)[0] ?? null,
        });
      }
      if (!foundByKey.has("venue_candidates")) {
        found.push("venue_candidates");
        foundByKey.add("venue_candidates");
      }
    }

    if (found.length) {
      summary.push({ tournament_id: t.id, name: t.name, found });
    }
  }

  let inserted = 0;
  let skipped_duplicates = 0;
  if (candidates.length) {
    const keyFor = (row: {
      tournament_id: string;
      attribute_key: string;
      attribute_value: string;
      source_url: string | null;
    }) => `${row.tournament_id}|${row.attribute_key}|${row.attribute_value}|${row.source_url ?? ""}`;

    // De-dupe within this scrape batch first.
    const uniqueBatch: Array<{
      tournament_id: string;
      attribute_key: string;
      attribute_value: string;
      source_url: string | null;
    }> = [];
    const seenBatch = new Set<string>();
    for (const row of candidates) {
      const key = keyFor(row);
      if (seenBatch.has(key)) {
        skipped_duplicates += 1;
        continue;
      }
      seenBatch.add(key);
      uniqueBatch.push(row);
    }

    // Skip rows that already exist in DB (matching unique index semantics via source_url coalesce).
    const tournamentIds = Array.from(new Set(uniqueBatch.map((c) => c.tournament_id)));
    const attributeKeys = Array.from(new Set(uniqueBatch.map((c) => c.attribute_key)));
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("tournament_attribute_candidates" as any)
      .select("tournament_id,attribute_key,attribute_value,source_url")
      .in("tournament_id", tournamentIds)
      .in("attribute_key", attributeKeys);
    if (existingError) {
      return NextResponse.json(
        {
          ok: false,
          error: "load_existing_candidates_failed",
          detail: existingError.message,
          attempted,
          parsed_candidates: candidates.length,
          pages_fetched: pagesFetched,
        },
        { status: 500 }
      );
    }
    const existingKeys = new Set(
      ((existingRows ?? []) as Array<{
        tournament_id: string;
        attribute_key: string;
        attribute_value: string;
        source_url: string | null;
      }>).map((row) => keyFor(row))
    );
    const toInsert = uniqueBatch.filter((row) => {
      const exists = existingKeys.has(keyFor(row));
      if (exists) skipped_duplicates += 1;
      return !exists;
    });

    if (toInsert.length) {
      const { data: insertedRows, error: insertError } = await supabaseAdmin
        .from("tournament_attribute_candidates" as any)
        .insert(toInsert)
        .select("id");
      if (insertError) {
        const isValueConstraint =
          insertError.code === "23514" &&
          /tournament_attribute_candidates_value_check/i.test(insertError.message ?? "");
        return NextResponse.json(
          {
            ok: false,
            error: isValueConstraint ? "attribute_constraint_outdated" : "insert_candidates_failed",
            detail: isValueConstraint
              ? "DB constraint tournament_attribute_candidates_value_check does not currently allow one or more scraped fee/venue values. Update the constraint to allow team_fee/games_guaranteed/player_parking/address/venue_url formats."
              : insertError.message,
            attempted,
            pages_fetched: pagesFetched,
            parsed_candidates: candidates.length,
            insert_candidates: toInsert.length,
          },
          { status: 500 }
        );
      }
      inserted = insertedRows?.length ?? 0;
    } else {
      inserted = 0;
    }
  }

  let venueInserted = 0;
  if (venueCandidates.length) {
    const normalize = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
    const keyForVenue = (row: {
      tournament_id: string;
      venue_name: string | null;
      address_text: string;
      source_url: string | null;
    }) => `${row.tournament_id}|${normalize(row.venue_name)}|${normalize(row.address_text)}|${normalize(row.source_url)}`;

    const uniqueBatch: typeof venueCandidates = [];
    const seenBatch = new Set<string>();
    for (const row of venueCandidates) {
      const key = keyForVenue(row);
      if (seenBatch.has(key)) {
        skipped_duplicates += 1;
        continue;
      }
      seenBatch.add(key);
      uniqueBatch.push(row);
    }

    const tournamentIds = Array.from(new Set(uniqueBatch.map((c) => c.tournament_id)));
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("tournament_venue_candidates" as any)
      .select("tournament_id,venue_name,address_text,source_url")
      .in("tournament_id", tournamentIds);
    if (existingError) {
      return NextResponse.json(
        {
          ok: false,
          error: "load_existing_venue_candidates_failed",
          detail: existingError.message,
          attempted,
          pages_fetched: pagesFetched,
        },
        { status: 500 }
      );
    }

    const existingKeys = new Set(
      ((existingRows ?? []) as Array<{
        tournament_id: string;
        venue_name: string | null;
        address_text: string;
        source_url: string | null;
      }>).map((row) => keyForVenue(row))
    );
    const toInsert = uniqueBatch.filter((row) => {
      const exists = existingKeys.has(keyForVenue(row));
      if (exists) skipped_duplicates += 1;
      return !exists;
    });

    if (toInsert.length) {
      const { data: insertedRows, error: insertError } = await supabaseAdmin
        .from("tournament_venue_candidates" as any)
        .insert(toInsert)
        .select("id");
      if (insertError) {
        return NextResponse.json(
          {
            ok: false,
            error: "insert_venue_candidates_failed",
            detail: insertError.message,
            attempted,
            pages_fetched: pagesFetched,
            insert_candidates: toInsert.length,
          },
          { status: 500 }
        );
      }
      venueInserted = insertedRows?.length ?? 0;
    }
  }

  if (attemptedTournamentIds.length) {
    const { error: stampError } = await supabaseAdmin
      .from("tournaments" as any)
      .update({ fees_venue_scraped_at: nowIso })
      .in("id", attemptedTournamentIds);
    if (stampError && !isMissingCooldownColumnError(stampError.message)) {
      return NextResponse.json(
        {
          ok: false,
          error: "stamp_fees_venue_scrape_failed",
          detail: stampError.message,
          inserted,
          attempted,
          pages_fetched: pagesFetched,
          summary,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    inserted,
    venue_inserted: venueInserted,
    attempted,
    pages_fetched: pagesFetched,
    skipped_recent,
    skipped_pending,
    skipped_duplicates,
    summary,
  });
}
