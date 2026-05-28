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

function asBool(value: string | null) {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return null;
}

function asInt(value: string | null) {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseTypesParam(value: string | null) {
  if (!value) return null;
  const raw = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!raw.length) return null;
  const out: string[] = [];
  for (const t of raw) {
    if (!EVENT_TYPES.has(t as any)) return null;
    out.push(t);
  }
  return Array.from(new Set(out));
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

const DEFAULT_GET_LIMIT = 200;
const MAX_GET_LIMIT = 500;
const TRUNCATION_SCAN_CAP_ROWS = 1000;
const TRUNCATION_PAGE_SIZE = 250;

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

  const tournamentIdRaw = asString((body as any).tournament_id);
  const tournamentId = tournamentIdRaw && isUuid(tournamentIdRaw) ? tournamentIdRaw : null;
  if (tournamentIdRaw && !tournamentId) {
    return NextResponse.json({ ok: false, error: "invalid_tournament_id" }, { status: 400 });
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
      tournament_id: tournamentId,
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

  if (error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true, event: data });
}

export async function GET(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const userId = user.id;

  // Optional range/filter params for season reliability.
  // Semantics:
  // - `from` inclusive, `to` exclusive: starts_at >= from AND starts_at < to
  // - `includePast=false` excludes starts_at < now even if within [from,to)
  const sp = new URL(req.url).searchParams;

  const fromRaw = sp.get("from");
  const toRaw = sp.get("to");
  const typesRaw = sp.get("types");
  const limitRaw = sp.get("limit");
  const includePastRaw = sp.get("includePast");

  const from = fromRaw && isIsoDateTime(fromRaw) ? fromRaw : null;
  const to = toRaw && isIsoDateTime(toRaw) ? toRaw : null;
  const types = parseTypesParam(typesRaw);
  const includePast = asBool(includePastRaw) ?? false;
  const limit = Math.min(Math.max(asInt(limitRaw) ?? DEFAULT_GET_LIMIT, 1), MAX_GET_LIMIT);

  if ((fromRaw && !from) || (toRaw && !to)) {
    return NextResponse.json({ ok: false, error: "invalid_range" }, { status: 400 });
  }
  if (typesRaw && !types) {
    return NextResponse.json({ ok: false, error: "invalid_types" }, { status: 400 });
  }

  function buildBaseQuery() {
    let q = (supabase.from("planner_events" as any) as any)
      .select(
        "id,user_id,weekend_id,title,event_type,team_name,opponent_name,tournament_id,venue_id,field_label,address_text,city,state,starts_at,ends_at,timezone,notes,source_type,source_id,source_event_uid,created_at,updated_at"
      )
      .eq("user_id", userId);

    if (from) q = q.gte("starts_at", from);
    if (to) q = q.lt("starts_at", to);
    if (!includePast) q = q.gte("starts_at", new Date().toISOString());
    if (types?.length) q = q.in("event_type", types);
    return q;
  }

  async function filterSuppressed(events: any[]) {
    if (!events.length) return events;

    const icsEvents = events.filter((e) => String(e?.source_type ?? "") === "ics");
    const sourceIds = Array.from(new Set(icsEvents.map((e) => String(e?.source_id ?? "").trim()).filter(Boolean)));
    const sourceUids = Array.from(new Set(icsEvents.map((e) => String(e?.source_event_uid ?? "").trim()).filter(Boolean)));

    if (!sourceIds.length || !sourceUids.length) return events;

    const { data: suppressions, error: suppressError } = await (supabase.from("planner_event_suppressions" as any) as any)
      .select("source_id,source_event_uid")
      .eq("user_id", userId)
      .eq("reason", "merged_duplicate")
      .in("source_id", sourceIds)
      .in("source_event_uid", sourceUids)
      .limit(1000);

    if (suppressError) {
      // Fail open (show events) rather than breaking the planner on suppression read issues.
      return events;
    }

    const suppressedKeys = new Set(
      ((suppressions ?? []) as any[])
        .map((s) => `${String(s?.source_id ?? "").trim()}:${String(s?.source_event_uid ?? "").trim()}`)
        .filter((k) => !k.startsWith(":") && !k.endsWith(":"))
    );

    if (!suppressedKeys.size) return events;

    return events.filter((e) => {
      if (String(e?.source_type ?? "") !== "ics") return true;
      const sid = String(e?.source_id ?? "").trim();
      const uid = String(e?.source_event_uid ?? "").trim();
      if (!sid || !uid) return true;
      return !suppressedKeys.has(`${sid}:${uid}`);
    });
  }

  // Truncation-aware read:
  // - Keep the existing user-provided limit (bounded to MAX_GET_LIMIT).
  // - Scan bounded pages until we have limit+1 *visible* (non-suppressed) events OR hit a scan cap.
  const pageSize = Math.min(Math.max(TRUNCATION_PAGE_SIZE, limit + 1), MAX_GET_LIMIT);
  const visible: any[] = [];
  let scanned = 0;
  let offset = 0;
  let truncated = false;

  while (visible.length < limit + 1 && scanned < TRUNCATION_SCAN_CAP_ROWS) {
    const remainingScan = TRUNCATION_SCAN_CAP_ROWS - scanned;
    const thisPageSize = Math.min(pageSize, remainingScan);

    const { data, error } = await buildBaseQuery()
      .order("starts_at", { ascending: true })
      .range(offset, offset + thisPageSize - 1);

    if (error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });

    const page = (data ?? []) as any[];
    scanned += page.length;
    offset += page.length;

    if (!page.length) {
      truncated = false;
      break;
    }

    const filtered = await filterSuppressed(page);
    for (const e of filtered) {
      visible.push(e);
      if (visible.length >= limit + 1) break;
    }

    if (page.length < thisPageSize) {
      truncated = false;
      break;
    }
  }

  if (visible.length > limit) truncated = true;
  if (scanned >= TRUNCATION_SCAN_CAP_ROWS && visible.length <= limit) {
    // Hit scan cap before proving there are no more visible events.
    truncated = true;
  }

  return NextResponse.json({ ok: true, events: visible.slice(0, limit), truncated, limit });
}
