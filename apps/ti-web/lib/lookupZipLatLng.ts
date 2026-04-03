import { supabaseAdmin } from "@/lib/supabaseAdmin";

const GOOGLE_PLACES_BASE = "https://places.googleapis.com/v1";

type PlacesSearchResponse = {
  places?: Array<{
    id?: string;
    types?: string[];
    location?: { latitude?: number; longitude?: number };
  }>;
};

function getApiKey() {
  return process.env.GOOGLE_PLACES_API_KEY ?? null;
}

function normalizeZip5(value: string) {
  const digits = String(value ?? "").replace(/\D+/g, "");
  if (digits.length < 5) return null;
  return digits.slice(0, 5);
}

async function lookupZipCentroid(zip5: string): Promise<{ latitude: number; longitude: number } | null> {
  const { data, error } = await (supabaseAdmin.from("zip_centroids" as any) as any)
    .select("zip, latitude, longitude")
    .eq("zip", zip5)
    .maybeSingle();
  if (error) return null;
  const row = (data ?? null) as { latitude?: number | null; longitude?: number | null } | null;
  if (!row || typeof row.latitude !== "number" || typeof row.longitude !== "number") return null;
  if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) return null;
  return { latitude: row.latitude, longitude: row.longitude };
}

async function maybeUpsertZipCentroid(zip5: string, latitude: number, longitude: number) {
  try {
    await (supabaseAdmin.from("zip_centroids" as any) as any).upsert(
      { zip: zip5, latitude, longitude },
      { onConflict: "zip" }
    );
  } catch {
    // Best-effort only: if the table/permissions differ by env, we still return the geocode result.
  }
}

export async function lookupZipLatLng(zip: string): Promise<{ latitude: number; longitude: number } | null> {
  const zip5 = normalizeZip5(zip);
  if (!zip5) return null;

  // First try our cached ZIP centroids table (free DB read).
  const centroid = await lookupZipCentroid(zip5);
  if (centroid) return centroid;

  const key = getApiKey();
  if (!key) return null;

  const runQuery = async (textQuery: string) => {
    const response = await fetch(`${GOOGLE_PLACES_BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.location,places.types",
      },
      body: JSON.stringify({ textQuery, languageCode: "en" }),
      cache: "no-store",
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(message || "ZIP lookup failed.");
    }

    const json = (await response.json().catch(() => ({}))) as PlacesSearchResponse;
    const first = (json.places ?? []).find((p) => p?.location?.latitude != null && p?.location?.longitude != null);
    if (!first?.location) return null;
    return {
      latitude: Number(first.location.latitude),
      longitude: Number(first.location.longitude),
    };
  };

  // Try ZIP alone first, then add country context.
  const result = (await runQuery(zip5)) ?? (await runQuery(`${zip5} USA`));
  if (result) {
    await maybeUpsertZipCentroid(zip5, result.latitude, result.longitude);
  }
  return result;
}
