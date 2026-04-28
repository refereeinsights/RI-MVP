import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { type MapVenue } from "./TournamentVenueMapClient";
import TournamentVenueMapShellClient from "./TournamentVenueMapShellClient";

export const revalidate = 3600;

type TournamentRow = {
  id: string;
  slug: string | null;
  name: string;
  sport: string | null;
};

type OwlsEyeRunRow = {
  id: string;
  run_id?: string | null;
  venue_id: string;
  status: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

async function fetchLatestOwlsEyeRuns(venueIds: string[]) {
  if (!venueIds.length) return [] as OwlsEyeRunRow[];

  const primary = await supabaseAdmin
    .from("owls_eye_runs" as any)
    .select("id,run_id,venue_id,status,updated_at,created_at")
    .in("venue_id", venueIds)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  const primaryErrCode = (primary as any)?.error?.code;
  if (!primary.error) {
    return (primary.data as OwlsEyeRunRow[] | null) ?? [];
  }

  // Backward compatibility for environments where updated_at is missing.
  if (primaryErrCode === "42703" || primaryErrCode === "PGRST204") {
    const fallback = await supabaseAdmin
      .from("owls_eye_runs" as any)
      .select("id,run_id,venue_id,status,created_at")
      .in("venue_id", venueIds)
      .order("created_at", { ascending: false });
    return (fallback.data as OwlsEyeRunRow[] | null) ?? [];
  }

  return [];
}

async function loadOwlsEyeCountsByVenueId(venueIds: string[]) {
  const hasOwlsEyeByVenueId = new Map<string, boolean>();
  const countsByVenueId = new Map<string, { coffee: number; food: number; hotels: number }>();

  const runRows = await fetchLatestOwlsEyeRuns(venueIds);
  const latestRunByVenue = new Map<string, OwlsEyeRunRow>();
  for (const row of runRows) {
    if (!row?.venue_id) continue;
    if (latestRunByVenue.has(row.venue_id)) continue;
    latestRunByVenue.set(row.venue_id, row);
  }

  const runIds = Array.from(latestRunByVenue.values())
    .map((row) => row.run_id ?? row.id)
    .filter((value): value is string => Boolean(value));

  if (!runIds.length) return { hasOwlsEyeByVenueId, countsByVenueId };

  const { data: nearbyRows } = await supabaseAdmin
    .from("owls_eye_nearby_food" as any)
    .select("run_id,category")
    .in("run_id", runIds);

  const countsByRunId = new Map<string, { coffee: number; food: number; hotels: number; other: number }>();
  for (const row of ((nearbyRows as Array<{ run_id: string; category: string | null }> | null) ?? [])) {
    const runId = row.run_id;
    if (!runId) continue;
    const normalizedCategory = (row.category ?? "food").toLowerCase();
    const current = countsByRunId.get(runId) ?? { coffee: 0, food: 0, hotels: 0, other: 0 };
    if (normalizedCategory === "coffee") current.coffee += 1;
    else if (normalizedCategory === "hotel" || normalizedCategory === "hotels") current.hotels += 1;
    else if (
      normalizedCategory === "sporting_goods" ||
      normalizedCategory === "big_box_fallback" ||
      normalizedCategory === "quick_eats" ||
      normalizedCategory === "hangouts"
    ) current.other += 1;
    else current.food += 1;
    countsByRunId.set(runId, current);
  }

  for (const [venueId, run] of latestRunByVenue.entries()) {
    const runId = (run.run_id ?? run.id) as string;
    const counts = countsByRunId.get(runId) ?? { coffee: 0, food: 0, hotels: 0, other: 0 };
    countsByVenueId.set(venueId, { coffee: counts.coffee, food: counts.food, hotels: counts.hotels });
    hasOwlsEyeByVenueId.set(venueId, counts.coffee + counts.food + counts.hotels + counts.other > 0);
  }

  return { hasOwlsEyeByVenueId, countsByVenueId };
}

export default async function TournamentMapPage({ params }: { params: { slug: string } }) {
  const { data: tournament } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("id,slug,name,sport")
    .eq("slug", params.slug)
    .maybeSingle<TournamentRow>();

  if (!tournament?.id) notFound();

  const sportKey = (() => {
    const raw = String(tournament.sport ?? "").trim().toLowerCase();
    const allowed = new Set([
      "soccer",
      "basketball",
      "football",
      "baseball",
      "softball",
      "volleyball",
      "lacrosse",
      "wrestling",
      "hockey",
      "futsal",
    ]);
    return allowed.has(raw) ? raw : "generic";
  })();

  const { data: venueLinksRaw } = await supabaseAdmin
    .from("tournament_venues" as any)
    .select("venue_id,is_primary,created_at,venues(id,seo_slug,name,city,state,zip,latitude,longitude)")
    .eq("tournament_id", tournament.id)
    .eq("is_inferred", false)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  const venuesBase: Array<{
    venue: {
      id: string;
      seo_slug: string | null;
      name: string | null;
      city: string | null;
      state: string | null;
      latitude: number | null;
      longitude: number | null;
    } | null;
    isPrimary: boolean;
    idx: number;
  }> = ((venueLinksRaw as any[]) ?? [])
    .map((row: any, idx: number) => ({
      venue: row?.venues ?? null,
      isPrimary: Boolean(row?.is_primary),
      idx,
    }))
    .filter((row) => Boolean(row?.venue?.id));

  const venueIds = venuesBase.map((r) => r.venue!.id);
  const { hasOwlsEyeByVenueId, countsByVenueId } = await loadOwlsEyeCountsByVenueId(venueIds);

  const venues: MapVenue[] = venuesBase
    .map((row) => {
      const v = row.venue!;
      const counts = countsByVenueId.get(v.id) ?? null;
      const hasOwl = hasOwlsEyeByVenueId.get(v.id) ?? false;
      return {
        id: v.id,
        seo_slug: v.seo_slug ?? null,
        name: v.name ?? null,
        city: v.city ?? null,
        state: v.state ?? null,
        latitude: typeof v.latitude === "number" ? v.latitude : null,
        longitude: typeof v.longitude === "number" ? v.longitude : null,
        hasOwl,
        counts,
      };
    })
    .sort((a, b) => {
      const ap = venuesBase.find((r) => r.venue?.id === a.id)?.isPrimary ?? false;
      const bp = venuesBase.find((r) => r.venue?.id === b.id)?.isPrimary ?? false;
      if (ap !== bp) return ap ? -1 : 1;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

  const mapEnabled = Boolean((process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "").trim());

  return (
    <main className="pitchWrap tournamentsWrap">
      <TournamentVenueMapShellClient
        tournament={{
          id: tournament.id,
          slug: String(tournament.slug ?? params.slug),
          name: tournament.name,
          sport: tournament.sport ?? null,
        }}
        venues={venues}
        sportKey={sportKey}
        mapEnabled={mapEnabled}
      />
    </main>
  );
}
