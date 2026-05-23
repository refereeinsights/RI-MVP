import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Tournaments missing city or state
  const { data: missing, error: missErr } = await (sb
    .from('tournaments' as any)
    .select('id,name,slug,city,state,status')
    .or('city.is.null,state.is.null')
    .limit(500) as any);
  if (missErr) { console.error(missErr.message); process.exit(1); }

  const ids = (missing ?? []).map((t: any) => t.id);

  // Get venue links
  const { data: links } = await (sb
    .from('tournament_venues' as any)
    .select('tournament_id,venue_id')
    .in('tournament_id', ids)
    .eq('is_inferred', false)
    .limit(1000) as any);

  // First venue per tournament
  const firstVenue = new Map<string, string>();
  for (const l of links ?? []) {
    if (!firstVenue.has(l.tournament_id)) firstVenue.set(l.tournament_id, l.venue_id);
  }

  const venueIds = Array.from(new Set(firstVenue.values()));
  const { data: venues } = await (sb
    .from('venues' as any)
    .select('id,name,city,state')
    .in('id', venueIds)
    .limit(500) as any);
  const venueById = new Map((venues ?? []).map((v: any) => [v.id, v]));

  // Build fixable list
  let cityFixed = 0, stateFixed = 0, bothNull = 0, venueNoCity = 0;
  const fixable: Array<{id: string, name: string, status: string, tCity: string|null, tState: string|null, vCity: string|null, vState: string|null}> = [];

  for (const t of missing ?? []) {
    const venueId = firstVenue.get(t.id);
    if (!venueId) continue;
    const v = venueById.get(venueId);
    if (!v) continue;

    const needCity = !t.city;
    const needState = !t.state;
    const canFix = (needCity && v.city) || (needState && v.state);
    if (!canFix) { venueNoCity++; continue; }

    if (needCity && v.city) cityFixed++;
    if (needState && v.state) stateFixed++;
    if (needCity && needState) bothNull++;
    fixable.push({ id: t.id, name: t.name ?? t.slug, status: t.status, tCity: t.city, tState: t.state, vCity: v.city, vState: v.state });
  }

  console.log(`Fixable: ${fixable.length} (would set city on ${cityFixed}, state on ${stateFixed})`);
  console.log(`Venue also lacks city/state: ${venueNoCity}`);
  console.log('\nSample fixes (first 15):');
  for (const f of fixable.slice(0, 15)) {
    const cityPart = !f.tCity ? `city: NULL → ${f.vCity}` : '';
    const statePart = !f.tState ? `state: NULL → ${f.vState}` : '';
    console.log(`  [${f.status}] ${f.name} — ${[cityPart, statePart].filter(Boolean).join(' | ')}`);
  }
}

main().catch(console.error);
