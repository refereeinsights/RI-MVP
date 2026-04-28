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

function readDotEnvValue(key: string): string {
  try {
    const candidates = [
      path.join(process.cwd(), ".env.local"),
      path.join(process.cwd(), "apps", "referee", ".env.local"),
    ];
    for (const envPath of candidates) {
      let raw = "";
      try {
        raw = fs.readFileSync(envPath, "utf8");
      } catch {
        continue;
      }
      const lines = raw.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        const k = trimmed.slice(0, idx).trim();
        if (k !== key) continue;
        let v = trimmed.slice(idx + 1).trim();
        // Strip surrounding quotes if present
        if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return v;
      }
    }
    return "";
  } catch {
    return "";
  }
}

const FSQ_API_KEY = process.env.FSQ_API_KEY ?? readDotEnvValue("FSQ_API_KEY") ?? "";
if (!FSQ_API_KEY) {
  console.error("Missing FSQ_API_KEY env var (or FSQ_API_KEY in .env.local).");
  process.exit(1);
}

// Per Foursquare Places API docs, X-Places-Api-Version is required.
const API_VERSION =
  process.env.FOURSQUARE_API_VERSION || readDotEnvValue("FOURSQUARE_API_VERSION") || "2025-06-17";
const LIMIT = 25;

// Default test set: urban + sports complex + rural-ish.
// Edit/extend as needed.
const LOCATIONS: TestLocation[] = [
  { label: "Spokane, WA (downtown)", lat: 47.6588, lng: -117.426, radii: [5000, 8000] },
  { label: "Starfire Sports Complex (Tukwila, WA)", lat: 47.4569, lng: -122.2703, radii: [5000, 8000] },
  { label: "Rural sample (Ellensburg, WA)", lat: 46.9965, lng: -120.5478, radii: [8000, 12000] },
];

const DISCOVERY_QUERIES: Array<{ label: string; query: string }> = [
  // Quick eats-ish
  { label: "pizza", query: "pizza" },
  { label: "sandwich", query: "sandwich" },
  { label: "fast food", query: "fast food" },
  { label: "burrito", query: "burrito" },
  { label: "bakery", query: "bakery" },
  // Hangouts-ish
  { label: "brewery", query: "brewery" },
  { label: "bowling", query: "bowling" },
  { label: "arcade", query: "arcade" },
  { label: "mini golf", query: "mini golf" },
  { label: "ice cream", query: "ice cream" },
  { label: "park", query: "park" },
];

async function fsqSearch(args: { lat: number; lng: number; radius: number; query: string }) {
  // NOTE: Foursquare deprecated the previous /v3/places/search endpoint (HTTP 410).
  // Use the new Places API host.
  const url = new URL("https://places-api.foursquare.com/places/search");
  url.searchParams.set("ll", `${args.lat},${args.lng}`);
  url.searchParams.set("radius", String(args.radius));
  url.searchParams.set("limit", String(LIMIT));
  url.searchParams.set("sort", "DISTANCE");
  url.searchParams.set("query", args.query);

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

  const json = (await res.json()) as {
    results?: Array<{
      fsq_place_id?: string;
      name?: string;
      distance?: number;
      categories?: Array<{ fsq_category_id?: string; name?: string }>;
    }>;
  };

  const mapped: PlaceResult[] = (json.results ?? []).map((p) => ({
    fsq_place_id: typeof p.fsq_place_id === "string" ? p.fsq_place_id : "",
    name: typeof p.name === "string" ? p.name : "",
    distance: typeof p.distance === "number" ? p.distance : undefined,
    categories: Array.isArray(p.categories)
      ? p.categories
          .map((c) =>
            typeof c?.fsq_category_id === "string" && c?.name
              ? { fsq_category_id: String(c.fsq_category_id), name: String(c.name) }
              : null
          )
          .filter(Boolean)
      : [],
  }));

  return mapped.filter((p) => p.fsq_place_id && p.name);
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
      for (const q of DISCOVERY_QUERIES) {
        const results = await fsqSearch({ lat: loc.lat, lng: loc.lng, radius, query: q.query });
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
