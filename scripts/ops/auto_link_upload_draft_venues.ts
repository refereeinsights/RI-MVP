import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";

type TournamentRow = {
  id: string;
  name: string | null;
  status: string | null;
  tournament_association: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  venue: string | null;
  address: string | null;
  source_url: string | null;
  official_website_url: string | null;
};

type VenueRow = {
  id: string;
  name: string | null;
  address1: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  venue_url: string | null;
};

function argValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLower(value: string) {
  return normalizeSpace(value).toLowerCase();
}

function loadEnvLocalIfMissing() {
  // Keep scripts runnable locally without having to export env vars manually.
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const p = pathJoin(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2] || "";
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}

function pathJoin(...parts: string[]) {
  // Avoid importing node:path just for this script.
  return parts.join("/").replace(/\/{2,}/g, "/");
}

function extractAddresses(text: string): string[] {
  const pattern =
    /\d{1,5}\s+[A-Za-z0-9.\-#\s]{3,100},\s*[A-Za-z.\s]{2,60},\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?/g;
  const matches = Array.from(text.matchAll(pattern)).map((m) => normalizeSpace(m[0] ?? ""));
  return Array.from(new Set(matches.filter(Boolean)));
}

function isPlaceholderVenueName(name: string | null | undefined) {
  const v = normalizeLower(String(name || ""));
  if (!v) return false;
  const compact = v.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!compact) return false;
  if (compact === "tbd" || compact === "tba") return true;
  if (compact === "to be determined" || compact === "to be announced") return true;
  if (compact === "venue tbd" || compact === "venues tbd" || compact === "tbd venue" || compact === "tbd venues")
    return true;
  return false;
}

function parseFullAddress(addr: string): { address1: string; city: string; state: string; zip: string } | null {
  const m = addr.match(/^(.+?),\s*([A-Za-z.\s]{2,60}),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/);
  if (!m) return null;
  const address1 = normalizeSpace(m[1] ?? "");
  const city = normalizeSpace(m[2] ?? "");
  const state = (m[3] ?? "").trim().toUpperCase();
  const zip = (m[4] ?? "").trim();
  if (!address1 || !city || !state || !zip) return null;
  return { address1, city, state, zip };
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

function extractVenueEntriesFromPage($: cheerio.CheerioAPI): Array<{ venue_name: string; address_text: string }> {
  const out: Array<{ venue_name: string; address_text: string }> = [];
  const seen = new Set<string>();
  const nodes = $("li, tr, p, div, h3, h4")
    .toArray()
    .slice(0, 1400);

  for (const node of nodes) {
    const text = normalizeSpace($(node).text() || "");
    if (!text) continue;
    const addresses = extractAddresses(text);
    if (!addresses.length) continue;

    const headingText = $(node).find("strong,h3,h4,b").first().text() || "";
    const heading = cleanVenueName(headingText);
    const fallbackHeading = cleanVenueName(text.split(",")[0] || "");
    const venueName = heading ?? fallbackHeading;
    if (!venueName) continue;
    if (isPlaceholderVenueName(venueName)) continue;

    for (const address of addresses) {
      const key = `${venueName.toLowerCase()}|${address.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ venue_name: venueName, address_text: address });
    }
  }

  return out;
}

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const resp = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "RI-DraftVenueAutoLink/1.0" },
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(contentType) && !/application\/xhtml\+xml/i.test(contentType)) return null;
    const html = await resp.text();
    if (!html || html.length < 200) return null;
    return html.slice(0, 1024 * 1024);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function isLikelyVenueLink(href: string) {
  const h = href.toLowerCase();
  return (
    h.includes("field") ||
    h.includes("facility") ||
    h.includes("facilities") ||
    h.includes("venue") ||
    h.includes("venues") ||
    h.includes("location") ||
    h.includes("directions") ||
    h.includes("park") ||
    h.includes("complex")
  );
}

function rankInternalLinks($: cheerio.CheerioAPI, baseUrl: string) {
  const out: string[] = [];
  const seen = new Set<string>();
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return out;
  }
  $("a[href]")
    .toArray()
    .forEach((el) => {
      const hrefRaw = ($(el).attr("href") || "").trim();
      if (!hrefRaw) return;
      let abs: string;
      try {
        abs = new URL(hrefRaw, base).toString();
      } catch {
        return;
      }
      try {
        const u = new URL(abs);
        if (u.hostname.toLowerCase() !== base.hostname.toLowerCase()) return;
        u.hash = "";
        abs = u.toString();
      } catch {
        return;
      }
      if (seen.has(abs)) return;
      if (!isLikelyVenueLink(abs)) return;
      seen.add(abs);
      out.push(abs);
    });
  return out.slice(0, 6);
}

async function fetchPages(seedUrl: string, maxPages: number) {
  const pages: Array<{ url: string; html: string }> = [];
  const queue: string[] = [seedUrl];
  const seen = new Set<string>();
  while (queue.length && pages.length < maxPages) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    const html = await fetchHtml(next);
    if (!html) continue;
    pages.push({ url: next, html });
    const $ = cheerio.load(html);
    for (const href of rankInternalLinks($, next)) {
      if (!seen.has(href) && !queue.includes(href) && queue.length + pages.length < maxPages * 6) queue.push(href);
    }
  }
  return pages;
}

function isLikelyVenueName(text: string) {
  const v = normalizeSpace(text);
  if (!v) return false;
  if (v.length < 3 || v.length > 120) return false;
  const lower = v.toLowerCase();
  // Avoid obviously non-venue tokens.
  if (lower.includes("http") || lower.includes("@")) return false;
  if (/\b(division|bracket|schedule|standings|registration|register|entry fee|fees|referee|rules)\b/i.test(v)) return false;
  // If it contains a full postal address, it's not a venue name.
  if (extractAddresses(v).length) return false;
  // Most facility names have one of these tokens; keep it conservative to avoid random headings.
  return /\b(park|fields?|complex|center|arena|rink|stadium|sportsplex|facility|gym|dome|school|high school|university|college)\b/i.test(
    v
  );
}

function extractVenueNamesFromPage($: cheerio.CheerioAPI): string[] {
  const out = new Set<string>();

  // Strong signals: list/table content, headings, and emphasized labels.
  const nodes = $("li, tr, td, p, div, h2, h3, h4, strong, b")
    .toArray()
    .slice(0, 1800);

  for (const node of nodes) {
    const raw = normalizeSpace($(node).text() || "");
    if (!raw) continue;

    // Split common delimiters so "Venue A | Venue B" doesn't get treated as one string.
    const parts = raw
      .split(/[|•·]/)
      .map((p) => normalizeSpace(p))
      .filter(Boolean);

    for (const part of parts) {
      const name = cleanVenueName(part) ?? "";
      if (!name) continue;
      if (isPlaceholderVenueName(name)) continue;
      if (!isLikelyVenueName(name)) continue;
      out.add(name);
      if (out.size >= 30) break;
    }
    if (out.size >= 30) break;
  }

  return Array.from(out);
}

function venueNameVariants(name: string) {
  const base = normalizeSpace(name);
  const variants = new Set<string>();
  if (base) variants.add(base);
  // Drop parenthetical suffixes like "Foo Park (Field 2)" or "(Main Complex)".
  const noParen = base.replace(/\s*\([^)]{1,60}\)\s*$/, "").trim();
  if (noParen && noParen !== base) variants.add(noParen);
  // Normalize common punctuation differences.
  const noDots = base.replace(/\./g, "").replace(/\s{2,}/g, " ").trim();
  if (noDots && noDots !== base) variants.add(noDots);
  return Array.from(variants);
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  const includeAll = process.argv.includes("--all-drafts");
  const nameOnly = process.argv.includes("--name-only");
  const state = (argValue("state") || "FL").toUpperCase();
  const association = (argValue("association") || "AYSO").toUpperCase();
  const limit = Number(argValue("limit") || "200");
  const maxPages = Number(argValue("max-pages") || "4");

  loadEnvLocalIfMissing();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const draftsResp = await supabase
    .from("tournaments")
    .select(
      "id,name,status,tournament_association,city,state,start_date,end_date,venue,address,source_url,official_website_url"
    )
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(Math.max(200, limit));
  if (draftsResp.error) throw draftsResp.error;

  const drafts = (draftsResp.data ?? []) as TournamentRow[];
  const filtered = drafts.filter((t) => {
    if (!includeAll) {
      const st = (t.state || "").toUpperCase();
      const assoc = (t.tournament_association || "").toUpperCase();
      if (st !== state && assoc !== association) return false;
    }
    return true;
  });

  const ids = filtered.map((t) => t.id);
  const tvResp = ids.length
    ? await supabase.from("tournament_venues").select("tournament_id", { count: "exact" }).in("tournament_id", ids).limit(20000)
    : { data: [], error: null, count: 0 };
  if ((tvResp as any).error) throw (tvResp as any).error;
  const linked = new Set<string>(((tvResp as any).data ?? []).map((r: any) => String(r.tournament_id ?? "")).filter(Boolean));

  const candidates = filtered
    .filter((t) => !linked.has(t.id))
    .slice(0, Math.max(1, Math.min(limit, 2000)));

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        includeAll,
        filter: includeAll ? "all drafts" : `drafts where state=${state} OR association=${association}`,
        drafts_in_scope: filtered.length,
        already_linked: linked.size,
        to_scan: candidates.length,
      },
      null,
      2
    )
  );

  let scanned = 0;
  let fetched = 0;
  let foundVenueEntries = 0;
  let foundVenueNames = 0;
  let venuesMatched = 0;
  let venuesCreated = 0;
  let linksUpserted = 0;
  let tournamentsPatched = 0;
  let skippedNoAddresses = 0;
  let fetchFailed = 0;

  for (const t of candidates) {
    scanned += 1;
    const seedUrl = (t.official_website_url || t.source_url || "").trim();
    if (!seedUrl) continue;

    const pages = await fetchPages(seedUrl, maxPages);
    if (!pages.length) {
      fetchFailed += 1;
      continue;
    }
    fetched += 1;

    if (nameOnly) {
      const names = new Set<string>();
      for (const page of pages) {
        const $ = cheerio.load(page.html);
        for (const n of extractVenueNamesFromPage($)) names.add(n);
      }
      if (!names.size) {
        skippedNoAddresses += 1;
        continue;
      }
      foundVenueNames += names.size;

      let perTournamentLinks = 0;
      let perTournamentMatched = 0;
      let patchedThisTournament = false;

      for (const venue_name of names) {
        if (isPlaceholderVenueName(venue_name)) continue;
        if (!t.state) continue;

        let venueId: string | null = null;
        for (const variant of venueNameVariants(venue_name)) {
          const matchResp = await supabase
            .from("venues")
            .select("id,name,city,state")
            .eq("state", t.state.toUpperCase())
            // ilike with no wildcards behaves as case-insensitive equality.
            .ilike("name", variant)
            .limit(6);
          if (matchResp.error) throw matchResp.error;
          const existing = ((matchResp.data ?? []) as VenueRow[]).filter((v) => !isPlaceholderVenueName(v.name));
          if (existing.length === 1) {
            venueId = existing[0]!.id;
            break;
          }
        }
        if (!venueId) continue;

        venuesMatched += 1;
        perTournamentMatched += 1;

        if (APPLY) {
          const link = await supabase
            .from("tournament_venues")
            .upsert({ tournament_id: t.id, venue_id: venueId }, { onConflict: "tournament_id,venue_id" });
          if (link.error) throw link.error;
        }
        linksUpserted += 1;
        perTournamentLinks += 1;

        if (APPLY) {
          const patch: any = {};
          if (!t.venue) patch.venue = venue_name;
          if (Object.keys(patch).length) {
            const upd = await supabase.from("tournaments").update(patch).eq("id", t.id);
            if (upd.error) throw upd.error;
            patchedThisTournament = true;
            if (patch.venue) t.venue = patch.venue;
          }
        }
      }

      if (patchedThisTournament) tournamentsPatched += 1;
      console.log(
        `[${APPLY ? "apply" : "dry-run"}] ${t.id} :: ${t.name ?? ""} :: name_only venues_found=${names.size} linked=${perTournamentLinks} matched=${perTournamentMatched} :: ${seedUrl}`
      );
      continue;
    }

    const entries: Array<{ venue_name: string; address: ReturnType<typeof parseFullAddress> }> = [];
    for (const page of pages) {
      const $ = cheerio.load(page.html);
      for (const entry of extractVenueEntriesFromPage($)) {
        const parsed = parseFullAddress(entry.address_text);
        if (!parsed) continue;
        const venueName = cleanVenueName(entry.venue_name);
        if (!venueName) continue;
        entries.push({ venue_name: venueName, address: parsed });
      }
    }

    // De-dupe within tournament run.
    const uniq = new Map<
      string,
      { venue_name: string; address: { address1: string; city: string; state: string; zip: string } }
    >();
    for (const e of entries) {
      if (!e.address) continue;
      const key = `${normalizeLower(e.venue_name)}|${normalizeLower(e.address.address1)}|${normalizeLower(e.address.city)}|${e.address.state}|${e.address.zip}`;
      if (!uniq.has(key)) uniq.set(key, { venue_name: e.venue_name, address: e.address });
    }

    if (!uniq.size) {
      skippedNoAddresses += 1;
      continue;
    }

    foundVenueEntries += uniq.size;
    let perTournamentLinks = 0;
    let perTournamentCreated = 0;
    let perTournamentMatched = 0;
    let patchedThisTournament = false;

    for (const { venue_name, address } of uniq.values()) {
      if (isPlaceholderVenueName(venue_name)) continue;

      // Try to match existing venue by address1+city+state.
      const matchResp = await supabase
        .from("venues")
        .select("id,name,address,address1,city,state,zip,venue_url")
        .eq("state", address.state)
        .eq("city", address.city)
        .or(`address1.ilike.${address.address1},address.ilike.${address.address1}`)
        .limit(3);
      if (matchResp.error) throw matchResp.error;

      let venueId: string | null = null;
      const existing = (matchResp.data ?? []) as VenueRow[];
      const existingNonPlaceholder = existing.filter((v) => !isPlaceholderVenueName(v.name));
      if (existingNonPlaceholder.length) {
        venueId = existingNonPlaceholder[0]!.id;
        venuesMatched += 1;
        perTournamentMatched += 1;
      } else if (APPLY) {
        const ins = await supabase
          .from("venues")
          .insert({
            name: venue_name,
            address1: address.address1,
            address: address.address1,
            city: address.city,
            state: address.state,
            zip: address.zip,
          })
          .select("id")
          .single();
        if (ins.error) throw ins.error;
        venueId = (ins.data as any).id as string;
        venuesCreated += 1;
        perTournamentCreated += 1;
      } else {
        venueId = "DRY_RUN";
      }

      if (!venueId) continue;

      if (APPLY) {
        const link = await supabase
          .from("tournament_venues")
          .upsert({ tournament_id: t.id, venue_id: venueId }, { onConflict: "tournament_id,venue_id" });
        if (link.error) throw link.error;
      }
      linksUpserted += 1;
      perTournamentLinks += 1;

      if (APPLY) {
        // Only fill the legacy text fields if blank.
        const patch: any = {};
        if (!t.venue) patch.venue = venue_name;
        if (!t.address) patch.address = address.address1;
        if (Object.keys(patch).length) {
          const upd = await supabase.from("tournaments").update(patch).eq("id", t.id);
          if (upd.error) throw upd.error;
          patchedThisTournament = true;
          // Prevent repeated updates for the same tournament in this run.
          if (patch.venue) t.venue = patch.venue;
          if (patch.address) t.address = patch.address;
        }
      }
    }

    if (patchedThisTournament) tournamentsPatched += 1;

    console.log(
      `[${APPLY ? "apply" : "dry-run"}] ${t.id} :: ${t.name ?? ""} :: venues_found=${uniq.size} linked=${perTournamentLinks} matched=${perTournamentMatched} created=${perTournamentCreated} :: ${seedUrl}`
    );
  }

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        scanned,
        fetched,
        fetchFailed,
        skippedNoAddresses,
        foundVenueEntries,
        foundVenueNames,
        venuesMatched,
        venuesCreated,
        linksUpserted,
        tournamentsPatched,
      },
      null,
      2
    )
  );

  if (!APPLY) {
    console.log(
      nameOnly
        ? "Run again with --apply to write tournament_venues links (name-only links only when exactly one venue matches by name+city+state)."
        : "Run again with --apply to write venues + tournament_venues links (only when a full address is found)."
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
