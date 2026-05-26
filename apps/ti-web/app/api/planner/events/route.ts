import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import type { PlannerEventCreateBody } from "@/lib/planner/types";

export const runtime = "nodejs";

function asString(value: unknown) {
  const s = String(value ?? "").trim();
  return s || null;
}

function isIsoDateTime(value: string) {
  const d = new Date(value);
  return Number.isFinite(d.getTime());
}

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as PlannerEventCreateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const title = asString((body as any).title);
  const eventType = asString((body as any).event_type);
  const startsAt = asString((body as any).starts_at);

  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  if (!eventType) return NextResponse.json({ ok: false, error: "event_type_required" }, { status: 400 });
  if (!startsAt || !isIsoDateTime(startsAt)) {
    return NextResponse.json({ ok: false, error: "starts_at_required" }, { status: 400 });
  }

  const endsAtRaw = asString((body as any).ends_at);
  const endsAt = endsAtRaw && isIsoDateTime(endsAtRaw) ? endsAtRaw : null;

  const timezone = asString((body as any).timezone);
  const venueId = asString((body as any).venue_id);
  const addressText = asString((body as any).address_text);
  const city = asString((body as any).city);
  const state = asString((body as any).state);
  const notes = asString((body as any).notes);

  const { data, error } = await (supabase.from("planner_events" as any) as any)
    .insert({
      user_id: user.id,
      title,
      event_type: eventType,
      starts_at: startsAt,
      ends_at: endsAt,
      timezone,
      venue_id: venueId,
      address_text: addressText,
      city,
      state,
      notes,
      source_type: "manual",
    })
    .select(
      "id,user_id,weekend_id,title,event_type,team_name,opponent_name,tournament_id,venue_id,field_label,address_text,city,state,starts_at,ends_at,timezone,notes,source_type,source_id,created_at,updated_at"
    )
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, event: data });
}

