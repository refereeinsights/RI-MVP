import { createClient } from "@supabase/supabase-js";
import { buildVenueAddressFingerprint, buildVenueNameCityStateFingerprint } from "../../apps/referee/lib/identity/fingerprints";

function argValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function clean(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseFullAddress(addr: string): { street: string; city: string; state: string; zip: string | null } | null {
  const normalized = String(addr ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const m = normalized.match(
    /^(.+?),\s*([A-Za-z.\s]{2,60}),\s*([A-Z]{2})(?:\s*,?\s*(\d{5}(?:-\d{4})?))?(?:\s*,?\s*([A-Z]{2}))?\s*$/
  );
  if (!m) return null;
  const street = String(m[1] ?? "").trim();
  const city = String(m[2] ?? "").trim();
  const state = String(m[3] ?? "").trim().toUpperCase();
  const zip = m[4] ? String(m[4]).trim() : null;
  const trailingState = m[5] ? String(m[5]).trim().toUpperCase() : null;
  if (trailingState && trailingState !== state) return null;
  if (!street || !city || !state) return null;
  return { street, city, state, zip };
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  const updateTournamentFields = !process.argv.includes("--no_update_tournament_fields");

  const tournamentId = clean(argValue("tournament_id"));
  const name = clean(argValue("name"));
  const addressText = clean(argValue("address"));
  const venueUrl = clean(argValue("venue_url"));

  if (!tournamentId || !isUuid(tournamentId)) {
    throw new Error("Usage: --tournament_id=<uuid> --name=<name> --address=<full address> [--venue_url=<url>] [--apply]");
  }
  if (!name) throw new Error("Missing --name");
  if (!addressText) throw new Error("Missing --address");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const parsed = parseFullAddress(addressText);
  if (!parsed) throw new Error(`Could not parse address: ${addressText}`);

  const address_fingerprint = buildVenueAddressFingerprint({ address: parsed.street, city: parsed.city, state: parsed.state });
  const name_city_state_fingerprint = buildVenueNameCityStateFingerprint({ name, city: parsed.city, state: parsed.state });

  let venue: any | null = null;

  if (address_fingerprint) {
    const { data: hits, error } = await supabase
      .from("venues" as any)
      .select("id,name,address,city,state,zip,venue_url,address_fingerprint,name_city_state_fingerprint")
      .eq("address_fingerprint", address_fingerprint)
      .limit(10);
    if (error) throw new Error(error.message);
    const rows = (hits ?? []) as any[];
    if (rows.length) {
      venue = name_city_state_fingerprint
        ? rows.find((r) => String(r.name_city_state_fingerprint ?? "") === name_city_state_fingerprint) ?? rows[0]
        : rows[0];
    }
  }

  if (!venue && name_city_state_fingerprint) {
    const { data: hits, error } = await supabase
      .from("venues" as any)
      .select("id,name,address,city,state,zip,venue_url,address_fingerprint,name_city_state_fingerprint")
      .eq("name_city_state_fingerprint", name_city_state_fingerprint)
      .limit(5);
    if (error) throw new Error(error.message);
    venue = (hits ?? [])[0] ?? null;
  }

  const venuePayload = {
    name,
    address: parsed.street,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
    venue_url: venueUrl,
    address_fingerprint,
    name_city_state_fingerprint,
  };

  let created = false;
  if (!venue) {
    if (!APPLY) {
      console.log("DRY RUN: would create venue:", venuePayload);
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("venues" as any)
        .upsert(venuePayload, { onConflict: "name,address,city,state" })
        .select("id,name,address,city,state,zip,venue_url,address_fingerprint,name_city_state_fingerprint")
        .maybeSingle();
      if (insErr) throw new Error(insErr.message);
      venue = inserted ?? null;
      created = true;
    }
  } else {
    const patch: any = {};
    if (venueUrl && !clean(venue.venue_url)) patch.venue_url = venueUrl;
    if (parsed.zip && !clean(venue.zip)) patch.zip = parsed.zip;
    if (Object.keys(patch).length) {
      if (!APPLY) {
        console.log("DRY RUN: would update venue:", { id: venue.id, ...patch });
      } else {
        const { error: updErr } = await supabase.from("venues" as any).update(patch).eq("id", venue.id);
        if (updErr) throw new Error(updErr.message);
        venue = { ...venue, ...patch };
      }
    }
  }

  if (!venue?.id) throw new Error("venue_not_resolved");

  if (!APPLY) {
    console.log("DRY RUN: would link tournament_venues:", { tournament_id: tournamentId, venue_id: venue.id });
  } else {
    const { error: linkErr } = await supabase
      .from("tournament_venues" as any)
      .upsert([{ tournament_id: tournamentId, venue_id: venue.id }], { onConflict: "tournament_id,venue_id" });
    if (linkErr) throw new Error(linkErr.message);

    if (updateTournamentFields) {
      const { data: tRow, error: tErr } = await supabase
        .from("tournaments" as any)
        .select("id,venue,address")
        .eq("id", tournamentId)
        .maybeSingle();
      if (tErr) throw new Error(tErr.message);
      const patch: any = {};
      if (!clean(tRow?.venue)) patch.venue = name;
      if (!clean(tRow?.address)) patch.address = `${parsed.street}, ${parsed.city}, ${parsed.state}${parsed.zip ? ` ${parsed.zip}` : ""}`;
      if (Object.keys(patch).length) {
        const { error: tUpdErr } = await supabase.from("tournaments" as any).update(patch).eq("id", tournamentId);
        if (tUpdErr) throw new Error(tUpdErr.message);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        applied: APPLY,
        venue_id: venue.id,
        created,
        linked: true,
        tournament_id: tournamentId,
        venue: {
          name: venue.name ?? name,
          address: venue.address ?? parsed.street,
          city: venue.city ?? parsed.city,
          state: venue.state ?? parsed.state,
          zip: venue.zip ?? parsed.zip,
          venue_url: venue.venue_url ?? venueUrl ?? null,
        },
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("ERROR", err?.message || err);
  process.exit(1);
});

