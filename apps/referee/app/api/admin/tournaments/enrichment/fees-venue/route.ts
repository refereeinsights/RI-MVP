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
    normalized.matchAll(
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
    normalized.matchAll(
      /(U\s*\d{1,2}(?:\s*\/\s*\d{2,4})?\s*-\s*U?\s*\d{1,2}(?:\s*\/\s*\d{2,4})?|U\s*\d{1,2}\s*\+?)\s*[:|]?\s*\$\s*([0-9]{2,5}(?:\.[0-9]{2})?)/gi
    )
  );
  for (const m of ageRanges) {
    if ((m[0] ?? "").includes("|")) continue;
    addEntry([normalizeAge(m[1] ?? ""), normalizeAmount(m[2] ?? "")].filter(Boolean).join(" "));
  }

  // `Entry Fee: 7v7 $845 9v9 $975 11v11 $1045` and table row style formats.
  const formatFees = Array.from(
    normalized.matchAll(
      /\b(\d{1,2}\s*v\s*\d{1,2}|\d{1,2}v\d{1,2}|11v11)\b\s*[:|]?\s*\$\s*([0-9]{2,5}(?:\.[0-9]{2})?)(?!\d)/gi
    )
  );
  for (const m of formatFees) {
    addEntry([normalizeFormat(m[1] ?? ""), normalizeAmount(m[2] ?? "")].filter(Boolean).join(" "));
  }

  if (entries.length) return entries.join(" | ");

  const m = normalized.match(/\$\s*([0-9]{2,5}(?:\.[0-9]{2})?)/);
  return m ? normalizeAmount(m[1]) : null;
}

function extractGames(text: string): string | null {
  const m = text.match(/(\d+)\s*(?:game|gms)\s+guarantee/i);
  return m ? m[1] : null;
}

function extractAddress(text: string): string | null {
  const m = text.match(/\d{1,5}[\w\s\.\-]+,\s*[A-Za-z\.\s]+,\s*[A-Z]{2}\s*\d{5}/);
  return m ? m[0].trim() : null;
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

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { method: "GET", redirect: "follow", cache: "no-cache" });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
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
      .or("team_fee.is.null,games_guaranteed.is.null,venue.is.null,address.is.null,venue_url.is.null")
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
        .or("team_fee.is.null,games_guaranteed.is.null,venue.is.null,address.is.null,venue_url.is.null")
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
    .in("attribute_key", ["team_fee", "games_guaranteed", "address", "venue_url"])
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
  const summary: Array<{ tournament_id: string; name: string | null; found: string[] }> = [];
  const attemptedTournamentIds: string[] = [];
  let attempted = 0;

  for (const t of selected) {
    const url = (t as any).official_website_url || (t as any).source_url;
    if (!url) continue;
    attempted += 1;
    attemptedTournamentIds.push(t.id);
    const html = await fetchHtml(url);
    if (!html) continue;
    const $ = cheerio.load(html);
    const text = $.text().replace(/\s+/g, " ");
    const found: string[] = [];

    const fee = extractFee(text);
    if (fee) {
      candidates.push({ tournament_id: t.id, attribute_key: "team_fee", attribute_value: fee, source_url: url });
      found.push("team_fee");
    }

    const games = extractGames(text);
    if (games) {
      candidates.push({
        tournament_id: t.id,
        attribute_key: "games_guaranteed",
        attribute_value: games,
        source_url: url,
      });
      found.push("games_guaranteed");
    }

    const address = extractAddress(text);
    if (address) {
      candidates.push({ tournament_id: t.id, attribute_key: "address", attribute_value: address, source_url: url });
      found.push("address");
    }

    const venueUrl = extractVenueUrl($);
    if (venueUrl) {
      candidates.push({ tournament_id: t.id, attribute_key: "venue_url", attribute_value: venueUrl, source_url: url });
      found.push("venue_url");
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

    if (!toInsert.length) {
      return NextResponse.json({ ok: true, inserted: 0, attempted, skipped_recent, skipped_pending, skipped_duplicates, summary });
    }

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
            ? "DB constraint tournament_attribute_candidates_value_check does not currently allow one or more scraped fee/venue values. Update the constraint to allow team_fee/games_guaranteed/address/venue_url formats."
            : insertError.message,
          attempted,
          parsed_candidates: candidates.length,
          insert_candidates: toInsert.length,
        },
        { status: 500 }
      );
    }
    inserted = insertedRows?.length ?? 0;
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
          summary,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, inserted, attempted, skipped_recent, skipped_pending, skipped_duplicates, summary });
}
