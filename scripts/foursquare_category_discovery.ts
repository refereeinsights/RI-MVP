// Foursquare Places API category discovery helper (v1)
//
// Goal:
// - Run a few searches around known venues/areas and summarize which categories
//   appear most often in the results.
// - Use this output to populate `apps/referee/src/owlseye/foursquareCategories.ts`.
//
// Usage:
//   FSQ_API_KEY=<key> npx tsx scripts/foursquare_category_discovery.ts
//
// Output:
//   scripts/output/foursquare_category_discovery.json

import fs from "node:fs";
import path from "node:path";

type TestLocation = {
  label: string;
  lat: number;
  lng: number;
  radii: number[];
};

type CategoryHit = {
  fsq_category_id: string;
  name: string;
};

type PlaceResult = {
  fsq_place_id: string;
  name: string;
  distance?: number;
  categories?: CategoryHit[];
};

const FSQ_API_KEY = process.env.FSQ_API_KEY ?? "";
if (!FSQ_API_KEY) {
  console.error("Missing FSQ_API_KEY env var.");
  process.exit(1);
}

const API_VERSION = process.env.FOURSQUARE_API_VERSION ?? "2025-06-17";
const LIMIT = 25;

// Default test set: urban + sports complex + rural-ish.
// Edit/extend as needed.
const LOCATIONS: TestLocation[] = [
  { label: "Spokane, WA (downtown)", lat: 47.6588, lng: -117.426, radii: [5000, 8000] },
  { label: "Starfire Sports Complex (Tukwila, WA)", lat: 47.4569, lng: -122.2703, radii: [5000, 8000] },
  { label: "Rural sample (Ellensburg, WA)", lat: 46.9965, lng: -120.5478, radii: [8000, 12000] },
];

async function fsqSearch(args: { lat: number; lng: number; radius: number }) {
  const url = new URL("https://places-api.foursquare.com/places/search");
  url.searchParams.set("ll", `${args.lat},${args.lng}`);
  url.searchParams.set("radius", String(args.radius));
  url.searchParams.set("limit", String(LIMIT));
  url.searchParams.set("sort", "DISTANCE");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${FSQ_API_KEY}`,
      "X-Places-Api-Version": API_VERSION,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`FSQ HTTP ${res.status}: ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as { results?: PlaceResult[] };
  return json.results ?? [];
}

function addSample(samples: string[], value: string, max = 8) {
  if (samples.length >= max) return;
  if (samples.includes(value)) return;
  samples.push(value);
}

async function main() {
  const out: any = {
    generated_at: new Date().toISOString(),
    api_version: API_VERSION,
    limit: LIMIT,
    locations: [] as any[],
  };

  for (const loc of LOCATIONS) {
    const categoryCounts = new Map<string, { name: string; count: number; samples: string[] }>();

    for (const radius of loc.radii) {
      const results = await fsqSearch({ lat: loc.lat, lng: loc.lng, radius });
      for (const place of results) {
        for (const cat of place.categories ?? []) {
          if (!cat?.fsq_category_id || !cat?.name) continue;
          if (!categoryCounts.has(cat.fsq_category_id)) {
            categoryCounts.set(cat.fsq_category_id, { name: cat.name, count: 0, samples: [] });
          }
          const row = categoryCounts.get(cat.fsq_category_id)!;
          row.count += 1;
          addSample(row.samples, place.name);
        }
      }
    }

    const categories = Array.from(categoryCounts.entries())
      .map(([fsq_category_id, v]) => ({
        fsq_category_id,
        fsq_category_name: v.name,
        occurrence_count: v.count,
        sample_places: v.samples,
      }))
      .sort((a, b) => b.occurrence_count - a.occurrence_count);

    out.locations.push({
      label: loc.label,
      center: { lat: loc.lat, lng: loc.lng },
      radii: loc.radii,
      categories,
    });
  }

  const outDir = path.join(process.cwd(), "scripts", "output");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "foursquare_category_discovery.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

