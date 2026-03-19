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
  slug: string | null;
  start_date: string | null;
  end_date: string | null;
  state: string | null;
  tournament_director?: string | null;
  tournament_director_email?: string | null;
  referee_contact?: string | null;
  referee_contact_email?: string | null;
  official_website_url?: string | null;
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

const TARGET = {
  nameLike: '%Grape Stomp%',
  start_date: '2026-03-14',
  end_date: '2026-03-15',
  state: 'CA',
};

const TOURNAMENT_PATCH: Record<string, any> = {
  tournament_director: 'Lisa Smith',
  tournament_director_email: 'grapestomp.r65@gmail.com',
  referee_contact: 'Grape Stomp referee contact',
  referee_contact_email: 'grapestomp.r65@gmail.com',
  official_website_url: 'https://www.ayso65.org/grape-stomp',
  start_date: '2026-03-14',
  end_date: '2026-03-15',
  host_org: 'AYSO Region 65 Rancho Cucamonga',
  director_research_complete: true,
};

const VENUES: VenueInput[] = [
  {
    venue_name: 'Vineyard Jr High School',
    address: '6440 Mayberry Ave',
    city: 'Rancho Cucamonga',
    state: 'CA',
    zip: '91737',
  },
  {
    venue_name: 'Alta Loma Junior High School',
    address: '9000 Lemon Ave',
    city: 'Rancho Cucamonga',
    state: 'CA',
    zip: '91701',
  },
  {
    venue_name: 'Beryl Park',
    address: '',
    city: 'Rancho Cucamonga',
    state: 'CA',
    zip: '',
  },
  {
    venue_name: 'Red Hill Park',
    address: '7484 Vineyard Ave',
    city: 'Rancho Cucamonga',
    state: 'CA',
    zip: '91730',
  },
  {
    venue_name: 'Etiwanda Creek Park',
    address: '5939 East Ave',
    city: 'Rancho Cucamonga',
    state: 'CA',
    zip: '91739',
  },
];

function normalize(s: string | null | undefined) {
  return String(s ?? '').trim().toLowerCase();
}

async function pickTournament(): Promise<TournamentRow> {
  const base = await supabase
    .from('tournaments')
    .select(
      [
        'id',
        'name',
        'slug',
        'start_date',
        'end_date',
        'state',
        'tournament_director',
        'tournament_director_email',
        'referee_contact',
        'referee_contact_email',
        'official_website_url',
      ].join(',')
    )
    .ilike('name', TARGET.nameLike)
    .order('start_date', { ascending: false })
    .limit(25);
  if (base.error) throw base.error;

  let rows = (base.data ?? []) as TournamentRow[];
  rows = rows.filter((r) => normalize(r.state) === normalize(TARGET.state));

  const exactDates = rows.filter((r) => r.start_date === TARGET.start_date && r.end_date === TARGET.end_date);
  if (exactDates.length === 1) return exactDates[0];

  if (rows.length === 1) return rows[0];

  console.log('Multiple tournaments matched. Candidates:');
  for (const r of rows) {
    console.log(`- ${r.id} :: ${r.name} :: slug=${r.slug ?? 'null'} :: ${r.start_date ?? 'null'}-${r.end_date ?? 'null'} :: state=${r.state ?? 'null'}`);
  }
  throw new Error('ambiguous_tournament_match');
}

async function safeUpdateTournament(tournamentId: string) {
  // Try full patch; if this DB doesn't have optional columns, drop them and retry.
  const patch: Record<string, any> = { ...TOURNAMENT_PATCH };

  for (let attempt = 0; attempt < 5; attempt++) {
    const resp = await supabase.from('tournaments').update(patch).eq('id', tournamentId);
    if (!resp.error) {
      return { ok: true as const, mode: attempt === 0 ? ('full' as const) : ('trimmed' as const) };
    }

    const code = (resp.error as any).code;
    const msg = String((resp.error as any).message ?? '');
    if (code !== '42703' && code !== 'PGRST204') throw resp.error;

    const match = msg.match(/column\\s+tournaments\\.(\\w+)\\s+does not exist/i);
    const col = match?.[1];
    if (!col || !(col in patch)) break;
    delete patch[col];
  }

  // Last resort: only core columns that should exist.
  const fallbackPatch: Record<string, any> = {
    tournament_director: TOURNAMENT_PATCH.tournament_director,
    tournament_director_email: TOURNAMENT_PATCH.tournament_director_email,
    referee_contact: TOURNAMENT_PATCH.referee_contact,
    referee_contact_email: TOURNAMENT_PATCH.referee_contact_email,
    official_website_url: TOURNAMENT_PATCH.official_website_url,
    start_date: TOURNAMENT_PATCH.start_date,
    end_date: TOURNAMENT_PATCH.end_date,
  };
  const finalResp = await supabase.from('tournaments').update(fallbackPatch).eq('id', tournamentId);
  if (finalResp.error) throw finalResp.error;
  return { ok: true as const, mode: 'fallback' as const };
}

async function findVenue(input: VenueInput): Promise<VenueRow | null> {
  const state = input.state;
  const city = input.city;
  const name = input.venue_name;
  const address = input.address;

  // 1) Exact match on all fields we have.
  if (address) {
    const exact = await supabase
      .from('venues')
      .select('id,name,address,city,state,zip,sport')
      .eq('state', state)
      .eq('city', city)
      .eq('name', name)
      .eq('address', address)
      .limit(2);
    if (exact.error) throw exact.error;
    if ((exact.data ?? []).length === 1) return exact.data![0] as any;
  }

  // 2) Name + city/state case-insensitive.
  const byName = await supabase
    .from('venues')
    .select('id,name,address,city,state,zip,sport')
    .eq('state', state)
    .eq('city', city)
    .ilike('name', name)
    .limit(5);
  if (byName.error) throw byName.error;
  if ((byName.data ?? []).length === 1) return byName.data![0] as any;

  // 3) Fuzzy: name contains / address contains.
  const seed = normalize(name).split(' ').filter(Boolean).slice(0, 3).join(' ');
  const fuzzy = await supabase
    .from('venues')
    .select('id,name,address,city,state,zip,sport')
    .eq('state', state)
    .eq('city', city)
    .ilike('name', `%${seed}%`)
    .limit(8);
  if (fuzzy.error) throw fuzzy.error;
  const candidates = (fuzzy.data ?? []) as VenueRow[];

  // If address present, prefer a candidate whose address includes the street number.
  if (address) {
    const num = normalize(address).match(/\b\d{2,6}\b/)?.[0] ?? '';
    const addrKey = num ? candidates.find((c) => normalize(c.address).includes(num)) : null;
    if (addrKey) return addrKey;
  }

  // If we have candidates but can't pick uniquely, don't guess.
  return null;
}

async function createVenue(input: VenueInput): Promise<VenueRow> {
  const payload: Record<string, any> = {
    name: input.venue_name,
    address: input.address || null,
    city: input.city,
    state: input.state,
    zip: input.zip || null,
    sport: 'soccer',
  };

  const ins = await supabase
    .from('venues')
    .insert(payload)
    .select('id,name,address,city,state,zip,sport')
    .single();

  if (ins.error) {
    // If we collided on uniqueness, attempt re-fetch.
    if ((ins.error as any).code === '23505') {
      const found = await findVenue(input);
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
  console.log(`AYSO Grape Stomp update (apply=${apply})`);

  const t = await pickTournament();
  console.log(`tournament: ${t.id} :: ${t.name} :: slug=${t.slug ?? 'null'} :: ${t.start_date ?? 'null'}-${t.end_date ?? 'null'}`);

  // Preview patch diff.
  const desiredEmail = normalize(TOURNAMENT_PATCH.tournament_director_email);
  const desiredName = normalize(TOURNAMENT_PATCH.tournament_director);
  const willChangeDirector = normalize(t.tournament_director_email) !== desiredEmail || normalize(t.tournament_director) !== desiredName;

  console.log(`director before: ${t.tournament_director ?? 'null'} <${t.tournament_director_email ?? 'null'}>`);
  console.log(`director after : ${TOURNAMENT_PATCH.tournament_director} <${TOURNAMENT_PATCH.tournament_director_email}>`);
  console.log(`tournament patch: ${willChangeDirector ? 'will_update' : 'no_change_or_other_fields_only'}`);

  if (apply) {
    const upd = await safeUpdateTournament(t.id);
    console.log(`tournament updated (${upd.mode})`);
  }

  let created = 0;
  let linked = 0;
  let existed = 0;
  let ambiguous = 0;

  for (const v of VENUES) {
    const found = await findVenue(v);
    if (found) {
      existed++;
      console.log(`venue exists: ${v.venue_name} -> ${found.id} (${found.name ?? ''})`);
      if (apply) {
        const l = await linkVenue(t.id, found.id);
        if (l.linked) linked++;
      }
      continue;
    }

    // Check if multiple close candidates exist; if so, do not guess.
    const search = await supabase
      .from('venues')
      .select('id,name,address,city,state,zip')
      .eq('state', v.state)
      .eq('city', v.city)
      .ilike('name', `%${normalize(v.venue_name).split(' ')[0]}%`)
      .limit(10);
    if (search.error) throw search.error;
    const close = (search.data ?? []) as any[];
    const exactName = close.filter((c) => normalize(c.name) === normalize(v.venue_name));
    if (exactName.length > 1) {
      ambiguous++;
      console.log(`AMBIGUOUS (multiple exact-name matches) for ${v.venue_name}; not creating/linking.`);
      for (const c of exactName) {
        console.log(`- ${c.id} :: ${c.name} | ${c.address}, ${c.city} ${c.state} ${c.zip ?? ''}`);
      }
      continue;
    }

    console.log(`venue missing: ${v.venue_name} (${v.address}, ${v.city}, ${v.state} ${v.zip})`);
    if (apply) {
      const createdRow = await createVenue(v);
      created++;
      const l = await linkVenue(t.id, createdRow.id);
      if (l.linked) linked++;
      console.log(`  created -> ${createdRow.id} and linked`);
    }
  }

  console.log({ existed, created, linked, ambiguous });
  if (!apply) console.log('Dry run only. Re-run with --apply to write changes.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
