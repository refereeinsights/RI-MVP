import { randomUUID } from "node:crypto";

import { searchNearbyFood } from "../google/places";
import { getAdminSupabase } from "../supabase/admin";

type Sport = "soccer" | "basketball";

type RunInput = {
  runId?: string;
  venueId: string;
  sport: Sport;
  publishedMapUrl?: string | null;
  address?: string | null;
};

type RunResult =
  | { runId: string; status: "complete"; message?: string }
  | { runId: string; status: "failed"; message: string };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_REGEX.test(value);
}

async function safeUpsert(table: string, payload: Record<string, any>): Promise<{ ok: boolean; message?: string }> {
  try {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from(table).upsert(payload);
    if (error) {
      if (error.code === "42P01" || error.code === "42703") {
        return { ok: false, message: `${table} table missing` };
      }
      return { ok: false, message: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

async function safeInsert(table: string, payloads: Record<string, any>[]): Promise<{ ok: boolean; message?: string }> {
  try {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from(table).insert(payloads);
    if (error) {
      if (error.code === "42P01" || error.code === "42703") {
        return { ok: false, message: `${table} table missing` };
      }
      return { ok: false, message: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function runVenueScan(input: RunInput): Promise<RunResult> {
  if (!input?.venueId || !isUuid(input.venueId)) {
    return { runId: "", status: "failed", message: "Invalid venueId" };
  }
  if (input.sport !== "soccer" && input.sport !== "basketball") {
    return { runId: "", status: "failed", message: "Invalid sport" };
  }

  const runId = input.runId && isUuid(input.runId) ? input.runId : randomUUID();
  const startedAt = new Date().toISOString();
  const fieldMapUrl = input.publishedMapUrl ?? null;

  const runResult = await safeUpsert("owls_eye_runs", {
    run_id: runId,
    venue_id: input.venueId,
    sport: input.sport,
    status: "running",
    error_message: null,
    created_at: startedAt,
    updated_at: startedAt,
  });
  if (!runResult.ok) {
    return { runId, status: "failed", message: runResult.message ?? "Could not record run" };
  }

  let failureMessage: string | null = null;

  if (input.sport === "soccer" && fieldMapUrl) {
    const mapInsert = await safeInsert("owls_eye_map_artifacts", [
      {
        venue_id: input.venueId,
        sport: input.sport,
        map_kind: "soccer_field_map",
        url: fieldMapUrl,
        source: "manual_trigger",
        created_at: startedAt,
      },
    ]);
    if (!mapInsert.ok && mapInsert.message) {
      failureMessage = failureMessage ?? mapInsert.message;
    }
  }

  const nearby = await searchNearbyFood({ lat: 0, lng: 0 });
  if (nearby.length > 0) {
    const foodInsert = await safeInsert(
      "owls_eye_food",
      nearby.map((item) => ({
        run_id: runId,
        venue_id: input.venueId,
        name: item.name,
        address: item.address,
        place_id: item.placeId ?? null,
        lat: item.lat,
        lng: item.lng,
        created_at: startedAt,
      }))
    );
    if (!foodInsert.ok && foodInsert.message) {
      failureMessage = failureMessage ?? foodInsert.message;
    }
  }

  if (failureMessage) {
    await safeUpsert("owls_eye_runs", {
      run_id: runId,
      venue_id: input.venueId,
      sport: input.sport,
      status: "failed",
      error_message: failureMessage,
      updated_at: new Date().toISOString(),
    });
    return { runId, status: "failed", message: failureMessage };
  }

  const completed = await safeUpsert("owls_eye_runs", {
    run_id: runId,
    venue_id: input.venueId,
    sport: input.sport,
    status: "complete",
    error_message: null,
    updated_at: new Date().toISOString(),
  });

  if (!completed.ok) {
    return { runId, status: "failed", message: completed.message ?? "Run completion not recorded" };
  }

  return { runId, status: "complete" };
}
