import { createClient } from '@supabase/supabase-js';

type VenuePatch = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(url, key, { auth: { persistSession: false } });

const PATCHES: VenuePatch[] = [
  {
    id: '4b0dd3e2-69f2-4735-bb14-6ec132ee797b',
    name: 'Atlanta Fire United Soccer Complex',
    address: '3737 Brock Rd NW',
    city: 'Duluth',
    state: 'GA',
    zip: '30096',
  },
  {
    id: '76f2cc53-11d4-4b07-be87-e6ab35c70171',
    name: 'Frank White Jr. Softball Complex',
    address: '3901 SW Longview Rd',
    city: "Lee's Summit",
    state: 'MO',
    zip: '64081',
  },
];

function normalize(s: string | null | undefined) {
  return String(s ?? '').trim();
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`venue update: ${PATCHES.length} row(s) (apply=${apply})`);

  const ids = PATCHES.map((p) => p.id);
  const existing = await supabase
    .from('venues')
    .select('id,name,address,city,state,zip')
    .in('id', ids);
  if (existing.error) throw existing.error;

  const byId = new Map<string, any>();
  for (const row of existing.data ?? []) byId.set(row.id, row);

  const notFound = ids.filter((id) => !byId.has(id));
  if (notFound.length) {
    console.log('WARNING: venue IDs not found (skipping):', notFound);
  }

  let changed = 0;
  let skipped = 0;

  for (const p of PATCHES) {
    const row = byId.get(p.id);
    if (!row) {
      skipped++;
      continue;
    }

    const patch: Record<string, any> = {
      name: p.name,
      address: p.address,
      city: p.city,
      state: p.state,
      zip: p.zip,
    };

    const same =
      normalize(row.name) === p.name &&
      normalize(row.address) === p.address &&
      normalize(row.city) === p.city &&
      normalize(row.state) === p.state &&
      normalize(row.zip) === p.zip;

    if (same) {
      skipped++;
      continue;
    }

    console.log(`- ${p.id}`);
    console.log(`  from ${row.name ?? 'null'} | ${row.address ?? 'null'}, ${row.city ?? 'null'}, ${row.state ?? 'null'} ${row.zip ?? ''}`);
    console.log(`  to   ${p.name} | ${p.address}, ${p.city}, ${p.state} ${p.zip}`);

    if (apply) {
      const upd = await supabase.from('venues').update(patch).eq('id', p.id);
      if (upd.error) throw upd.error;
    }

    changed++;
  }

  console.log(`done: changed=${changed} skipped=${skipped} not_found=${notFound.length}`);
  if (!apply) console.log('Dry run only. Re-run with --apply to write updates.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
