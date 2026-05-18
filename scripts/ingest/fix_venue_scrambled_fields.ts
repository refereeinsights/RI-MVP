import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// 4 venues have all address columns shifted one position:
//   name=street, address=city, city=stateAbbr, state=zip, zip=URL|garbage
// Additionally Oakland venues have completely wrong coordinates (42.58,-77.97 = Fillmore NY, not Oakland CA).
// Fix: restore correct field values, rescue URLs into venue_url, null bad coords.

const FIXES: Array<{
  id: string;
  address: string; city: string; state: string; zip: string;
  venue_url: string | null;
  latitude: number | null; longitude: number | null;
  name: string;
  nameNote: string;
}> = [
  {
    id: "b6431f08-557a-433e-825e-3df068ca458c",
    address: "1925 Magdalena Ave", city: "Chula Vista", state: "CA", zip: "91913",
    venue_url: null,
    latitude: 32.58394, longitude: -117.128103,  // existing coords look correct
    name: "1925 Magdalena Ave",
    nameNote: "unknown venue; keeping street as name",
  },
  {
    id: "c2fef2ae-a6b8-47c2-b5c7-37cdd2a11940",
    address: "751 Otay Lakes Rd", city: "Chula Vista", state: "CA", zip: "91913",
    venue_url: "https://bvhs.sweetwaterschools.org",
    latitude: 32.58394, longitude: -117.128103,
    name: "Bonita Vista High School",
    nameNote: "inferred from URL (bvhs.sweetwaterschools.org)",
  },
  {
    id: "3aa343e8-4d4a-4fc1-8e0a-aea429e5bea7",
    address: "550 10th St", city: "Oakland", state: "CA", zip: "94607",
    venue_url: "https://www.oaklandconventioncenter.com",
    latitude: null, longitude: null,  // old coords (42.58,-77.97) are Fillmore NY — clear for re-geocode
    name: "Oakland Convention Center",
    nameNote: "inferred from URL",
  },
  {
    id: "d05c36f2-6665-4778-8338-7031af24626d",
    address: "900 Fallon St", city: "Oakland", state: "CA", zip: "94607",
    venue_url: "https://laney.edu",
    latitude: null, longitude: null,
    name: "Laney College",
    nameNote: "inferred from URL",
  },
];

const apply = process.argv.includes("--apply");
console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}\n`);

async function run() {
  const { data: rows } = await supabase.from("venues" as any)
    .select("id,name,address,city,state,zip,venue_url,latitude,longitude")
    .in("id", FIXES.map((f) => f.id));

  const byId = new Map((rows ?? [] as any[]).map((r: any) => [r.id, r]));

  for (const fix of FIXES) {
    const row = byId.get(fix.id) as any;
    if (!row) { console.log(`NOT FOUND: ${fix.id}`); continue; }

    const patch: Record<string, any> = {
      address: fix.address,
      city: fix.city,
      state: fix.state,
      zip: fix.zip,
    };
    if (fix.venue_url !== null) patch.venue_url = fix.venue_url;
    if (fix.latitude === null) { patch.latitude = null; patch.longitude = null; }
    if (fix.name !== row.name) patch.name = fix.name;

    console.log(`${apply ? "PATCH" : "WOULD PATCH"} "${row.name}"`);
    console.log(`  address: "${row.address}" → "${fix.address}"`);
    console.log(`  city:    "${row.city}" → "${fix.city}"`);
    console.log(`  state:   "${row.state}" → "${fix.state}"`);
    console.log(`  zip:     "${row.zip}" → "${fix.zip}"`);
    if (fix.venue_url) console.log(`  venue_url: null → "${fix.venue_url}"  (rescued from zip field)`);
    if (fix.latitude === null) console.log(`  lat/lng: ${row.latitude},${row.longitude} → NULL  (was Fillmore NY — will re-geocode on next run)`);
    if (fix.name !== row.name) console.log(`  name: "${row.name}" → "${fix.name}"  (${fix.nameNote})`);

    if (apply) {
      const { error } = await supabase.from("venues" as any).update(patch).eq("id", fix.id);
      if (error) console.error(`  ERROR: ${error.message}`);
      else console.log(`  ✓ updated`);
    }
    console.log("");
  }
  if (!apply) console.log("Re-run with --apply to commit.");
}
run().catch(console.error);
