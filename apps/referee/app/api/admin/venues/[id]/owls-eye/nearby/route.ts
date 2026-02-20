import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type OwlRunRow = {
  id?: string | null;
  run_id?: string | null;
  venue_id: string;
  sport?: string | null;
  status?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

async function ensureAdminRequest() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") return null;
  return data.user;
}

function sanitizeCategory(value: unknown): "food" | "coffee" | "hotel" {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "coffee") return "coffee";
  if (normalized === "hotel" || normalized === "hotels" || normalized === "lodging") return "hotel";
  return "food";
}

function asTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return null;
}

async function fetchLatestRun(venueId: string) {
  const primary = await supabaseAdmin
    .from("owls_eye_runs" as any)
    .select("id,run_id,venue_id,sport,status,updated_at,created_at")
    .eq("venue_id", venueId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<OwlRunRow>();

  if (!primary.error) return primary.data ?? null;

  if (primary.error.code === "42703" || primary.error.code === "PGRST204") {
    const fallback = await supabaseAdmin
      .from("owls_eye_runs" as any)
      .select("id,run_id,venue_id,sport,status,created_at")
      .eq("venue_id", venueId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<OwlRunRow>();
    return fallback.data ?? null;
  }

  throw primary.error;
}

async function ensureRunForVenue(venueId: string): Promise<{ runId: string; sport: string }> {
  const existing = await fetchLatestRun(venueId);
  if (existing) {
    return {
      runId: (existing.run_id ?? existing.id) as string,
      sport: existing.sport === "basketball" ? "basketball" : "soccer",
    };
  }

  const { data: venue } = await supabaseAdmin.from("venues" as any).select("sport").eq("id", venueId).maybeSingle();
  const venueSport = ((venue as any)?.sport ?? "").toLowerCase();
  const sport = venueSport === "basketball" ? "basketball" : "soccer";
  const runId = randomUUID();
  const nowIso = new Date().toISOString();

  const insertPayload = {
    id: runId,
    run_id: runId,
    venue_id: venueId,
    sport,
    run_type: "manual_override",
    status: "complete",
    created_at: nowIso,
    updated_at: nowIso,
    completed_at: nowIso,
  };
  const insertResp = await supabaseAdmin.from("owls_eye_runs" as any).upsert(insertPayload);
  if (insertResp.error && (insertResp.error.code === "42703" || insertResp.error.code === "PGRST204")) {
    const fallbackPayload = {
      id: runId,
      venue_id: venueId,
      sport,
      run_type: "manual_override",
      status: "complete",
      created_at: nowIso,
      completed_at: nowIso,
    };
    const fallbackResp = await supabaseAdmin.from("owls_eye_runs" as any).upsert(fallbackPayload);
    if (fallbackResp.error) throw fallbackResp.error;
  } else if (insertResp.error) {
    throw insertResp.error;
  }

  return { runId, sport };
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const run = await fetchLatestRun(params.id);
    if (!run) {
      return NextResponse.json({ ok: true, run_id: null, rows: [] });
    }

    const runId = (run.run_id ?? run.id) as string;
    const { data, error } = await supabaseAdmin
      .from("owls_eye_nearby_food" as any)
      .select("id,run_id,place_id,name,category,address,maps_url,distance_meters,is_sponsor,sponsor_click_url,created_at")
      .eq("run_id", runId)
      .order("is_sponsor", { ascending: false })
      .order("distance_meters", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message || "nearby_fetch_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, run_id: runId, rows: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "nearby_fetch_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = asTrimmed(payload?.name);
  if (!name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  try {
    const run = await ensureRunForVenue(params.id);
    const rowId = randomUUID();
    const insertPayload = {
      id: rowId,
      run_id: run.runId,
      place_id: asTrimmed(payload?.place_id) ?? `manual-${rowId}`,
      name,
      category: sanitizeCategory(payload?.category),
      address: asTrimmed(payload?.address) ?? "",
      maps_url: asTrimmed(payload?.maps_url),
      distance_meters: asOptionalNumber(payload?.distance_meters),
      is_sponsor: asOptionalBoolean(payload?.is_sponsor) ?? false,
      sponsor_click_url: asTrimmed(payload?.sponsor_click_url),
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("owls_eye_nearby_food" as any)
      .insert(insertPayload)
      .select("id,run_id,place_id,name,category,address,maps_url,distance_meters,is_sponsor,sponsor_click_url,created_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message || "nearby_insert_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, run_id: run.runId, row: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "nearby_insert_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rowId = asTrimmed(payload?.id);
  if (!rowId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 });
  }

  try {
    const run = await fetchLatestRun(params.id);
    const runId = ((run?.run_id ?? run?.id) as string | undefined) ?? EMPTY_UUID;

    const updatePayload: Record<string, any> = {
      name: asTrimmed(payload?.name),
      category: sanitizeCategory(payload?.category),
      address: asTrimmed(payload?.address) ?? "",
      maps_url: asTrimmed(payload?.maps_url),
      distance_meters: asOptionalNumber(payload?.distance_meters),
      is_sponsor: asOptionalBoolean(payload?.is_sponsor) ?? false,
      sponsor_click_url: asTrimmed(payload?.sponsor_click_url),
    };

    const { data, error } = await supabaseAdmin
      .from("owls_eye_nearby_food" as any)
      .update(updatePayload)
      .eq("id", rowId)
      .eq("run_id", runId)
      .select("id,run_id,place_id,name,category,address,maps_url,distance_meters,is_sponsor,sponsor_click_url,created_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message || "nearby_update_failed" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "nearby_not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, row: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "nearby_update_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rowId = asTrimmed(payload?.id);
  if (!rowId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 });
  }

  try {
    const run = await fetchLatestRun(params.id);
    const runId = ((run?.run_id ?? run?.id) as string | undefined) ?? EMPTY_UUID;

    const { error } = await supabaseAdmin
      .from("owls_eye_nearby_food" as any)
      .delete()
      .eq("id", rowId)
      .eq("run_id", runId);

    if (error) {
      return NextResponse.json({ error: error.message || "nearby_delete_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "nearby_delete_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
