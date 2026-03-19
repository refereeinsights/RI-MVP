import { createClient } from '@supabase/supabase-js';

type VenueInput = {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  // Keeping for reference only (we don't have field-level schema yet).
  fieldNames?: string;
};

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  sport: string | null;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(url, key, { auth: { persistSession: false } });

const TOURNAMENT_ID = '0365c9b6-7f28-4103-8d21-5b05f676e426';
const OFFICIAL_URL = 'https://www.ironboundsoccer.com/tournaments';
const SPORT = 'soccer';

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

async function ensureOfficialUrl() {
  const cur = await supabase
    .from('tournaments')
    .select('id, official_website_url')
    .eq('id', TOURNAMENT_ID)
    .maybeSingle();
  if (cur.error) throw cur.error;

  const current = cur.data?.official_website_url;
  if (current === OFFICIAL_URL) return { changed: false as const };

  const upd = await supabase
    .from('tournaments')
    .update({ official_website_url: OFFICIAL_URL })
    .eq('id', TOURNAMENT_ID);
  if (upd.error) throw upd.error;
  return { changed: true as const, from: current };
}

async function findVenueExact(v: VenueInput): Promise<VenueRow | null> {
  const res = await supabase
    .from('venues')
    .select('id,name,address,city,state,zip,sport')
    .eq('name', v.name)
    .eq('address', v.address)
    .eq('city', v.city)
    .eq('state', v.state)
    .limit(1);
  if (res.error) throw res.error;
  return (res.data?.[0] as VenueRow | undefined) ?? null;
}

async function createVenue(v: VenueInput): Promise<VenueRow> {
  const ins = await supabase
    .from('venues')
    .insert({
      name: v.name,
      address: v.address,
      city: v.city,
      state: v.state,
      zip: v.zip,
      sport: SPORT,
    })
    .select('id,name,address,city,state,zip,sport')
    .single();
  if (ins.error) {
    // Unique constraint collision: re-fetch and continue.
    if ((ins.error as any).code === '23505') {
      const existing = await findVenueExact(v);
      if (existing) return existing;
    }
    throw ins.error;
  }
  return ins.data as VenueRow;
}

async function linkVenue(venueId: string) {
  const res = await supabase
    .from('tournament_venues')
    .insert({ tournament_id: TOURNAMENT_ID, venue_id: venueId });
  if (res.error) {
    if ((res.error as any).code === '23505') return { linked: false as const };
    throw res.error;
  }
  return { linked: true as const };
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (!apply) {
    console.log('Refusing to write without --apply');
    process.exit(2);
  }

  const urlRes = await ensureOfficialUrl();
  console.log('official_url', urlRes);

  console.log('NOTE: fieldNames are not stored (no field-level schema yet).');

  let created = 0;
  let linked = 0;
  let existed = 0;
  let alreadyLinked = 0;

  for (const v of INPUT) {
    let row = await findVenueExact(v);
    if (row) {
      existed++;
    } else {
      row = await createVenue(v);
      created++;
    }

    const l = await linkVenue(row.id);
    if (l.linked) linked++;
    else alreadyLinked++;
  }

  const tv = await supabase
    .from('tournament_venues')
    .select('venue_id', { count: 'exact', head: true })
    .eq('tournament_id', TOURNAMENT_ID);
  if (tv.error) throw tv.error;

  console.log({ created, existed, linked, alreadyLinked, tournamentVenueLinks: tv.count ?? 0 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
