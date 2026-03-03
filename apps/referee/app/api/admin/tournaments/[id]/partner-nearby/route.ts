import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

function sanitizeCategory(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  const canonical =
    normalized === "hotels" || normalized === "lodging"
      ? "hotel"
      : normalized
          .replace(/&/g, " and ")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .replace(/-{2,}/g, "-");
  return canonical || "food";
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

async function ensureTournamentExists(tournamentId: string) {
  const { data, error } = await supabaseAdmin.from("tournaments" as any).select("id").eq("id", tournamentId).maybeSingle();
  if (error) throw error;
  return Boolean((data as any)?.id);
}

async function ensureVenueLinkedToTournament(tournamentId: string, venueId: string) {
  const { data, error } = await supabaseAdmin
    .from("tournament_venues" as any)
    .select("tournament_id,venue_id")
    .eq("tournament_id", tournamentId)
    .eq("venue_id", venueId)
    .maybeSingle();
  if (error) throw error;
  return Boolean((data as any)?.venue_id);
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data, error } = await supabaseAdmin
      .from("tournament_partner_nearby" as any)
      .select("id,tournament_id,venue_id,category,name,address,maps_url,distance_meters,sponsor_click_url,sort_order,is_active,created_at,updated_at")
      .eq("tournament_id", params.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message || "partner_fetch_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, rows: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "partner_fetch_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = asTrimmed(payload?.name);
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
  const venueId = asTrimmed(payload?.venue_id);

  try {
    if (!(await ensureTournamentExists(params.id))) {
      return NextResponse.json({ error: "tournament_not_found" }, { status: 404 });
    }
    if (venueId && !(await ensureVenueLinkedToTournament(params.id, venueId))) {
      return NextResponse.json({ error: "venue_not_linked_to_tournament" }, { status: 400 });
    }

    const insertPayload = {
      id: randomUUID(),
      tournament_id: params.id,
      venue_id: venueId,
      category: sanitizeCategory(payload?.category),
      name,
      address: asTrimmed(payload?.address) ?? "",
      maps_url: asTrimmed(payload?.maps_url),
      distance_meters: asOptionalNumber(payload?.distance_meters),
      sponsor_click_url: asTrimmed(payload?.sponsor_click_url),
      sort_order: asOptionalNumber(payload?.sort_order) ?? 0,
      is_active: asOptionalBoolean(payload?.is_active) ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("tournament_partner_nearby" as any)
      .insert(insertPayload)
      .select("id,tournament_id,venue_id,category,name,address,maps_url,distance_meters,sponsor_click_url,sort_order,is_active,created_at,updated_at")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message || "partner_insert_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, row: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "partner_insert_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rowId = asTrimmed(payload?.id);
  if (!rowId) return NextResponse.json({ error: "id_required" }, { status: 400 });
  const venueId = asTrimmed(payload?.venue_id);

  try {
    if (venueId && !(await ensureVenueLinkedToTournament(params.id, venueId))) {
      return NextResponse.json({ error: "venue_not_linked_to_tournament" }, { status: 400 });
    }
    const updatePayload = {
      venue_id: venueId,
      category: sanitizeCategory(payload?.category),
      name: asTrimmed(payload?.name),
      address: asTrimmed(payload?.address) ?? "",
      maps_url: asTrimmed(payload?.maps_url),
      distance_meters: asOptionalNumber(payload?.distance_meters),
      sponsor_click_url: asTrimmed(payload?.sponsor_click_url),
      sort_order: asOptionalNumber(payload?.sort_order) ?? 0,
      is_active: asOptionalBoolean(payload?.is_active) ?? true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("tournament_partner_nearby" as any)
      .update(updatePayload)
      .eq("id", rowId)
      .eq("tournament_id", params.id)
      .select("id,tournament_id,venue_id,category,name,address,maps_url,distance_meters,sponsor_click_url,sort_order,is_active,created_at,updated_at")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message || "partner_update_failed" }, { status: 500 });
    if (!data) return NextResponse.json({ error: "partner_not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, row: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "partner_update_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rowId = asTrimmed(payload?.id);
  if (!rowId) return NextResponse.json({ error: "id_required" }, { status: 400 });

  try {
    const { error } = await supabaseAdmin
      .from("tournament_partner_nearby" as any)
      .delete()
      .eq("id", rowId)
      .eq("tournament_id", params.id);

    if (error) return NextResponse.json({ error: error.message || "partner_delete_failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "partner_delete_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
