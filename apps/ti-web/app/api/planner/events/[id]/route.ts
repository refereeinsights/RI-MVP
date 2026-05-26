import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import type { PlannerEventUpdateBody } from "@/lib/planner/types";

export const runtime = "nodejs";

function asString(value: unknown) {
  const s = String(value ?? "").trim();
  return s || null;
}

function isIsoDateTime(value: string) {
  const d = new Date(value);
  return Number.isFinite(d.getTime());
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const eventId = String(id ?? "").trim();
  if (!eventId) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as PlannerEventUpdateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const patch: Record<string, unknown> = {};

  if ("title" in (body as any)) {
    const title = asString((body as any).title);
    if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
    patch.title = title;
  }

  if ("event_type" in (body as any)) {
    const eventType = asString((body as any).event_type);
    if (!eventType) return NextResponse.json({ ok: false, error: "event_type_required" }, { status: 400 });
    patch.event_type = eventType;
  }

  if ("starts_at" in (body as any)) {
    const startsAt = asString((body as any).starts_at);
    if (!startsAt || !isIsoDateTime(startsAt)) {
      return NextResponse.json({ ok: false, error: "starts_at_required" }, { status: 400 });
    }
    patch.starts_at = startsAt;
  }

  if ("ends_at" in (body as any)) {
    const endsAtRaw = asString((body as any).ends_at);
    patch.ends_at = endsAtRaw && isIsoDateTime(endsAtRaw) ? endsAtRaw : null;
  }

  if ("timezone" in (body as any)) patch.timezone = asString((body as any).timezone);
  if ("venue_id" in (body as any)) patch.venue_id = asString((body as any).venue_id);
  if ("address_text" in (body as any)) patch.address_text = asString((body as any).address_text);
  if ("city" in (body as any)) patch.city = asString((body as any).city);
  if ("state" in (body as any)) patch.state = asString((body as any).state);
  if ("notes" in (body as any)) patch.notes = asString((body as any).notes);

  const { data, error } = await (supabase.from("planner_events" as any) as any)
    .update(patch)
    .eq("id", eventId)
    .eq("user_id", user.id)
    .select(
      "id,user_id,weekend_id,title,event_type,team_name,opponent_name,tournament_id,venue_id,field_label,address_text,city,state,starts_at,ends_at,timezone,notes,source_type,source_id,created_at,updated_at"
    )
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, event: data });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const eventId = String(id ?? "").trim();
  if (!eventId) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const { error } = await (supabase.from("planner_events" as any) as any)
    .delete()
    .eq("id", eventId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

