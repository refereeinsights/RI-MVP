import { createClient } from '@supabase/supabase-js';

type VenueInput = {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

type TournamentRow = {
  id: string;
  name: string;
  slug: string | null;
  sport: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  state: string | null;
};

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  sport?: string | null;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(url, key, { auth: { persistSession: false } });

const INPUT: VenueInput[] = [
  {
    name: 'Apodaca Baseball Field',
    address: '801 E Madrid Ave',
    city: 'Las Cruces',
    state: 'NM',
    zip: '88001',
  },
  {
    name: 'East Mesa Sports Complex',
    address: '5589 Porter Dr',
    city: 'Las Cruces',
    state: 'NM',
    zip: '88011',
  },
];

function normalize(s: string | null | undefined) {
  return String(s ?? '').trim().toLowerCase();
}

async function pickTournament(): Promise<TournamentRow> {
  const forcedId = String(process.env.TOURNAMENT_ID ?? '').trim();
  if (forcedId) {
    const one = await supabase
      .from('tournaments')
      .select('id,name,slug,sport,start_date,end_date,city,state')
      .eq('id', forcedId)
      .maybeSingle<TournamentRow>();
    if (one.error) throw one.error;
    if (!one.data) throw new Error('tournament_not_found');
    return one.data;
  }

  const res = await supabase
    .from('tournaments')
    .select('id,name,slug,sport,start_date,end_date,city,state')
    .ilike('name', '%BATAAN%')
    .order('start_date', { ascending: false })
    .limit(25);
  if (res.error) throw res.error;

  const rows = (res.data ?? []) as TournamentRow[];
  if (rows.length === 1) return rows[0];

  const exact = rows.filter((r) => normalize(r.name).includes('bataan death march'));
  if (exact.length === 1) return exact[0];

  console.log('Ambiguous tournament match for %BATAAN%. Set TOURNAMENT_ID env to force one. Candidates:');
  for (const r of rows) {
    console.log(`- ${r.id} :: ${r.name} :: slug=${r.slug ?? 'null'} :: sport=${r.sport ?? 'null'} :: ${r.start_date ?? 'null'}-${r.end_date ?? 'null'} :: ${r.city ?? ''}, ${r.state ?? ''}`);
  }
  throw new Error('ambiguous_tournament_match');
}

async function findVenue(v: VenueInput): Promise<VenueRow | null> {
  const exact = await supabase
    .from('venues')
    .select('id,name,address,city,state,zip,sport')
    .eq('name', v.name)
    .eq('address', v.address)
    .eq('city', v.city)
    .eq('state', v.state)
    .limit(2);
  if (exact.error) throw exact.error;
  if ((exact.data ?? []).length === 1) return exact.data![0] as any;

  // Fallback: address+city+state
  const addr = await supabase
    .from('venues')
    .select('id,name,address,city,state,zip,sport')
    .eq('city', v.city)
    .eq('state', v.state)
    .ilike('address', `%${v.address.split(' ')[0]}%`)
    .limit(10);
  if (addr.error) throw addr.error;
  const addrMatches = (addr.data ?? []) as VenueRow[];
  const normalizedTargetAddr = normalize(v.address);
  const pick = addrMatches.find((r) => normalize(r.address) === normalizedTargetAddr);
  if (pick) return pick;

  // Fallback: name + city/state
  const byName = await supabase
    .from('venues')
    .select('id,name,address,city,state,zip,sport')
    .eq('city', v.city)
    .eq('state', v.state)
    .ilike('name', `%${v.name.split(' ')[0]}%`)
    .limit(10);
  if (byName.error) throw byName.error;
  const nameMatches = (byName.data ?? []) as VenueRow[];
  const normalizedTargetName = normalize(v.name);
  const pickByName = nameMatches.find((r) => normalize(r.name) === normalizedTargetName);
  if (pickByName) return pickByName;

  return null;
}

async function createVenue(v: VenueInput, sport: string | null): Promise<VenueRow> {
  const payload: Record<string, any> = {
    name: v.name,
    address: v.address,
    city: v.city,
    state: v.state,
    zip: v.zip || null,
    sport: sport || null,
  };

  const ins = await supabase
    .from('venues')
    .insert(payload)
    .select('id,name,address,city,state,zip,sport')
    .single();

  if (ins.error) {
    if ((ins.error as any).code === '23505') {
      const found = await findVenue(v);
      if (found) return found;
    }
    throw ins.error;
  }

  return ins.data as any;
}

async function linkVenue(tournamentId: string, venueId: string) {
  const ins = await supabase
    .from('tournament_venues')
    .insert({ tournament_id: tournamentId, venue_id: venueId });
  if (ins.error) {
    if ((ins.error as any).code === '23505') return { linked: false as const };
    throw ins.error;
  }
  return { linked: true as const };
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`Bataan Death March venue add/link (apply=${apply})`);

  const t = await pickTournament();
  console.log(`tournament: ${t.id} :: ${t.name} :: slug=${t.slug ?? 'null'} :: sport=${t.sport ?? 'null'}`);

  const existingLinks = await supabase
    .from('tournament_venues')
    .select('venue_id', { count: 'exact', head: false })
    .eq('tournament_id', t.id);
  if (existingLinks.error) throw existingLinks.error;
  console.log(`existing venue links: ${existingLinks.data?.length ?? 0}`);

  let existed = 0;
  let created = 0;
  let linked = 0;
  let alreadyLinked = 0;

  for (const v of INPUT) {
    let row = await findVenue(v);
    if (row) {
      existed++;
      console.log(`venue exists: ${v.name} -> ${row.id}`);
    } else {
      console.log(`venue missing: ${v.name} (${v.address}, ${v.city}, ${v.state} ${v.zip})`);
      if (apply) {
        row = await createVenue(v, t.sport);
        created++;
        console.log(`  created -> ${row.id}`);
      }
    }

    if (row && apply) {
      const l = await linkVenue(t.id, row.id);
      if (l.linked) linked++;
      else alreadyLinked++;
    }
  }

  console.log({ existed, created, linked, alreadyLinked });
  if (!apply) console.log('Dry run only. Re-run with --apply to write changes.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
