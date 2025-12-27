import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "../../../../../../RI_Backend/src/lib/supabase";
import { runVenueScan } from "../../../../../../RI_Backend/src/owlseye/jobs/runVenueScan";
import { SportType } from "../../../../../../RI_Backend/src/owlseye/types";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mapKindForSport(sport: SportType) {
  return sport === "soccer" ? "soccer_field_map" : "basketball_gym_photo";
}

async function recordRun(
  runId: string,
  venueId: string,
  sport: SportType,
  status: "running" | "complete" | "failed",
  errorMessage?: string
) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("owlseye_runs").upsert(
    {
      run_id: runId,
      venue_id: venueId,
      sport,
      status,
      error_message: errorMessage ?? null,
      created_at: new Date().toISOString(),
    },
    { onConflict: "run_id" }
  );
  if (error && error.code !== "42P01" && error.code !== "42703") {
    throw error;
  }
}

async function insertMapArtifact(venueId: string, sport: SportType, mapUrl?: string | null) {
  if (!mapUrl) return;
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("owls_eye_map_artifacts").insert({
    venue_id: venueId,
    sport,
    map_kind: mapKindForSport(sport),
    url: mapUrl,
    source: "manual_trigger",
    created_at: new Date().toISOString(),
  });
  if (error && error.code !== "42P01" && error.code !== "42703") {
    throw error;
  }
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const venueId = body?.venueId;
  const sport = body?.sport as SportType | undefined;
  const address = body?.address;
  const mapUrl = body?.mapUrl ?? null;
  const sponsoredFood = body?.sponsored_food ?? null;

  if (!venueId || typeof venueId !== "string" || !isUuid(venueId)) {
    return NextResponse.json({ error: "invalid_venue_id" }, { status: 400 });
  }
  if (sport !== "soccer" && sport !== "basketball") {
    return NextResponse.json({ error: "invalid_sport" }, { status: 400 });
  }
  if (!address || typeof address !== "string") {
    return NextResponse.json({ error: "address_required" }, { status: 400 });
  }

  const runId = randomUUID();
  await recordRun(runId, venueId, sport, "running").catch(() => {});
  await insertMapArtifact(venueId, sport, mapUrl).catch(() => {});

  try {
    await runVenueScan({
      venue_id: venueId,
      sport,
      address,
      published_map_url: mapUrl,
      sponsored_food: sponsoredFood,
    });
    await recordRun(runId, venueId, sport, "complete").catch(() => {});
    return NextResponse.json({ runId });
  } catch (err) {
    await recordRun(runId, venueId, sport, "failed", err instanceof Error ? err.message : String(err)).catch(
      () => {}
    );
    return NextResponse.json(
      { error: "run_failed", message: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
