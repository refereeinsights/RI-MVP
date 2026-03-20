import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type Row = {
  tournament_id: string;
  tournament_name: string;
  venues: string;
  venue_addresses: string;
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

function splitSemi(value: string) {
  return value
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Minimal CSV parser that handles quotes/double-quotes.
function parseCsv(content: string): Row[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0]);
  const idx = (name: string) => header.indexOf(name);
  const idIdx = idx("tournament_id");
  const nameIdx = idx("tournament_name");
  const venuesIdx = idx("venues");
  const addrsIdx = idx("venue_addresses");

  if (idIdx < 0 || nameIdx < 0 || venuesIdx < 0 || addrsIdx < 0) {
    throw new Error(`CSV must include headers: tournament_id,tournament_name,venues,venue_addresses. Got: ${header.join(",")}`);
  }

  const out: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    out.push({
      tournament_id: (cols[idIdx] ?? "").trim(),
      tournament_name: (cols[nameIdx] ?? "").trim(),
      venues: (cols[venuesIdx] ?? "").trim(),
      venue_addresses: (cols[addrsIdx] ?? "").trim(),
    });
  }
  return out.filter((r) => r.tournament_id);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\"") {
      const next = line[i + 1];
      if (inQuotes && next === "\"") {
        cur += "\"";
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseUsAddress(full: string): { address: string; city: string; state: string; zip: string } | null {
  const parts = full.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const address = parts[0];
  const city = parts[1];
  const stateZip = parts.slice(2).join(" ");
  const m = stateZip.match(/\b([A-Za-z]{2})\b\s*(\d{5})(?:-\d{4})?$/);
  if (!m) return null;
  return { address, city, state: m[1].toUpperCase(), zip: m[2] };
}

async function main() {
  const filePath = argValue("file") || argValue("path");
  if (!filePath) {
    throw new Error("Usage: npx tsx scripts/ingest/link_tournament_venues_from_csv.ts --file=... [--apply]");
  }

  const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const rows = parseCsv(fs.readFileSync(absPath, "utf8"));
  if (rows.length === 0) throw new Error("No rows found.");

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`${APPLY ? "[APPLY]" : "[DRY-RUN]"} Processing ${rows.length} tournament row(s) from ${absPath}`);

  let createdVenues = 0;
  let matchedVenues = 0;
  let linkedCount = 0;
  let alreadyLinkedCount = 0;
  let skippedVenues = 0;

  for (const row of rows) {
    const tournamentId = row.tournament_id;
    const venues = splitSemi(row.venues);
    const addrStrings = splitSemi(row.venue_addresses);

    if (venues.length === 0 || addrStrings.length === 0) {
      console.log(`\n- Skipping tournament (no venues/addresses): ${row.tournament_name || tournamentId} (${tournamentId})`);
      continue;
    }

    if (venues.length !== addrStrings.length) {
      console.warn(
        `\n- Skipping tournament (venues/addresses count mismatch): ${row.tournament_name || tournamentId} (${tournamentId}) venues=${venues.length} addresses=${addrStrings.length}`
      );
      continue;
    }

    const { data: tournamentRow, error: tournamentErr } = await supabase
      .from("tournaments" as any)
      .select("id,name,sport")
      .eq("id", tournamentId)
      .maybeSingle();
    if (tournamentErr) throw tournamentErr;
    if (!tournamentRow?.id) {
      console.warn(`\n- Tournament not found, skipping: ${row.tournament_name || tournamentId} (${tournamentId})`);
      continue;
    }

    const sport = (tournamentRow as any).sport ?? null;

    console.log(`\nTournament: ${(tournamentRow as any).name ?? row.tournament_name ?? tournamentId} (${tournamentId})`);

    for (let i = 0; i < venues.length; i++) {
      const venueName = venues[i];
      const parsed = parseUsAddress(addrStrings[i]);
      if (!venueName || !parsed) {
        skippedVenues++;
        console.warn(`  - Skipping venue (missing/invalid address): ${venueName || "(blank)"} / ${addrStrings[i]}`);
        continue;
      }

      const { address, city, state, zip } = parsed;

      const { data: candidatesRaw, error: candidatesErr } = await supabase
        .from("venues" as any)
        .select("id,name,address,address1,city,state,zip,venue_url")
        .eq("state", state)
        .eq("zip", zip)
        .limit(250);
      if (candidatesErr) throw candidatesErr;
      const candidates = (candidatesRaw ?? []) as VenueRow[];

      const targetAddr = normalize(address);
      const targetCity = normalize(city);
      const targetName = normalize(venueName);

      const existing =
        candidates.find((v) => normalize(v.address1 || v.address) === targetAddr && normalize(v.city) === targetCity) ??
        candidates.find((v) => normalize(v.name) === targetName && normalize(v.city) === targetCity) ??
        null;

      let venueId: string;
      if (existing?.id) {
        venueId = existing.id;
        matchedVenues++;
        console.log(`  - Found venue: ${venueName} (${venueId})`);
      } else {
        if (!APPLY) {
          venueId = `DRY_RUN_${venueName.replace(/\s+/g, "_")}`;
          createdVenues++;
          console.log(`  - Would create venue: ${venueName} (${address}, ${city}, ${state} ${zip})`);
        } else {
          const insertPayload: any = {
            name: venueName,
            address,
            address1: address,
            city,
            state,
            zip,
            sport,
            updated_at: new Date().toISOString(),
          };
          const { data: inserted, error: insertErr } = await supabase.from("venues" as any).insert(insertPayload).select("id").single();
          if (insertErr) throw insertErr;
          venueId = String((inserted as any).id);
          createdVenues++;
          console.log(`  - Created venue: ${venueName} (${venueId})`);
        }
      }

      if (!APPLY) {
        console.log(`    -> Would link tournament_venues: ${tournamentId} <-> ${venueId}`);
        continue;
      }

      const { data: existingLink, error: linkCheckErr } = await supabase
        .from("tournament_venues" as any)
        .select("tournament_id,venue_id")
        .eq("tournament_id", tournamentId)
        .eq("venue_id", venueId)
        .maybeSingle();
      if (linkCheckErr && (linkCheckErr as any).code !== "PGRST116") throw linkCheckErr;

      if (existingLink) {
        alreadyLinkedCount++;
        console.log("    -> Already linked.");
        continue;
      }

      const { error: linkErr } = await supabase
        .from("tournament_venues" as any)
        .upsert([{ tournament_id: tournamentId, venue_id: venueId }], { onConflict: "tournament_id,venue_id" });
      if (linkErr) throw linkErr;
      linkedCount++;
      console.log("    -> Linked.");
    }
  }

  console.log("\nDone.");
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

