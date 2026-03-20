import { createClient } from "@supabase/supabase-js";

type TournamentRow = {
  id: string;
  name: string | null;
  sport: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type ParsedAddress = {
  address1: string;
  city: string;
  state: string;
  zip: string | null;
};

const APPLY = process.argv.includes("--apply");

function argValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}.`);
  return v;
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSemi(value: string | null | undefined) {
  return (value ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeZip(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{5})(?:-\d{4})?$/);
  return m ? m[1] : null;
}

function normalizeState(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return null;
}

function parseUsAddress(value: string | null | undefined): ParsedAddress | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  // Street, City, ST 12345
  const m = raw.match(/^(.+?),\s*(.+?),\s*([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?\s*$/);
  if (!m) return null;

  return {
    address1: m[1].trim(),
    city: m[2].trim(),
    state: m[3].toUpperCase(),
    zip: m[4],
  };
}

function buildCandidate(opts: {
  venueName: string;
  addressRaw: string;
  cityFallback: string | null;
  stateFallback: string | null;
  zipFallback: string | null;
}): { name: string; address1: string; city: string; state: string; zip: string | null } | null {
  const name = opts.venueName.trim();
  if (!name) return null;

  const parsed = parseUsAddress(opts.addressRaw);
  if (parsed) {
    return {
      name,
      address1: parsed.address1,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
    };
  }

  const address1 = opts.addressRaw.trim();
  const city = String(opts.cityFallback ?? "").trim();
  const state = normalizeState(opts.stateFallback);
  const zip = normalizeZip(opts.zipFallback);

  // Too risky to create/link venues without a street-like address.
  // This avoids creating junk venues like "TBD", "Multiple gyms", "City-wide" placeholders.
  const streetLike = /^[0-9][0-9A-Za-z-]*\s+/.test(address1);
  if (!address1 || !streetLike || !city || !state) return null;

  return { name, address1, city, state, zip };
}

async function findOrCreateVenue(supabase: any, candidate: {
  name: string;
  address1: string;
  city: string;
  state: string;
  zip: string | null;
  sport: string | null;
}): Promise<{ id: string; matched: boolean; created: boolean }> {
  const targetAddr = normalize(candidate.address1);
  const targetCity = normalize(candidate.city);
  const targetName = normalize(candidate.name);

  let query = supabase
    .from("venues" as any)
    .select("id,name,address,address1,city,state,zip")
    .eq("state", candidate.state);

  if (candidate.zip) query = query.eq("zip", candidate.zip);
  else query = query.eq("city", candidate.city);

  const { data: candidatesRaw, error: candidatesErr } = await query.limit(250);
  if (candidatesErr) throw candidatesErr;
  const candidates = (candidatesRaw ?? []) as VenueRow[];

  const existing =
    candidates.find((v) => normalize(v.address1 || v.address) === targetAddr && normalize(v.city) === targetCity) ??
    candidates.find((v) => normalize(v.name) === targetName && normalize(v.city) === targetCity) ??
    null;

  if (existing?.id) {
    return { id: existing.id, matched: true, created: false };
  }

  if (!APPLY) {
    return { id: `DRY_RUN_${candidate.name.replace(/\s+/g, "_")}`, matched: false, created: true };
  }

  const insertPayload: any = {
    name: candidate.name,
    address: candidate.address1,
    address1: candidate.address1,
    city: candidate.city,
    state: candidate.state,
    zip: candidate.zip,
    sport: candidate.sport,
    updated_at: new Date().toISOString(),
  };

  const { data: inserted, error: insertErr } = await supabase.from("venues" as any).insert(insertPayload).select("id").single();
  if (insertErr) throw insertErr;

  return { id: String((inserted as any).id), matched: false, created: true };
}

async function main() {
  const limit = Number(argValue("limit") ?? "200");
  const offset = Number(argValue("offset") ?? "0");
  const stateFilter = normalizeState(argValue("state"));
  const sportFilter = String(argValue("sport") ?? "").trim().toLowerCase() || null;

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`${APPLY ? "[APPLY]" : "[DRY-RUN]"} Migrating tournaments.venue/address -> venues + tournament_venues`);
  console.log(`- limit=${limit} offset=${offset}`);
  if (stateFilter) console.log(`- state=${stateFilter}`);
  if (sportFilter) console.log(`- sport=${sportFilter}`);

  let baseQuery = supabase
    .from("tournaments" as any)
    .select("id,name,sport,venue,address,city,state,zip")
    .eq("status", "published")
    .eq("is_canonical", true)
    .or("venue.not.is.null,address.not.is.null")
    .order("start_date", { ascending: true, nullsFirst: false });

  if (stateFilter) baseQuery = baseQuery.eq("state", stateFilter);
  if (sportFilter) baseQuery = baseQuery.eq("sport", sportFilter);

  const { data: baseRaw, error: baseErr } = await baseQuery.range(offset, offset + Math.max(0, limit - 1));
  if (baseErr) throw baseErr;

  const base = (baseRaw ?? []) as TournamentRow[];
  if (base.length === 0) {
    console.log("No tournaments found for this range.");
    return;
  }

  // Filter to only those with NO linked venues.
  const ids = base.map((t) => t.id).filter(Boolean);
  const linkedSet = new Set<string>();
  const chunkSize = 50;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data: linked, error } = await supabase
      .from("tournament_venues" as any)
      .select("tournament_id")
      .in("tournament_id", chunk)
      .limit(20000);
    if (error) throw error;
    for (const row of (linked ?? []) as Array<{ tournament_id: string | null }>) {
      const tid = String(row.tournament_id ?? "");
      if (tid) linkedSet.add(tid);
    }
  }

  const targets = base.filter((t) => !linkedSet.has(t.id));

  let processedTournaments = 0;
  let skippedTournaments = 0;
  let matchedVenues = 0;
  let createdVenues = 0;
  let linkedCount = 0;
  let alreadyLinkedCount = 0;
  let skippedVenues = 0;

  for (const t of targets) {
    processedTournaments++;
    const tName = t.name ?? t.id;
    const tSport = t.sport ?? null;

    const venueNames = splitSemi(t.venue);
    const addrStrings = splitSemi(t.address);

    if (venueNames.length === 0 || addrStrings.length === 0) {
      skippedTournaments++;
      console.log(`\n- Skipping (missing venue/address text): ${tName} (${t.id})`);
      continue;
    }

    // If either has multiple but they don't line up, skip rather than guessing.
    if (venueNames.length !== addrStrings.length) {
      skippedTournaments++;
      console.warn(
        `\n- Skipping (multi-venue mismatch): ${tName} (${t.id}) venues=${venueNames.length} addresses=${addrStrings.length}`
      );
      continue;
    }

    console.log(`\nTournament: ${tName} (${t.id})`);

    for (let i = 0; i < venueNames.length; i++) {
      const venueName = venueNames[i];
      const addrRaw = addrStrings[i];
      const candidate = buildCandidate({
        venueName,
        addressRaw: addrRaw,
        cityFallback: t.city,
        stateFallback: t.state,
        zipFallback: t.zip,
      });
      if (!candidate) {
        skippedVenues++;
        console.warn(`  - Skipping venue (cannot safely parse): ${venueName || "(blank)"} / ${addrRaw || "(blank)"}`);
        continue;
      }

      const venueRes = await findOrCreateVenue(supabase, { ...candidate, sport: tSport });
      if (venueRes.matched) {
        matchedVenues++;
        console.log(`  - Found venue: ${candidate.name} (${venueRes.id})`);
      } else if (venueRes.created) {
        createdVenues++;
        console.log(
          `  - ${APPLY ? "Created" : "Would create"} venue: ${candidate.name} (${candidate.address1}, ${candidate.city}, ${candidate.state}${candidate.zip ? ` ${candidate.zip}` : ""})`
        );
      }

      if (!APPLY) {
        console.log(`    -> Would link tournament_venues: ${t.id} <-> ${venueRes.id}`);
        continue;
      }

      const { data: existingLink, error: linkCheckErr } = await supabase
        .from("tournament_venues" as any)
        .select("tournament_id,venue_id")
        .eq("tournament_id", t.id)
        .eq("venue_id", venueRes.id)
        .maybeSingle();
      if (linkCheckErr && (linkCheckErr as any).code !== "PGRST116") throw linkCheckErr;

      if (existingLink) {
        alreadyLinkedCount++;
        console.log("    -> Already linked.");
        continue;
      }

      const { error: linkErr } = await supabase
        .from("tournament_venues" as any)
        .upsert([{ tournament_id: t.id, venue_id: venueRes.id }], { onConflict: "tournament_id,venue_id" });
      if (linkErr) throw linkErr;

      linkedCount++;
      console.log("    -> Linked.");
    }
  }

  console.log("\nDone.");
  console.log(`- Tournament rows scanned: ${base.length}`);
  console.log(`- Tournament rows targeted (no links): ${targets.length}`);
  console.log(`- Tournaments processed: ${processedTournaments}`);
  console.log(`- Tournaments skipped: ${skippedTournaments}`);
  console.log(`- Venues matched: ${matchedVenues}`);
  console.log(`- Venues created: ${createdVenues}`);
  console.log(`- Links created: ${linkedCount}`);
  console.log(`- Already linked: ${alreadyLinkedCount}`);
  console.log(`- Venues skipped: ${skippedVenues}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
