import { createClient } from '@supabase/supabase-js';

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type Place = {
  id: string;
  name: string;
  address: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const placesKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

if (!supabaseUrl || !serviceKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
if (!placesKey) throw new Error('Missing GOOGLE_PLACES_API_KEY (or GOOGLE_MAPS_API_KEY)');

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

function norm(s: string | null | undefined) {
  return String(s ?? '').trim().toLowerCase();
}

function streetNumber(address: string) {
  return norm(address).match(/\b\d{1,6}\b/)?.[0] ?? '';
}

async function searchPlacesByText(textQuery: string): Promise<Place[]> {
  const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': placesKey!,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount: 5,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Places searchText failed: ${resp.status} ${text}`);
  }

  const json = (await resp.json()) as any;
  const places = Array.isArray(json?.places) ? json.places : [];
  return places
    .map((p: any) => {
      const id = p.id || '';
      const name = p.displayName?.text || '';
      const address = p.formattedAddress || '';
      if (!id || !name) return null;
      return { id, name, address } as Place;
    })
    .filter(Boolean) as Place[];
}

function pickBestPlace(venue: VenueRow, places: Place[]): Place | null {
  const vCity = norm(venue.city);
  const vState = norm(venue.state);
  const vAddr = norm(venue.address);
  const num = venue.address ? streetNumber(venue.address) : '';

  const scored = places
    .map((p) => {
      const pAddr = norm(p.address);
      let score = 0;
      if (vCity && pAddr.includes(vCity)) score += 30;
      if (vState && pAddr.includes(` ${vState} `)) score += 15;
      if (num && pAddr.includes(num)) score += 20;
      if (vAddr && (pAddr.includes(vAddr) || vAddr.includes(pAddr))) score += 10;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score ? scored[0].p : null;
}

async function main() {
  const apply = process.argv.includes('--apply');

  const res = await supabase
    .from('venues')
    .select('id,name,address,city,state,zip,latitude,longitude')
    .eq('state', 'WA')
    .or('name.ilike.ballfields,name.ilike.ballfield%,name.ilike.%ballfields%')
    .order('city', { ascending: true })
    .limit(50);
  if (res.error) throw res.error;

  const venues = (res.data ?? []) as VenueRow[];
  console.log(`Found ${venues.length} WA venue(s) matching ballfields`);

  let changed = 0;
  let skipped = 0;

  for (const v of venues) {
    const currentName = String(v.name ?? '').trim();
    const address = String(v.address ?? '').trim();
    const city = String(v.city ?? '').trim();
    const state = String(v.state ?? '').trim();
    const zip = String(v.zip ?? '').trim();

    if (!address || !city || !state) {
      console.log(`- ${v.id} skip (missing address/city/state): name=${currentName || 'null'} addr=${address}`);
      skipped++;
      continue;
    }

    const query = `${address}, ${city}, ${state}${zip ? ` ${zip}` : ''}`;
    let places: Place[] = [];
    try {
      places = await searchPlacesByText(query);
    } catch (err) {
      console.log(`- ${v.id} places lookup failed: ${(err as any)?.message || err}`);
      skipped++;
      continue;
    }

    const best = pickBestPlace(v, places);
    if (!best) {
      console.log(`- ${v.id} no confident place match for: ${query}`);
      skipped++;
      continue;
    }

    if (best.name.trim() && best.name.trim() !== currentName) {
      console.log(`- ${v.id}`);
      console.log(`  from: ${currentName || 'null'} | ${query}`);
      console.log(`  to  : ${best.name} | ${best.address}`);
      if (apply) {
        const upd = await supabase.from('venues').update({ name: best.name }).eq('id', v.id);
        if (upd.error) throw upd.error;
      }
      changed++;
    } else {
      console.log(`- ${v.id} no change (already '${currentName}') -> best='${best.name}'`);
      skipped++;
    }
  }

  console.log(`done: changed=${changed} skipped=${skipped}`);
  if (!apply) console.log('Dry run only. Re-run with --apply to write venue name updates.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
