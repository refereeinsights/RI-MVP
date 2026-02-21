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

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function asIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseJsonLd(
  $: cheerio.CheerioAPI
): {
  start_date: string | null;
  end_date: string | null;
  venue_name: string | null;
  address_text: string | null;
} {
  const result = {
    start_date: null as string | null,
    end_date: null as string | null,
    venue_name: null as string | null,
    address_text: null as string | null,
  };

  const scripts = $("script[type='application/ld+json']").toArray();
  for (const script of scripts) {
    const raw = ($(script).html() || "").trim();
    if (!raw) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const typeRaw = item["@type"];
      const type = Array.isArray(typeRaw) ? typeRaw.join(" ").toLowerCase() : String(typeRaw ?? "").toLowerCase();
      if (!type.includes("sports") && !type.includes("event")) continue;

      result.start_date = result.start_date ?? asIsoDate(item.startDate);
      result.end_date = result.end_date ?? asIsoDate(item.endDate);

      const loc = item.location;
      if (loc && typeof loc === "object") {
        const locName = normalizeSpace(String(loc.name ?? "")) || null;
        result.venue_name = result.venue_name ?? locName;
        const addr = loc.address;
        if (addr && typeof addr === "object") {
          const full = [
            addr.streetAddress,
            [addr.addressLocality, addr.addressRegion].filter(Boolean).join(", "),
            addr.postalCode,
          ]
            .map((v) => String(v ?? "").trim())
            .filter(Boolean)
            .join(", ");
          if (full) result.address_text = result.address_text ?? normalizeSpace(full);
        }
      }
    }
  }
  return result;
}

function extractDateRange(text: string): { start_date: string | null; end_date: string | null } {
  const normalized = text.replace(/[–—]/g, "-").replace(/\s+/g, " ");
  const m = normalized.match(
    /\b([A-Za-z]{3,9})\s+(\d{1,2})\s*-\s*([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(20\d{2})\b/i
  );
  if (!m) return { start_date: null, end_date: null };
  const toMonth = (token: string) => {
    const t = token.toLowerCase().slice(0, 3);
    return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(t);
  };
  const sm = toMonth(m[1]);
  const em = toMonth(m[3]);
  const sd = Number(m[2]);
  const ed = Number(m[4]);
  const y = Number(m[5]);
  if (sm < 0 || em < 0) return { start_date: null, end_date: null };
  const s = new Date(Date.UTC(y, sm, sd));
  const e = new Date(Date.UTC(y, em, ed));
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return { start_date: null, end_date: null };
  return {
    start_date: s.toISOString().slice(0, 10),
    end_date: e.toISOString().slice(0, 10),
  };
}

function extractTeamFee(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ");
  const entryFeePatterns = [
    /\b(?:entry|team)\s*fee\b[^$]{0,60}\$\s*([0-9]{2,5}(?:\.[0-9]{2})?)/i,
    /\$\s*([0-9]{2,5}(?:\.[0-9]{2})?)\s*(?:entry|team)\s*fee/i,
  ];
  for (const pattern of entryFeePatterns) {
    const m = normalized.match(pattern);
    if (m) return `$${m[1].replace(/,/g, "")}`;
  }

  // USSSA often lists per-division fees; keep up to 8 concise items.
  const rows = Array.from(
    normalized.matchAll(
      /\b(?:\d{1,2}U|[A-Za-z]{1,4}\d{1,2}U|\d{1,2}AA|\d{1,2}A)\b[^$]{0,24}\$\s*([0-9]{2,5}(?:\.[0-9]{2})?)/gi
    )
  );
  if (!rows.length) return null;
  const values: string[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(0, 8)) {
    const label = normalizeSpace(String(row[0]).split("$")[0] ?? "").replace(/[^A-Za-z0-9U ]/g, "").trim();
    const fee = `$${String(row[1] ?? "").replace(/,/g, "")}`;
    const value = `${label} ${fee}`.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values.length ? values.join(" | ") : null;
}

function extractAgeGroup(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ");
  const matches = Array.from(
    normalized.matchAll(/\b(?:\d{1,2}U|[A-Za-z]{1,4}\d{1,2}U|\d{1,2}AA|\d{1,2}A)\b/g)
  ).map((m) => String(m[0]).toUpperCase());
  if (!matches.length) return null;
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    if (seen.has(m)) continue;
    seen.add(m);
    ordered.push(m);
    if (ordered.length >= 12) break;
  }
  return ordered.join(", ");
}

function extractVenuePageLinks(pageUrl: string, $: cheerio.CheerioAPI): string[] {
  const out: string[] = [];
  $("a[href]").each((_idx, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (!href) return;
    if (!/(venue|venues|facility|facilities|complex|park|location|locations|field|fields|sites)/i.test(href)) return;
    try {
      const abs = new URL(href, pageUrl).toString();
      if (!/^https?:\/\//i.test(abs)) return;
      out.push(abs);
    } catch {
      return;
    }
  });
  return Array.from(new Set(out)).slice(0, 8);
}

function extractAddressLines(text: string): string[] {
  const pattern =
    /\d{1,5}\s+[A-Za-z0-9.\-#\s]{3,100},\s*[A-Za-z.\s]{2,60},\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?/g;
  return Array.from(new Set(Array.from(text.matchAll(pattern)).map((m) => normalizeSpace(m[0] ?? "")).filter(Boolean)));
}

function extractVenueRows($: cheerio.CheerioAPI): Array<{ venue_name: string | null; address_text: string }> {
  const rows: Array<{ venue_name: string | null; address_text: string }> = [];
  const seen = new Set<string>();
  $("li,tr,p,div").each((_idx, el) => {
    const text = normalizeSpace($(el).text() || "");
    if (!text) return;
    const addrs = extractAddressLines(text);
    if (!addrs.length) return;
    const heading = normalizeSpace($(el).find("strong,h2,h3,h4,b").first().text() || "") || null;
    for (const address of addrs) {
      const key = `${(heading ?? "").toLowerCase()}|${address.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ venue_name: heading, address_text: address });
    }
  });
  return rows.slice(0, 30);
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-cache",
      headers: { "user-agent": "RI-USSSA-Enrichment/1.0" },
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(contentType)) return null;
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
  const cappedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 2000)) : 10;
  const candidatePoolSize = Math.min(5000, cappedLimit * 20);
  const nowIso = new Date().toISOString();
  const cooldownDays = 10;
  const cooldownCutoffMs = Date.now() - cooldownDays * 24 * 60 * 60 * 1000;

  const fetchTargetTournaments = async () => {
    const withCooldownSelect =
      "id,name,official_website_url,source_url,status,is_canonical,enrichment_skip,team_fee,level,start_date,end_date,venue,address,fees_venue_scraped_at";
    const withoutCooldownSelect =
      "id,name,official_website_url,source_url,status,is_canonical,enrichment_skip,team_fee,level,start_date,end_date,venue,address";

    const primary = await supabaseAdmin
      .from("tournaments" as any)
      .select(withCooldownSelect)
      .eq("status", "published")
      .eq("is_canonical", true)
      .eq("enrichment_skip", false)
      .or("official_website_url.ilike.%usssa.com/event/%,source_url.ilike.%usssa.com/event/%")
      .order("fees_venue_scraped_at", { ascending: true, nullsFirst: true })
      .limit(candidatePoolSize);

    if (!primary.error) return primary;
    if (isMissingCooldownColumnError(primary.error.message)) {
      return supabaseAdmin
        .from("tournaments" as any)
        .select(withoutCooldownSelect)
        .eq("status", "published")
        .eq("is_canonical", true)
        .eq("enrichment_skip", false)
        .or("official_website_url.ilike.%usssa.com/event/%,source_url.ilike.%usssa.com/event/%")
        .order("updated_at", { ascending: false })
        .limit(candidatePoolSize);
    }
    return primary;
  };

  const { data: tournaments, error } = await fetchTargetTournaments();
  if (error) {
    return NextResponse.json({ ok: false, error: "fetch_tournaments_failed", detail: error.message }, { status: 500 });
  }

  let skipped_recent = 0;
  let skipped_pending = 0;
  const pendingIds = new Set<string>();
  const pendingAttributeRows = await supabaseAdmin
    .from("tournament_attribute_candidates" as any)
    .select("tournament_id")
    .in("attribute_key", ["team_fee", "level", "address"])
    .is("accepted_at", null)
    .is("rejected_at", null)
    .limit(10000);
  ((pendingAttributeRows.data ?? []) as Array<{ tournament_id: string | null }>).forEach((r) => {
    if (r.tournament_id) pendingIds.add(String(r.tournament_id));
  });

  const selected: any[] = [];
  for (const t of (tournaments as any[] | null) ?? []) {
    if (pendingIds.has(String((t as any).id ?? ""))) {
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
    if (!t.team_fee || !t.level || !t.start_date || !t.end_date || !t.venue || !t.address) {
      selected.push(t);
      if (selected.length >= cappedLimit) break;
    }
  }

  const dateCandidates: Array<{
    tournament_id: string;
    date_text: string | null;
    start_date: string | null;
    end_date: string | null;
    source_url: string | null;
    confidence: number;
  }> = [];
  const attrCandidates: Array<{
    tournament_id: string;
    attribute_key: string;
    attribute_value: string;
    source_url: string | null;
    confidence: number;
  }> = [];
  const venueCandidates: Array<{
    tournament_id: string;
    venue_name: string | null;
    address_text: string;
    venue_url: string | null;
    source_url: string | null;
    confidence: number;
  }> = [];

  const summary: Array<{ tournament_id: string; name: string | null; found: string[] }> = [];
  const attemptedTournamentIds: string[] = [];
  let attempted = 0;
  let pagesFetched = 0;

  for (const t of selected) {
    const url = t.official_website_url || t.source_url;
    if (!url) continue;
    attemptedTournamentIds.push(String(t.id));
    const html = await fetchHtml(url);
    attempted += 1;
    if (!html) continue;
    pagesFetched += 1;

    const found: string[] = [];
    const $ = cheerio.load(html);
    const text = normalizeSpace($.text() || "");

    const j = parseJsonLd($);
    const textDates = extractDateRange(text);
    const start = j.start_date ?? textDates.start_date;
    const end = j.end_date ?? textDates.end_date ?? start;
    if (start || end) {
      dateCandidates.push({
        tournament_id: t.id,
        date_text: null,
        start_date: start,
        end_date: end,
        source_url: url,
        confidence: 0.85,
      });
      found.push("dates");
    }

    const age = extractAgeGroup(text);
    if (age) {
      attrCandidates.push({
        tournament_id: t.id,
        attribute_key: "level",
        attribute_value: age,
        source_url: url,
        confidence: 0.75,
      });
      found.push("level");
    }

    const fee = extractTeamFee(text);
    if (fee) {
      attrCandidates.push({
        tournament_id: t.id,
        attribute_key: "team_fee",
        attribute_value: fee,
        source_url: url,
        confidence: 0.8,
      });
      found.push("team_fee");
    }

    if (j.address_text) {
      attrCandidates.push({
        tournament_id: t.id,
        attribute_key: "address",
        attribute_value: j.address_text,
        source_url: url,
        confidence: 0.8,
      });
      found.push("address");
    }

    if (j.venue_name && j.address_text) {
      venueCandidates.push({
        tournament_id: t.id,
        venue_name: j.venue_name,
        address_text: j.address_text,
        source_url: url,
        venue_url: null,
        confidence: 0.82,
      });
      found.push("venue_candidates");
    }

    const venuePages = extractVenuePageLinks(url, $);
    for (const venueUrl of venuePages) {
      const venueHtml = await fetchHtml(venueUrl);
      if (!venueHtml) continue;
      pagesFetched += 1;
      const $v = cheerio.load(venueHtml);
      const rows = extractVenueRows($v);
      for (const row of rows) {
        venueCandidates.push({
          tournament_id: t.id,
          venue_name: row.venue_name,
          address_text: row.address_text,
          source_url: venueUrl,
          venue_url: venueUrl,
          confidence: 0.8,
        });
      }
      if (rows.length) found.push("venue_candidates");
    }

    if (found.length) summary.push({ tournament_id: t.id, name: t.name, found: Array.from(new Set(found)) });
  }

  const dedupeKeyAttr = (row: {
    tournament_id: string;
    attribute_key: string;
    attribute_value: string;
    source_url: string | null;
  }) => `${row.tournament_id}|${row.attribute_key}|${row.attribute_value}|${row.source_url ?? ""}`;
  const dedupeKeyVenue = (row: {
    tournament_id: string;
    venue_name: string | null;
    address_text: string;
    source_url: string | null;
  }) =>
    `${row.tournament_id}|${(row.venue_name ?? "").trim().toLowerCase()}|${row.address_text.trim().toLowerCase()}|${(row.source_url ?? "")
      .trim()
      .toLowerCase()}`;
  const dedupeKeyDate = (row: {
    tournament_id: string;
    start_date: string | null;
    end_date: string | null;
    source_url: string | null;
  }) => `${row.tournament_id}|${row.start_date ?? ""}|${row.end_date ?? ""}|${row.source_url ?? ""}`;

  let skippedDuplicates = 0;
  const dedupe = <T>(rows: T[], keyFn: (row: T) => string) => {
    const out: T[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const key = keyFn(row);
      if (seen.has(key)) {
        skippedDuplicates += 1;
        continue;
      }
      seen.add(key);
      out.push(row);
    }
    return out;
  };

  const uniqueAttrs = dedupe(attrCandidates, dedupeKeyAttr);
  const uniqueVenues = dedupe(venueCandidates, dedupeKeyVenue);
  const uniqueDates = dedupe(dateCandidates, dedupeKeyDate);

  let insertedAttributes = 0;
  if (uniqueAttrs.length) {
    const tournamentIds = Array.from(new Set(uniqueAttrs.map((r) => r.tournament_id)));
    const attributeKeys = Array.from(new Set(uniqueAttrs.map((r) => r.attribute_key)));
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("tournament_attribute_candidates" as any)
      .select("tournament_id,attribute_key,attribute_value,source_url")
      .in("tournament_id", tournamentIds)
      .in("attribute_key", attributeKeys);
    if (existingError) {
      return NextResponse.json(
        { ok: false, error: "load_existing_attribute_candidates_failed", detail: existingError.message, attempted, pages_fetched: pagesFetched },
        { status: 500 }
      );
    }
    const existingKeys = new Set(
      ((existingRows ?? []) as Array<{ tournament_id: string; attribute_key: string; attribute_value: string; source_url: string | null }>).map(
        (row) => dedupeKeyAttr(row)
      )
    );
    const toInsert = uniqueAttrs.filter((row) => {
      const exists = existingKeys.has(dedupeKeyAttr(row));
      if (exists) skippedDuplicates += 1;
      return !exists;
    });
    if (!toInsert.length) {
      insertedAttributes = 0;
    } else {
    const { data, error: insertError } = await supabaseAdmin
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
          error: isValueConstraint ? "attribute_constraint_outdated" : "insert_attribute_candidates_failed",
          detail: isValueConstraint
            ? "DB constraint tournament_attribute_candidates_value_check does not currently allow one or more USSSA values (team_fee/level/address)."
            : insertError.message,
          attempted,
          pages_fetched: pagesFetched,
        },
        { status: 500 }
      );
    }
    insertedAttributes = data?.length ?? 0;
    }
  }

  let insertedDates = 0;
  if (uniqueDates.length) {
    const tournamentIds = Array.from(new Set(uniqueDates.map((r) => r.tournament_id)));
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("tournament_date_candidates" as any)
      .select("tournament_id,start_date,end_date,source_url")
      .in("tournament_id", tournamentIds);
    if (existingError) {
      return NextResponse.json(
        { ok: false, error: "load_existing_date_candidates_failed", detail: existingError.message, attempted, pages_fetched: pagesFetched },
        { status: 500 }
      );
    }
    const existingKeys = new Set(
      ((existingRows ?? []) as Array<{ tournament_id: string; start_date: string | null; end_date: string | null; source_url: string | null }>).map(
        (row) => dedupeKeyDate(row)
      )
    );
    const toInsert = uniqueDates.filter((row) => {
      const exists = existingKeys.has(dedupeKeyDate(row));
      if (exists) skippedDuplicates += 1;
      return !exists;
    });
    if (!toInsert.length) {
      insertedDates = 0;
    } else {
    const { data, error: insertError } = await supabaseAdmin
      .from("tournament_date_candidates" as any)
      .insert(toInsert)
      .select("id");
    if (insertError) {
      return NextResponse.json(
        { ok: false, error: "insert_date_candidates_failed", detail: insertError.message, attempted, pages_fetched: pagesFetched },
        { status: 500 }
      );
    }
    insertedDates = data?.length ?? 0;
    }
  }

  let insertedVenues = 0;
  if (uniqueVenues.length) {
    const tournamentIds = Array.from(new Set(uniqueVenues.map((r) => r.tournament_id)));
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("tournament_venue_candidates" as any)
      .select("tournament_id,venue_name,address_text,source_url")
      .in("tournament_id", tournamentIds);
    if (existingError) {
      return NextResponse.json(
        { ok: false, error: "load_existing_venue_candidates_failed", detail: existingError.message, attempted, pages_fetched: pagesFetched },
        { status: 500 }
      );
    }
    const existingKeys = new Set(
      ((existingRows ?? []) as Array<{ tournament_id: string; venue_name: string | null; address_text: string; source_url: string | null }>).map(
        (row) => dedupeKeyVenue(row)
      )
    );
    const toInsert = uniqueVenues.filter((row) => {
      const exists = existingKeys.has(dedupeKeyVenue(row));
      if (exists) skippedDuplicates += 1;
      return !exists;
    });
    if (!toInsert.length) {
      insertedVenues = 0;
    } else {
    const { data, error: insertError } = await supabaseAdmin
      .from("tournament_venue_candidates" as any)
      .insert(toInsert)
      .select("id");
    if (insertError) {
      return NextResponse.json(
        { ok: false, error: "insert_venue_candidates_failed", detail: insertError.message, attempted, pages_fetched: pagesFetched },
        { status: 500 }
      );
    }
    insertedVenues = data?.length ?? 0;
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
          error: "stamp_usssa_scrape_failed",
          detail: stampError.message,
          attempted,
          pages_fetched: pagesFetched,
          inserted_attributes: insertedAttributes,
          inserted_dates: insertedDates,
          inserted_venues: insertedVenues,
          skipped_duplicates: skippedDuplicates,
          summary,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    attempted,
    pages_fetched: pagesFetched,
    inserted_attributes: insertedAttributes,
    inserted_dates: insertedDates,
    inserted_venues: insertedVenues,
    skipped_recent,
    skipped_pending,
    skipped_duplicates: skippedDuplicates,
    summary,
  });
}
