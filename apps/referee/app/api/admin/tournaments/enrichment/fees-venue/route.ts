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

function isJunkVenueName(name: string | null | undefined): boolean {
  const raw = normalizeSpace(String(name ?? ""));
  if (!raw) return true;
  const v = raw.toLowerCase();
  if (v.length < 3) return true;
  if (/^(venue|venues|field|fields|facility|facilities|location|locations)$/i.test(raw)) return true;
  const bad = [
    "tbd",
    "to be determined",
    "various",
    "multiple locations",
    "see website",
    "see site",
    "online",
    "virtual",
    "zoom",
    "check in",
    "check-in",
    "registration",
    "headquarters",
  ];
  if (bad.some((token) => v.includes(token))) return true;
  // "City, ST" and similar placeholders.
  if (/^[a-z .'-]{2,60},\s*[a-z]{2}$/i.test(raw)) return true;
  return false;
}

function looksLikeStreetAddress(addressText: string | null | undefined): boolean {
  const addr = normalizeSpace(String(addressText ?? ""));
  if (!addr) return false;
  // Reject "City, ST" (no street).
  if (/^[a-z .'-]{2,60},\s*[a-z]{2}$/i.test(addr)) return false;
  // Prefer a number + street suffix, but allow strong street-like strings even without ZIP.
  const strong =
    /\b\d{1,6}\s+[A-Za-z0-9.'#\-\s]{2,90}\b(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pkwy|Parkway|Pl|Place|Cir|Circle|Ter|Terrace|Highway|Hwy)\b/i.test(
      addr
    );
  if (strong) return true;
  // Fall back to the looser parser when it still finds a plausible street component.
  const parsed = parseAddressParts(addr);
  const street = normalizeSpace(String(parsed.street ?? ""));
  if (!street) return false;
  return /\d/.test(street) || street.length >= 10;
}

function scoreVenueEntryForInsert(entry: { venue_name: string | null; address_text: string; source_url: string }, candidateVenueUrl: string | null): number {
  let score = 0;
  const name = normalizeSpace(String(entry.venue_name ?? ""));
  const addr = normalizeSpace(String(entry.address_text ?? ""));
  if (name && !isJunkVenueName(name)) score += 3;
  if (looksLikeStreetAddress(addr)) score += 4;
  if (/\b\d{5}(?:-\d{4})?\b/.test(addr)) score += 1;
  const src = normalizeSpace(String(entry.source_url ?? "")).toLowerCase();
  if (/(^|\/)(venue|venues|field|fields|facility|facilities|location|locations|directions?|map|maps)(\/|$)/i.test(src)) score += 1;
  const cand = normalizeSpace(String(candidateVenueUrl ?? "")).toLowerCase();
  if (cand && /(venue|venues|facility|facilities|fields|location|directions|map)/i.test(cand)) score += 1;
  return score;
}

function confidenceFromVenueScore(score: number): number {
  const maxScore = 10;
  const clamped = Math.max(0, Math.min(maxScore, Math.trunc(Number(score) || 0)));
  return Math.round((clamped / maxScore) * 100) / 100;
}

function extractAddresses(text: string): string[] {
  const pattern =
    /\d{1,5}\s+[A-Za-z0-9.\-#\s]{3,100},\s*[A-Za-z.\s]{2,60},\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?/g;
  const matches = Array.from(text.matchAll(pattern)).map((m) => normalizeSpace(m[0] ?? ""));
  // Some tournament sites include a global "contact" address in the footer/header that
  // can incorrectly get scraped across many unrelated tournaments. Keep a small
  // denylist for known noisy addresses.
  const denylist = new Set<string>([
    "1529 third st. s., jacksonville beach, fl 32250",
  ]);
  const normalized = matches
    .filter(Boolean)
    .map((addr) => ({ raw: addr, key: normalizeLower(addr) }))
    .filter((row) => !denylist.has(row.key))
    .map((row) => row.raw);
  return Array.from(new Set(normalized));
}

function extractLooseAddresses(text: string): string[] {
  // Like extractAddresses(), but allows missing ZIP codes and requires a street suffix
  // to reduce false positives.
  const suffix =
    "(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pkwy|Parkway|Pl|Place|Cir|Circle|Ter|Terrace|Highway|Hwy)";
  const pattern = new RegExp(
    `\\b\\d{1,5}\\s+[A-Za-z0-9.'\\-#\\s]{2,90}\\b${suffix}\\b\\.?\\s*,\\s*[A-Za-z.'\\s]{2,60}\\s*,\\s*[A-Z]{2}(?:\\s*\\d{5}(?:-\\d{4})?)?\\b`,
    "g"
  );
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
    const looseAddresses = fullAddresses.length ? [] : extractLooseAddresses(text);
    const partialStreet = fullAddresses.length ? null : extractStreetLike(text);
    const localitySuffix = locality ? `${locality.city}, ${locality.state} ${locality.zip}` : null;
    const addresses = fullAddresses.length
      ? fullAddresses
      : looseAddresses.length
      ? looseAddresses
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

function extractJsonLdVenueEntriesFromPage($: cheerio.CheerioAPI): Array<{ venue_name: string | null; address_text: string; venue_url: string | null }> {
  const out: Array<{ venue_name: string | null; address_text: string; venue_url: string | null }> = [];
  const seen = new Set<string>();

  const toAddressText = (addr: any): string | null => {
    if (!addr) return null;
    if (typeof addr === "string") {
      const cleaned = normalizeSpace(addr);
      return cleaned.length >= 6 ? cleaned : null;
    }
    if (typeof addr !== "object") return null;
    const street = normalizeSpace(addr.streetAddress ?? addr.street_address ?? "");
    const city = normalizeSpace(addr.addressLocality ?? addr.city ?? "");
    const state = normalizeSpace((addr.addressRegion ?? addr.state ?? "").toUpperCase());
    const zip = normalizeSpace(addr.postalCode ?? addr.zip ?? addr.zipCode ?? "");
    const parts = [street, [city, state].filter(Boolean).join(", "), zip].filter(Boolean);
    const joined = normalizeSpace(parts.join(" "));
    if (!joined) return null;
    // Require some locality signal to avoid generic "USA" / etc.
    if (!/[A-Z]{2}\b/.test(joined) && !/\d{5}\b/.test(joined)) return null;
    return joined;
  };

  const push = (args: { venue_name: string | null; address_text: string | null; venue_url: string | null }) => {
    const venue_name = args.venue_name ? cleanVenueName(args.venue_name) : null;
    const address_text = normalizeSpace(args.address_text ?? "");
    const venue_url = args.venue_url ? normalizeSpace(args.venue_url) : null;
    if (!address_text || address_text.length < 6) return;
    const key = `${(venue_name ?? "").toLowerCase()}|${address_text.toLowerCase()}|${(venue_url ?? "").toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ venue_name, address_text, venue_url });
  };

  const visit = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== "object") return;

    // Common schema: Event -> location -> Place -> address (PostalAddress)
    const typeRaw = node["@type"] ?? node.type ?? null;
    const types = Array.isArray(typeRaw) ? typeRaw : typeRaw ? [typeRaw] : [];
    const typeStr = types.map((t: any) => String(t ?? "").toLowerCase()).join(" ");

    const maybeAddress = toAddressText((node as any).address);
    if (maybeAddress) {
      push({
        venue_name: (node as any).name ?? null,
        address_text: maybeAddress,
        venue_url: (node as any).url ?? (node as any).sameAs ?? null,
      });
    }

    const location = (node as any).location ?? (node as any).venue ?? null;
    if (location) {
      if (Array.isArray(location)) {
        for (const loc of location) visit(loc);
      } else {
        visit(location);
      }
    }

    // Some schemas embed a Place under "organizer" or "performer" (less common but safe to traverse).
    if (/event|sports|tournament/.test(typeStr)) {
      const organizer = (node as any).organizer ?? null;
      const performer = (node as any).performer ?? null;
      if (organizer) visit(organizer);
      if (performer) visit(performer);
    }

    for (const k of Object.keys(node)) {
      if (k === "location" || k === "address" || k === "organizer" || k === "performer") continue;
      const v = (node as any)[k];
      if (typeof v === "object") visit(v);
    }
  };

  const scripts = $("script[type='application/ld+json']")
    .toArray()
    .slice(0, 16);
  for (const el of scripts) {
    const raw = normalizeSpace($(el).contents().text() || "");
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      visit(parsed);
    } catch {
      // Some pages include multiple JSON blobs or invalid JSON; ignore.
    }
    if (out.length >= 16) break;
  }

  return out.slice(0, 16);
}

function extractFacilityMentionsFromText(textRaw: string): Array<{ venue_name: string; city: string; state: string }> {
  const text = normalizeSpace(textRaw ?? "");
  if (!text) return [];

  // Matches patterns like:
  // - "WyEast Middle School – Vancouver, WA"
  // - "Olympus Sports Center - Hillsboro, OR"
  // Often appears inside parentheses in schedule/facilities blocks.
  const dash = "[\\u2013\\u2014\\-]"; // en/em dash or hyphen
  const pattern = new RegExp(`\\(([^()]{3,120}?)\\s*${dash}\\s*([A-Za-z .']{2,60}),\\s*([A-Z]{2})\\)`, "g");
  const pattern2 = new RegExp(`\\b([^()\\n]{3,120}?)\\s*${dash}\\s*([A-Za-z .']{2,60}),\\s*([A-Z]{2})\\b`, "g");

  const out: Array<{ venue_name: string; city: string; state: string }> = [];
  const seen = new Set<string>();

  const add = (venueRaw: string, cityRaw: string, stateRaw: string) => {
    const venue_name = cleanVenueName(venueRaw);
    const city = normalizeSpace(cityRaw);
    const state = (stateRaw ?? "").trim().toUpperCase();
    if (!venue_name || !city || !state) return;
    // Avoid capturing obvious non-venue tokens.
    if (/(girls|boys|division|age group|g\d{1,2}s|u\d{1,2})/i.test(venue_name)) return;
    if (venue_name.length > 120) return;
    const key = `${venue_name.toLowerCase()}|${city.toLowerCase()}|${state}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ venue_name, city, state });
  };

  for (const m of text.matchAll(pattern)) {
    add(m[1] ?? "", m[2] ?? "", m[3] ?? "");
    if (out.length >= 12) break;
  }
  if (out.length < 12) {
    for (const m of text.matchAll(pattern2)) {
      add(m[1] ?? "", m[2] ?? "", m[3] ?? "");
      if (out.length >= 12) break;
    }
  }

  return out;
}

function extractFacilitiesFromPage($: cheerio.CheerioAPI): Array<{ venue_name: string; address_text: string }> {
  // Lightweight extraction for pages that list facilities without street addresses.
  // Example: https://cevaregion.org/freeze/ "Age Groups & Facilities"
  const headingText = $("h1,h2,h3,h4")
    .toArray()
    .map((el) => normalizeSpace($(el).text() || ""))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasFacilitiesSignal = /(facilities|facility|venues?|locations?)/i.test(headingText) || /facilities/i.test(normalizeSpace($.text() || ""));
  if (!hasFacilitiesSignal) return [];

  const text = normalizeSpace($.text() || "");
  const mentions = extractFacilityMentionsFromText(text);
  return mentions.map((m) => ({ venue_name: m.venue_name, address_text: `${m.city}, ${m.state}` }));
}

function extractStateFromFullAddress(address: string | null | undefined): string | null {
  const raw = normalizeSpace(address ?? "");
  if (!raw) return null;
  const m = raw.match(/,\s*([A-Z]{2})\s*\d{5}(?:-\d{4})?\s*$/);
  return m?.[1] ? m[1].toUpperCase() : null;
}

function extractVenueMapCardsFromPage(args: {
  $: cheerio.CheerioAPI;
  tournamentState: string | null;
}): Array<{ venue_name: string; city: string | null; map_image_url: string | null }> {
  const { $, tournamentState } = args;

  // Some tournament sites publish "Venue Maps" as images with headings (no map links, no full addresses).
  // Example: socalelitefc.com "Tournament Venue Maps" section.
  const headingNodes = $("h1,h2,h3,h4,span")
    .toArray()
    .filter((el) => /venue\s+maps?/i.test(normalizeSpace($(el).text() || "")));

  const results: Array<{ venue_name: string; city: string | null; map_image_url: string | null }> = [];
  const seen = new Set<string>();

  const pushCard = (venueNameRaw: string, cityRaw: string | null, imgUrlRaw: string | null) => {
    const venue_name = cleanVenueName(venueNameRaw);
    if (!venue_name) return;
    const city = cityRaw ? normalizeSpace(cityRaw) : null;
    const map_image_url = normalizeSpace(imgUrlRaw ?? "") || null;
    const key = `${venue_name.toLowerCase()}|${(city ?? "").toLowerCase()}|${(map_image_url ?? "").toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ venue_name, city: city || null, map_image_url });
  };

  for (const h of headingNodes.slice(0, 3)) {
    const row = $(h).closest(".fl-row, section, article, main, body");
    if (!row.length) continue;

    // Cards are usually "image + h2 + h3" within the same column container.
    const cardContainers = row
      .find(".fl-col-content, .elementor-widget-wrap, .wp-block-group, .wp-block-column, div")
      .toArray()
      .slice(0, 400)
      .filter((el) => $(el).find("img").length > 0 && $(el).find("h2").length > 0);

    for (const card of cardContainers) {
      const img = $(card).find("img").first();
      const imgUrl = (img.attr("src") || "").trim() || null;
      const h2Text = normalizeSpace($(card).find("h2").first().text() || "");
      const h3Text = normalizeSpace($(card).find("h3").first().text() || "");

      // Filter out obvious non-venue cards (e.g. sponsor logos) by requiring a plausible venue name.
      if (!h2Text || h2Text.length < 3) continue;
      if (!/[a-z]/i.test(h2Text)) continue;
      // Often these map cards omit state; we store city separately and use tournamentState when building address_text.
      pushCard(h2Text, h3Text || null, imgUrl);
      if (results.length >= 12) break;
    }
    if (results.length) break;
  }

  // If we have a state but no city on some cards, still keep them; address_text is built later.
  // Note: tournamentState is intentionally unused here to keep extraction purely structural.
  void tournamentState;
  return results;
}

async function searchFullAddressForVenue(args: {
  venueName: string;
  city: string | null;
  state: string | null;
  maxResults?: number;
}): Promise<string | null> {
  const venueName = normalizeSpace(args.venueName);
  const city = normalizeSpace(args.city ?? "");
  const state = normalizeSpace(args.state ?? "").toUpperCase();
  if (!venueName || !state) return null;

  const maxResults = Math.max(1, Math.min(args.maxResults ?? 3, 5));
  const geo = [city, state].filter(Boolean).join(" ");

  const queries = [
    `"${venueName}" ${geo} address`,
    `"${venueName}" ${geo}`,
    `${venueName} ${geo} address`,
  ];

  const visited = new Set<string>();
  for (const q of queries) {
    const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    let html: string | null = null;
    try {
      const resp = await fetch(searchUrl, {
        method: "GET",
        cache: "no-cache",
        redirect: "follow",
        headers: {
          "user-agent": "RI-FeesVenue-Scraper/2.2",
          accept: "text/html,application/xhtml+xml",
        },
      });
      if (!resp.ok) continue;
      const contentType = resp.headers.get("content-type") ?? "";
      if (!/text\/html/i.test(contentType)) continue;
      html = await resp.text();
    } catch {
      continue;
    }
    if (!html) continue;
    const $ = cheerio.load(html);
    const hrefs = $("a.result__a, a[href]")
      .toArray()
      .map((el) => ($(el).attr("href") || "").trim())
      .filter(Boolean)
      .map((href) => decodeSearchRedirect(href))
      .filter((href): href is string => !!href);

    let checked = 0;
    for (const href of hrefs) {
      if (checked >= maxResults) break;
      if (visited.has(href)) continue;
      visited.add(href);
      checked += 1;

      const pageHtml = await fetchHtml(href);
      if (!pageHtml) continue;
      const pageText = cheerio.load(pageHtml).text().replace(/\s+/g, " ");
      const addresses = extractAddresses(pageText);
      for (const addr of addresses) {
        const addrState = extractStateFromFullAddress(addr);
        if (addrState && addrState !== state) continue;
        if (city && !normalizeLower(addr).includes(normalizeLower(city))) continue;
        return addr;
      }
    }
  }

  return null;
}

function decodeMapHint(urlRaw: string): string | null {
  const raw = (urlRaw ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const candidates = [
      parsed.searchParams.get("q"),
      parsed.searchParams.get("query"),
      parsed.searchParams.get("destination"),
      parsed.searchParams.get("daddr"),
    ].filter(Boolean) as string[];
    for (const c of candidates) {
      const cleaned = normalizeSpace(decodeURIComponent(c)).replace(/\+/g, " ");
      if (cleaned.length >= 3) return cleaned;
    }
    if (/google\.com\/maps\/place\//i.test(parsed.toString())) {
      const m = parsed.toString().match(/\/maps\/place\/([^/?#]+)/i);
      if (m?.[1]) {
        const cleaned = normalizeSpace(decodeURIComponent(m[1]).replace(/\+/g, " "));
        if (cleaned.length >= 3) return cleaned;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function extractMapLinkedVenueEntries($: cheerio.CheerioAPI): Array<{ venue_name: string | null; address_text: string }> {
  const out: Array<{ venue_name: string | null; address_text: string }> = [];
  const dedupe = new Set<string>();

  $("a[href]").each((_idx, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (!href) return;
    if (!/google\.com\/maps|maps\.apple|waze\.com/i.test(href)) return;

    const linkText = normalizeSpace($(el).text() || "");
    const nearbyHeading = cleanVenueName(
      $(el)
        .closest("li, tr, p, div")
        .find("strong,h3,h4,b")
        .first()
        .text() || ""
    );
    const venueName = cleanVenueName(linkText) ?? nearbyHeading ?? null;
    const hintedAddress = decodeMapHint(href);
    const addressText = normalizeSpace(hintedAddress ?? linkText);
    if (!addressText || addressText.length < 3) return;
    if (/^(google maps|directions?|map|waze)$/i.test(addressText)) return;

    const key = `${(venueName ?? "").toLowerCase()}|${addressText.toLowerCase()}`;
    if (dedupe.has(key)) return;
    dedupe.add(key);
    out.push({ venue_name: venueName, address_text: addressText });
  });

  return out;
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

function normalizeLower(value: string | null | undefined): string {
  return normalizeSpace(value ?? "").toLowerCase();
}

function parseAddressParts(text: string | null | undefined): {
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  const raw = normalizeSpace(text ?? "");
  if (!raw) return { street: null, city: null, state: null, zip: null };
  const full = raw.match(
    /^(.+?),\s*([A-Za-z.\s]{2,60}),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i
  );
  if (full) {
    return {
      street: normalizeSpace(full[1] ?? ""),
      city: normalizeSpace(full[2] ?? ""),
      state: normalizeSpace((full[3] ?? "").toUpperCase()),
      zip: normalizeSpace(full[4] ?? "") || null,
    };
  }
  return { street: raw, city: null, state: null, zip: null };
}

function buildAddressKey(parts: { street: string | null; city: string | null; state: string | null }): string | null {
  const street = normalizeLower(parts.street);
  const city = normalizeLower(parts.city);
  const state = normalizeLower(parts.state);
  if (!street || !city || !state) return null;
  return `${street}|${city}|${state}`;
}

function extractVenueKeywordLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const out = new Set<string>();
  const keyword = /(venues?|locations?|fields?|facilit(y|ies)|field\s+directions?|directions?|maps?|complex|park)/i;

  $("a[href]").each((_idx, el) => {
    const hrefRaw = ($(el).attr("href") || "").trim();
    if (!hrefRaw) return;
    if (hrefRaw.startsWith("mailto:") || hrefRaw.startsWith("tel:") || hrefRaw.startsWith("javascript:")) return;
    const anchorText = normalizeSpace($(el).text() || "");
    if (!keyword.test(`${hrefRaw} ${anchorText}`)) return;
    const normalized = normalizeUrl(hrefRaw, base);
    if (!normalized) return;
    try {
      const parsed = new URL(normalized);
      if (parsed.hostname !== base.hostname) return;
      out.add(normalized);
    } catch {
      // ignore
    }
  });
  return Array.from(out);
}

function extractTournamentSpecificLinks(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  tournamentName: string | null | undefined,
  max = 6
): string[] {
  const rawName = normalizeSpace(String(tournamentName ?? ""));
  if (!rawName) return [];
  const base = new URL(baseUrl);

  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "of",
    "in",
    "at",
    "for",
    "to",
    "on",
    "tournament",
    "cup",
    "classic",
    "showcase",
    "invitational",
    "challenge",
    "festival",
    "spring",
    "summer",
    "fall",
    "winter",
    "soccer",
    "basketball",
    "softball",
    "baseball",
    "volleyball",
  ]);

  const nameTokens = rawName
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !stop.has(t));

  if (!nameTokens.length) return [];

  const scored: Array<{ href: string; score: number }> = [];
  const seen = new Set<string>();
  $("a[href]").each((_idx, el) => {
    const hrefRaw = ($(el).attr("href") || "").trim();
    if (!hrefRaw || hrefRaw.startsWith("mailto:") || hrefRaw.startsWith("tel:") || hrefRaw.startsWith("javascript:")) return;
    const normalized = normalizeUrl(hrefRaw, base);
    if (!normalized) return;
    try {
      const parsed = new URL(normalized);
      if (parsed.hostname !== base.hostname) return;
      if (seen.has(normalized)) return;
      seen.add(normalized);

      const anchorText = normalizeSpace($(el).text() || "");
      const combined = `${anchorText} ${parsed.pathname} ${parsed.search}`.toLowerCase();
      let hits = 0;
      for (const token of nameTokens) {
        if (combined.includes(token)) hits += 1;
      }
      if (hits === 0) return;
      // Require at least two token hits for common names to avoid drifting to generic pages.
      if (nameTokens.length >= 4 && hits < 2) return;
      let score = hits * 10;
      if (/(tournament|event|schedule|bracket|details|about)/i.test(combined)) score += 3;
      if (/(venue|venues|facility|facilities|fields|location|directions|map)/i.test(combined)) score += 2;
      scored.push({ href: normalized, score });
    } catch {
      return;
    }
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((s) => s.href);
}

function detectVenuePageUrl(currentUrl: string, $: cheerio.CheerioAPI): string | null {
  const selfPath = new URL(currentUrl).pathname.toLowerCase();
  if (/(^|\/)(venue|venues|location|locations|field|fields|facility|facilities|map|maps|directions?)(\/|$)/.test(selfPath))
    return currentUrl;

  const anchors = $("a[href]");
  for (const el of anchors) {
    const href = ($(el).attr("href") || "").trim();
    const anchorText = normalizeSpace($(el).text() || "");
    const combined = `${href} ${anchorText}`;
    if (!href) continue;
    if (/(^|\/)(venue|venues|location|locations|field|fields|facility|facilities|map|maps|directions?)(\/|$)/i.test(combined)) {
      try {
        return new URL(href, currentUrl).toString();
      } catch {
        continue;
      }
    }
  }
  return null;
}

function isLikelyVenueContentPage($: cheerio.CheerioAPI): boolean {
  const headingText = $("h1,h2,h3,h4,strong,b")
    .toArray()
    .map((el) => normalizeSpace($(el).text() || ""))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const bodyText = normalizeSpace($.text() || "").toLowerCase();

  const headingSignal = /(venues?|locations?|fields?|facilit(y|ies)|field\s+directions?|directions?|maps?)/i.test(headingText);
  const bodySignal =
    /(venues?|locations?|fields?|facilit(y|ies)|field\s+directions?|directions?|maps?)/i.test(bodyText) &&
    /\d{1,5}\s+[a-z0-9.\-#\s]{3,100},\s*[a-z.\s]{2,60},\s*[a-z]{2}\s*\d{5}(?:-\d{4})?/i.test(bodyText);

  return headingSignal || bodySignal;
}

function isLikelyVenueLandingPath(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /(^|\/)(venue|venues|location|locations|field|fields|facility|facilities|map|maps|directions?)(\/|$)/.test(pathname);
  } catch {
    return false;
  }
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

function decodeSearchRedirect(rawHref: string): string | null {
  const trimmed = (rawHref ?? "").trim();
  if (!trimmed) return null;
  try {
    const maybeUrl = new URL(trimmed);
    if (maybeUrl.hostname.includes("duckduckgo.com")) {
      const uddg = maybeUrl.searchParams.get("uddg");
      if (uddg) {
        const decoded = decodeURIComponent(uddg);
        if (/^https?:\/\//i.test(decoded)) return decoded;
      }
    }
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
  } catch {
    // fall through
  }
  if (trimmed.startsWith("/l/?")) {
    try {
      const parsed = new URL(`https://duckduckgo.com${trimmed}`);
      const uddg = parsed.searchParams.get("uddg");
      if (uddg) {
        const decoded = decodeURIComponent(uddg);
        if (/^https?:\/\//i.test(decoded)) return decoded;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

async function searchVenuePagesFallback(args: {
  tournamentName: string | null;
  city: string | null;
  state: string | null;
  seedHost: string;
  limit?: number;
}): Promise<string[]> {
  const tournamentName = normalizeSpace(args.tournamentName ?? "");
  if (!tournamentName) return [];
  const city = normalizeSpace(args.city ?? "");
  const state = normalizeSpace(args.state ?? "");
  const geo = [city, state].filter(Boolean).join(" ");
  const seedHost = (args.seedHost ?? "").trim().toLowerCase();
  const max = Math.max(1, Math.min(args.limit ?? 4, 8));

  const queries: string[] = [];
  if (seedHost) {
    queries.push(`site:${seedHost} "${tournamentName}" (venues OR fields OR locations OR maps)`);
  }
  queries.push(`"${tournamentName}" ${geo} (venues OR fields OR locations OR maps)`);
  queries.push(`"${tournamentName}" ${geo} "field directions"`);

  const found = new Set<string>();
  for (const q of queries) {
    if (found.size >= max) break;
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    let html: string | null = null;
    try {
      const resp = await fetch(url, {
        method: "GET",
        cache: "no-cache",
        redirect: "follow",
        headers: {
          "user-agent": "RI-FeesVenue-Scraper/2.1",
          accept: "text/html,application/xhtml+xml",
        },
      });
      if (!resp.ok) continue;
      const contentType = resp.headers.get("content-type") ?? "";
      if (!/text\/html/i.test(contentType)) continue;
      html = await resp.text();
    } catch {
      continue;
    }
    if (!html) continue;
    const $ = cheerio.load(html);
    const hrefs = $("a.result__a, a[href]")
      .toArray()
      .map((el) => ($(el).attr("href") || "").trim())
      .filter(Boolean);
    for (const href of hrefs) {
      const decoded = decodeSearchRedirect(href);
      if (!decoded) continue;
      try {
        const parsed = new URL(decoded);
        if (!/^https?:$/i.test(parsed.protocol)) continue;
        parsed.hash = "";
        const normalized = parsed.toString();
        if (seedHost && parsed.hostname.toLowerCase() !== seedHost) continue;
        if (!isLikelyVenueLandingPath(normalized)) continue;
        found.add(normalized);
        if (found.size >= max) break;
      } catch {
        continue;
      }
    }
  }
  return Array.from(found);
}

async function fetchTournamentPages(
  seedUrl: string,
  maxPages = 6,
  seededUrls: string[] = []
): Promise<Array<{ url: string; html: string }>> {
  const pages: Array<{ url: string; html: string }> = [];
  const queue: string[] = [seedUrl, ...seededUrls.filter((u) => u && u !== seedUrl)];
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
    // "1-hop" venue intelligence: if we land on a page that has a dedicated Fields/Locations/Venues link,
    // prioritize crawling it immediately (without relying on general internal-link ranking).
    const venueSeeds = extractVenueKeywordLinks($, nextUrl);
    for (const href of venueSeeds) {
      if (queue.length + pages.length >= maxPages * 8) break;
      if (!seen.has(href) && !queue.includes(href)) queue.unshift(href);
    }
    const ranked = rankInternalLinks($, nextUrl);
    for (const href of ranked) {
      if (queue.length + pages.length >= maxPages * 8) break;
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
  const mode = (searchParams.get("mode") ?? "").trim().toLowerCase();
  const focusMissingVenues = mode === "missing_venues";
  const statusParamRaw = (searchParams.get("status") ?? "").trim().toLowerCase();
  const statusParam = statusParamRaw === "draft" ? "draft" : "published";
  const requireCanonical = statusParam === "published";
  const skipPendingParam = (searchParams.get("skip_pending") ?? "").trim().toLowerCase();
  const enforcePendingSkip =
    skipPendingParam === "1" || skipPendingParam === "true" || (!focusMissingVenues && skipPendingParam !== "0");
  const limit = Number(searchParams.get("limit") ?? "10");
  const maxLimit = focusMissingVenues ? 200 : 50;
  const cappedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, maxLimit)) : 10;
  const candidatePoolSize = Math.min(cappedLimit * (focusMissingVenues ? 30 : 20), focusMissingVenues ? 5000 : 1000);
  const nowIso = new Date().toISOString();
  const cooldownDays = 10;
  const cooldownCutoffMs = Date.now() - cooldownDays * 24 * 60 * 60 * 1000;
  const tournamentIdParam = (searchParams.get("tournament_id") ?? "").trim();

  const fetchTargetTournaments = async () => {
    const withCooldownSelect = "id,name,city,state,official_website_url,source_url,fees_venue_scraped_at";
    const withoutCooldownSelect = "id,name,city,state,official_website_url,source_url";

    let primaryQuery = supabaseAdmin
      .from("tournaments" as any)
      .select(withCooldownSelect)
      .eq("status", statusParam)
      .eq("enrichment_skip", false)
      .or("official_website_url.not.is.null,source_url.not.is.null");
    if (requireCanonical) primaryQuery = primaryQuery.eq("is_canonical", true);

    if (focusMissingVenues) {
      // Prioritize the true "no venue data at all" backlog (aligns with /admin/tournaments/missing-venues):
      // published+canonical (for published runs) with both venue and address unset.
      primaryQuery = primaryQuery.is("venue", null).is("address", null);
    } else {
      primaryQuery = primaryQuery.or(
        "team_fee.is.null,games_guaranteed.is.null,player_parking.is.null,venue.is.null,address.is.null,venue_url.is.null"
      );
    }

    const primary = await primaryQuery
      .order("fees_venue_scraped_at", { ascending: true, nullsFirst: true })
      .limit(candidatePoolSize);

    if (!primary.error) return primary;

    if (isMissingCooldownColumnError(primary.error.message)) {
      let retryQuery = supabaseAdmin
        .from("tournaments" as any)
        .select(withoutCooldownSelect)
        .eq("status", statusParam)
        .eq("enrichment_skip", false)
        .or("official_website_url.not.is.null,source_url.not.is.null");
      if (requireCanonical) retryQuery = retryQuery.eq("is_canonical", true);
      if (focusMissingVenues) {
        retryQuery = retryQuery.is("venue", null).is("address", null);
      } else {
        retryQuery = retryQuery.or(
          "team_fee.is.null,games_guaranteed.is.null,player_parking.is.null,venue.is.null,address.is.null,venue_url.is.null"
        );
      }
      const retryWithoutCooldown = await retryQuery.limit(candidatePoolSize);
      if (!retryWithoutCooldown.error) return retryWithoutCooldown;
      if (!/column .* does not exist/i.test(retryWithoutCooldown.error.message)) return retryWithoutCooldown;
    } else if (!/column .* does not exist/i.test(primary.error.message)) {
      return primary;
    }

    // Backward-compatible fallback for environments where fee/venue columns are not migrated yet.
    let fallbackQuery = supabaseAdmin
      .from("tournaments" as any)
      .select(withCooldownSelect)
      .eq("status", statusParam)
      .eq("enrichment_skip", false)
      .or("official_website_url.not.is.null,source_url.not.is.null");
    if (requireCanonical) fallbackQuery = fallbackQuery.eq("is_canonical", true);
    if (focusMissingVenues) {
      fallbackQuery = fallbackQuery.is("venue", null).is("address", null);
    }
    const fallback = await fallbackQuery.order("fees_venue_scraped_at", { ascending: true, nullsFirst: true }).limit(candidatePoolSize);
    if (!fallback.error) return fallback;
    if (isMissingCooldownColumnError(fallback.error.message)) {
      let fallbackNoCooldownQuery = supabaseAdmin
        .from("tournaments" as any)
        .select(withoutCooldownSelect)
        .eq("status", statusParam)
        .eq("enrichment_skip", false)
        .or("official_website_url.not.is.null,source_url.not.is.null");
      if (requireCanonical) fallbackNoCooldownQuery = fallbackNoCooldownQuery.eq("is_canonical", true);
      if (focusMissingVenues) {
        fallbackNoCooldownQuery = fallbackNoCooldownQuery.is("venue", null).is("address", null);
      }
      return fallbackNoCooldownQuery.limit(candidatePoolSize);
    }
    return fallback;
  };

  let tournaments: any[] | null = null;
  let error: any = null;
  if (tournamentIdParam) {
    const { data, error: fetchError } = await supabaseAdmin
      .from("tournaments" as any)
      .select("id,name,city,state,official_website_url,source_url,fees_venue_scraped_at,venue,address,venue_url,enrichment_skip,status,is_canonical")
      .eq("id", tournamentIdParam)
      .maybeSingle();
    if (fetchError) {
      error = fetchError;
    } else if (!data) {
      return NextResponse.json({ error: "tournament_not_found", tournament_id: tournamentIdParam }, { status: 404 });
    } else {
      tournaments = [data];
    }
  } else {
    const resp = await fetchTargetTournaments();
    tournaments = (resp.data as any[] | null) ?? null;
    error = resp.error;
  }

  if (error) {
    return NextResponse.json({ error: "fetch_tournaments_failed", detail: error.message }, { status: 500 });
  }

  const selected: any[] = [];
  let skipped_recent = 0;
  let skipped_pending = 0;
  let skipped_linked = 0;
  let skipped_no_url = 0;
  let linkedTournamentIds = new Set<string>();
  if (focusMissingVenues && (tournaments as any[] | null)?.length) {
    const candidateTournamentIds = ((tournaments as any[] | null) ?? []).map((t: any) => String(t.id ?? "")).filter(Boolean);
    if (candidateTournamentIds.length) {
      // PostgREST `.in()` filters can overflow URL/header limits for large arrays,
      // so chunk these requests (otherwise we silently fail and end up scanning tournaments that already have venues).
      const out = new Set<string>();
      const chunkSize = 200;
      for (let i = 0; i < candidateTournamentIds.length; i += chunkSize) {
        const chunk = candidateTournamentIds.slice(i, i + chunkSize);
	        const { data: links, error: linkErr } = await supabaseAdmin
	          .from("tournament_venues" as any)
	          .select("tournament_id")
	          .in("tournament_id", chunk)
	          .eq("is_inferred", false)
	          .limit(20000);
        if (linkErr) {
          console.warn("[fees-venue] failed to load tournament_venues for missing_venues skip", linkErr.message);
          continue;
        }
        for (const row of (links ?? []) as Array<{ tournament_id: string | null }>) {
          const id = String(row.tournament_id ?? "");
          if (id) out.add(id);
        }
      }
      linkedTournamentIds = out;
    }
  }
  let pendingTournamentIds = new Set<string>();
  if (enforcePendingSkip) {
    const { data: pendingRows } = await supabaseAdmin
      .from("tournament_attribute_candidates" as any)
      .select("tournament_id")
      .is("accepted_at", null)
      .is("rejected_at", null)
      .in(
        "attribute_key",
        focusMissingVenues ? ["address", "venue_url"] : ["team_fee", "games_guaranteed", "player_parking", "address", "venue_url"]
      )
      .limit(10000);
    pendingTournamentIds = new Set(
      ((pendingRows ?? []) as Array<{ tournament_id: string | null }>).map((r) => String(r.tournament_id ?? "")).filter(Boolean)
    );
  }
  for (const t of (tournaments as any[] | null) ?? []) {
    // For bulk "missing venues" sweeps we skip tournaments already linked in tournament_venues,
    // but for an explicit tournament deep-scan request we still run (it may be missing additional venues).
    if (!tournamentIdParam && focusMissingVenues && linkedTournamentIds.has(String((t as any).id ?? ""))) {
      skipped_linked += 1;
      continue;
    }
    // Pending-skip is for bulk runs; per-tournament scans should re-run to refresh candidates.
    if (!tournamentIdParam && enforcePendingSkip && pendingTournamentIds.has(String((t as any).id ?? ""))) {
      skipped_pending += 1;
      continue;
    }
    const lastScraped = (t as any).fees_venue_scraped_at;
    // Cooldown is for bulk runs; per-tournament scans should always attempt.
    if (!tournamentIdParam && lastScraped) {
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
    evidence_text: string | null;
    confidence: number | null;
  }> = [];
  const venueReasonCounts = new Map<string, number>();
  const bumpReason = (reason: string) => venueReasonCounts.set(reason, (venueReasonCounts.get(reason) ?? 0) + 1);
  const summary: Array<{ tournament_id: string; name: string | null; found: string[] }> = [];
  const attemptedTournamentIds: string[] = [];
  const seededVenueUrlsByTournament = new Map<string, string[]>();
  const tournamentLocalityById = new Map<string, { city: string | null; state: string | null }>();
  const existingVenueByAddressKey = new Map<string, Array<{ id: string; venue_url: string | null }>>();
  const autoLinkRows: Array<{ tournament_id: string; venue_id: string }> = [];
  const autoLinkVenueUrlUpdates = new Map<string, string>();
  let attempted = 0;
  let pagesFetched = 0;
  let autoLinkedExisting = 0;
  let autoLinkedVenueUrlUpdated = 0;
  let droppedLowQualityVenueEntries = 0;
  let droppedLowScoreVenueEntries = 0;

  for (const t of selected) {
    tournamentLocalityById.set(String((t as any).id ?? ""), {
      city: normalizeSpace((t as any).city ?? "") || null,
      state: normalizeSpace((t as any).state ?? "").toUpperCase() || null,
    });
  }

  if (focusMissingVenues && selected.length) {
    const selectedIds = selected.map((t: any) => String(t.id ?? "")).filter(Boolean);
    const { data: seededAttrRows } = await supabaseAdmin
      .from("tournament_attribute_candidates" as any)
      .select("tournament_id,attribute_value")
      .in("tournament_id", selectedIds)
      .eq("attribute_key", "venue_url")
      .limit(5000);
    for (const row of (seededAttrRows ?? []) as Array<{ tournament_id: string | null; attribute_value: string | null }>) {
      const tid = String(row.tournament_id ?? "");
      const urlVal = normalizeSpace(row.attribute_value ?? "");
      if (!tid || !urlVal) continue;
      const list = seededVenueUrlsByTournament.get(tid) ?? [];
      if (!list.includes(urlVal)) list.push(urlVal);
      seededVenueUrlsByTournament.set(tid, list);
    }

    const { data: seededVenueRows } = await supabaseAdmin
      .from("tournament_venue_candidates" as any)
      .select("tournament_id,venue_url")
      .in("tournament_id", selectedIds)
      .limit(5000);
    for (const row of (seededVenueRows ?? []) as Array<{ tournament_id: string | null; venue_url: string | null }>) {
      const tid = String(row.tournament_id ?? "");
      const urlVal = normalizeSpace(row.venue_url ?? "");
      if (!tid || !urlVal) continue;
      const list = seededVenueUrlsByTournament.get(tid) ?? [];
      if (!list.includes(urlVal)) list.push(urlVal);
      seededVenueUrlsByTournament.set(tid, list);
    }

    const { data: existingVenues } = await supabaseAdmin
      .from("venues" as any)
      .select("id,address,address1,city,state,venue_url")
      .limit(20000);
    for (const venue of (existingVenues ?? []) as Array<{
      id: string;
      address: string | null;
      address1: string | null;
      city: string | null;
      state: string | null;
      venue_url: string | null;
    }>) {
      const parsed = parseAddressParts(venue.address1 ?? venue.address);
      const key = buildAddressKey({
        street: parsed.street,
        city: parsed.city ?? venue.city,
        state: parsed.state ?? venue.state,
      });
      if (!key) continue;
      const list = existingVenueByAddressKey.get(key) ?? [];
      list.push({ id: venue.id, venue_url: venue.venue_url ?? null });
      existingVenueByAddressKey.set(key, list);
    }
  }

  for (const t of selected) {
    const url = (t as any).official_website_url || (t as any).source_url;
    if (!url) {
      skipped_no_url += 1;
      continue;
    }
    attempted += 1;
    attemptedTournamentIds.push(t.id);
    const seedHost = (() => {
      try {
        return new URL(url).hostname.toLowerCase();
      } catch {
        return "";
      }
    })();
    const prefetchedSeedUrls = seededVenueUrlsByTournament.get(String((t as any).id ?? "")) ?? [];
    let homepageKeywordUrls: string[] = [];
    let tournamentSpecificUrls: string[] = [];
    const homepageHtml = await fetchHtml(url);
    if (homepageHtml) {
      const $home = cheerio.load(homepageHtml);
      homepageKeywordUrls = extractVenueKeywordLinks($home, url);
      if (focusMissingVenues) {
        tournamentSpecificUrls = extractTournamentSpecificLinks($home, url, (t as any).name ?? null, 6);
      }
    }
    const pages = await fetchTournamentPages(
      url,
      focusMissingVenues ? 12 : 6,
      Array.from(new Set([...tournamentSpecificUrls, ...prefetchedSeedUrls, ...homepageKeywordUrls]))
    );
    pagesFetched += pages.length;
    if (!pages.length) continue;
    const found: string[] = [];
    const inferredAddressPool: string[] = [];
    const venuePageAddressPool: string[] = [];
  const venueEntriesPool: Array<{
    venue_name: string | null;
    address_text: string;
    source_url: string;
    venue_url?: string | null;
    reason: string;
  }> = [];
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
      const venuePathMatch = /(^|\/)(venue|venues|location|locations|field|fields|facility|facilities|map|maps|directions?)(\/|$)/i.test(
        new URL(page.url).pathname
      );
      if (venuePathMatch || isLikelyVenueContentPage($)) {
        extractVenuePageAddresses($, locality).forEach((addr) => venuePageAddressPool.push(addr));
        extractVenueEntriesFromPage($, locality).forEach((entry) =>
          venueEntriesPool.push({ ...entry, source_url: page.url, venue_url: null, reason: "page_text_address" })
        );
        extractMapLinkedVenueEntries($).forEach((entry) =>
          venueEntriesPool.push({ ...entry, source_url: page.url, venue_url: null, reason: "map_link" })
        );
        // Many sites expose venue location via schema.org JSON-LD even when the rendered page is thin.
        extractJsonLdVenueEntriesFromPage($).forEach((entry) =>
          venueEntriesPool.push({ venue_name: entry.venue_name, address_text: entry.address_text, source_url: page.url, venue_url: entry.venue_url, reason: "jsonld_location" })
        );
      }

      // Some sites list facilities as "Venue Name – City, ST" with no street address.
      // Capture those so we can later resolve to full addresses via follow-up lookup.
      if (focusMissingVenues) {
        for (const facility of extractFacilitiesFromPage($).slice(0, 12)) {
          venueEntriesPool.push({
            venue_name: facility.venue_name,
            address_text: facility.address_text,
            source_url: page.url,
            venue_url: null,
            reason: "facility_city_state",
          });
        }
      }

      // Even on non-venue landing pages, JSON-LD sometimes includes the event location.
      if (focusMissingVenues && !(venuePathMatch || isLikelyVenueContentPage($))) {
        for (const entry of extractJsonLdVenueEntriesFromPage($).slice(0, 6)) {
          venueEntriesPool.push({
            venue_name: entry.venue_name,
            address_text: entry.address_text,
            source_url: page.url,
            venue_url: entry.venue_url,
            reason: "jsonld_location",
          });
        }
      }

      if (focusMissingVenues) {
        const tournamentState = normalizeSpace((t as any).state ?? "").toUpperCase() || null;
        const mapCards = extractVenueMapCardsFromPage({ $, tournamentState });
        if (mapCards.length) {
          for (const card of mapCards.slice(0, 8)) {
            const city = card.city ? normalizeSpace(card.city) : null;
            const address_text = [city, tournamentState].filter(Boolean).join(", ");
            if (!address_text) continue;
            venueEntriesPool.push({
              venue_name: card.venue_name,
              address_text,
              source_url: page.url,
              venue_url: card.map_image_url,
              reason: "map_link",
            });
          }

          // When running a single-tournament deep scan, attempt a lightweight lookup for full addresses
          // based on the extracted venue name + city/state.
          if (tournamentIdParam) {
            const toLookup = mapCards.slice(0, 4);
            for (const card of toLookup) {
              const full = await searchFullAddressForVenue({
                venueName: card.venue_name,
                city: card.city,
                state: tournamentState,
                maxResults: 3,
              });
              if (!full) continue;
              venueEntriesPool.push({
                venue_name: card.venue_name,
                address_text: full,
                source_url: page.url,
                venue_url: card.map_image_url,
                reason: "map_link",
              });
            }
          }
        }
      }

      // Do not insert raw venue_url-only candidates. If we can't resolve a URL to a real
      // venue name + address (and thus create/link a venue), it creates junk rows and
      // a confusing review experience. Venue URLs are still used to force-parse venue pages
      // below, which can yield real venue candidates with address text.

      if (foundByKey.size >= 5) break;
    }

    // Force-parse any discovered internal venue page URLs (e.g. /venues) so we can
    // extract multiple venue name/address rows even when generic crawl ranking misses them.
    const crawledUrls = new Set(pages.map((p) => p.url));
    const forcedVenuePages = Array.from(venueUrlCandidates)
      .filter((candidateUrl) => {
        if (!isLikelyVenueLandingPath(candidateUrl)) return false;
        try {
          const parsed = new URL(candidateUrl);
          if (!/^https?:$/i.test(parsed.protocol)) return false;
          if (!seedHost || parsed.hostname.toLowerCase() !== seedHost) return false;
        } catch {
          return false;
        }
        return !crawledUrls.has(candidateUrl);
      })
      .slice(0, 4);

    for (const forcedUrl of forcedVenuePages) {
      const forcedHtml = await fetchHtml(forcedUrl);
      if (!forcedHtml) continue;
      pagesFetched += 1;
      crawledUrls.add(forcedUrl);
      const $ = cheerio.load(forcedHtml);
      const text = $.text().replace(/\s+/g, " ");
      extractAddresses(text).forEach((addr) => inferredAddressPool.push(addr));
      const locality = inferLocality(inferredAddressPool);
      extractVenuePageAddresses($, locality).forEach((addr) => venuePageAddressPool.push(addr));
      extractVenueEntriesFromPage($, locality).forEach((entry) =>
        venueEntriesPool.push({ ...entry, source_url: forcedUrl, venue_url: null, reason: "page_text_address" })
      );
      extractMapLinkedVenueEntries($).forEach((entry) =>
        venueEntriesPool.push({ ...entry, source_url: forcedUrl, venue_url: null, reason: "map_link" })
      );
    }

    if (focusMissingVenues && venueEntriesPool.length === 0 && venuePageAddressPool.length === 0) {
      const fallbackVenueUrls = await searchVenuePagesFallback({
        tournamentName: t.name ?? null,
        city: (t as any).city ?? null,
        state: (t as any).state ?? null,
        seedHost,
        limit: 4,
      });
      for (const fallbackUrl of fallbackVenueUrls) {
        if (crawledUrls.has(fallbackUrl)) continue;
        const fallbackHtml = await fetchHtml(fallbackUrl);
        if (!fallbackHtml) continue;
        pagesFetched += 1;
        crawledUrls.add(fallbackUrl);
        venueUrlCandidates.add(fallbackUrl);

        const $ = cheerio.load(fallbackHtml);
        const text = $.text().replace(/\s+/g, " ");
        extractAddresses(text).forEach((addr) => inferredAddressPool.push(addr));
        const locality = inferLocality(inferredAddressPool);
        extractVenuePageAddresses($, locality).forEach((addr) => venuePageAddressPool.push(addr));
        extractVenueEntriesFromPage($, locality).forEach((entry) =>
          venueEntriesPool.push({ ...entry, source_url: fallbackUrl, venue_url: null, reason: "page_text_address" })
        );
        extractMapLinkedVenueEntries($).forEach((entry) =>
          venueEntriesPool.push({ ...entry, source_url: fallbackUrl, venue_url: null, reason: "map_link" })
        );
      }
    }

    const tournamentState = normalizeSpace((t as any).state ?? "").toUpperCase() || null;
    const allAddresses = Array.from(new Set([...inferredAddressPool, ...venuePageAddressPool]))
      .filter((addr) => {
        const addrState = extractStateFromFullAddress(addr);
        if (!addrState || !tournamentState) return true;
        return addrState === tournamentState;
      })
      .slice(0, 12);
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
      const ranked = venueEntriesPool
        .map((entry) => {
          const candidateVenueUrl = entry.venue_url ?? Array.from(venueUrlCandidates)[0] ?? null;
          const score = scoreVenueEntryForInsert(entry, candidateVenueUrl);
          return { entry, candidateVenueUrl, score, confidence: confidenceFromVenueScore(score) };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

      const minScoreToInsert = focusMissingVenues ? 5 : 5;
      for (const { entry, candidateVenueUrl, score, confidence } of ranked) {
        if (!looksLikeStreetAddress(entry.address_text)) {
          droppedLowQualityVenueEntries += 1;
          continue;
        }
        if (entry.venue_name && isJunkVenueName(entry.venue_name)) {
          droppedLowQualityVenueEntries += 1;
          continue;
        }
        if (score < minScoreToInsert) {
          droppedLowScoreVenueEntries += 1;
          continue;
        }
        const key = `${(entry.venue_name ?? "").toLowerCase()}|${entry.address_text.toLowerCase()}|${entry.source_url}`;
        if (entryDedup.has(key)) continue;
        entryDedup.add(key);
        let autoLinked = false;
        if (focusMissingVenues) {
          const tournamentLocality = tournamentLocalityById.get(String(t.id ?? ""));
          const parsedAddress = parseAddressParts(entry.address_text);
          const parsedState = parsedAddress.state ?? extractStateFromFullAddress(entry.address_text);
          const tournamentState = normalizeSpace(tournamentLocality?.state ?? "") || null;
          // If we have a state in the extracted address and it doesn't match the tournament state,
          // skip to avoid "sticky" footer/contact addresses bleeding across states.
          if (parsedState && tournamentState && parsedState.toUpperCase() !== tournamentState.toUpperCase()) {
            continue;
          }
          const addrKey = buildAddressKey({
            street: parsedAddress.street,
            city: parsedAddress.city ?? tournamentLocality?.city ?? null,
            state: parsedAddress.state ?? tournamentLocality?.state ?? null,
          });
          if (addrKey) {
            const existing = existingVenueByAddressKey.get(addrKey) ?? [];
            const matched = existing[0] ?? null;
            if (matched?.id) {
              autoLinkRows.push({ tournament_id: t.id, venue_id: matched.id });
              autoLinkedExisting += 1;
              autoLinked = true;
              if (candidateVenueUrl && !matched.venue_url) {
                autoLinkVenueUrlUpdates.set(matched.id, candidateVenueUrl);
              }
            }
          }
        }
        if (!autoLinked) {
          bumpReason(entry.reason || "unknown");
          venueCandidates.push({
            tournament_id: t.id,
            venue_name: entry.venue_name,
            address_text: entry.address_text,
            source_url: entry.source_url,
            venue_url: candidateVenueUrl,
            evidence_text: `reason=${entry.reason || "unknown"}; score=${score};`,
            confidence,
          });
        }
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

	  if (autoLinkRows.length) {
	    const dedup = new Map<string, { tournament_id: string; venue_id: string }>();
	    for (const row of autoLinkRows) {
	      dedup.set(`${row.tournament_id}|${row.venue_id}`, row);
	    }
	    const rows = Array.from(dedup.values()).map((row) => ({ ...row, is_inferred: false }));
	    const { error: linkError } = await supabaseAdmin
	      .from("tournament_venues" as any)
	      .upsert(rows, { onConflict: "tournament_id,venue_id" });
    if (linkError) {
      return NextResponse.json(
        {
          ok: false,
          error: "auto_link_existing_venues_failed",
          detail: linkError.message,
          attempted,
          pages_fetched: pagesFetched,
          auto_link_rows: rows.length,
        },
        { status: 500 }
      );
    }
  }

  if (autoLinkVenueUrlUpdates.size) {
    for (const [venueId, venueUrl] of autoLinkVenueUrlUpdates.entries()) {
      const { error: updateErr } = await supabaseAdmin
        .from("venues" as any)
        .update({ venue_url: venueUrl })
        .eq("id", venueId)
        .or("venue_url.is.null,venue_url.eq.");
      if (!updateErr) autoLinkedVenueUrlUpdated += 1;
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
    mode: focusMissingVenues ? "missing_venues" : "default",
    skip_pending: enforcePendingSkip,
    inserted,
    venue_inserted: venueInserted,
    venue_candidates_parsed: venueCandidates.length,
    venue_candidates_inserted: venueInserted,
    venue_candidates_dropped_low_quality: droppedLowQualityVenueEntries,
    venue_candidates_dropped_low_score: droppedLowScoreVenueEntries,
    venue_reason_counts: Object.fromEntries(
      Array.from(venueReasonCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
    ),
    auto_linked_existing: autoLinkedExisting,
    auto_linked_venue_url_updated: autoLinkedVenueUrlUpdated,
    attempted,
    pages_fetched: pagesFetched,
    skipped_recent,
    skipped_pending,
    skipped_linked,
    skipped_no_url,
    skipped_duplicates,
    summary,
  });
}
