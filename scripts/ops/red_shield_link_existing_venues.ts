import { createClient } from '@supabase/supabase-js';

type VenueInput = {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  fieldNames: string; // pipe-separated
};

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(url, key, { auth: { persistSession: false } });

const TOURNAMENT_ID = '0365c9b6-7f28-4103-8d21-5b05f676e426';

const INPUT: VenueInput[] = [
  {
    name: 'Athenia Steel Complex',
    address: '718 Clifton Ave',
    city: 'Clifton',
    state: 'NJ',
    zip: '07013',
    fieldNames:
      'Athenia Steel #1 (11v11)|Athenia Steel #2 (11v11)|Athenia Steel #3 (small sided)',
  },
  {
    name: 'Belleville Park',
    address: '343 Belleville Ave',
    city: 'Belleville',
    state: 'NJ',
    zip: '07109',
    fieldNames: 'Belleville Park (Turf Field)',
  },
  {
    name: 'Branch Brook Park Turf',
    address: '242 Lake Street',
    city: 'Newark',
    state: 'NJ',
    zip: '07104',
    fieldNames: 'Branch Brook Park - Turf',
  },
  {
    name: 'Brookdale Park Stadium',
    address: '473 Watchung Ave',
    city: 'Bloomfield',
    state: 'NJ',
    zip: '07003',
    fieldNames:
      'Brookdale Park Stadium (11v11)|Brookdale Park Stadium (small sided 1)|Brookdale Park Stadium (small sided 2)',
  },
  {
    name: 'Caven Point Athletic Complex',
    address: '1 Chapel Ave',
    city: 'Jersey City',
    state: 'NJ',
    zip: '07305',
    fieldNames: 'Caven Point Soccer Field',
  },
  {
    name: 'Eddie Moraes Stadium',
    address: '109 St Charles St',
    city: 'Newark',
    state: 'NJ',
    zip: '07105',
    fieldNames: 'Eddie Moraes Stadium',
  },
  {
    name: 'Gateway Turf Soccer Field',
    address: '23 Merseles St',
    city: 'Jersey City',
    state: 'NJ',
    zip: '07302',
    fieldNames: 'Gateway Turf Field',
  },
  {
    name: 'Harvey Field Complex',
    address: '280 Schuyler Ave',
    city: 'Kearny',
    state: 'NJ',
    zip: '07032',
    fieldNames: 'Harvey Field Complex',
  },
  {
    name: 'Independence Park',
    address: 'Van Buren St & Walnut St',
    city: 'Newark',
    state: 'NJ',
    zip: '07105',
    fieldNames: 'Independence Park|Independence Park (9v9)',
  },
  {
    name: 'Ironbound Stadium',
    address: 'Rome St & St Charles St',
    city: 'Newark',
    state: 'NJ',
    zip: '07105',
    fieldNames: 'Ironbound Stadium',
  },
  {
    name: 'Martucci Field',
    address: '1020 West Side Ave',
    city: 'Jersey City',
    state: 'NJ',
    zip: '07306',
    fieldNames: 'Martucci Field',
  },
  {
    name: 'Monte Irvin Orange Park',
    address: 'Center St & South Harrison St',
    city: 'Orange',
    state: 'NJ',
    zip: '07050',
    fieldNames: 'Monte Irvin Orange Park (11v11)',
  },
  {
    name: 'Rutgers-Newark Frederick Douglass Field',
    address: 'Hackett Street',
    city: 'Newark',
    state: 'NJ',
    zip: '07102',
    fieldNames: 'Newark Rutgers',
  },
  {
    name: 'Riverbank Park',
    address: 'Market St & Van Buren St',
    city: 'Newark',
    state: 'NJ',
    zip: '07105',
    fieldNames: 'Riverbank Park',
  },
  {
    name: 'Riverfront Park',
    address: 'Raymond Blvd & Brill St',
    city: 'Newark',
    state: 'NJ',
    zip: '07105',
    fieldNames: 'Riverfront Park',
  },
  {
    name: "St Benedict's Prep",
    address: '520 Dr Martin Luther King Jr Blvd',
    city: 'Newark',
    state: 'NJ',
    zip: '07102',
    fieldNames: "St Benedicts Prep Lower (9v9)|St Benedicts Prep Upper (7v7)",
  },
  {
    name: 'Watsessing Park',
    address: 'Bloomfield Ave & Conger St',
    city: 'Bloomfield',
    state: 'NJ',
    zip: '07003',
    fieldNames: 'Watssessing Park (Bloomfield)',
  },
  {
    name: 'Weequahic Park',
    address: 'Elizabeth Ave & Meeker Ave',
    city: 'Newark',
    state: 'NJ',
    zip: '07112',
    fieldNames: 'Weequahic Park (Oval)',
  },
];

function normalize(s: string) {
  return s.trim().toLowerCase();
}

function addressKey(address: string) {
  const a = address.trim();
  // For intersections, use the first street chunk for fuzzy address matching.
  if (a.includes('&')) return a.split('&')[0].trim();
  if (a.includes(' and ')) return a.split(' and ')[0].trim();
  return a;
}

async function findCandidates(input: VenueInput): Promise<VenueRow[]> {
  // 1) exact (name+address+city+state)
  const exact = await supabase
    .from('venues')
    .select('id,name,address,city,state,zip')
    .eq('state', input.state)
    .eq('city', input.city)
    .eq('name', input.name)
    .eq('address', input.address)
    .limit(5);
  if (exact.error) throw exact.error;
  if (exact.data.length) return exact.data as VenueRow[];

  // 2) address + city + state (fuzzy address)
  const key = addressKey(input.address);
  const addrCity = await supabase
    .from('venues')
    .select('id,name,address,city,state,zip')
    .eq('state', input.state)
    .eq('city', input.city)
    .ilike('address', `%${key}%`)
    .limit(5);
  if (addrCity.error) throw addrCity.error;
  if (addrCity.data.length) return addrCity.data as VenueRow[];

  // 3) name + city + state
  const nameCity = await supabase
    .from('venues')
    .select('id,name,address,city,state,zip')
    .eq('state', input.state)
    .eq('city', input.city)
    .ilike('name', `%${input.name}%`)
    .limit(5);
  if (nameCity.error) throw nameCity.error;
  if (nameCity.data.length) return nameCity.data as VenueRow[];

  // 4) address + state only (last resort)
  const addrState = await supabase
    .from('venues')
    .select('id,name,address,city,state,zip')
    .eq('state', input.state)
    .ilike('address', `%${key}%`)
    .limit(5);
  if (addrState.error) throw addrState.error;
  return addrState.data as VenueRow[];
}

async function linkVenue(tournamentId: string, venueId: string) {
  const ins = await supabase.from('tournament_venues').insert({ tournament_id: tournamentId, venue_id: venueId });
  if (ins.error) {
    // Ignore duplicate links.
    if ((ins.error as any).code === '23505') return { ok: true as const, skipped: true as const };
    throw ins.error;
  }
  return { ok: true as const, skipped: false as const };
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`Red Shield Classic: linking existing venues only (apply=${apply})`);
  console.log('NOTE: fieldNames are currently ignored (no field-level schema to store them).');

  const linked: { input: VenueInput; venue: VenueRow }[] = [];
  const ambiguous: { input: VenueInput; candidates: VenueRow[] }[] = [];
  const missing: VenueInput[] = [];

  for (const v of INPUT) {
    const candidates = await findCandidates(v);
    if (candidates.length === 1) {
      linked.push({ input: v, venue: candidates[0] });
      if (apply) await linkVenue(TOURNAMENT_ID, candidates[0].id);
      continue;
    }
    if (candidates.length > 1) {
      ambiguous.push({ input: v, candidates });
      continue;
    }
    missing.push(v);
  }

  console.log(`\nUnambiguous matches: ${linked.length}`);
  for (const m of linked) {
    console.log(`- ${m.input.name} -> ${m.venue.id} :: ${m.venue.name} | ${m.venue.address}, ${m.venue.city} ${m.venue.state} ${m.venue.zip ?? ''}`);
  }

  console.log(`\nAmbiguous matches (not linked): ${ambiguous.length}`);
  for (const a of ambiguous) {
    console.log(`- ${a.input.name} (${a.input.address}, ${a.input.city}, ${a.input.state} ${a.input.zip})`);
    for (const c of a.candidates) {
      console.log(`  - ${c.id} :: ${c.name} | ${c.address}, ${c.city} ${c.state} ${c.zip ?? ''}`);
    }
  }

  console.log(`\nMissing (no existing venue found): ${missing.length}`);
  for (const m of missing) {
    console.log(`- ${m.name} | ${m.address}, ${m.city}, ${m.state} ${m.zip}`);
  }

  if (apply) {
    const tv = await supabase.from('tournament_venues').select('venue_id', { count: 'exact', head: true }).eq('tournament_id', TOURNAMENT_ID);
    if (tv.error) throw tv.error;
    console.log(`\nDone. Tournament now has ${tv.count ?? 0} linked venues.`);
  } else {
    console.log('\nDry run only. Re-run with --apply to insert links for unambiguous matches.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
