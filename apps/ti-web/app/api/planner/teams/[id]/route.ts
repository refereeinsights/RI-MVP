import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import type { PlannerTeamUpdateBody } from "@/lib/planner/types";

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

function normalizeSport(value: string | null) {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || null;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const teamId = String(id ?? "").trim();
  if (!teamId) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as PlannerTeamUpdateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("display_name" in (body as any)) {
    const displayName = clamp(asString((body as any).display_name), 100);
    if (!displayName) return NextResponse.json({ ok: false, error: "display_name_required" }, { status: 400 });
    patch.display_name = displayName;
  }
  if ("sport" in (body as any)) {
    const sport = normalizeSport(clamp(asString((body as any).sport), 40));
    if (!sport) return NextResponse.json({ ok: false, error: "sport_required" }, { status: 400 });
    patch.sport = sport;
  }
  if ("season_label" in (body as any)) {
    patch.season_label = clamp(asString((body as any).season_label), 40);
  }
  if ("sort_order" in (body as any)) {
    const sortOrder = parseSortOrder((body as any).sort_order);
    if (sortOrder === null) return NextResponse.json({ ok: false, error: "invalid_sort_order" }, { status: 400 });
    patch.sort_order = sortOrder;
  }
  if ("is_archived" in (body as any)) {
    const archived = parseArchived((body as any).is_archived);
    if (archived === null) return NextResponse.json({ ok: false, error: "invalid_is_archived" }, { status: 400 });
    patch.is_archived = archived;
  }
  if ("child_id" in (body as any)) {
    const childId = asString((body as any).child_id);
    if (!childId) return NextResponse.json({ ok: false, error: "child_id_required" }, { status: 400 });
    const { data: child, error: childError } = await (supabase.from("planner_children" as any) as any)
      .select("id,is_archived")
      .eq("id", childId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (childError) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
    if (!child) return NextResponse.json({ ok: false, error: "child_not_found" }, { status: 404 });
    if (child.is_archived) return NextResponse.json({ ok: false, error: "child_is_archived" }, { status: 409 });
    patch.child_id = childId;
  }

  const { data, error } = await (supabase.from("planner_teams" as any) as any)
    .update(patch)
    .eq("id", teamId)
    .eq("user_id", user.id)
    .select("id,user_id,child_id,display_name,sport,season_label,sort_order,is_archived,created_at,updated_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true, team: data });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const teamId = String(id ?? "").trim();
  if (!teamId) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const { data: team, error: teamError } = await (supabase.from("planner_teams" as any) as any)
    .select("id,is_archived")
    .eq("id", teamId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (teamError) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  if (!team) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!team.is_archived) return NextResponse.json({ ok: false, error: "archive_first" }, { status: 409 });

  const { error } = await (supabase.from("planner_teams" as any) as any)
    .delete()
    .eq("id", teamId)
    .eq("user_id", user.id)
    .eq("is_archived", true);

  if (error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
