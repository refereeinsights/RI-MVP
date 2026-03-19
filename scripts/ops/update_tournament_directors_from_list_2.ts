import { createClient } from '@supabase/supabase-js';

type Update = {
  id: string;
  director_email?: string;
  director_name?: string;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(url, key, { auth: { persistSession: false } });

function cleanEmail(value: string | undefined) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  return v.toLowerCase();
}

function cleanName(value: string | undefined) {
  const v = String(value ?? '').trim();
  return v || null;
}

const UPDATES: Update[] = [
  // Bay Area Roaddawgs (Ronnie Sample McDaniel)
  { id: '056220e7-4704-4a3c-83d6-98641af1b6cb', director_email: 'ronnie2mac@aol.com', director_name: 'Ronnie Sample McDaniel' },
  { id: '8be97e28-fdbf-48e7-bf93-7b148aecbdaa', director_email: 'ronnie2mac@aol.com', director_name: 'Ronnie Sample McDaniel' },
  { id: 'dc7ab0eb-7941-4d03-9394-5697706da34b', director_email: 'ronnie2mac@aol.com', director_name: 'Ronnie Sample McDaniel' },
  { id: '9b71fd3e-cd61-4206-9957-c8d5076ceedb', director_email: 'ronnie2mac@aol.com', director_name: 'Ronnie Sample McDaniel' },
  { id: '098bb24a-809e-4231-b27b-4a28d08f3ec6', director_email: 'ronnie2mac@aol.com', director_name: 'Ronnie Sample McDaniel' },

  // Adidas 3SSB
  { id: 'c1415c62-0d8f-493d-8516-bf7b47077f7e', director_email: 'max.piner@adidas3ssb.com', director_name: 'Max Piner' },

  // Cal State Games (org contact)
  { id: 'd390cb3f-06e6-4060-b4c0-74435ba8b9a6', director_email: 'info@calstategames.org' },

  // PLL Play (org contact)
  { id: '641d6257-b570-4bca-ba83-943bde5a9f89', director_email: 'play@premierlacrosseleague.com' },

  // Legends Lacrosse
  { id: '5a997909-a78f-407b-8a46-06368e1aa37f', director_email: 'reid@legendslax.com', director_name: 'Reid Doucette' },
  { id: '849634a1-5abc-45ad-9093-85f77bda1c64', director_email: 'reid@legendslax.com', director_name: 'Reid Doucette' },

  // Buku Events (low confidence org contact)
  { id: 'c9b8d742-b495-4da7-903a-6fa915e927b3', director_email: 'austen@bukulax.com', director_name: 'Austen Lison' },
  { id: '7c9a9df2-525a-48f8-9002-600b0b380bb4', director_email: 'austen@bukulax.com', director_name: 'Austen Lison' },
  { id: 'bcbc258b-395c-4dc9-9465-bd90402d2e8d', director_email: 'austen@bukulax.com', director_name: 'Austen Lison' },

  // AYSO Quartz Hill
  { id: '7dc27b36-f0b7-4ed1-9467-3d30ecf2b1d8', director_email: 'lpikkel@ayso638.org', director_name: 'Landon Pikkel' },

  // SoCal Elite FC
  { id: '672d838b-9e38-45e7-bb21-a39b67ec61cb', director_email: 'davidoh@socalelitefc.com', director_name: 'David Oh' },

  // Surf Nation Champions League
  { id: '5c605072-21e3-49ff-a7c6-0ff2fe6adf46', director_email: 'aprosser@surfsoccer.com', director_name: 'Andy Prosser' },

  // AYSO Glendale Legends Cup (org contact)
  { id: '3808c590-150a-4b53-b927-f08a5bb9d6ee', director_email: 'glendaleayso@gmail.com' },
];

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`director update: ${UPDATES.length} row(s) (apply=${apply})`);

  const ids = UPDATES.map((u) => u.id);
  const existing = await supabase
    .from('tournaments')
    .select('id,name,slug,tournament_director,tournament_director_email')
    .in('id', ids);
  if (existing.error) throw existing.error;

  const existingById = new Map<string, any>();
  for (const row of existing.data ?? []) existingById.set(row.id, row);

  const missing = ids.filter((id) => !existingById.has(id));
  if (missing.length) {
    console.log('WARNING: tournament IDs not found (skipping):', missing);
  }

  let changed = 0;
  let skipped = 0;

  for (const u of UPDATES) {
    const row = existingById.get(u.id);
    if (!row) {
      skipped++;
      continue;
    }

    const email = cleanEmail(u.director_email);
    const name = cleanName(u.director_name);

    const patch: Record<string, any> = {};
    if (email) patch.tournament_director_email = email;
    if (name) patch.tournament_director = name;

    if (Object.keys(patch).length === 0) {
      skipped++;
      continue;
    }

    const sameEmail = !('tournament_director_email' in patch) || (row.tournament_director_email ?? null) === patch.tournament_director_email;
    const sameName = !('tournament_director' in patch) || (row.tournament_director ?? null) === patch.tournament_director;

    if (sameEmail && sameName) {
      skipped++;
      continue;
    }

    console.log(`- ${row.id} :: ${row.slug} :: ${row.name}`);
    console.log(`  from name=${row.tournament_director ?? 'null'} email=${row.tournament_director_email ?? 'null'}`);
    console.log(`  to   name=${patch.tournament_director ?? row.tournament_director ?? 'null'} email=${patch.tournament_director_email ?? row.tournament_director_email ?? 'null'}`);

    if (apply) {
      const upd = await supabase.from('tournaments').update(patch).eq('id', row.id);
      if (upd.error) throw upd.error;
    }

    changed++;
  }

  console.log(`done: changed=${changed} skipped=${skipped} not_found=${missing.length}`);
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write updates.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
