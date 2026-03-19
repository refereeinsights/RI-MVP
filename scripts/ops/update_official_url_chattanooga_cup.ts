import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(url, key, { auth: { persistSession: false } });

const NEW_URL = 'https://soccer.sincsports.com/details.aspx?tid=ERSHAM&tab=1';

async function main() {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id,name,slug,start_date,end_date,city,state,official_website_url,source_url')
    .ilike('name', '%Chattanooga Cup%')
    .order('start_date', { ascending: false })
    .limit(20);
  if (error) throw error;

  if (!data || data.length === 0) {
    console.log('No tournaments matched name like "%Chattanooga Cup%"');
    process.exit(2);
  }

  console.log(`Matched ${data.length} tournament(s):`);
  for (const t of data) {
    console.log(`- ${t.id} :: ${t.name} :: slug=${t.slug} :: ${t.start_date ?? 'null'}-${t.end_date ?? 'null'} :: ${t.city ?? ''}, ${t.state ?? ''} :: official=${t.official_website_url ?? 'null'} :: source=${t.source_url ?? 'null'}`);
  }

  if (data.length !== 1) {
    console.log('\nRefusing to update because match count != 1. Re-run with TOURNAMENT_ID env set.');
    process.exit(3);
  }

  const t = data[0];
  const { error: updErr } = await supabase
    .from('tournaments')
    .update({ official_website_url: NEW_URL })
    .eq('id', t.id);
  if (updErr) throw updErr;

  console.log(`\nUpdated official_website_url for ${t.id} (${t.slug}) to ${NEW_URL}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
