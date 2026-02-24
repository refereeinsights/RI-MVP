import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
};

type LinkRow = {
  tournament_id: string | null;
  venue_id: string | null;
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

function isJunkVenue(v: VenueRow | undefined) {
  if (!v) return false;
  return looksLikeJunkVenueName(v.name) || !looksLikeStreetAddress(v.address);
}

async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: venuesRaw, error: venuesErr } = await supabase.from("venues" as any).select("id,name,address");
  if (venuesErr) throw venuesErr;
  const venues = (venuesRaw ?? []) as VenueRow[];
  const venueById = new Map(venues.map((v) => [v.id, v]));

  const { data: linksRaw, error: linksErr } = await supabase
    .from("tournament_venues" as any)
    .select("tournament_id,venue_id");
  if (linksErr) throw linksErr;
  const links = ((linksRaw ?? []) as LinkRow[]).filter((l) => l.tournament_id && l.venue_id);

  const byTournament = new Map<string, string[]>();
  for (const row of links) {
    const tid = row.tournament_id as string;
    const vid = row.venue_id as string;
    const existing = byTournament.get(tid) ?? [];
    existing.push(vid);
    byTournament.set(tid, existing);
  }

  const removeLinks: Array<{ tournament_id: string; venue_id: string }> = [];
  for (const [tournamentId, venueIds] of byTournament.entries()) {
    const uniqueVenueIds = Array.from(new Set(venueIds));
    const junkIds = uniqueVenueIds.filter((vid) => isJunkVenue(venueById.get(vid)));
    const cleanIds = uniqueVenueIds.filter((vid) => !isJunkVenue(venueById.get(vid)));
    if (!junkIds.length) continue;
    if (!cleanIds.length) continue;
    for (const junkId of junkIds) {
      removeLinks.push({ tournament_id: tournamentId, venue_id: junkId });
    }
  }

  let linksDeleted = 0;
  if (APPLY && removeLinks.length) {
    for (const row of removeLinks) {
      const { error } = await supabase
        .from("tournament_venues" as any)
        .delete()
        .eq("tournament_id", row.tournament_id)
        .eq("venue_id", row.venue_id);
      if (error) throw error;
      linksDeleted += 1;
    }
  }

  const { data: linksAfterRaw, error: linksAfterErr } = await supabase
    .from("tournament_venues" as any)
    .select("venue_id");
  if (linksAfterErr) throw linksAfterErr;
  const linkedAfter = new Set((linksAfterRaw ?? []).map((r: any) => String(r.venue_id)).filter(Boolean));

  const { data: runsRaw, error: runsErr } = await supabase.from("owls_eye_runs" as any).select("venue_id");
  if (runsErr) throw runsErr;
  const owlVenueIds = new Set((runsRaw ?? []).map((r: any) => String(r.venue_id)).filter(Boolean));

  const orphanJunkIds = venues
    .filter((v) => isJunkVenue(v))
    .filter((v) => !linkedAfter.has(v.id))
    .filter((v) => !owlVenueIds.has(v.id))
    .map((v) => v.id);

  let venuesDeleted = 0;
  if (APPLY && orphanJunkIds.length) {
    for (let i = 0; i < orphanJunkIds.length; i += 500) {
      const chunk = orphanJunkIds.slice(i, i + 500);
      const { error } = await supabase.from("venues" as any).delete().in("id", chunk);
      if (error) throw error;
      venuesDeleted += chunk.length;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        venues_scanned: venues.length,
        links_scanned: links.length,
        junk_links_safe_to_remove: removeLinks.length,
        links_deleted: linksDeleted,
        orphan_junk_venues_safe_to_delete: orphanJunkIds.length,
        venues_deleted: venuesDeleted,
        sample_links: removeLinks.slice(0, 30),
        sample_orphan_venue_ids: orphanJunkIds.slice(0, 30),
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
