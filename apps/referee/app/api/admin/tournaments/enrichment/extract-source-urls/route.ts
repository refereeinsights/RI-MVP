/**
 * POST /api/admin/tournaments/enrichment/extract-source-urls
 *
 * For published canonical tournaments that have a source_url but no
 * official_website_url, fetches each source page and looks for outbound
 * external links that could be the tournament's actual official website.
 *
 * Successful candidates are inserted into tournament_url_suggestions
 * (status = "pending") for admin review — the same approval flow used
 * by the US Club Soccer and USSSA enrichment endpoints.
 *
 * Strategy:
 *  1. Prefer links with keyword anchor text ("official website",
 *     "tournament website", "more info", "register", "visit site", etc.)
 *  2. Fall back to any external outbound link that isn't a CDN, social
 *     media, analytics domain, or known aggregator.
 *  3. Score by anchor text quality; skip pages where we'd only produce
 *     low-confidence suggestions.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import * as cheerio from "cheerio";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

// ─── auth ────────────────────────────────────────────────────────────────────

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

// ─── constants ────────────────────────────────────────────────────────────────

/**
 * Known aggregator / listing-platform hostnames.
 * Source URLs on these domains are listing pages; we try to extract the
 * real official tournament URL from them.
 * Also used to *reject* outbound links that just point to another aggregator.
 */
const AGGREGATOR_HOSTS = new Set([
  "usclubsoccer.org",
  "softballconnected.com",
  "grassroots365.com",
  "myhockeytournaments.com",
  "sgatournaments.com",
  "gotsport.com",
  "events.gotsport.com",
  "gotsoccer.com",
  "home.gotsoccer.com",
  "sincsports.com",
  "tourneymachine.com",
  "sportsengine.com",
  "sportngin.com",
  "playmetrics.com",
  "leaguelobster.com",
  "tournamentsuccessgroup.com",
  "nxtsports.com",
  "perfectgame.org",
  "usssa.com",
  "iwlcarecruiting.com",
  "corrigansports.com",
  "adrln.com",
  "washingtonyouthsoccer.org",
  "midwestlacrosse.com",
  "legacylax.com",
  "bazookasoccer.com",
  "primetimelacrosse.com",
  "mylacrossetournaments.com",
  "soccertournaments.com",
  "spokaneshadow.com",
  "exposureevents.com",
  "basketball.exposureevents.com",
]);

/** Hosting / utility / social domains that are never tournament websites. */
const SKIP_HOSTS_FRAGMENTS = [
  "googleapis.com",
  "gstatic.com",
  "google.com",
  "googlesyndication.com",
  "cloudflare.com",
  "cdnjs.cloudflare",
  "bootstrapcdn.com",
  "fontawesome.com",
  "use.fontawesome",
  "jquery.com",
  "jsdelivr.net",
  "facebook.com",
  "twitter.com",
  "instagram.com",
  "youtube.com",
  "tiktok.com",
  "linkedin.com",
  "pinterest.com",
  "snapchat.com",
  "gmpg.org",
  "w3.org",
  "schema.org",
  "wordpress.org",
  "wp.com",
  "wixpress.com",
  "gravatar.com",
  "sentry.io",
  "hugeDomains.com",
  "hugedomains.com",
  "namecheap.com",
  "godaddy.com",
  "bluehost.com",
  "amazonaws.com",
  "cloudfront.net",
  "akamai",
  "paypal.com",
  "stripe.com",
  "opengympremier.com", // linked from grassroots365 but is a different tournament org
];

/** Anchor text patterns that strongly suggest an official tournament website link. */
const KEYWORD_RE =
  /(?:official\s+(?:tournament\s+|event\s+)?(?:web)?site|tournament\s+(?:web)?site|event\s+(?:web)?site|visit\s+(?:the\s+)?(?:official\s+)?(?:web)?site|more\s+info(?:rmation)?|click\s+here\s+for|tournament\s+info|event\s+info|register\s+(?:here|now)|event\s+registration|tournament\s+registration)/i;

/** File extensions to skip — these are never tournament websites. */
const SKIP_EXT_RE = /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|pdf|zip|xml|json)(\?.*)?$/i;

// ─── helpers ─────────────────────────────────────────────────────────────────

function normalizeKey(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isSkippedHost(host: string): boolean {
  if (!host) return true;
  if (AGGREGATOR_HOSTS.has(host)) return true;
  // Also skip USSSA subdomains
  if (host.endsWith(".usssa.com")) return true;
  return SKIP_HOSTS_FRAGMENTS.some((f) => host.includes(f));
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "RI-UrlExtractor/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(ct)) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

type LinkCandidate = {
  href: string;
  host: string;
  anchorText: string;
  score: number;
};

/**
 * Extract the best external outbound link from an aggregator/source page
 * that could represent the tournament's actual official website.
 *
 * Returns candidates sorted by score descending, or [] if nothing found.
 */
function extractCandidateLinks(html: string, sourceUrl: string): LinkCandidate[] {
  const sourceHost = hostOf(sourceUrl);
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const candidates: LinkCandidate[] = [];

  $("a[href]").each((_i, el) => {
    const rawHref = $(el).attr("href") ?? "";
    let href: string;
    try {
      href = new URL(rawHref, sourceUrl).toString();
    } catch {
      return;
    }
    if (!/^https?:\/\//i.test(href)) return;
    if (SKIP_EXT_RE.test(href)) return;

    const host = hostOf(href);
    if (!host) return;
    if (host === sourceHost) return; // same-domain link
    if (isSkippedHost(host)) return;
    if (seen.has(host)) return; // dedupe per host
    seen.add(host);

    const anchorText = ($(el).text() ?? "").replace(/\s+/g, " ").trim().slice(0, 120);

    // Score: keyword anchor = 1.0, non-empty anchor = 0.5, bare URL = 0.2
    let score = 0.2;
    if (anchorText) score = 0.5;
    if (KEYWORD_RE.test(anchorText)) score = 1.0;

    candidates.push({ href, host, anchorText, score });
  });

  return candidates.sort((a, b) => b.score - a.score);
}

// ─── main handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const isAdmin = await ensureAdmin();
  if (!isAdmin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const rawLimit = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.trunc(rawLimit))) : 50;
  // Minimum score for a candidate to be inserted as a suggestion.
  const minScore = 0.5;

  // Fetch published canonical tournaments with source_url but no official_website_url
  const { data: tournaments, error: tErr } = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,name,state,source_url,source_domain")
    .eq("status", "published")
    .eq("is_canonical", true)
    .is("official_website_url", null)
    .not("source_url", "is", null)
    .eq("enrichment_skip", false)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (tErr) {
    return NextResponse.json({ error: tErr.message }, { status: 500 });
  }

  const target = ((tournaments ?? []) as any[]).slice(0, limit);
  const tournamentIds = target.map((t: any) => String(t.id)).filter(Boolean);

  // Load existing suggestions to avoid duplicates
  const { data: existingSugs } = tournamentIds.length
    ? await supabaseAdmin
        .from("tournament_url_suggestions" as any)
        .select("tournament_id,suggested_url,status")
        .in("tournament_id", tournamentIds)
    : { data: [] };

  const existingKey = new Set(
    ((existingSugs ?? []) as any[])
      .filter((r: any) => (r.status ?? "pending") === "pending")
      .map((r: any) => `${r.tournament_id}|${normalizeKey(r.suggested_url)}`)
  );

  // Process each tournament
  let attempted = 0;
  let fetched = 0;
  let blocked = 0;
  let noLinks = 0;
  let inserted = 0;
  const toInsert: any[] = [];
  const summary: Array<{
    tournament_id: string;
    tournament_name: string | null;
    source_url: string;
    suggested_url: string;
    anchor_text: string;
    score: number;
  }> = [];

  for (const t of target) {
    const sourceUrl = String(t.source_url ?? "").trim();
    if (!sourceUrl) continue;
    attempted++;

    const html = await fetchHtml(sourceUrl);
    if (!html) {
      blocked++;
      continue;
    }
    fetched++;

    const candidates = extractCandidateLinks(html, sourceUrl);
    const best = candidates.find((c) => c.score >= minScore);
    if (!best) {
      noLinks++;
      continue;
    }

    const tid = String(t.id);
    const key = `${tid}|${normalizeKey(best.href)}`;
    if (existingKey.has(key)) continue;
    existingKey.add(key);

    const domain = hostOf(best.href) || null;
    toInsert.push({
      tournament_id: tid,
      suggested_url: best.href,
      suggested_domain: domain,
      submitter_email: null,
      status: "pending",
    });
    summary.push({
      tournament_id: tid,
      tournament_name: t.name ?? null,
      source_url: sourceUrl,
      suggested_url: best.href,
      anchor_text: best.anchorText,
      score: best.score,
    });
  }

  if (toInsert.length) {
    const { data: rows, error: insErr } = await supabaseAdmin
      .from("tournament_url_suggestions" as any)
      .insert(toInsert)
      .select("tournament_id");
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    inserted = (rows ?? []).length;
  }

  return NextResponse.json({
    ok: true,
    attempted,
    fetched,
    blocked,
    no_links: noLinks,
    inserted,
    summary: summary.slice(0, 30),
  });
}
