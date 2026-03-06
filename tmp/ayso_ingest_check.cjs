const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});
(async()=>{
  const since = new Date(Date.now()-2*60*60*1000).toISOString();
  const { data: vc } = await supabase
    .from('tournament_venue_candidates')
    .select('tournament_id,venue_name,address_text,source_url,created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);
  const tids = [...new Set((vc||[]).map(r=>r.tournament_id))];
  const { data: ts } = tids.length ? await supabase.from('tournaments').select('id,name,slug').in('id', tids) : {data:[]};
  const map = new Map((ts||[]).map(t=>[t.id,t]));
  console.log(JSON.stringify((vc||[]).map(r=>({
    tournament: map.get(r.tournament_id)?.name,
    slug: map.get(r.tournament_id)?.slug,
    venue_name:r.venue_name,
    address:r.address_text,
    source_url:r.source_url,
    created_at:r.created_at,
  })), null, 2));
})();
