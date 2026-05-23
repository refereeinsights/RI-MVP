import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const targets = ['Payson High School; Rumsey Park', 'Payson High School', 'Rumsey Park'];
  for (const name of targets) {
    const { data } = await (sb.from('venues' as any).select('id,name,city,state,address').eq('name', name).limit(3) as any);
    for (const v of data ?? []) console.log(`${v.id} | city:${v.city ?? 'NULL'} | state:${v.state ?? 'NULL'} | addr:${v.address ?? '—'} | ${v.name}`);
  }
}
main().catch(console.error);
