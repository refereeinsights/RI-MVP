import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(url, key, { auth: { persistSession: false } });

const TOURNAMENT_ID = '0365c9b6-7f28-4103-8d21-5b05f676e426';

async function main() {
  const tRes = await supabase
    .from('tournaments')
    .select('id, name, slug, sport, city, state, start_date, end_date, official_website_url')
    .eq('id', TOURNAMENT_ID)
    .maybeSingle();
  if (tRes.error) throw tRes.error;
  console.log('tournament', tRes.data);

  const tvRes = await supabase
    .from('tournament_venues')
    .select('venue_id')
    .eq('tournament_id', TOURNAMENT_ID);
  if (tvRes.error) throw tvRes.error;
  const venueIds = tvRes.data.map((r: any) => r.venue_id);
  console.log('linked venues count', venueIds.length);
  if (venueIds.length) {
    const vRes = await supabase
      .from('venues')
      .select('id, name, address, city, state, zip')
      .in('id', venueIds)
      .order('city', { ascending: true });
    if (vRes.error) throw vRes.error;
    console.log('linked venues', vRes.data);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
