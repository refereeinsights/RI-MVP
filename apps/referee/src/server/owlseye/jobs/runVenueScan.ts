import { randomUUID } from "node:crypto";

import { getAdminSupabase } from "../supabase/admin";
import { upsertNearbyForRun } from "@/owlseye/nearby/upsertNearbyForRun";

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

async function safeUpsert(
  table: string,
  payload: Record<string, any>,
  options?: { ignoreMissingColumns?: boolean }
): Promise<{ ok: boolean; message?: string }> {
  try {
    const supabase = getAdminSupabase();
    const attemptPayload = payload;
    const { error } = await supabase.from(table).upsert(attemptPayload);
    if (error) {
      if (options?.ignoreMissingColumns && error.code === "42P01") {
        // Table missing; allow caller to proceed.
        return { ok: true, message: "table_or_column_missing" };
      }
      if (error.code === "42703" || error.code === "PGRST204") {
        // Column mismatch: retry with sanitized payload (id instead of run_id, drop extras).
        const allowed = new Set([
          "id",
          "run_id",
          "venue_id",
          "sport",
          "status",
          "run_type",
          "started_at",
          "completed_at",
          "ttl_until",
          "inputs",
          "outputs",
          "cost_cents",
          "created_at",
        ]);
        const fallbackPayload: Record<string, any> = {};
        for (const [k, v] of Object.entries(payload)) {
          if (allowed.has(k)) fallbackPayload[k] = v;
        }
        // If run_id column is missing, rely on id.
        if ("run_id" in fallbackPayload) {
          fallbackPayload.id = fallbackPayload.id ?? fallbackPayload.run_id;
          delete fallbackPayload.run_id;
        }
        const retry = await supabase.from(table).upsert(fallbackPayload);
        if (!retry.error) {
          return { ok: true, message: "column_mismatch_sanitized" };
        }
      }
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

async function safeInsert(
  table: string,
  payloads: Record<string, any>[],
  options?: { ignoreMissingColumns?: boolean }
): Promise<{ ok: boolean; message?: string }> {
  try {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from(table).insert(payloads);
    if (error) {
      if (
        options?.ignoreMissingColumns &&
        (error.code === "42P01")
      ) {
        return { ok: true, message: "table_or_column_missing" };
      }
      if (error.code === "42703" || error.code === "PGRST204") {
        // Retry inserts mapping run_id -> id when column is missing.
        const mapped = payloads.map((p) =>
          "run_id" in p && !("id" in p) ? { ...p, id: p.run_id, run_id: undefined } : p
        );
        const retry = await supabase.from(table).insert(mapped);
        if (!retry.error) {
          return { ok: true, message: "run_id_column_missing" };
        }
      }
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

  const runResult = await safeUpsert(
    "owls_eye_runs",
    {
      id: runId,
      run_id: runId,
      venue_id: input.venueId,
      sport: input.sport,
      run_type: "manual",
      status: "running",
      error_message: null,
      started_at: startedAt,
      created_at: startedAt,
      updated_at: startedAt,
    },
    { ignoreMissingColumns: true }
  );
  if (!runResult.ok) {
    return { runId, status: "failed", message: runResult.message ?? "Could not record run" };
  }

  let failureMessage: string | null = null;

  if (input.sport === "soccer" && fieldMapUrl) {
    const mapInsert = await safeInsert(
      "owls_eye_map_artifacts",
      [
        {
          id: runId,
          run_id: runId,
          map_kind: "soccer_field_map",
          image_url: fieldMapUrl,
          created_at: startedAt,
        },
      ],
      { ignoreMissingColumns: true }
    );
    if (!mapInsert.ok && mapInsert.message) {
      failureMessage = failureMessage ?? mapInsert.message;
    }
  }

  // Nearby amenities (non-blocking)
  try {
    const supabase = getAdminSupabase();
    const venueResp = await supabase
      .from("venues" as any)
      .select("latitude,longitude")
      .eq("id", input.venueId)
      .maybeSingle();

    const lat = (venueResp.data as any)?.latitude ?? null;
    const lng = (venueResp.data as any)?.longitude ?? null;

    if (typeof lat === "number" && typeof lng === "number" && isFinite(lat) && isFinite(lng)) {
      const nearbyResult = (await upsertNearbyForRun({
        supabaseAdmin: supabase,
        runId,
        venueId: input.venueId,
        sport: input.sport,
        venueLat: lat,
        venueLng: lng,
      })) as any;
      if (nearbyResult && nearbyResult.ok === false) {
        console.warn("[owlseye] Nearby upsert result", nearbyResult);
      }
    }
  } catch (err) {
    console.error("[owlseye] Nearby fetch failed", err);
  }

  if (failureMessage) {
    await safeUpsert(
      "owls_eye_runs",
      {
        id: runId,
        run_id: runId,
        venue_id: input.venueId,
        sport: input.sport,
        run_type: "manual",
        status: "failed",
        error_message: failureMessage,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { ignoreMissingColumns: true }
    );
    return { runId, status: "failed", message: failureMessage };
  }

  const completed = await safeUpsert(
    "owls_eye_runs",
    {
      id: runId,
      run_id: runId,
      venue_id: input.venueId,
      sport: input.sport,
      run_type: "manual",
      status: "complete",
      error_message: null,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { ignoreMissingColumns: true }
  );

  if (!completed.ok) {
    return { runId, status: "failed", message: completed.message ?? "Run completion not recorded" };
  }

  return { runId, status: "complete" };
}
