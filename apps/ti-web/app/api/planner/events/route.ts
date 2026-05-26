import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { isUuid } from "@/lib/venues/isUuid";
import type { PlannerEventCreateBody } from "@/lib/planner/types";

export const runtime = "nodejs";

const EVENT_TYPES = new Set([
  "game",
  "practice",
  "travel",
  "hotel",
  "meal",
  "check_in",
  "referee_assignment",
  "other",
] as const);

function asString(value: unknown) {
  const s = String(value ?? "").trim();
  return s || null;
}

function isIsoDateTime(value: string) {
  const d = new Date(value);
  return Number.isFinite(d.getTime());
}

function clamp(value: string | null, maxLen: number) {
  if (!value) return null;
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

function normalizeState(value: string | null) {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (!v) return null;
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

function normalizeTimeZone(value: string | null) {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (v.length > 64) return null;
  try {
    // Validate IANA tz; throws RangeError on invalid values.
    new Intl.DateTimeFormat("en-US", { timeZone: v }).format(new Date());
    return v;
  } catch {
    return null;
  }
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
  if (!EVENT_TYPES.has(eventType as any)) {
    return NextResponse.json({ ok: false, error: "invalid_event_type" }, { status: 400 });
  }
  if (!startsAt || !isIsoDateTime(startsAt)) {
    return NextResponse.json({ ok: false, error: "starts_at_required" }, { status: 400 });
  }

  const endsAtRaw = asString((body as any).ends_at);
  const endsAt = endsAtRaw && isIsoDateTime(endsAtRaw) ? endsAtRaw : null;
  if (endsAt) {
    const startMs = new Date(startsAt).getTime();
    const endMs = new Date(endsAt).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
      return NextResponse.json({ ok: false, error: "ends_before_starts" }, { status: 400 });
    }
  }

  const timezone = normalizeTimeZone(asString((body as any).timezone));

  const venueIdRaw = asString((body as any).venue_id);
  const venueId = venueIdRaw && isUuid(venueIdRaw) ? venueIdRaw : null;
  if (venueIdRaw && !venueId) {
    return NextResponse.json({ ok: false, error: "invalid_venue_id" }, { status: 400 });
  }

  const addressText = clamp(asString((body as any).address_text), 200);
  const city = clamp(asString((body as any).city), 80);
  const state = normalizeState(asString((body as any).state));
  if ((body as any).state && !state) {
    return NextResponse.json({ ok: false, error: "invalid_state" }, { status: 400 });
  }
  const notes = clamp(asString((body as any).notes), 2000);

  const { data, error } = await (supabase.from("planner_events" as any) as any)
    .insert({
      user_id: user.id,
      title: clamp(title, 140),
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

export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { data, error } = await (supabase.from("planner_events" as any) as any)
    .select(
      "id,user_id,weekend_id,title,event_type,team_name,opponent_name,tournament_id,venue_id,field_label,address_text,city,state,starts_at,ends_at,timezone,notes,source_type,source_id,source_event_uid,created_at,updated_at"
    )
    .eq("user_id", user.id)
    .order("starts_at", { ascending: true })
    .limit(500);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, events: data ?? [] });
}
