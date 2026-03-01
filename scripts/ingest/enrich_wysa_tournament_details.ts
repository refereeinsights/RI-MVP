/**
 * enrich_wysa_tournament_details.ts
 *
 * Fetches each Washington Youth Soccer tournament detail page and enriches:
 *   - tournament_director / tournament_director_email / tournament_director_phone
 *   - referee_contact / referee_contact_email / referee_contact_phone
 *   - team_fee
 *   - venue, address, city, zip
 *   - official_website_url  ("View Venue Website" link on the detail page)
 *   - Upserts venue into venues table if not already present
 *   - Adds tournament_venues link (additive only — never removes existing links)
 *
 * Usage:
 *   npx tsx scripts/ingest/enrich_wysa_tournament_details.ts             # dry-run
 *   npx tsx scripts/ingest/enrich_wysa_tournament_details.ts --apply     # write to DB
 *   npx tsx scripts/ingest/enrich_wysa_tournament_details.ts --apply --force  # re-scrape already-done
 *   npx tsx scripts/ingest/enrich_wysa_tournament_details.ts --limit=5   # cap rows
 */

import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// ── Config ────────────────────────────────────────────────────────────────────
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split("=")[1])) : 50;
const FETCH_TIMEOUT_MS = 12_000;
const RATE_LIMIT_MS = 400;
const SOURCE_DOMAIN = "washingtonyouthsoccer.org";

// ── DB client ─────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function clean(v: string | null | undefined): string | null {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s || null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Parse "August 14, 2026" → "2026-08-14" */
function parseDetailDate(text: string): string | null {
  const m = text.replace(/\s+/g, " ").trim().match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(20\d{2})/);
  if (!m) return null;
  const MONTHS = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const idx = MONTHS.indexOf(m[1].toLowerCase());
  if (idx === -1) return null;
  return `${m[3]}-${String(idx + 1).padStart(2, "0")}-${String(parseInt(m[2], 10)).padStart(2, "0")}`;
}

/**
 * Strip venue name prefix from street address if duplicated at the start.
 * "Woodward Middle School 9125 Sportsman Club Rd NE" → "9125 Sportsman Club Rd NE"
 */
function stripVenuePrefix(venueName: string | null, address: string): string {
  if (!venueName) return address;
  const prefix = venueName.replace(/\s+/g, " ").trim();
  const addr = address.replace(/\s+/g, " ").trim();
  if (addr.toLowerCase().startsWith(prefix.toLowerCase())) {
    return addr.slice(prefix.length).replace(/^[\s,]+/, "").trim();
  }
  return addr;
}

// ── Page parser ───────────────────────────────────────────────────────────────
type ParsedDetail = {
  start_date: string | null;
  end_date: string | null;
  // Venue
  venue_name: string | null;
  street_address: string | null;
  city: string | null;
  zip: string | null;
  // "View Venue Website" → tournament.official_website_url
  official_website_url: string | null;
  // Tournament Director
  director_name: string | null;
  director_phone: string | null;
  director_email: string | null;
  // Referee Contact
  referee_contact_name: string | null;
  referee_contact_phone: string | null;
  referee_contact_email: string | null;
  // Fees
  team_fee: string | null;
};

function parseDetailPage(html: string): ParsedDetail {
  const $ = cheerio.load(html);

  // ── Dates ──────────────────────────────────────────────────────────────────
  const start_date = parseDetailDate($("span.tribe-event-date-start").first().text());
  const end_date = parseDetailDate($("span.tribe-event-date-end").first().text());

  // ── Venue ──────────────────────────────────────────────────────────────────
  const venue_name = clean($("dd.tribe-venue").first().text());
  const rawAddress = clean($("span.tribe-street-address").first().text());
  const street_address = rawAddress
    ? (stripVenuePrefix(venue_name, rawAddress) || rawAddress)
    : null;
  const city = clean($("span.tribe-locality").first().text());
  const zip = clean($("span.tribe-postal-code").first().text());

  // "View Venue Website" link → official_website_url on tournament
  let official_website_url: string | null = null;
  $("a").each((_, el) => {
    if (/view venue website/i.test($(el).text())) {
      const href = $(el).attr("href");
      if (href?.startsWith("http")) { official_website_url = href; return false; }
    }
  });

  // ── Departments Contact ────────────────────────────────────────────────────
  // Structure: div.departments-contact > div.flex > div.box-layout (one per role)
  //   <h4>Tournament Director</h4>  or  <h4>Referee Assignor</h4>
  //   <p>Name</p>
  //   <p class="phone-no"><a href="tel:...">phone</a></p>
  //   <p class="email-id"><a href="mailto:...">email</a></p>
  let director_name: string | null = null;
  let director_phone: string | null = null;
  let director_email: string | null = null;
  let referee_contact_name: string | null = null;
  let referee_contact_phone: string | null = null;
  let referee_contact_email: string | null = null;

  $("div.departments-contact div.box-layout").each((_, box) => {
    const $box = $(box);
    const role = clean($box.find("h4").first().text()) ?? "";
    const name = clean($box.find("p").not(".phone-no, .email-id").first().text());
    const phone = clean($box.find("p.phone-no a").first().text());
    const email = clean($box.find("p.email-id a").first().text());

    if (/tournament director/i.test(role)) {
      director_name = name;
      director_phone = phone;
      director_email = email;
    } else if (/referee assignor/i.test(role)) {
      // Page labels it "Referee Assignor" but we store in referee_contact fields
      referee_contact_name = name;
      referee_contact_phone = phone;
      referee_contact_email = email;
    }
  });

  // ── Fees ───────────────────────────────────────────────────────────────────
  // Structure: <h2 class="title">Fees</h2>
  //            <ul><li>U9 &amp; U10 <strong>$500</strong></li>...</ul>
  const feeParts: string[] = [];
  $("h2.title").each((_, h2) => {
    if ($(h2).text().trim().toLowerCase() !== "fees") return;
    const $ul = $(h2).next("ul").length
      ? $(h2).next("ul")
      : $(h2).parent().find("ul").first();
    $ul.find("li").each((_, li) => {
      const $li = $(li);
      const price = clean($li.find("strong").text());
      if (!price) return;
      const age = clean($li.clone().find("strong").remove().end().text());
      if (age) feeParts.push(`${age}: ${price}`);
    });
    return false; // only first "Fees" heading
  });

  return {
    start_date,
    end_date,
    venue_name,
    street_address,
    city,
    zip,
    official_website_url,
    director_name,
    director_phone,
    director_email,
    referee_contact_name,
    referee_contact_phone,
    referee_contact_email,
    team_fee: feeParts.length ? feeParts.join(" | ") : null,
  };
}

// ── Venue upsert ──────────────────────────────────────────────────────────────
// Looks up by name + city + state.  If found, patches address/zip/sport.
// If not found, inserts new row.
// Returns venue id, or null on dry-run (no insert) / error.
async function upsertVenue(detail: ParsedDetail, sport: string): Promise<string | null> {
  const { venue_name: name, street_address: address, city, zip } = detail;
  if (!name) return null;

  const { data: existing } = await supabase
    .from("venues")
    .select("id")
    .eq("name", name)
    .eq("state", "WA")
    .eq("city", city ?? "")
    .maybeSingle();

  if (existing) {
    if (APPLY) {
      await supabase
        .from("venues")
        .update({
          ...(address ? { address, address1: address } : {}),
          ...(zip ? { zip } : {}),
          sport,
        })
        .eq("id", existing.id);
    }
    return existing.id;
  }

  if (!APPLY) return null;

  const { data, error } = await supabase
    .from("venues")
    .insert({ name, address: address ?? null, address1: address ?? null, city: city ?? null, state: "WA", zip: zip ?? null, sport })
    .select("id")
    .single();

  if (error) {
    if ((error as any).code === "23505") {
      // Unique constraint race — re-fetch
      const { data: retry } = await supabase
        .from("venues")
        .select("id")
        .eq("name", name)
        .eq("state", "WA")
        .eq("city", city ?? "")
        .maybeSingle();
      return (retry as any)?.id ?? null;
    }
    console.error(`  ⚠ venue insert error: ${error.message}`);
    return null;
  }

  return (data as any).id;
}

// ── Tournament-venue link (additive only) ─────────────────────────────────────
// Uses upsert with onConflict so it never removes existing links.
async function linkTournamentVenue(tournamentId: string, venueId: string) {
  if (!APPLY) return;
  const { error } = await supabase
    .from("tournament_venues")
    .upsert(
      { tournament_id: tournamentId, venue_id: venueId },
      { onConflict: "tournament_id,venue_id" }
    );
  if (error) console.error(`  ⚠ tournament_venues link error: ${error.message}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}${FORCE ? " + FORCE" : ""} | limit=${LIMIT}`);
  console.log("");

  let query = supabase
    .from("tournaments")
    .select("id, name, sport, source_url, start_date, end_date, city, zip, venue")
    .eq("source_domain", SOURCE_DOMAIN)
    .not("source_url", "is", null)
    .order("start_date", { ascending: true })
    .limit(LIMIT);

  // By default skip tournaments that already have a venue (already enriched).
  // Use --force to re-scrape all.
  if (!FORCE) query = query.is("venue", null);

  const { data: tournaments, error } = await query;
  if (error) { console.error("DB fetch error:", error.message); process.exit(1); }
  if (!tournaments?.length) { console.log("No tournaments to process."); return; }

  console.log(`${tournaments.length} tournament(s) to enrich.\n`);

  let ok = 0, skipped = 0, failed = 0;

  for (const t of tournaments as any[]) {
    console.log(`→ ${t.name}  (${t.start_date ?? "?"})`);
    console.log(`  ${t.source_url}`);

    // Fetch detail page
    let html: string;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      const resp = await fetch(t.source_url, {
        signal: ctrl.signal,
        headers: { "User-Agent": "RI-Admin-WYSAEnrich/1.0" },
      });
      clearTimeout(timer);
      if (!resp.ok) {
        console.log(`  ⚠ HTTP ${resp.status} — skipping`);
        skipped++;
        await sleep(RATE_LIMIT_MS);
        continue;
      }
      html = await resp.text();
    } catch (err: any) {
      console.log(`  ⚠ fetch error: ${err.message} — skipping`);
      skipped++;
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    let detail: ParsedDetail;
    try {
      detail = parseDetailPage(html);
    } catch (err: any) {
      console.log(`  ⚠ parse error: ${err.message} — skipping`);
      skipped++;
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    console.log(`  director:   ${detail.director_name ?? "—"}  ${detail.director_phone ?? ""}  ${detail.director_email ?? ""}`);
    console.log(`  ref.contact:${detail.referee_contact_name ?? "—"}  ${detail.referee_contact_phone ?? ""}  ${detail.referee_contact_email ?? ""}`);
    console.log(`  venue:      ${detail.venue_name ?? "—"}  |  ${detail.street_address ?? "—"}, ${detail.city ?? "—"} ${detail.zip ?? "—"}`);
    console.log(`  website:    ${detail.official_website_url ?? "—"}`);
    console.log(`  fees:       ${detail.team_fee ?? "—"}`);
    console.log(`  dates:      ${detail.start_date ?? "?"} → ${detail.end_date ?? "?"}`);

    // Build tournament update — only set non-null parsed values
    const updates: Record<string, any> = {};
    if (detail.director_name)          updates.tournament_director = detail.director_name;
    if (detail.director_email)         updates.tournament_director_email = detail.director_email;
    if (detail.director_phone)         updates.tournament_director_phone = detail.director_phone;
    if (detail.referee_contact_name)   updates.referee_contact = detail.referee_contact_name;
    if (detail.referee_contact_email)  updates.referee_contact_email = detail.referee_contact_email;
    if (detail.referee_contact_phone)  updates.referee_contact_phone = detail.referee_contact_phone;
    if (detail.team_fee)               updates.team_fee = detail.team_fee;
    if (detail.venue_name)             updates.venue = detail.venue_name;
    if (detail.street_address)         updates.address = detail.street_address;
    if (detail.city)                   updates.city = detail.city;
    if (detail.zip)                    updates.zip = detail.zip;
    if (detail.official_website_url)   updates.official_website_url = detail.official_website_url;
    // Fill dates only if not already on the record
    if (detail.start_date && !t.start_date) updates.start_date = detail.start_date;
    if (detail.end_date && !t.end_date)     updates.end_date = detail.end_date;

    if (APPLY) {
      const { error: updErr } = await supabase
        .from("tournaments")
        .update(updates)
        .eq("id", t.id);
      if (updErr) {
        console.log(`  ✗ update failed: ${updErr.message}`);
        failed++;
        await sleep(RATE_LIMIT_MS);
        continue;
      }
    }

    // Upsert venue + add link (additive — never removes existing links)
    if (detail.venue_name) {
      const venueId = await upsertVenue(detail, t.sport ?? "soccer");
      if (venueId) {
        await linkTournamentVenue(t.id, venueId);
        console.log(`  ✓ venue ${APPLY ? `linked: ${venueId}` : "(dry-run)"}`);
      } else if (APPLY) {
        console.log(`  ⚠ venue upsert returned no id`);
      } else {
        console.log(`  ✓ venue would be upserted (dry-run)`);
      }
    }

    console.log(`  ✓ ${APPLY ? "written" : "dry-run ok"}\n`);
    ok++;
    await sleep(RATE_LIMIT_MS);
  }

  console.log(`Done.  ok=${ok}  skipped=${skipped}  failed=${failed}`);
  if (!APPLY) console.log("\nRerun with --apply to commit changes.");
}

run().catch((err) => { console.error(err); process.exit(1); });
