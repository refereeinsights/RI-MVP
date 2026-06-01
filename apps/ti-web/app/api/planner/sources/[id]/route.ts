import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type PatchBody = {
  source_name?: unknown;
  sourceName?: unknown;
  label?: unknown;
};

function asSingleLineLabel(value: unknown) {
  if (typeof value !== "string") return null;
  const v = value.replace(/\s+/g, " ").trim();
  if (!v) return null;
  if (v.length > 140) return null;
  return v;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const sourceId = String(id ?? "").trim();
  if (!sourceId) return NextResponse.json({ ok: false, error: "missing_source_id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const nextLabel =
    asSingleLineLabel(body.source_name) ??
    asSingleLineLabel(body.sourceName) ??
    asSingleLineLabel(body.label) ??
    null;

  // If the client provided a string but it sanitizes to null (empty) we allow clearing.
  const providedAnyString =
    typeof body.source_name === "string" || typeof body.sourceName === "string" || typeof body.label === "string";
  if (providedAnyString && nextLabel === null) {
    // Clear label (set NULL) or reject overlong/invalid.
    const raw =
      typeof body.source_name === "string"
        ? body.source_name
        : typeof body.sourceName === "string"
          ? body.sourceName
          : typeof body.label === "string"
            ? body.label
            : "";
    const cleaned = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (cleaned.length > 140) {
      return NextResponse.json({ ok: false, error: "label_too_long" }, { status: 400 });
    }
  } else if (!providedAnyString) {
    return NextResponse.json({ ok: false, error: "missing_label" }, { status: 400 });
  }

  const { data, error } = await (supabase.from("planner_event_sources" as any) as any)
    .update({ source_name: nextLabel })
    .eq("id", sourceId)
    .eq("user_id", user.id)
    .eq("source_type", "ics")
    .select("id,source_type,source_name,team_name,last_synced_at,sync_status,sync_error,created_at,updated_at")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, source: data });
}

