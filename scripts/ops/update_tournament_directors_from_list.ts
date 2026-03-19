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

// Only include rows with at least one non-empty value.
const UPDATES: Update[] = [
  // Alabama USSSA Baseball (Matt Hamilton)
  { id: '47a9c0ba-123b-49f6-a9d8-362dc882848f', director_email: 'matt.hamilton7@yahoo.com', director_name: 'Matt Hamilton' },
  { id: '52b66d10-1741-4c33-a5c7-8edf395ace76', director_email: 'matt.hamilton7@yahoo.com', director_name: 'Matt Hamilton' },
  { id: '491b9506-e8d3-4a28-b6cc-af2625fb4c45', director_email: 'matt.hamilton7@yahoo.com', director_name: 'Matt Hamilton' },
  { id: 'ae32a889-d7cd-4643-80ea-d0304f698cdb', director_email: 'matt.hamilton7@yahoo.com', director_name: 'Matt Hamilton' },
  { id: '2bec2087-d747-4d8b-ae1e-1a2dcac20049', director_email: 'matt.hamilton7@yahoo.com', director_name: 'Matt Hamilton' },
  { id: 'ec87d2d2-a530-4470-af5f-91953c3b673d', director_email: 'matt.hamilton7@yahoo.com', director_name: 'Matt Hamilton' },
  { id: '9465b06c-5ca0-4739-9401-befc1c622a14', director_email: 'matt.hamilton7@yahoo.com', director_name: 'Matt Hamilton' },

  // Panhandle Basketball (John McDonald)
  { id: 'fce0c085-3f89-400d-a365-be10f76ad697', director_email: 'panhandlebasketball@gmail.com', director_name: 'John McDonald' },
  { id: 'f105606e-5779-4de8-b8dc-99ae8b7eddca', director_email: 'panhandlebasketball@gmail.com', director_name: 'John McDonald' },
  { id: '03706dda-1977-4b1c-973b-c4b54e9b730d', director_email: 'panhandlebasketball@gmail.com', director_name: 'John McDonald' },
  { id: '7394cc16-5c82-4052-b309-d55d2baae9e1', director_email: 'panhandlebasketball@gmail.com', director_name: 'John McDonald' },
  { id: '39462067-2266-4c92-8bef-c2a8c5ff71b8', director_email: 'panhandlebasketball@gmail.com', director_name: 'John McDonald' },
  { id: '0e846b01-825b-4aac-9551-805d5f0be45b', director_email: 'panhandlebasketball@gmail.com', director_name: 'John McDonald' },
  { id: 'c76e2818-611e-407c-a4df-475395c438b5', director_email: 'panhandlebasketball@gmail.com', director_name: 'John McDonald' },
  { id: '304f9ed6-780b-4bef-962c-b22921d6cd0e', director_email: 'panhandlebasketball@gmail.com', director_name: 'John McDonald' },
  { id: '95b2d495-5387-4db7-a0cf-e38b4684c3e2', director_email: 'panhandlebasketball@gmail.com', director_name: 'John McDonald' },
  { id: '71d77783-f1cc-4cca-a7ce-01d727db6727', director_email: 'panhandlebasketball@gmail.com', director_name: 'John McDonald' },
  { id: '5e06cfd3-c2d6-4b8b-b9bc-f98f413bcb21', director_email: 'panhandlebasketball@gmail.com', director_name: 'John McDonald' },

  // Hockey tournament contact
  { id: '36d325aa-f17c-4e65-bcca-491281592a8f', director_email: 'zjackson@tphacademy.com', director_name: 'Z. Jackson' },

  // SincSports director contact
  { id: 'c13930b4-ac99-4dc8-8565-0f178ffa6b75', director_email: 'nick@snapsoccer.com', director_name: 'Nick Cooper' },

  // United Soccer Club (email only)
  { id: 'e7d4e04a-0c48-4d2b-a9ca-0556fb47e552', director_email: 'admin@unitedsoccerclub.org' },

  // SincSports director contact
  { id: 'cdfa549a-6d79-4b38-960b-d23b9d74edd5', director_email: 'zack@snapsoccer.com', director_name: 'Zack T.' },

  // Hardwood (email only)
  { id: 'e9d0a6a0-f842-4a2b-b89b-1506a567c4fc', director_email: 'contact@hardwoodtournaments.com' },

  // AZ USSSA Baseball (Eric Bell)
  { id: 'b85f64eb-3354-42a4-97e6-031a099c5dc8', director_email: 'ebell@usssa.com', director_name: 'Eric Bell' },
  { id: 'b96a25b1-2685-41e8-9188-287e7f10907b', director_email: 'ebell@usssa.com', director_name: 'Eric Bell' },
  { id: '6ad66014-c3f8-4658-8343-7ceec91d4279', director_email: 'ebell@usssa.com', director_name: 'Eric Bell' },
  { id: 'f73d1c6f-7264-4019-a394-b1468ad14b27', director_email: 'ebell@usssa.com', director_name: 'Eric Bell' },

  // CHE Hockey org contact
  { id: '989b53c3-9423-43c8-8bee-bbea4b2f1532', director_email: 'goals@chehockey.com', director_name: 'Graydon Crowley' },

  // US Lax Events
  { id: '288a483d-479d-4ae0-917a-d915c40678e3', director_email: 'vince@uslaxevents.com', director_name: 'Vincent Markello' },

  // AYSO Region 397 (email only)
  { id: '7a688d44-b122-4600-9a87-f9e8b6d9a730', director_email: 'bullheadsoccer@yahoo.com' },
  { id: '7b2e5f23-f548-4d92-998e-b6ac3083c21d', director_email: 'bullheadsoccer@yahoo.com' },

  // Phoenix Cup / Rated Cup
  { id: '2a6ecda7-d8c8-4e2b-8583-b337bfe25083', director_email: 'mike@phoenixcup.com', director_name: 'Michael Rocca' },
  { id: '8e163b05-b692-40f2-899f-1e707738f600', director_email: 'mike@phoenixcup.com', director_name: 'Michael Rocca' },

  // CA USSSA Baseball (Steve Hassett)
  { id: 'd604cc1a-b559-4cce-903e-96e18babbd55', director_email: 'shassett@usssa.com', director_name: 'Steve Hassett' },
  { id: 'cd1abfda-77fb-40fe-9be0-a1629d2fc337', director_email: 'shassett@usssa.com', director_name: 'Steve Hassett' },
  { id: '08493e50-e370-4017-b219-876246a50ee2', director_email: 'shassett@usssa.com', director_name: 'Steve Hassett' },
  { id: 'b70e3ceb-3389-4a73-be0c-f9b1d22a99e4', director_email: 'shassett@usssa.com', director_name: 'Steve Hassett' },
  { id: 'ff624063-5d33-455e-baca-30abd61e81f0', director_email: 'shassett@usssa.com', director_name: 'Steve Hassett' },
  { id: 'debec8c8-c704-4e6c-83e1-367789cc48d0', director_email: 'shassett@usssa.com', director_name: 'Steve Hassett' },
  { id: 'eb24e225-5a41-40bd-9a85-8a6e1fa5fa83', director_email: 'shassett@usssa.com', director_name: 'Steve Hassett' },
  { id: '126a7db7-7828-4c48-82f6-746a976d6274', director_email: 'shassett@usssa.com', director_name: 'Steve Hassett' },
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
