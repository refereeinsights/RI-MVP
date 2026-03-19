import { createClient } from '@supabase/supabase-js';

type VenueInput = {
  venue_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

type TournamentRow = {
  id: string;
  name: string;
  sport: string | null;
  start_date: string | null;
  end_date: string | null;
};

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  address1?: string | null;
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
    venue_name: 'Reach 11 Sports Complex',
    address: '2425 E Deer Valley Rd',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85050',
  },
  {
    venue_name: 'Scottsdale Sports Complex',
    address: '8081 E Princess Dr',
    city: 'Scottsdale',
    state: 'AZ',
    zip: '85255',
  },
  {
    venue_name: 'Bell94 Sports Complex',
    address: '9390 W Bell Rd',
    city: 'Peoria',
    state: 'AZ',
    zip: '85382',
  },
  {
    venue_name: 'Grande Sports World',
    address: '12684 W Gila Bend Hwy',
    city: 'Casa Grande',
    state: 'AZ',
    zip: '85193',
  },
];

function normalize(s: string | null | undefined) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function pickTournament(): Promise<TournamentRow> {
  const forcedId = String(process.env.TOURNAMENT_ID ?? '').trim();
  if (forcedId) {
    const one = await supabase
      .from('tournaments')
      .select('id,name,sport,start_date,end_date')
      .eq('id', forcedId)
      .maybeSingle<TournamentRow>();
    if (one.error) throw one.error;
    if (!one.data) throw new Error('tournament_not_found');
    return one.data;
  }

  const res = await supabase
    .from('tournaments')
    .select('id,name,sport,start_date,end_date')
    .ilike('name', '%Enigma%Cup%')
    .order('start_date', { ascending: false })
    .limit(25);
  if (res.error) throw res.error;

  const rows = (res.data ?? []) as TournamentRow[];
  const preferred = rows.filter((r) => normalize(r.name).includes('2026') && normalize(r.name).includes('enigma') && normalize(r.name).includes('cup'));
  if (preferred.length === 1) return preferred[0];
  if (rows.length === 1) return rows[0];

  console.log('Ambiguous tournament match for %Enigma%Cup%. Set TOURNAMENT_ID env to force one. Candidates:');
  for (const r of rows) {
    console.log(`- ${r.id} :: ${r.name} :: sport=${r.sport ?? 'null'} :: ${r.start_date ?? 'null'}-${r.end_date ?? 'null'}`);
  }
  throw new Error('ambiguous_tournament_match');
}

async function findVenue(v: VenueInput): Promise<VenueRow | null> {
  const exact = await supabase
    .from('venues')
    .select('id,name,address,address1,city,state,zip,sport')
    .eq('city', v.city)
    .eq('state', v.state)
    .limit(50)
    .ilike('address', `%${v.address.split(' ')[0]}%`);
  if (exact.error) throw exact.error;
  const rows = (exact.data ?? []) as VenueRow[];

  const targetAddr = normalize(v.address);
  const targetCity = normalize(v.city);
  const targetState = normalize(v.state);
  const targetZip = normalize(v.zip);

  // Prefer exact address match; fall back to address1 match.
  const byAddress = rows.find((r) => normalize(r.address) === targetAddr && normalize(r.city) === targetCity && normalize(r.state) === targetState);
  if (byAddress) return byAddress;
  const byAddress1 = rows.find((r) => normalize((r as any).address1) === targetAddr && normalize(r.city) === targetCity && normalize(r.state) === targetState);
  if (byAddress1) return byAddress1;

  // If zip matches and the street number matches, consider it a match.
  const streetNum = targetAddr.match(/\b\d{2,6}\b/)?.[0] ?? '';
  const byZipAndNum = rows.find((r) => {
    const rAddr = normalize(r.address) || normalize((r as any).address1);
    const rNum = rAddr.match(/\b\d{2,6}\b/)?.[0] ?? '';
    return streetNum && rNum === streetNum && (!targetZip || normalize(r.zip) === targetZip);
  });
  if (byZipAndNum) return byZipAndNum;

  // Fuzzy: address contains the same street number + key street words (handles embedded/junk prefixes like "11 ... 2425 E Deer Valley Dr").
  if (streetNum) {
    const words = targetAddr
      .replace(/\b(n|s|e|w|north|south|east|west)\b/g, ' ')
      .replace(/\b(rd|road|dr|drive|st|street|ave|avenue|blvd|boulevard|hwy|highway)\b/g, ' ')
      .split(' ')
      .map((w) => w.trim())
      .filter(Boolean)
      .filter((w) => w !== streetNum);
    const keyWords = Array.from(new Set(words)).slice(0, 4);
    const byContains = rows.find((r) => {
      const rAddr = normalize(r.address) || normalize((r as any).address1);
      if (!rAddr.includes(streetNum)) return false;
      return keyWords.every((w) => rAddr.includes(w));
    });
    if (byContains) return byContains;
  }

  return null;
}

async function createVenue(v: VenueInput, sport: string | null): Promise<VenueRow> {
  const payload: Record<string, any> = {
    name: v.venue_name,
    address: v.address,
    city: v.city,
    state: v.state,
    zip: v.zip || null,
    sport: sport || null,
  };

  const ins = await supabase
    .from('venues')
    .insert(payload)
    .select('id,name,address,address1,city,state,zip,sport')
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
  const ins = await (supabase.from('tournament_venues' as any) as any).upsert(
    { tournament_id: tournamentId, venue_id: venueId },
    { onConflict: 'tournament_id,venue_id' }
  );
  if (ins.error) throw ins.error;
}

async function unlinkThirdStSouth(tournamentId: string, apply: boolean) {
  // Unlink any venue for this tournament whose address contains "1529" and "third" (case-insensitive).
  const links = await supabase.from('tournament_venues').select('venue_id').eq('tournament_id', tournamentId);
  if (links.error) throw links.error;
  const venueIds = (links.data ?? []).map((r: any) => r.venue_id).filter(Boolean);
  if (!venueIds.length) return { unlinked: 0 };

  const venues = await supabase
    .from('venues')
    .select('id,address,address1,city,state')
    .in('id', venueIds);
  if (venues.error) throw venues.error;

  const matches = (venues.data ?? []).filter((v: any) => {
    const addr = normalize(v.address) || normalize(v.address1);
    return addr.includes('1529') && addr.includes('third') && addr.includes('st');
  });

  if (!matches.length) {
    console.log('No existing tournament venue link matched "1529 third st"');
    return { unlinked: 0 };
  }

  console.log(`Found ${matches.length} linked venue(s) matching "1529 third st" to unlink:`);
  for (const v of matches) {
    console.log(`- ${v.id} :: ${v.address ?? v.address1 ?? 'null'} :: ${v.city ?? ''}, ${v.state ?? ''}`);
  }

  if (!apply) return { unlinked: 0 };

  for (const v of matches) {
    const del = await supabase.from('tournament_venues').delete().eq('tournament_id', tournamentId).eq('venue_id', v.id);
    if (del.error) throw del.error;
  }

  return { unlinked: matches.length };
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`Enigma Cup venues update (apply=${apply})`);

  const t = await pickTournament();
  console.log(`tournament: ${t.id} :: ${t.name} :: sport=${t.sport ?? 'null'}`);

  await unlinkThirdStSouth(t.id, apply);

  let existed = 0;
  let created = 0;
  let linked = 0;

  for (const v of INPUT) {
    let row = await findVenue(v);
    if (row) {
      existed++;
      console.log(`venue exists: ${v.venue_name} -> ${row.id} (${row.name ?? 'null'})`);
    } else {
      console.log(`venue missing: ${v.venue_name} (${v.address}, ${v.city}, ${v.state} ${v.zip})`);
      if (apply) {
        row = await createVenue(v, t.sport);
        created++;
        console.log(`  created -> ${row.id}`);
      }
    }

    if (row && apply) {
      await linkVenue(t.id, row.id);
      linked++;
    }
  }

  console.log({ existed, created, linked });
  if (!apply) console.log('Dry run only. Re-run with --apply to write changes.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
