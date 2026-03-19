import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(url, key, { auth: { persistSession: false } });

const IDS = process.argv.slice(2);
if (!IDS.length) {
  console.log('usage: npx tsx scripts/ops/probe_venues_address1.ts <venue_id> ...');
  process.exit(2);
}

async function main() {
  const { data, error } = await supabase
    .from('venues')
    .select('id,name,address,address1,city,state,zip')
    .in('id', IDS);
  if (error) throw error;
  for (const row of data ?? []) {
    console.log(row);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
