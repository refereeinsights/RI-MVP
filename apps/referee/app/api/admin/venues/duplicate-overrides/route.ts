import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

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

function sortPair(a: string, b: string) {
  return a < b ? { venueA: a, venueB: b } : { venueA: b, venueB: a };
}

export async function POST(request: Request) {
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

  const sourceVenueId = String(payload?.source_venue_id ?? "").trim();
  const targetVenueId = String(payload?.target_venue_id ?? "").trim();
  const note = typeof payload?.note === "string" ? payload.note.trim().slice(0, 500) : null;

  if (!isUuid(sourceVenueId) || !isUuid(targetVenueId) || sourceVenueId === targetVenueId) {
    return NextResponse.json({ error: "invalid_venue_pair" }, { status: 400 });
  }

  const { venueA, venueB } = sortPair(sourceVenueId, targetVenueId);

  const { data: existingRaw } = await supabaseAdmin
    .from("venue_duplicate_overrides" as any)
    .select("id")
    .eq("venue_a_id", venueA)
    .eq("venue_b_id", venueB)
    .maybeSingle();
  const existing = (existingRaw as { id?: string } | null) ?? null;

  const payloadRow = {
    venue_a_id: venueA,
    venue_b_id: venueB,
    status: "keep_both",
    note: note || null,
    created_by: adminUser.id,
  };

  const mutation = existing?.id
    ? await supabaseAdmin.from("venue_duplicate_overrides" as any).update(payloadRow).eq("id", existing.id)
    : await supabaseAdmin.from("venue_duplicate_overrides" as any).insert(payloadRow);

  const error = mutation.error;

  if (error) {
    return NextResponse.json({ error: error.message || "override_upsert_failed" }, { status: 500 });
  }

  // Best-effort: suppress Owl's Eye suspect pairs when the admin explicitly keeps both.
  try {
    await supabaseAdmin
      .from("owls_eye_venue_duplicate_suspects" as any)
      .update({ status: "ignored", note: note || "keep_both override" })
      .or(
        `and(source_venue_id.eq.${sourceVenueId},candidate_venue_id.eq.${targetVenueId}),and(source_venue_id.eq.${targetVenueId},candidate_venue_id.eq.${sourceVenueId})`
      );
  } catch {
    // ignore missing table
  }

  return NextResponse.json({ ok: true, source_venue_id: sourceVenueId, target_venue_id: targetVenueId, status: "keep_both" });
}
