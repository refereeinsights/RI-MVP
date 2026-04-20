import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function countTotalVenues() {
  const res = await supabase.from("venues").select("id", { count: "exact", head: true });
  if (res.error) throw res.error;
  return res.count ?? 0;
}

async function countWithGeoPresent() {
  const res = await supabase
    .from("venues")
    .select("id", { count: "exact", head: true })
    .not("latitude", "is", null)
    .not("longitude", "is", null);
  if (res.error) throw res.error;
  return res.count ?? 0;
}

async function countWithGeoMissingAny() {
  const res = await supabase
    .from("venues")
    .select("id", { count: "exact", head: true })
    .or("latitude.is.null,longitude.is.null");
  if (res.error) throw res.error;
  return res.count ?? 0;
}

async function countWithGeoMissingBoth() {
  const res = await supabase
    .from("venues")
    .select("id", { count: "exact", head: true })
    .is("latitude", null)
    .is("longitude", null);
  if (res.error) throw res.error;
  return res.count ?? 0;
}

async function sampleMissing(limit: number) {
  const res = await supabase
    .from("venues")
    .select("id,name,city,state,address,latitude,longitude,geocode_source,created_at")
    .or("latitude.is.null,longitude.is.null")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (res.error) throw res.error;
  return (res.data ?? []) as Array<Record<string, unknown>>;
}

function pct(n: number, d: number) {
  if (!d) return "0.0%";
  return `${((n / d) * 100).toFixed(1)}%`;
}

async function main() {
  const total = await countTotalVenues();
  const present = await countWithGeoPresent();
  const missingAny = await countWithGeoMissingAny();
  const missingBoth = await countWithGeoMissingBoth();

  console.log(
    JSON.stringify(
      {
        total_venues: total,
        geo_present_both: { count: present, pct: pct(present, total) },
        geo_missing_any: { count: missingAny, pct: pct(missingAny, total) },
        geo_missing_both: { count: missingBoth, pct: pct(missingBoth, total) },
        note: "Geo presence is defined as latitude!=null AND longitude!=null.",
      },
      null,
      2,
    ),
  );

  if (missingAny > 0) {
    const rows = await sampleMissing(Math.min(25, missingAny));
    console.log("\nSample venues missing latitude/longitude (newest first):");
    for (const row of rows) console.log(row);
  }
}

main().catch((e) => {
  console.error("[audit_venues_geo] fatal", e);
  process.exit(1);
});

