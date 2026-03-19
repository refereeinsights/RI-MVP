import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

type TournamentRow = {
  id: string;
  name: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  start_date?: string | null;
  end_date?: string | null;
  source_url: string | null;
  official_website_url: string | null;
};

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  venue_url: string | null;
};

type ParsedVenue = {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  // Exposure does not provide a stable venue permalink; keep null for now.
  venue_url: null;
};

type Unresolved = {
  tournament_id: string;
  tournament_name: string | null;
  url: string | null;
  reason: "missing_url" | "no_exposure_widget" | "fetch_empty" | "no_venues_found" | "error";
  detail?: string;
};

const APPLY = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : 5000;
const DOMAIN_ARG = process.argv.find((arg) => arg.startsWith("--domain="));
const DOMAIN_FILTER = (DOMAIN_ARG ? DOMAIN_ARG.split("=")[1] : "toptiersports.net").trim().toLowerCase();

function clean(value: string | null | undefined) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchHtml(url: string) {
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-cache",
      headers: { "user-agent": "RI-Exposure-VenueLinker/1.0" },
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(contentType)) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

function extractExposureWidgetEventUrl(html: string): string | null {
  // Example on toptiersports.net:
  // data-href="https://baseball.exposureevents.com/widgets/v1/event?eventid=250529&header=true&menu=true"
  const m =
    html.match(/https?:\/\/[a-z0-9-]+\.exposureevents\.com\/widgets\/v1\/event\?[^\"'<>]*eventid=\d+[^\"'<>]*/i) ??
    null;
  if (m && m[0]) return m[0];
  return null;
}

function buildVenuesUrlFromWidgetEventUrl(widgetUrl: string): { venuesUrl: string; eventId: string } | null {
  try {
    const u = new URL(widgetUrl);
    const eventId = u.searchParams.get("eventid");
    if (!eventId || !/^\d+$/.test(eventId)) return null;
    const venuesUrl = `${u.protocol}//${u.host}/widgets/v1/venues?eventid=${encodeURIComponent(eventId)}&header=true&menu=true`;
    return { venuesUrl, eventId };
  } catch {
    return null;
  }
}

function parseExposureVenues(html: string): ParsedVenue[] {
  const $ = cheerio.load(html);
  const out: ParsedVenue[] = [];

  // Venue cards look like:
  // <div class="col-12 col-lg-6" id="...">
  //   <h2>Celebration Park</h2>
  //   ...
  //   <div class="street-address">1095 S. 324th St</div>
  //   <span class="locality">Federal Way</span>, <span class="region">WA</span>, <span class="postal-code">98003</span>
  const blocks = $("div.col-12.col-lg-6").filter((_, el) => {
    const hasName = $(el).find("h2").first().text().trim().length > 0;
    const hasAddr = $(el).find(".street-address").first().text().trim().length > 0;
    return hasName && hasAddr;
  });

  blocks.each((_, el) => {
    const name = clean($(el).find("h2").first().text()) ?? "";
    const address = clean($(el).find(".street-address").first().text()) ?? "";
    const city = clean($(el).find(".locality").first().text()) ?? "";
    const state = (clean($(el).find(".region").first().text()) ?? "").toUpperCase();
    const zip = clean($(el).find(".postal-code").first().text());
    if (!name || !address || !city || !state) return;
    out.push({ name, address, city, state, zip: zip ?? null, venue_url: null });
  });

  // Dedupe by (address, city, state, name) but prefer not to create duplicates.
  const seen = new Set<string>();
  const deduped: ParsedVenue[] = [];
  for (const v of out) {
    const key = [normalize(v.address), normalize(v.city), normalize(v.state), normalize(v.name)].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(v);
  }
  return deduped;
}

async function run() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const domainIlike = `%${DOMAIN_FILTER}%`;
  const { data: tournamentsRaw, error: tournamentErr } = await supabase
    .from("tournaments" as any)
    .select("id,name,sport,city,state,start_date,end_date,source_url,official_website_url,status,is_canonical")
    .eq("status", "published")
    .eq("is_canonical", true)
    .or(`source_url.ilike.${domainIlike},official_website_url.ilike.${domainIlike}`)
    .order("updated_at", { ascending: false })
    .limit(LIMIT);
  if (tournamentErr) throw tournamentErr;
  const tournaments = (tournamentsRaw ?? []) as TournamentRow[];

  const ids = tournaments.map((t) => t.id).filter(Boolean);
  const linkedSet = new Set<string>();
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data: linked, error } = await supabase
      .from("tournament_venues" as any)
      .select("tournament_id")
      .in("tournament_id", chunk);
    if (error) throw error;
    for (const row of (linked ?? []) as Array<{ tournament_id: string | null }>) {
      const tid = String(row.tournament_id ?? "");
      if (tid) linkedSet.add(tid);
    }
  }
  const targets = tournaments.filter((t) => !linkedSet.has(t.id));

  // Small in-memory index to reduce roundtrips for venues we touch repeatedly.
  const venueByAddrKey = new Map<string, VenueRow[]>();
  const indexVenue = (v: VenueRow) => {
    const address = clean(v.address) ?? "";
    const city = clean(v.city) ?? "";
    const state = (clean(v.state) ?? "").toUpperCase();
    if (!address || !city || !state) return;
    const key = [normalize(address), normalize(city), normalize(state)].join("|");
    const list = venueByAddrKey.get(key) ?? [];
    if (!list.some((x) => x.id === v.id)) list.push(v);
    venueByAddrKey.set(key, list);
  };

  const findVenueByAddressCityState = async (args: {
    address: string;
    city: string;
    state: string;
  }): Promise<VenueRow | null> => {
    const key = [normalize(args.address), normalize(args.city), normalize(args.state)].join("|");
    const cached = venueByAddrKey.get(key);
    if (cached && cached.length) return cached[0] ?? null;
    const { data, error } = await supabase
      .from("venues" as any)
      .select("id,name,address,address1,city,state,zip,venue_url")
      .eq("address", args.address)
      .eq("city", args.city)
      .eq("state", args.state)
      .limit(5);
    if (error) throw error;
    const rows = (data ?? []) as VenueRow[];
    for (const v of rows) indexVenue(v);
    return rows[0] ?? null;
  };

  const findVenueByUniqueKey = async (args: {
    name: string;
    address: string;
    city: string;
    state: string;
  }): Promise<VenueRow | null> => {
    const { data, error } = await supabase
      .from("venues" as any)
      .select("id,name,address,address1,city,state,zip,venue_url")
      .eq("name", args.name)
      .eq("address", args.address)
      .eq("city", args.city)
      .eq("state", args.state)
      .maybeSingle();
    if (error && (error as any).code !== "PGRST116") throw error;
    const v = (data as VenueRow | null) ?? null;
    if (v) indexVenue(v);
    return v;
  };

  let scanned = 0;
  let withWidget = 0;
  let withVenueData = 0;
  let linkedExistingVenues = 0;
  let linkedCreatedVenues = 0;
  let created = 0;
  let linksInserted = 0;
  let failures = 0;
  const unresolved: Unresolved[] = [];

  for (const t of targets) {
    scanned += 1;
    const url = (clean(t.official_website_url) ?? clean(t.source_url)) as string | null;
    if (!url) {
      unresolved.push({
        tournament_id: t.id,
        tournament_name: t.name,
        url: null,
        reason: "missing_url",
      });
      continue;
    }

    try {
      const html = await fetchHtml(url);
      if (!html) {
        unresolved.push({
          tournament_id: t.id,
          tournament_name: t.name,
          url,
          reason: "fetch_empty",
        });
        continue;
      }
      const widgetUrl = extractExposureWidgetEventUrl(html);
      if (!widgetUrl) {
        unresolved.push({
          tournament_id: t.id,
          tournament_name: t.name,
          url,
          reason: "no_exposure_widget",
        });
        continue;
      }
      withWidget += 1;

      const built = buildVenuesUrlFromWidgetEventUrl(widgetUrl);
      if (!built) {
        unresolved.push({
          tournament_id: t.id,
          tournament_name: t.name,
          url,
          reason: "no_exposure_widget",
          detail: "Failed to parse exposure widget eventid",
        });
        continue;
      }

      const venuesHtml = await fetchHtml(built.venuesUrl);
      if (!venuesHtml) {
        unresolved.push({
          tournament_id: t.id,
          tournament_name: t.name,
          url: built.venuesUrl,
          reason: "fetch_empty",
        });
        continue;
      }

      const parsed = parseExposureVenues(venuesHtml);
      if (!parsed.length) {
        unresolved.push({
          tournament_id: t.id,
          tournament_name: t.name,
          url: built.venuesUrl,
          reason: "no_venues_found",
        });
        continue;
      }
      withVenueData += 1;

      for (const pv of parsed) {
        let createdThisVenue = false;
        let venue = await findVenueByAddressCityState({
          address: pv.address,
          city: pv.city,
          state: pv.state,
        });

        if (!venue && APPLY) {
          const payload: Record<string, unknown> = {
            name: pv.name,
            address: pv.address,
            address1: pv.address,
            city: pv.city,
            state: pv.state,
            zip: pv.zip,
            venue_url: null,
          };

          // Check the DB-level unique key before insert to avoid 23505 from partial prefetches / races.
          const existingByUnique = await findVenueByUniqueKey({
            name: pv.name,
            address: pv.address,
            city: pv.city,
            state: pv.state,
          });

          if (existingByUnique) {
            venue = existingByUnique;
          } else {
            const { data: insertRaw, error: insertErr } = await supabase
              .from("venues" as any)
              .insert(payload)
              .select("id,name,address,address1,city,state,zip,venue_url")
              .single();
            if (insertErr) {
              if ((insertErr as any).code === "23505") {
                const existingAfter = await findVenueByUniqueKey({
                  name: pv.name,
                  address: pv.address,
                  city: pv.city,
                  state: pv.state,
                });
                if (existingAfter) venue = existingAfter;
                else throw insertErr;
              } else {
                throw insertErr;
              }
            } else {
              venue = insertRaw as VenueRow;
              indexVenue(venue);
              created += 1;
              createdThisVenue = true;
            }
          }
        }

        if (!venue) {
          // dry-run: we'd create (assume) and link
          created += 1;
          linkedCreatedVenues += 1;
          linksInserted += 1;
          continue;
        }

        if (APPLY) {
          const { error: linkErr } = await supabase
            .from("tournament_venues" as any)
            .upsert({ tournament_id: t.id, venue_id: venue.id }, { onConflict: "tournament_id,venue_id" });
          if (linkErr) throw linkErr;
          linksInserted += 1;
          if (createdThisVenue) linkedCreatedVenues += 1;
          else linkedExistingVenues += 1;
        } else {
          linksInserted += 1;
          // In dry-run we infer existing only when we matched by address.
          linkedExistingVenues += 1;
        }
      }
    } catch (error) {
      failures += 1;
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null
            ? JSON.stringify(error)
            : String(error);
      unresolved.push({
        tournament_id: t.id,
        tournament_name: t.name,
        url,
        reason: "error",
        detail: msg,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        domain_filter: DOMAIN_FILTER,
        tournaments_scanned: tournaments.length,
        tournaments_missing_venues: targets.length,
        pages_scanned: scanned,
        pages_with_exposure_widget: withWidget,
        pages_with_venue_data: withVenueData,
        created_venues: created,
        tournament_venue_links_upserted: linksInserted,
        linked_existing_venues: linkedExistingVenues,
        linked_created_venues: linkedCreatedVenues,
        failures,
        unresolved_total: unresolved.length,
        unresolved: unresolved.slice(0, 50),
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
