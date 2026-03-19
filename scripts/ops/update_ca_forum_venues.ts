import { createClient } from '@supabase/supabase-js';

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  address1?: string | null;
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
  types?: string[];
  primaryType?: string;
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

function pickStreet(v: VenueRow) {
  // Prefer canonical `address`; fall back to legacy `address1` if needed.
  const a = String(v.address ?? '').trim();
  if (a) return a;
  return String(v.address1 ?? '').trim();
}

async function searchPlacesByText(textQuery: string): Promise<Place[]> {
  const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': placesKey!,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.types,places.primaryType',
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
      const types = Array.isArray(p.types) ? p.types.filter((v: unknown) => typeof v === 'string') : [];
      const primaryType = typeof p.primaryType === 'string' ? p.primaryType : undefined;
      return { id, name, address, types, primaryType } as Place;
    })
    .filter(Boolean) as Place[];
}

async function searchPlacesByTextNear(opts: { textQuery: string; lat: number; lng: number; radiusMeters: number }) {
  const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': placesKey!,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.types,places.primaryType,places.location',
    },
    body: JSON.stringify({
      textQuery: opts.textQuery,
      maxResultCount: 10,
      locationBias: {
        circle: {
          center: { latitude: opts.lat, longitude: opts.lng },
          radius: opts.radiusMeters,
        },
      },
      rankPreference: 'DISTANCE',
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Places searchText (near) failed: ${resp.status} ${text}`);
  }

  const json = (await resp.json()) as any;
  const places = Array.isArray(json?.places) ? json.places : [];
  return places
    .map((p: any) => {
      const id = p.id || '';
      const name = p.displayName?.text || '';
      const address = p.formattedAddress || '';
      if (!id || !name) return null;
      const types = Array.isArray(p.types) ? p.types.filter((v: unknown) => typeof v === 'string') : [];
      const primaryType = typeof p.primaryType === 'string' ? p.primaryType : undefined;
      return { id, name, address, types, primaryType } as Place;
    })
    .filter(Boolean) as Place[];
}

function scorePlace(venue: VenueRow, p: Place) {
  const vCity = norm(venue.city);
  const vState = norm(venue.state);
  const vStreet = norm(pickStreet(venue));
  const num = vStreet ? streetNumber(vStreet) : '';

  const pAddr = norm(p.address);
  let score = 0;
  if (vCity && pAddr.includes(vCity)) score += 30;
  if (vState && (pAddr.includes(` ${vState} `) || pAddr.endsWith(` ${vState}`))) score += 20;
  if (num && pAddr.includes(num)) score += 25;
  if (vStreet && (pAddr.includes(vStreet) || vStreet.includes(pAddr))) score += 15;
  // Prefer places that look like real venue names (not a raw street address).
  if (/^\d+\s+/.test(p.name.trim())) score -= 25;
  // Prefer parks / sports complexes when available.
  const types = (p.types ?? []).map((t) => t.toLowerCase());
  if (types.includes('sports_complex') || types.includes('stadium') || types.includes('athletic_field')) score += 20;
  if (types.includes('park')) score += 10;
  return score;
}

function pickBestPlace(venue: VenueRow, places: Place[]): { best: Place | null; score: number } {
  const scored = places
    .map((p) => ({ p, score: scorePlace(venue, p) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  return { best: top?.p ?? null, score: top?.score ?? 0 };
}

async function main() {
  const apply = process.argv.includes('--apply');

  // Exact-ish match for placeholder name "Forum" (case-insensitive).
  const res = await supabase
    .from('venues')
    .select('id,name,address,address1,city,state,zip,latitude,longitude')
    .eq('state', 'CA')
    .ilike('name', 'forum')
    .order('city', { ascending: true })
    .limit(200);
  if (res.error) throw res.error;

  const venues = (res.data ?? []) as VenueRow[];
  console.log(`Found ${venues.length} CA venue(s) named 'Forum'`);

  let changed = 0;
  let skipped = 0;

  for (const v of venues) {
    const currentName = String(v.name ?? '').trim();
    const street = pickStreet(v);
    const city = String(v.city ?? '').trim();
    const state = String(v.state ?? '').trim();
    const zip = String(v.zip ?? '').trim();

    if (!street || !city || !state) {
      console.log(`- ${v.id} skip (missing street/city/state): name=${currentName || 'null'} street=${street || 'null'}`);
      skipped++;
      continue;
    }

    const query = `${street}, ${city}, ${state}${zip ? ` ${zip}` : ''}`;
    let places: Place[] = [];
    try {
      places = await searchPlacesByText(query);
    } catch (err) {
      console.log(`- ${v.id} places lookup failed: ${(err as any)?.message || err}`);
      skipped++;
      continue;
    }

    let { best, score } = pickBestPlace(v, places);

    // If the top match is just the street address, try a nearby venue-style search using lat/lng.
    const looksLikeStreetAddress = best ? /^\d+\s+/.test(best.name.trim()) && (best.types ?? []).includes('street_address') : false;
    const lat = typeof v.latitude === 'number' && Number.isFinite(v.latitude) ? v.latitude : null;
    const lng = typeof v.longitude === 'number' && Number.isFinite(v.longitude) ? v.longitude : null;
    if ((!best || looksLikeStreetAddress || score < 55) && lat != null && lng != null) {
      try {
        const nearbyPlaces = [
          ...(await searchPlacesByTextNear({ textQuery: 'sports complex', lat, lng, radiusMeters: 2000 })),
          ...(await searchPlacesByTextNear({ textQuery: 'soccer field', lat, lng, radiusMeters: 2000 })),
          ...(await searchPlacesByTextNear({ textQuery: 'park', lat, lng, radiusMeters: 2000 })),
        ];
        const dedup = new Map<string, Place>();
        for (const p of nearbyPlaces) dedup.set(p.id, p);
        const picked = pickBestPlace(v, Array.from(dedup.values()));
        if (picked.best && picked.score > score) {
          best = picked.best;
          score = picked.score;
        }
      } catch (err) {
        // If nearby fallback fails, stick with address search results.
      }
    }

    // Require a reasonably strong match; otherwise we risk renaming incorrectly.
    if (!best || score < 55 || /^\d+\s+/.test(best.name.trim())) {
      console.log(`- ${v.id} no confident venue-style place match (score=${score}) for: ${query}`);
      skipped++;
      continue;
    }

    if (best.name.trim() && best.name.trim() !== currentName) {
      console.log(`- ${v.id}`);
      console.log(`  from: ${currentName || 'null'} | ${query}`);
      console.log(`  to  : ${best.name} | ${best.address} (score=${score})`);
      if (apply) {
        const upd = await supabase.from('venues').update({ name: best.name }).eq('id', v.id);
        if (upd.error) throw upd.error;
      }
      changed++;
    } else {
      console.log(`- ${v.id} no change (already '${currentName}') -> best='${best.name}' score=${score}`);
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
