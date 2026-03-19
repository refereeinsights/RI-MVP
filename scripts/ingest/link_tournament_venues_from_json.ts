import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type Payload = {
  tournament_id?: string;
  tournament_name?: string;
  venues: Array<{
    venue_name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    venue_url?: string | null;
  }>;
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

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}.`);
  return v;
}

async function main() {
  const filePath = argValue("file") || argValue("path");
  if (!filePath) {
    throw new Error("Usage: npx tsx scripts/ingest/link_tournament_venues_from_json.ts --file=... [--tournament-id=...] [--apply]");
  }

  const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const payload = JSON.parse(fs.readFileSync(absPath, "utf8")) as Payload;

  const tournamentId = (argValue("tournament-id") || payload.tournament_id || "").trim();
  if (!tournamentId) {
    throw new Error("Missing tournament id. Provide --tournament-id=... or include tournament_id in JSON.");
  }

  if (!Array.isArray(payload.venues) || payload.venues.length === 0) {
    throw new Error("Payload has no venues.");
  }

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tournamentRow, error: tournamentErr } = await supabase
    .from("tournaments" as any)
    .select("id,name,sport")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tournamentErr) throw tournamentErr;
  if (!tournamentRow?.id) throw new Error(`Tournament not found: ${tournamentId}`);

  const sport = (tournamentRow as any).sport ?? null;

  console.log(
    `${APPLY ? "[APPLY]" : "[DRY-RUN]"} Linking ${payload.venues.length} venue(s) to tournament: ${
      (tournamentRow as any).name ?? payload.tournament_name ?? tournamentId
    } (${tournamentId})`
  );

  const linked: Array<{ venue_id: string; venue_name: string; action: "linked" | "skipped_already_linked" }> = [];
  const created: Array<{ venue_id: string; venue_name: string }> = [];
  const matchedExisting: Array<{ venue_id: string; venue_name: string }> = [];

  for (const v of payload.venues) {
    const venueName = String(v.venue_name ?? "").trim();
    const address = String(v.address ?? "").trim();
    const city = String(v.city ?? "").trim();
    const state = String(v.state ?? "").trim().toUpperCase();
    const zip = String(v.zip ?? "").trim();
    const venueUrl = v.venue_url ? String(v.venue_url).trim() : null;

    if (!venueName || !address || !city || !state || !zip) {
      console.warn("Skipping venue with missing required fields:", v);
      continue;
    }

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

    let existing: VenueRow | null = null;
    // Prefer exact address match.
    existing =
      candidates.find((row) => normalize(row.address1 || row.address) === targetAddr && normalize(row.city) === targetCity) ??
      // Fall back to name+city match within zip/state.
      candidates.find((row) => normalize(row.name) === targetName && normalize(row.city) === targetCity) ??
      null;

    let venueId: string;
    if (existing?.id) {
      venueId = existing.id;
      matchedExisting.push({ venue_id: venueId, venue_name: venueName });
      console.log(`- Found existing venue: ${venueName} (${venueId})`);
    } else {
      const insertPayload: any = {
        name: venueName,
        address,
        address1: address,
        city,
        state,
        zip,
        venue_url: venueUrl,
        sport,
        updated_at: new Date().toISOString(),
      };
      if (!APPLY) {
        venueId = `DRY_RUN_${venueName.replace(/\s+/g, "_")}`;
        console.log(`- Would create venue: ${venueName} (${address}, ${city}, ${state} ${zip})`);
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from("venues" as any)
          .insert(insertPayload)
          .select("id")
          .single();
        if (insertErr) throw insertErr;
        venueId = String((inserted as any).id);
        created.push({ venue_id: venueId, venue_name: venueName });
        console.log(`- Created venue: ${venueName} (${venueId})`);
      }
    }

    if (!APPLY) {
      console.log(`  -> Would link tournament_venues: ${tournamentId} <-> ${venueId}`);
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
      linked.push({ venue_id: venueId, venue_name: venueName, action: "skipped_already_linked" });
      console.log(`  -> Already linked.`);
      continue;
    }

    const { error: linkErr } = await supabase
      .from("tournament_venues" as any)
      .upsert([{ tournament_id: tournamentId, venue_id: venueId }], { onConflict: "tournament_id,venue_id" });
    if (linkErr) throw linkErr;
    linked.push({ venue_id: venueId, venue_name: venueName, action: "linked" });
    console.log(`  -> Linked.`);
  }

  console.log("\nDone.");
  console.log(`- Existing matched: ${matchedExisting.length}`);
  console.log(`- Created: ${created.length}`);
  console.log(`- Linked: ${linked.filter((l) => l.action === "linked").length}`);
  console.log(`- Already linked: ${linked.filter((l) => l.action === "skipped_already_linked").length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

