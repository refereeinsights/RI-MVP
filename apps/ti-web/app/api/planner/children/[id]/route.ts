import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import type { PlannerChildUpdateBody } from "@/lib/planner/types";
import { isValidFamilyColorOption } from "@/lib/planner/familyColors";
import { getTiTierServer } from "@/lib/entitlementsServer";

export const runtime = "nodejs";

function asString(value: unknown) {
  const s = String(value ?? "").trim();
  return s || null;
}

function clamp(value: string | null, maxLen: number) {
  if (!value) return null;
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

function parseSortOrder(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const out = Math.trunc(n);
  return out >= 0 ? out : null;
}

function parseArchived(value: unknown) {
  if (typeof value === "boolean") return value;
  return null;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
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
  const childId = String(id ?? "").trim();
  if (!childId) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as PlannerChildUpdateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("display_name" in (body as any)) {
    const displayName = clamp(asString((body as any).display_name), 80);
    if (!displayName) return NextResponse.json({ ok: false, error: "display_name_required" }, { status: 400 });
    patch.display_name = displayName;
  }

  if ("color_token" in (body as any)) {
    const colorToken = asString((body as any).color_token);
    if (colorToken && !isValidFamilyColorOption(colorToken)) {
      return NextResponse.json({ ok: false, error: "invalid_color_token" }, { status: 400 });
    }
    patch.color_token = colorToken;
  }

  if ("sort_order" in (body as any)) {
    const sortOrder = parseSortOrder((body as any).sort_order);
    if (sortOrder === null) return NextResponse.json({ ok: false, error: "invalid_sort_order" }, { status: 400 });
    patch.sort_order = sortOrder;
  }

  let archiveTeams = false;
  if ("is_archived" in (body as any)) {
    const archived = parseArchived((body as any).is_archived);
    if (archived === null) return NextResponse.json({ ok: false, error: "invalid_is_archived" }, { status: 400 });
    patch.is_archived = archived;
    archiveTeams = archived;
  }

  const { data, error } = await (supabase.from("planner_children" as any) as any)
    .update(patch)
    .eq("id", childId)
    .eq("user_id", user.id)
    .select("id,user_id,display_name,color_token,sort_order,is_archived,created_at,updated_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });

  if (archiveTeams) {
    await (supabase.from("planner_teams" as any) as any)
      .update({ is_archived: true })
      .eq("child_id", childId)
      .eq("user_id", user.id)
      .eq("is_archived", false);
  }

  return NextResponse.json({ ok: true, child: data });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
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
  const childId = String(id ?? "").trim();
  if (!childId) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const { data: child, error: childError } = await (supabase.from("planner_children" as any) as any)
    .select("id,is_archived")
    .eq("id", childId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (childError) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  if (!child) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!child.is_archived) return NextResponse.json({ ok: false, error: "archive_first" }, { status: 409 });

  const { count, error: teamCountError } = await (supabase.from("planner_teams" as any) as any)
    .select("id", { count: "exact", head: true })
    .eq("child_id", childId)
    .eq("user_id", user.id);

  if (teamCountError) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  if ((count ?? 0) > 0) return NextResponse.json({ ok: false, error: "child_has_teams" }, { status: 409 });

  const { error } = await (supabase.from("planner_children" as any) as any)
    .delete()
    .eq("id", childId)
    .eq("user_id", user.id)
    .eq("is_archived", true);

  if (error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
