import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
};

function clean(value: string | null | undefined) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function looksLikeJunkVenueName(name: string | null | undefined) {
  const n = clean(name);
  if (!n) return true;
  return (
    /\b(born\s*\d{4}|\d{1,2}u\b|girls?\d{1,2}u|boys?\d{1,2}u|program|coach:|size\s*\d+)\b/i.test(n) ||
    /\b(minutes?|mins?)\b/i.test(n) ||
    /^(\d{1,2}u|\d{4}\/\d{4}|born\s+\d{4}(?:\/\d{4})*|\d+\s*min\.?.*)$/i.test(n)
  );
}

function looksLikeStreetAddress(address: string | null | undefined) {
  const a = clean(address);
  if (!a) return false;
  if (!/^\d{1,6}\s+/.test(a)) return false;
  if (/\b(min|mins|minutes)\b/i.test(a)) return false;
  if (/\b(size\s*\d+|coach:|girls?\d{1,2}u|boys?\d{1,2}u|\d{1,2}u)\b/i.test(a)) return false;
  return /\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|court|ct|circle|cir|parkway|pkwy|place|pl|terrace|ter|trail|trl|highway|hwy)\b/i.test(
    a
  );
}

async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: venuesRaw, error: venuesErr } = await supabase.from("venues" as any).select("id,name,address,city,state");
  if (venuesErr) throw venuesErr;
  const venues = (venuesRaw ?? []) as VenueRow[];

  const { data: linksRaw, error: linksErr } = await supabase.from("tournament_venues" as any).select("venue_id");
  if (linksErr) throw linksErr;
  const linkedVenueIds = new Set<string>((linksRaw ?? []).map((r: any) => String(r.venue_id)).filter(Boolean));

  const { data: runsRaw, error: runsErr } = await supabase.from("owls_eye_runs" as any).select("venue_id");
  if (runsErr) throw runsErr;
  const owlVenueIds = new Set<string>((runsRaw ?? []).map((r: any) => String(r.venue_id)).filter(Boolean));

  const candidates = venues.filter((v) => {
    if (!v?.id) return false;
    if (linkedVenueIds.has(v.id)) return false;
    if (owlVenueIds.has(v.id)) return false;
    const junkName = looksLikeJunkVenueName(v.name);
    const validAddress = looksLikeStreetAddress(v.address);
    return junkName || !validAddress;
  });

  let deleted = 0;
  if (APPLY && candidates.length) {
    for (let i = 0; i < candidates.length; i += 500) {
      const chunk = candidates.slice(i, i + 500).map((v) => v.id);
      const { error } = await supabase.from("venues" as any).delete().in("id", chunk);
      if (error) throw error;
      deleted += chunk.length;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        venues_scanned: venues.length,
        linked_venues: linkedVenueIds.size,
        owl_run_venues: owlVenueIds.size,
        junk_unlinked_candidates: candidates.length,
        deleted,
        sample: candidates.slice(0, 30).map((v) => ({
          id: v.id,
          name: v.name,
          address: v.address,
          city: v.city,
          state: v.state,
        })),
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
