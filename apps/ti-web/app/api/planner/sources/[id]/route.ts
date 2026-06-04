import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { parseOptionalPlannerProfileId, validatePlannerAssignment } from "@/lib/planner/assignmentServer";

export const runtime = "nodejs";

type PatchBody = {
  source_name?: unknown;
  sourceName?: unknown;
  label?: unknown;
  child_profile_id?: unknown;
  team_profile_id?: unknown;
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

  const childProfileInput = parseOptionalPlannerProfileId(body.child_profile_id);
  if (childProfileInput.invalid) {
    return NextResponse.json({ ok: false, error: "invalid_child_profile_id" }, { status: 400 });
  }

  const teamProfileInput = parseOptionalPlannerProfileId(body.team_profile_id);
  if (teamProfileInput.invalid) {
    return NextResponse.json({ ok: false, error: "invalid_team_profile_id" }, { status: 400 });
  }

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
  }

  const providedAssignmentField = childProfileInput.provided || teamProfileInput.provided;
  if (!providedAnyString && !providedAssignmentField) {
    return NextResponse.json({ ok: false, error: "missing_patch_fields" }, { status: 400 });
  }

  const { data: existing, error: existingError } = await (supabase.from("planner_event_sources" as any) as any)
    .select(
      "id,source_type,source_name,team_name,child_profile_id,team_profile_id,last_synced_at,sync_status,sync_error,created_at,updated_at"
    )
    .eq("id", sourceId)
    .eq("user_id", user.id)
    .eq("source_type", "ics")
    .maybeSingle();

  if (existingError) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const nextChildProfileId = childProfileInput.provided ? childProfileInput.value : (existing.child_profile_id ?? null);
  const nextTeamProfileId = teamProfileInput.provided ? teamProfileInput.value : (existing.team_profile_id ?? null);

  const assignmentValidation = await validatePlannerAssignment({
    supabase,
    userId: user.id,
    childProfileId: nextChildProfileId,
    teamProfileId: nextTeamProfileId,
  });

  if (!assignmentValidation.ok) {
    return NextResponse.json(
      { ok: false, error: assignmentValidation.error },
      { status: assignmentValidation.status }
    );
  }

  const patch: Record<string, unknown> = {};
  if (providedAnyString) patch.source_name = nextLabel;
  if (providedAssignmentField) {
    patch.child_profile_id = assignmentValidation.childProfileId;
    patch.team_profile_id = assignmentValidation.teamProfileId;
  }

  const { data, error } = await (supabase.from("planner_event_sources" as any) as any)
    .update(patch)
    .eq("id", sourceId)
    .eq("user_id", user.id)
    .eq("source_type", "ics")
    .select(
      "id,source_type,source_name,team_name,child_profile_id,team_profile_id,last_synced_at,sync_status,sync_error,created_at,updated_at"
    )
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, source: data });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const sourceId = String(id ?? "").trim();
  if (!sourceId) return NextResponse.json({ ok: false, error: "missing_source_id" }, { status: 400 });

  const { data: existing, error: fetchError } = await (supabase.from("planner_event_sources" as any) as any)
    .select("id")
    .eq("id", sourceId)
    .eq("user_id", user.id)
    .eq("source_type", "ics")
    .maybeSingle();

  if (fetchError) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const { error: disconnectError } = await (supabase.from("planner_event_sources" as any) as any)
    .update({
      source_type: "ics_disconnected",
      source_url: null,
      last_synced_at: null,
      sync_status: "disconnected",
      sync_error: null,
    })
    .eq("id", sourceId)
    .eq("user_id", user.id)
    .eq("source_type", "ics");

  if (disconnectError) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
