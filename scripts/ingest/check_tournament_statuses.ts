import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: unknown } = await (sb
    .from('tournaments' as any)
    .select('id,name,slug,city,state,status')
    .ilike('city', 'unknown')
    .limit(200) as any);

  const ids = (unknown ?? []).map((t: any) => t.id);
  console.log(`Tournaments with city='Unknown': ${ids.length}`);

  const { data: links } = await (sb
    .from('tournament_venues' as any)
    .select('tournament_id,venue_id,is_inferred')
    .in('tournament_id', ids)
    .limit(2000) as any);

  // First venue per tournament (prefer non-inferred)
  const firstVenue = new Map<string, { venueId: string; inferred: boolean }>();
  for (const l of (links ?? []).sort((a: any, b: any) => Number(a.is_inferred) - Number(b.is_inferred))) {
    if (!firstVenue.has(l.tournament_id)) {
      firstVenue.set(l.tournament_id, { venueId: l.venue_id, inferred: l.is_inferred });
    }
  }

  const venueIds = Array.from(new Set(Array.from(firstVenue.values()).map(v => v.venueId)));
  const { data: venues } = await (sb
    .from('venues' as any)
    .select('id,name,city,state')
    .in('id', venueIds)
    .limit(500) as any);
  const venueById = new Map((venues ?? []).map((v: any) => [v.id, v]));

  let fixable = 0, venueNoCity = 0, noLink = 0;
  for (const t of unknown ?? []) {
    const entry = firstVenue.get(t.id);
    if (!entry) { noLink++; continue; }
    const v = venueById.get(entry.venueId);
    if (v?.city && v.city.toLowerCase() !== 'unknown') { fixable++; } else { venueNoCity++; }
  }

  console.log(`  Fixable from venue city: ${fixable}`);
  console.log(`  Venue also unknown/no city: ${venueNoCity}`);
  console.log(`  No venue link: ${noLink}`);

  console.log('\nSample fixable:');
  let shown = 0;
  for (const t of unknown ?? []) {
    if (shown >= 15) break;
    const entry = firstVenue.get(t.id);
    if (!entry) continue;
    const v = venueById.get(entry.venueId);
    if (!v?.city || v.city.toLowerCase() === 'unknown') continue;
    console.log(`  [${t.status}] ${t.name ?? t.slug} → ${v.city}  (venue: ${v.name}) [inferred:${entry.inferred}]`);
    shown++;
  }
}

main().catch(console.error);
