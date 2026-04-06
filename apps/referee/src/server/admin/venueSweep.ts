import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { TournamentRow } from "@/lib/types/tournament";
import * as cheerio from "cheerio";
import { atlasSearch, getSearchProviderName } from "@/server/atlas/search";
import {
  getRegistryRowByUrl,
  normalizeSourceUrl,
  TERMINAL_REVIEW_STATUSES,
  upsertRegistry,
} from "@/server/admin/sources";
import { createTournamentFromUrl, fetchHtml } from "@/server/admin/pasteUrl";

type VenueRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  sport: string | null;
  venue_url?: string | null;
};

function clean(val: unknown) {
  return String(val ?? "").trim();
}

function safeSport(value: string | null | undefined) {
  const v = clean(value).toLowerCase();
  return (v || "other") as TournamentRow["sport"];
}

function safeHost(url: string | null | undefined) {
  try {
    return url ? new URL(url).hostname.toLowerCase() : "";
  } catch {
    return "";
  }
}

function buildVenueSweepQueries(venue: VenueRow) {
  const name = clean(venue.name);
  const city = clean(venue.city);
  const state = clean(venue.state).toUpperCase();
  const sport = safeSport(venue.sport);
  const venueHost = safeHost(venue.venue_url);

  // Keep these short (Brave hard limit is 400 chars; other providers are more forgiving).
  const quoted = name.includes('"') ? name.replace(/"/g, "") : `"${name}"`;

  const negatives = "-league -rental -availability -reservation -permit -jobs -construction";
  const base = [
    `${quoted} tournament ${city} ${state} ${negatives}`,
    `${quoted} youth tournament ${state} ${negatives}`,
    `${quoted} ${sport} tournament ${state} ${negatives}`,
    `${quoted} cup showcase classic invitational ${state} ${negatives}`,
  ];

  // Some venues are generic names; add city/state anchored variants.
  if (city && state) {
    base.push(`${quoted} tournament ${city}`);
  }

  // If the venue has a website, add a site-anchored query that can find hidden “events” pages or PDFs.
  if (venueHost) {
    base.push(`site:${venueHost} (${sport} OR tournament OR cup OR classic OR showcase) ${state}`);
  }

  // Keep deterministic and unique.
  return Array.from(new Set(base.map((q) => q.replace(/\s+/g, " ").trim()).filter(Boolean))).slice(0, 8);
}

function isLikelyTournamentResult(args: {
  url: string;
  domain?: string | null;
  title?: string | null;
  snippet?: string | null;
}) {
  const domain = String(args.domain ?? "").toLowerCase();
  const text = `${args.title ?? ""} ${args.snippet ?? ""} ${args.url}`.toLowerCase();

  // Always allow known tournament platforms/directories.
  const allowDomains = [
    "usssa.com",
    "gotsport.com",
    "gotsoccer.com",
    "tourneymachine.com",
    "exposureevents.com",
    "perfectgame.org",
    "sportsengine.com",
    "leagueapps.com",
    "playpass.com",
    "eventconnect.io",
  ];
  if (allowDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;

  // Drop obvious non-tournament content.
  const hardBlockDomains = ["facebook.com", "instagram.com", "tiktok.com", "x.com", "twitter.com", "youtube.com"];
  if (hardBlockDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) return false;
  if (domain.endsWith(".gov")) return false;

  const positive = /(tournament|cup|classic|showcase|shootout|invitational|championship|qualifier|state\s+cup|memorial\s+day)/i;
  const negative = /(field\s*(rental|availability|reservation|schedule)|facility\s*(rental|availability)|park\s+rules|hours\s+of\s+operation|construction|locker\s+rooms|restrooms|pickleball|recreation\s+center)/i;

  if (!positive.test(text)) return false;
  if (negative.test(text)) return false;
  return true;
}

function isLikelyVenueInfoResult(args: {
  url: string;
  domain?: string | null;
  title?: string | null;
  snippet?: string | null;
  venueHost?: string;
}) {
  const domain = String(args.domain ?? "").toLowerCase();
  const venueHost = String(args.venueHost ?? "").toLowerCase();
  const text = `${args.title ?? ""} ${args.snippet ?? ""} ${args.url}`.toLowerCase();

  // If it’s on the venue’s own site, allow it as a venue-info candidate.
  if (venueHost && (domain === venueHost || domain.endsWith(`.${venueHost}`))) return true;

  // Otherwise, only allow clear “facility” pages (low volume).
  const facility = /(sports\s+complex|soccer\s+complex|baseball\s+complex|athletic\s+complex|recreation\s+center|park|fields|sportsplex|facility)/i;
  if (!facility.test(text)) return false;

  // Drop obvious noise.
  const hardBlockDomains = ["facebook.com", "instagram.com", "tiktok.com", "x.com", "twitter.com", "youtube.com"];
  if (hardBlockDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) return false;
  if (domain.endsWith(".gov")) return false;

  return true;
}

function looksLikeTournamentLink(textRaw: string, hrefRaw: string) {
  const text = `${textRaw ?? ""}`.replace(/\s+/g, " ").trim().toLowerCase();
  const href = `${hrefRaw ?? ""}`.trim().toLowerCase();
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  if (href.endsWith(".jpg") || href.endsWith(".png") || href.endsWith(".svg")) return false;

  const positive = /(tournament|cup|classic|showcase|shootout|invitational|championship|qualifier|state\s+cup|memorial\s+day)/i;
  const negative = /(league|rental|availability|reservation|permit|field\s*map|rules|hours|calendar\s*sync|pickleball)/i;
  if (negative.test(text) || negative.test(href)) return false;
  return positive.test(text) || positive.test(href);
}

function extractEventNameCandidates(textRaw: string) {
  const text = String(textRaw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const out: string[] = [];
  const re =
    /\b([A-Z0-9][A-Za-z0-9&'’.\- ]{3,64}?\s+(Cup|Classic|Showcase|Invitational|Shootout|Tournament|Championship|Qualifier))\b/g;
  for (const match of text.matchAll(re)) {
    const phrase = String(match[1] ?? "").replace(/\s+/g, " ").trim();
    if (!phrase) continue;
    // Avoid overly generic phrases
    if (/season|league/i.test(phrase)) continue;
    out.push(phrase);
    if (out.length >= 5) break;
  }
  return Array.from(new Set(out));
}

async function expandFromVenuePage(args: {
  pageUrl: string;
  venueState: string;
  perQueryLimit: number;
  maxNewUrls: number;
  venueHost: string;
}) {
  let html: string | null = null;
  try {
    html = await fetchHtml(args.pageUrl);
  } catch (err: any) {
    // Non-fatal: some venue/facility pages return non-HTML (PDF), are bot-blocked, or are JS-only.
    // We keep the sweep running and just skip expansion for this page.
    return { links: [] as string[], eventQueries: [] as string[], error: String(err?.message ?? "fetch_failed") };
  }
  if (!html) return { links: [] as string[], eventQueries: [] as string[], error: "empty_html" };

  const $ = cheerio.load(html);
  const found = new Set<string>();

  $("a[href]").each((_i, el) => {
    const hrefRaw = String($(el).attr("href") ?? "").trim();
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!looksLikeTournamentLink(text, hrefRaw)) return;
    let abs = "";
    try {
      abs = new URL(hrefRaw, args.pageUrl).toString();
    } catch {
      return;
    }
    const host = safeHost(abs);
    // Prefer off-page tournament links; but allow same-host event pages as well.
    if (!host) return;
    found.add(abs);
  });

  // If the page lists tournaments without links, try a small follow-up search using extracted event names.
  const bodyText = $.text().replace(/\s+/g, " ");
  const events = extractEventNameCandidates(bodyText);
  const eventQueries = events.map((e) => `"${e.replace(/"/g, "")}" ${args.venueState}`).slice(0, 3);

  for (const q of eventQueries) {
    const results = await atlasSearch(q, Math.max(1, Math.min(6, args.perQueryLimit)));
    for (const r of results) {
      const raw = clean(r.url);
      if (!raw) continue;
      let canonical = "";
      try {
        canonical = normalizeSourceUrl(raw).canonical;
      } catch {
        continue;
      }
      // For these event-name queries, accept results more liberally but still block obvious facility/rental pages.
      if (
        !isLikelyTournamentResult({
          url: canonical,
          domain: r.domain ?? null,
          title: r.title ?? null,
          snippet: r.snippet ?? null,
        })
      ) {
        continue;
      }
      found.add(canonical);
      if (found.size >= args.maxNewUrls) break;
    }
    if (found.size >= args.maxNewUrls) break;
  }

  const links = Array.from(found).slice(0, args.maxNewUrls);
  return { links, eventQueries, error: null as string | null };
}

export async function runVenueSweepToDraftUploads(args: {
  venueId: string;
  createdBy: string;
  perQueryLimit?: number;
  maxTotalUrls?: number;
}) {
  const perQueryLimit = Math.max(1, Math.min(20, Math.floor(args.perQueryLimit ?? 6)));
  const maxTotalUrls = Math.max(1, Math.min(120, Math.floor(args.maxTotalUrls ?? 25)));

  const venueResp = await supabaseAdmin
    .from("venues" as any)
    .select("id,name,city,state,sport,venue_url")
    .eq("id", args.venueId)
    .maybeSingle();

  const venue = (venueResp.data ?? null) as VenueRow | null;
  if (!venue?.id) {
    return { ok: false as const, reason: "venue_not_found" as const };
  }

  const name = clean(venue.name);
  const city = clean(venue.city);
  const state = clean(venue.state).toUpperCase();
  if (!name) return { ok: false as const, reason: "missing_venue_name" as const };
  if (!city || !state) return { ok: false as const, reason: "missing_city_state" as const };

  // Mark the venue as swept (even if no URLs are found) so admin tooling can de-noise repeats.
  // Non-fatal if the column hasn't been migrated yet in some environments.
  try {
    await supabaseAdmin.from("venues" as any).update({ last_swept_at: new Date().toISOString() }).eq("id", venue.id);
  } catch {
    // ignore
  }

  const provider = getSearchProviderName();
  const queries = buildVenueSweepQueries(venue);

  const deduped = new Map<string, { url: string; discovered_query: string }>();
  const venuePages = new Map<string, { url: string; discovered_query: string }>();
  let totalFound = 0;
  let noise_dropped = 0;
  let venue_pages_considered = 0;

  for (const query of queries) {
    const results = await atlasSearch(query, perQueryLimit);
    totalFound += results.length;
    for (const result of results) {
      const raw = clean(result.url);
      if (!raw) continue;
      let canonical = "";
      try {
        canonical = normalizeSourceUrl(raw).canonical;
      } catch {
        continue;
      }
      if (
        isLikelyTournamentResult({
          url: canonical,
          domain: result.domain ?? null,
          title: result.title ?? null,
          snippet: result.snippet ?? null,
        })
      ) {
        if (deduped.has(canonical)) continue;
        deduped.set(canonical, { url: canonical, discovered_query: query });
      } else if (
        isLikelyVenueInfoResult({
          url: canonical,
          domain: result.domain ?? null,
          title: result.title ?? null,
          snippet: result.snippet ?? null,
          venueHost: safeHost(venue.venue_url),
        })
      ) {
        venue_pages_considered += 1;
        if (!venuePages.has(canonical)) {
          venuePages.set(canonical, { url: canonical, discovered_query: query });
        }
      } else {
        noise_dropped += 1;
        continue;
      }
      if (deduped.size >= maxTotalUrls) break;
    }
    if (deduped.size >= maxTotalUrls) break;
  }

  // Second stage: if we saw likely venue/facility pages, fetch them and extract outbound tournament links.
  const venueHost = safeHost(venue.venue_url);
  let venue_pages_fetched = 0;
  let venue_page_links_extracted = 0;
  let venue_page_event_queries = 0;
  let venue_page_fetch_errors = 0;

  for (const page of Array.from(venuePages.values()).slice(0, 4)) {
    const expanded = await expandFromVenuePage({
      pageUrl: page.url,
      venueState: state,
      perQueryLimit,
      maxNewUrls: 12,
      venueHost,
    });
    venue_pages_fetched += 1;
    venue_page_links_extracted += expanded.links.length;
    venue_page_event_queries += expanded.eventQueries.length;
    if (expanded.error) venue_page_fetch_errors += 1;

    for (const link of expanded.links) {
      let canonical = "";
      try {
        canonical = normalizeSourceUrl(link).canonical;
      } catch {
        continue;
      }
      if (deduped.has(canonical)) continue;
      if (deduped.size >= maxTotalUrls) break;
      deduped.set(canonical, { url: canonical, discovered_query: `venue_page:${page.url}` });
    }
    if (deduped.size >= maxTotalUrls) break;
  }

  let inserted_sources = 0;
  let skipped_existing = 0;
  let skipped_terminal = 0;

  const toSweep: Array<{ url: string; discovered_query: string; source_id: string }> = [];

  for (const item of deduped.values()) {
    const normalized = item.url;
    const existing = await getRegistryRowByUrl(normalized);
    if (existing.row) {
      const status = (existing.row.review_status || "").trim();
      if (TERMINAL_REVIEW_STATUSES.has(status)) skipped_terminal += 1;
      else skipped_existing += 1;
      continue;
    }

    const { registry_id } = await upsertRegistry({
      source_url: normalized,
      source_type: "venue_sweep",
      sport: venue.sport || null,
      state: venue.state || null,
      review_status: "needs_review",
      review_notes: `discovered via venue sweep (venue_id=${venue.id})`,
      is_active: true,
    });

    // Persist provenance, but don't fail the sweep on a uniqueness race.
    const prov = await supabaseAdmin.from("tournament_source_discoveries" as any).insert({
      created_by: args.createdBy,
      provider,
      query: item.discovered_query,
      venue_id: venue.id,
      source_id: registry_id,
    });
    if (prov.error && (prov.error as any)?.code !== "23505") {
      console.warn("[venue-sweep] provenance insert failed", prov.error);
    }

    inserted_sources += 1;
    toSweep.push({ url: normalized, discovered_query: item.discovered_query, source_id: registry_id });
  }

  let imported_tournaments = 0;
  let sweep_errors = 0;
  const imported_ids: string[] = [];
  const sweep_failures: Array<{ url: string; message: string }> = [];

  for (const item of toSweep) {
    try {
      const res: any = await createTournamentFromUrl({
        url: item.url,
        sport: safeSport(venue.sport),
        sourceType: "venue_sweep",
        status: "draft",
        source: "external_crawl",
      });

      const extracted = Number(res?.extracted_count ?? 0) || 0;
      imported_tournaments += extracted > 0 ? extracted : 0;
      const tournamentId = clean(res?.tournamentId);
      if (tournamentId) {
        imported_ids.push(tournamentId);
        // Attach the originating venue as an inferred link for reviewer context.
        const link = await supabaseAdmin.from("tournament_venues" as any).upsert(
          {
            tournament_id: tournamentId,
            venue_id: venue.id,
            is_inferred: true,
          },
          { onConflict: "tournament_id,venue_id" }
        );
        if (link.error) {
          // Non-fatal; some environments may not have `is_inferred` yet.
          console.warn("[venue-sweep] failed to upsert inferred tournament_venues link", link.error);
        }
      }
    } catch (err: any) {
      sweep_errors += 1;
      const message = String(err?.message ?? "unknown error");
      sweep_failures.push({ url: item.url, message });
    }
  }

  return {
    ok: true as const,
    venue_id: venue.id,
    provider,
    queries,
    total_found: totalFound,
    discovered_urls: deduped.size,
    noise_dropped,
    venue_pages_considered,
    venue_pages_fetched,
    venue_page_links_extracted,
    venue_page_event_queries,
    venue_page_fetch_errors,
    inserted_sources,
    skipped_existing,
    skipped_terminal,
    imported_tournaments,
    imported_ids,
    sweep_errors,
    sweep_failures: sweep_failures.slice(0, 10),
    sample_urls: Array.from(deduped.values())
      .slice(0, 10)
      .map((v) => v.url),
  };
}
