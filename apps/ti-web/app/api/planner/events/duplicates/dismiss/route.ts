import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { isUuid } from "@/lib/venues/isUuid";

export const runtime = "nodejs";

type Body = {
  event_id?: unknown;
  candidate_event_id?: unknown;
};

function asTrimmedString(value: unknown) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v || null;
}

function buildEventKey(e: any) {
  const sourceType = String(e?.source_type ?? "").trim();
  if (sourceType === "ics") {
    const sourceId = String(e?.source_id ?? "").trim();
    const uid = String(e?.source_event_uid ?? "").trim();
    if (!sourceId || !uid) return null;
    return `ics:${sourceId}:${uid}`;
  }
  // Manual key is stable by row id.
  const id = String(e?.id ?? "").trim();
  if (!id) return null;
  return `manual:${id}`;
}

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const eventId = asTrimmedString(body.event_id);
  const candidateId = asTrimmedString(body.candidate_event_id);

  if (!eventId || !candidateId) {
    return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });
  }
  if (!isUuid(eventId) || !isUuid(candidateId)) {
    return NextResponse.json({ ok: false, error: "invalid_ids" }, { status: 400 });
  }
  if (eventId === candidateId) {
    return NextResponse.json({ ok: false, error: "invalid_pair" }, { status: 400 });
  }

  const { data: rows, error: fetchError } = await (supabase.from("planner_events" as any) as any)
    .select("id,user_id,source_type,source_id,source_event_uid")
    .in("id", [eventId, candidateId])
    .eq("user_id", user.id)
    .limit(2);

  if (fetchError) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  if (!rows || rows.length !== 2) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const a = rows.find((r: any) => String(r?.id) === eventId);
  const b = rows.find((r: any) => String(r?.id) === candidateId);
  if (!a || !b) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const keyA = buildEventKey(a);
  const keyB = buildEventKey(b);
  if (!keyA || !keyB) {
    return NextResponse.json({ ok: false, error: "unsupported_event" }, { status: 400 });
  }

  const [pairKeyA, pairKeyB] = [keyA, keyB].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));

  const { error: insertError } = await (supabase.from("planner_event_duplicate_dismissals" as any) as any)
    .insert({
      user_id: user.id,
      pair_key_a: pairKeyA,
      pair_key_b: pairKeyB,
    })
    .select("id")
    .maybeSingle();

  // Unique constraint: ignore duplicates.
  if (insertError) {
    const code = String((insertError as any).code ?? "");
    if (code !== "23505") return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

