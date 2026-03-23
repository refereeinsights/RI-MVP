import { NextResponse } from "next/server";
import { headers } from "next/headers";
import * as cheerio from "cheerio";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const DIRECTORY_URL = "https://usclubsoccer.org/list-of-sanctioned-tournaments/";

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

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string) {
  return normalizeSpace(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
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
  ]);
  return normalizeKey(value)
    .split(" ")
    .filter((t) => t && t.length >= 2 && !stop.has(t));
}

function jaccard(a: string[], b: string[]) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

function extractCityState(text: string): { city: string | null; state: string | null } {
  const normalized = normalizeSpace(text);
  const m = normalized.match(/\b([A-Za-z.'\s]{2,60}),\s*([A-Z]{2})\b/);
  if (!m) return { city: null, state: null };
  return { city: normalizeSpace(m[1] ?? "") || null, state: String(m[2] ?? "").trim().toUpperCase() || null };
}

type DirectoryEntry = {
  name: string;
  url: string | null;
  city: string | null;
  state: string | null;
  text: string;
};

function dedupeEntries(entries: DirectoryEntry[]) {
  const out: DirectoryEntry[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const key = `${normalizeKey(e.name)}|${normalizeKey(e.url ?? "")}|${normalizeKey(e.state ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function extractEntriesFromHtml(html: string): DirectoryEntry[] {
  const $ = cheerio.load(html);
  const entries: DirectoryEntry[] = [];

  const consider = (nameRaw: string, hrefRaw: string | null, contextText: string) => {
    const name = normalizeSpace(nameRaw);
    if (!name || name.length < 3) return;

    const href = normalizeSpace(String(hrefRaw ?? "")) || null;
    const url = (() => {
      if (!href) return null;
      try {
        const u = new URL(href, DIRECTORY_URL);
        if (!/^https?:$/i.test(u.protocol)) return null;
        const normalized = u.toString();
        if (normalized === DIRECTORY_URL) return null;
        return normalized;
      } catch {
        return null;
      }
    })();

    const text = normalizeSpace(contextText);
    const loc = extractCityState(text);
    entries.push({ name, url, city: loc.city, state: loc.state, text });
  };

  // Table-first (many directories use a table with a link in the name cell).
  $("table tr").each((_i, tr) => {
    const $tr = $(tr);
    const rowText = normalizeSpace($tr.text());
    if (!rowText || rowText.length < 8) return;
    const $a = $tr.find("a[href]").first();
    if ($a.length) {
      consider($a.text(), $a.attr("href") ?? null, rowText);
      return;
    }
    const tds = $tr.find("td").toArray().map((td) => normalizeSpace($(td).text())).filter(Boolean);
    if (!tds.length) return;
    consider(tds[0] ?? "", null, rowText);
  });

  // List fallback.
  $("article a[href], main a[href], .entry-content a[href]").each((_i, a) => {
    const $a = $(a);
    const txt = normalizeSpace($a.text());
    if (!txt || txt.length < 3) return;
    const href = $a.attr("href") ?? null;
    const contextText = normalizeSpace($a.closest("li, p, div").text() || txt);
    // Avoid nav/footer noise.
    if (/privacy|terms|contact|login|donate|membership/i.test(txt)) return;
    consider(txt, href, contextText);
  });

  return dedupeEntries(entries);
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-cache",
      headers: { "user-agent": "RI-USClubSoccer-Enrichment/1.0" },
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(contentType)) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

function scoreTournamentToEntry(tournamentName: string, tournamentState: string | null, entry: DirectoryEntry): number {
  const tTokens = tokens(tournamentName);
  const eTokens = tokens(entry.name);
  let score = jaccard(tTokens, eTokens);
  const tn = normalizeKey(tournamentName);
  const en = normalizeKey(entry.name);
  if (tn && en) {
    if (tn === en) score += 0.4;
    else if (tn.includes(en) || en.includes(tn)) score += 0.2;
  }
  if (tournamentState && entry.state && tournamentState.toUpperCase() === entry.state.toUpperCase()) score += 0.15;
  return Math.min(1, score);
}

export async function POST(request: Request) {
  const isAdmin = await ensureAdmin();
  if (!isAdmin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "200");
  const cappedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(2000, Math.floor(limit))) : 200;

  const html = await fetchHtml(DIRECTORY_URL);
  if (!html) {
    return NextResponse.json({ ok: false, error: "fetch_directory_failed" }, { status: 500 });
  }
  const entries = extractEntriesFromHtml(html).filter((e) => e.url);
  if (!entries.length) {
    return NextResponse.json({ ok: false, error: "no_directory_entries_found" }, { status: 500 });
  }

  // Target tournaments that (incorrectly) use the directory page as their URL.
  const dirFilter = "usclubsoccer.org/list-of-sanctioned-tournaments";
  const { data: tournaments, error } = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,name,state,official_website_url,source_url,status,is_canonical,sport,enrichment_skip")
    .eq("status", "published")
    .eq("is_canonical", true)
    .eq("sport", "soccer")
    .eq("enrichment_skip", false)
    .or(`official_website_url.ilike.%${dirFilter}%,source_url.ilike.%${dirFilter}%`)
    .order("updated_at", { ascending: false })
    .limit(5000);
  if (error) {
    return NextResponse.json({ ok: false, error: "fetch_tournaments_failed", detail: error.message }, { status: 500 });
  }

  const target = ((tournaments ?? []) as any[])
    .filter((t) => {
      const url = String(t.official_website_url ?? t.source_url ?? "").toLowerCase();
      return url.includes(dirFilter);
    })
    .slice(0, cappedLimit);

  const tournamentIds = target.map((t) => String(t.id ?? "")).filter(Boolean);
  const existingSuggestions = tournamentIds.length
    ? await supabaseAdmin
        .from("tournament_url_suggestions" as any)
        .select("tournament_id,suggested_url,status")
        .in("tournament_id", tournamentIds)
        .limit(5000)
    : { data: [], error: null as any };
  if ((existingSuggestions as any).error) {
    return NextResponse.json(
      { ok: false, error: "load_existing_suggestions_failed", detail: (existingSuggestions as any).error.message },
      { status: 500 }
    );
  }
  const existingKey = new Set(
    (((existingSuggestions as any).data ?? []) as Array<{ tournament_id: string; suggested_url: string; status: string | null }>)
      .filter((r) => (r.status ?? "pending") === "pending")
      .map((r) => `${r.tournament_id}|${normalizeKey(r.suggested_url)}`)
  );

  let attempted = 0;
  let matched = 0;
  let skippedExisting = 0;
  let inserted = 0;
  const toInsert: Array<{
    tournament_id: string;
    suggested_url: string;
    suggested_domain: string | null;
    submitter_email: string | null;
    status: string;
  }> = [];
  const summary: Array<{ tournament_id: string; tournament_name: string | null; matched_name: string; matched_url: string; score: number }> = [];

  for (const t of target) {
    attempted += 1;
    const tid = String(t.id ?? "");
    const tournamentName = String(t.name ?? "").trim();
    if (!tid || !tournamentName) continue;
    const tournamentState = String(t.state ?? "").trim().toUpperCase() || null;

    let best: { entry: DirectoryEntry; score: number } | null = null;
    for (const entry of entries) {
      if (tournamentState && entry.state && entry.state.toUpperCase() !== tournamentState) continue;
      const s = scoreTournamentToEntry(tournamentName, tournamentState, entry);
      if (!best || s > best.score) best = { entry, score: s };
    }
    if (!best || best.score < 0.68 || !best.entry.url) continue;

    matched += 1;
    const suggestedUrl = best.entry.url;
    const key = `${tid}|${normalizeKey(suggestedUrl)}`;
    if (existingKey.has(key)) {
      skippedExisting += 1;
      continue;
    }
    existingKey.add(key);
    const suggestedDomain = (() => {
      try {
        return new URL(suggestedUrl).hostname.toLowerCase();
      } catch {
        return null;
      }
    })();

    toInsert.push({
      tournament_id: tid,
      suggested_url: suggestedUrl,
      suggested_domain: suggestedDomain,
      submitter_email: null,
      status: "pending",
    });
    summary.push({
      tournament_id: tid,
      tournament_name: tournamentName,
      matched_name: best.entry.name,
      matched_url: suggestedUrl,
      score: Number(best.score.toFixed(3)),
    });
  }

  if (toInsert.length) {
    const { data: insertedRows, error: insErr } = await supabaseAdmin
      .from("tournament_url_suggestions" as any)
      .insert(toInsert)
      .select("tournament_id");
    if (insErr) {
      return NextResponse.json({ ok: false, error: "insert_suggestions_failed", detail: insErr.message }, { status: 500 });
    }
    inserted = (insertedRows ?? []).length;
  }

  return NextResponse.json({
    ok: true,
    directory_url: DIRECTORY_URL,
    attempted,
    matched,
    inserted,
    skipped_existing: skippedExisting,
    summary: summary.slice(0, 25),
  });
}

