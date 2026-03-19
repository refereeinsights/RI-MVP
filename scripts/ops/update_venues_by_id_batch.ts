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
    id: 'aa6fb588-2c48-4a64-8826-5508d8508d20',
    name: "O'Fallon Sports Park",
    address: '301 Obernuefemann Rd',
    city: "O'Fallon",
    state: 'IL',
    zip: '62269',
  },
  {
    id: '8a5d467f-a4a0-4f8d-a44f-7c161a4cb9bc',
    name: 'One FC Soccer Complex',
    address: '339 American Spirit Rd',
    city: 'Winter Haven',
    state: 'FL',
    zip: '33880',
  },
  {
    id: 'e63a5245-eb9e-4134-a39e-6be03954ddf7',
    name: 'North Wall Little League Complex',
    address: "1900 Bailey's Corner Rd",
    city: 'Wall Township',
    state: 'NJ',
    zip: '07719',
  },
  {
    id: '5e826cc0-e7bb-4337-abed-61609f56d3e2',
    name: 'Wolcott Park',
    address: '1 Willow Dr',
    city: 'Eatontown',
    state: 'NJ',
    zip: '07724',
  },
  {
    id: 'dd95eb11-bb13-4e8b-a1a8-ad1312193978',
    name: 'Cross Farm Park',
    address: '10 Longbridge Rd',
    city: 'Holmdel',
    state: 'NJ',
    zip: '07733',
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
