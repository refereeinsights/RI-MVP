import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTiTierServer } from "@/lib/entitlementsServer";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const tierInfo = await getTiTierServer(user);
  if (tierInfo.unverified || tierInfo.tier === "explorer") {
    if (tierInfo.unverified) {
      return NextResponse.json({ ok: false, error: "email_verification_required" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const eventId = String(id ?? "").trim();
  if (!eventId) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const { data: existing, error: fetchError } = await (supabase.from("planner_events" as any) as any)
    .select(
      "id,user_id,weekend_id,title,event_type,team_name,opponent_name,tournament_id,venue_id,field_label,address_text,city,state,starts_at,ends_at,timezone,notes,source_type,source_id,source_event_uid"
    )
    .eq("id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  if (String((existing as any).source_type ?? "") !== "manual") {
    return NextResponse.json({ ok: false, error: "Only manual events can be duplicated right now." }, { status: 400 });
  }

  const payload = {
    user_id: user.id,
    title: (existing as any).title,
    event_type: (existing as any).event_type,
    team_name: (existing as any).team_name ?? null,
    opponent_name: (existing as any).opponent_name ?? null,
    tournament_id: (existing as any).tournament_id ?? null,
    venue_id: (existing as any).venue_id ?? null,
    field_label: (existing as any).field_label ?? null,
    address_text: (existing as any).address_text ?? null,
    city: (existing as any).city ?? null,
    state: (existing as any).state ?? null,
    starts_at: (existing as any).starts_at,
    ends_at: (existing as any).ends_at ?? null,
    timezone: (existing as any).timezone ?? null,
    notes: (existing as any).notes ?? null,
    source_type: "manual",
    source_id: null,
    source_event_uid: null,
  };

  const { data: created, error: insertError } = await (supabase.from("planner_events" as any) as any)
    .insert(payload)
    .select(
      "id,user_id,weekend_id,title,event_type,team_name,opponent_name,tournament_id,venue_id,field_label,address_text,city,state,starts_at,ends_at,timezone,notes,source_type,source_id,source_event_uid,created_at,updated_at"
    )
    .single();

  if (insertError) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true, event: created });
}
