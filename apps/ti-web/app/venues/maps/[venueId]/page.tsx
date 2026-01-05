import Link from "next/link";

type RunRow = { id: string; run_id: string | null; updated_at: string | null };
type ArtifactRow = { image_url: string | null; north_bearing_degrees: number | null; created_at: string | null };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const REVALIDATE_SECONDS = 300;

export const revalidate = REVALIDATE_SECONDS;

async function fetchSupabase<T>(path: string, search: string): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing Supabase configuration");
  }
  const url = `${SUPABASE_URL}/rest/v1/${path}${search ? `?${search}` : ""}`;
  const resp = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: "application/json",
    },
    // Cache for a few minutes to avoid hammering Supabase for static artifacts.
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!resp.ok) {
    throw new Error(`Supabase request failed: ${resp.status} ${await resp.text()}`);
  }
  return (await resp.json()) as T;
}

export default async function VenueMapPage({ params }: { params: { venueId: string } }) {
  const venueId = params.venueId;

  let latestRun: RunRow | null = null;
  try {
    const runs = await fetchSupabase<RunRow[]>(
      "owls_eye_runs",
      `select=id,run_id,updated_at&venue_id=eq.${venueId}&order=updated_at.desc&limit=1`
    );
    latestRun = runs?.[0] ?? null;
  } catch (err) {
    console.error("[ti-web] fetch runs failed", err);
  }

  let artifact: ArtifactRow | null = null;
  const resolvedRunId = latestRun?.run_id || latestRun?.id || null;

  if (resolvedRunId) {
    try {
      const artifacts = await fetchSupabase<ArtifactRow[]>(
        "owls_eye_map_artifacts",
        `select=image_url,north_bearing_degrees,created_at&run_id=eq.${resolvedRunId}&order=created_at.desc&limit=1`
      );
      artifact = artifacts?.[0] ?? null;
    } catch (err) {
      console.error("[ti-web] fetch artifacts failed", err);
    }
  }

  const hasMap = Boolean(artifact?.image_url);

  return (
    <main style={{ minHeight: "100vh", display: "flex", justifyContent: "center", padding: "32px 16px" }}>
      <div style={{ width: "100%", maxWidth: 960 }}>
        <header style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Venue Map</h1>
            <p style={{ margin: "4px 0 0", color: "#4b5563", fontSize: 14 }}>Venue ID: {venueId}</p>
          </div>
          <Link href="/" style={{ fontSize: 14, color: "#0f172a", textDecoration: "none" }}>
            TournamentInsights
          </Link>
        </header>

        {!hasMap && (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, background: "#f8fafc" }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Map not available</div>
            <div style={{ color: "#4b5563", fontSize: 14 }}>
              We couldn&apos;t find a map for this venue yet. If a run exists, the latest artifact will appear here
              once available.
            </div>
          </div>
        )}

        {hasMap && (
          <div
            style={{
              position: "relative",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <img
              src={artifact?.image_url ?? ""}
              alt="Venue map"
              style={{ width: "100%", display: "block" }}
              loading="lazy"
            />
            {artifact?.north_bearing_degrees != null && (
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  background: "rgba(255,255,255,0.82)",
                  padding: "6px 8px",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#0f172a",
                  border: "1px solid #e5e7eb",
                }}
              >
                North: {artifact.north_bearing_degrees.toFixed(0)}°
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
