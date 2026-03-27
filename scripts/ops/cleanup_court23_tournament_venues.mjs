import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { load as loadHtml } from "cheerio";

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

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function clean(value) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function csv(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const MONTHS = new Map([
  ["JANUARY", 1],
  ["FEBRUARY", 2],
  ["MARCH", 3],
  ["APRIL", 4],
  ["MAY", 5],
  ["JUNE", 6],
  ["JULY", 7],
  ["AUGUST", 8],
  ["SEPTEMBER", 9],
  ["OCTOBER", 10],
  ["NOVEMBER", 11],
  ["DECEMBER", 12],
]);

function toIsoDate(y, m, d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}

function parseCourt23DateRange(label) {
  // "MAY 2-3, 2026" or "MARCH 7-8, 2026" or "APRIL 11-12, 2026"
  const raw = clean(label);
  if (!raw) return null;
  const m = raw.match(/^([A-Z]+)\s+(\d{1,2})(?:\s*-\s*(\d{1,2}))?,\s*(\d{4})$/i);
  if (!m) return null;
  const monthName = String(m[1] ?? "").toUpperCase();
  const month = MONTHS.get(monthName);
  if (!month) return null;
  const d1 = Number(m[2]);
  const d2 = Number(m[3] ?? m[2]);
  const year = Number(m[4]);
  if (!Number.isFinite(d1) || !Number.isFinite(d2) || !Number.isFinite(year)) return null;
  return { start_date: toIsoDate(year, month, d1), end_date: toIsoDate(year, month, d2) };
}

async function fetchText(url) {
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    cache: "no-cache",
    headers: { "user-agent": "RI-Court23-Cleanup/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`fetch_failed:${res.status}:${url}`);
  return await res.text();
}

function buildHomepageDateToUrlMap(homeHtml) {
  const $ = loadHtml(homeHtml);
  const map = new Map(); // key "YYYY-MM-DD|YYYY-MM-DD" -> url
  $("p.has-text-align-center").each((_idx, el) => {
    const dateText = clean($(el).find("strong").first().text());
    const href = clean($(el).find("a[href]").first().attr("href"));
    if (!dateText || !href) return;
    if (!href.includes("/dallas-tournaments/")) return;
    const parsed = parseCourt23DateRange(dateText);
    if (!parsed) return;
    map.set(`${parsed.start_date}|${parsed.end_date}`, href);
  });
  return map;
}

function parsePlayingSites(html) {
  const $ = loadHtml(html);
  const entry = $(".entry-content, .post-content, article, .post").first();
  const kids = entry.children().toArray();
  const findText = (node) => clean($(node).text()) ?? "";

  let startIdx = -1;
  for (let i = 0; i < kids.length; i++) {
    const text = findText(kids[i]).toLowerCase();
    if (text.includes("playing site")) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return [];

  const stopWords = ["entry fee", "hotel", "register", "registration", "rules", "brackets"];
  const chunks = [];
  for (let i = startIdx; i < kids.length; i++) {
    const text = findText(kids[i]);
    if (!text) continue;
    const low = text.toLowerCase();
    if (i > startIdx && stopWords.some((w) => low.includes(w))) break;
    const htmlFrag = $(kids[i]).html() ?? "";
    const normalized = htmlFrag
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/\u00a0/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();
    if (normalized) chunks.push(normalized);
  }

  const venues = [];
  const parseCityStateZip = (line) => {
    const raw = clean(line);
    if (!raw) return null;
    const normalized = raw
      .replace(/\bTexas\b/gi, "TX")
      .replace(/\s+/g, " ")
      .replace(/\s*,\s*/g, ", ")
      .trim();

    // "Plano, TX 75023"
    let m = normalized.match(/^(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i);
    if (m) return { city: clean(m[1]), state: clean(m[2])?.toUpperCase() ?? null, zip: m[3] ? clean(m[3]) : null };

    // "Plano TX, 75023"
    m = normalized.match(/^(.+?)\s+([A-Z]{2}),\s*(\d{5}(?:-\d{4})?)$/i);
    if (m) return { city: clean(m[1]), state: clean(m[2])?.toUpperCase() ?? null, zip: clean(m[3]) };

    // "Plano, TX, 75023"
    m = normalized.match(/^(.+?),\s*([A-Z]{2}),\s*(\d{5}(?:-\d{4})?)$/i);
    if (m) return { city: clean(m[1]), state: clean(m[2])?.toUpperCase() ?? null, zip: clean(m[3]) };

    // "Plano TX 75023"
    m = normalized.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
    if (m) return { city: clean(m[1]), state: clean(m[2])?.toUpperCase() ?? null, zip: clean(m[3]) };

    // "Plano, TX"
    m = normalized.match(/^(.+?),\s*([A-Z]{2})$/i);
    if (m) return { city: clean(m[1]), state: clean(m[2])?.toUpperCase() ?? null, zip: null };

    return null;
  };

  for (const chunk of chunks) {
    const lines = chunk
      .split("\n")
      .map((l) => clean(l))
      .filter(Boolean);
    if (lines.length < 2) continue;

    const name = lines.find((l) => /[A-Za-z]/.test(l) && !/^(playing sites?:)$/i.test(l)) ?? null;
    const address = lines.find((l) => /^\d{1,6}\s+/.test(l)) ?? null;
    const cityStateZipLine =
      lines.find((l) => /,\s*[A-Z]{2}\s*\d{5}/.test(l)) ??
      lines.find((l) => /\s+[A-Z]{2},\s*\d{5}/.test(l)) ??
      lines.find((l) => /\bTexas\b/i.test(l)) ??
      lines.find((l) => /,\s*[A-Z]{2}\b/.test(l)) ??
      null;
    if (!name || !address || !cityStateZipLine) continue;
    const parsed = parseCityStateZip(cityStateZipLine);
    if (!parsed) continue;
    const city = parsed.city;
    const state = parsed.state;
    const zip = parsed.zip;
    if (!city || !state) continue;
    venues.push({ name, address, city, state, zip });
  }

  // De-dupe by name+address+city+state.
  const uniq = new Map();
  for (const v of venues) {
    uniq.set(`${v.name}|${v.address}|${v.city}|${v.state}`, v);
  }
  return Array.from(uniq.values());
}

async function main() {
  loadEnvLocal();
  const APPLY = process.argv.includes("--apply");
  const outPath = clean(argValue("out")) || path.resolve(process.cwd(), "tmp", "court23_cleanup_report.csv");

  const supabaseUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const homeHtml = await fetchText("https://court23basketball.com/");
  const dateUrlMap = buildHomepageDateToUrlMap(homeHtml);

  const { data: tournamentsRaw, error: tErr } = await supabase
    .from("tournaments")
    .select("id,name,city,state,start_date,end_date,sport,official_website_url,source_url,updated_at")
    .ilike("name", "Court 23 Basketball%")
    .eq("state", "TX")
    .order("start_date", { ascending: true })
    .limit(200);
  if (tErr) throw tErr;
  const tournaments = (tournamentsRaw ?? []).filter((t) => t?.id);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    ["tournament_id", "tournament_name", "start_date", "end_date", "page_url", "old_links", "new_links", "created_venues", "unlinked_links", "note"].join(",") + "\n",
    "utf8"
  );

  let processed = 0;
  for (const t of tournaments) {
    const start = clean(t.start_date);
    const end = clean(t.end_date) ?? start;
    const key = start && end ? `${start}|${end}` : null;
    const pageUrl = key ? dateUrlMap.get(key) ?? null : null;
    if (!pageUrl) {
      fs.appendFileSync(outPath, [t.id, t.name, start, end, "", "", "", "", "", "no_page_match"].map(csv).join(",") + "\n");
      continue;
    }

    const html = await fetchText(pageUrl);
    const venues = parsePlayingSites(html);
    if (!venues.length) {
      fs.appendFileSync(outPath, [t.id, t.name, start, end, pageUrl, "", "", "", "", "no_playing_sites"].map(csv).join(",") + "\n");
      continue;
    }

    // Load existing links.
    const { data: linksRaw, error: lErr } = await supabase
      .from("tournament_venues")
      .select("venue_id")
      .eq("tournament_id", t.id);
    if (lErr) throw lErr;
    const existingVenueIds = new Set((linksRaw ?? []).map((r) => String(r.venue_id ?? "")).filter(Boolean));

    // Ensure venue rows exist.
    const keepVenueIds = [];
    let createdVenues = 0;
    for (const v of venues) {
      // Prefer exact match on the unique constraint, then fall back to address/city/state.
      const { data: matchRows, error: mErr } = await supabase
        .from("venues")
        .select("id,name")
        .eq("name", v.name)
        .eq("address", v.address)
        .eq("city", v.city)
        .eq("state", v.state)
        .limit(2);
      if (mErr) throw mErr;
      if ((matchRows ?? []).length === 1) {
        keepVenueIds.push(String(matchRows[0].id));
        continue;
      }
      if ((matchRows ?? []).length > 1) {
        keepVenueIds.push(String(matchRows[0].id));
        continue;
      }

      const { data: addrRows, error: aErr } = await supabase
        .from("venues")
        .select("id,name")
        .eq("address", v.address)
        .eq("city", v.city)
        .eq("state", v.state)
        .limit(5);
      if (aErr) throw aErr;
      if ((addrRows ?? []).length === 1) {
        const row = addrRows[0];
        keepVenueIds.push(String(row.id));
        // If the existing row has a blank-ish name, fill it with the better one.
        const existingName = clean(row.name);
        if (APPLY && (!existingName || /^\d{1,6}\s+/.test(existingName))) {
          await supabase
            .from("venues")
            .update({ name: v.name, updated_at: new Date().toISOString() })
            .eq("id", row.id);
        }
        continue;
      }
      if ((addrRows ?? []).length > 1) {
        // Ambiguous address match; keep the first row to avoid inserting another duplicate.
        keepVenueIds.push(String(addrRows[0].id));
        continue;
      }

      if (!APPLY) {
        keepVenueIds.push("dry_run_new_venue");
        createdVenues += 1;
        continue;
      }

      const { data: ins, error: insErr } = await supabase
        .from("venues")
        .insert({
          name: v.name,
          address: v.address,
          city: v.city,
          state: v.state,
          zip: v.zip,
          sport: clean(t.sport) ?? "basketball",
          venue_url: null,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      createdVenues += 1;
      keepVenueIds.push(String(ins.id));
    }

    const keepSet = new Set(keepVenueIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)));
    const oldLinksCount = existingVenueIds.size;

    let newLinksCount = keepSet.size;
    let unlinked = 0;
    if (APPLY) {
      // Link desired venues.
      for (const venueId of keepSet) {
        await supabase.from("tournament_venues").upsert({ tournament_id: t.id, venue_id: venueId }, { onConflict: "tournament_id,venue_id" });
      }
      // Unlink everything else.
      const toUnlink = Array.from(existingVenueIds).filter((id) => !keepSet.has(id));
      if (toUnlink.length) {
        const { error: delErr } = await supabase.from("tournament_venues").delete().eq("tournament_id", t.id).in("venue_id", toUnlink);
        if (delErr) throw delErr;
        unlinked = toUnlink.length;
      }
      // Update URL to the specific tournament page (helps deep scan avoid homepage bleed).
      const currentOfficial = clean(t.official_website_url) ?? clean(t.source_url) ?? "";
      if (currentOfficial === "https://court23basketball.com/" || currentOfficial === "https://court23basketball.com") {
        await supabase
          .from("tournaments")
          .update({ official_website_url: pageUrl, updated_at: new Date().toISOString() })
          .eq("id", t.id);
      }
    }

    fs.appendFileSync(
      outPath,
      [t.id, t.name, start, end, pageUrl, String(oldLinksCount), String(newLinksCount), String(createdVenues), String(unlinked), APPLY ? "applied" : "dry_run"].map(csv).join(",") +
        "\n"
    );
    processed += 1;
  }

  console.log(`[court23_cleanup] apply=${APPLY} processed=${processed} report=${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
