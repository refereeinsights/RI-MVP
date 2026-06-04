import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import type { PlannerChildCreateBody, PlannerChildRow, PlannerChildWithTeamsRow, PlannerTeamRow } from "@/lib/planner/types";

export const runtime = "nodejs";

function asString(value: unknown) {
  const s = String(value ?? "").trim();
  return s || null;
}

function clamp(value: string | null, maxLen: number) {
  if (!value) return null;
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

function asBool(value: string | null) {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return null;
}

function parseSortOrder(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const out = Math.trunc(n);
  return out >= 0 ? out : null;
}

async function nextChildSortOrder(supabase: any, userId: string) {
  const { data } = await (supabase.from("planner_children" as any) as any)
    .select("sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const current = Number(data?.sort_order ?? -1);
  return Number.isFinite(current) ? Math.max(0, current + 1) : 0;
}

export async function GET(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const includeArchived = asBool(url.searchParams.get("include_archived")) === true;

  let childQuery = (supabase.from("planner_children" as any) as any)
    .select("id,user_id,display_name,sort_order,is_archived,created_at,updated_at")
    .eq("user_id", user.id)
    .order("is_archived", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (!includeArchived) childQuery = childQuery.eq("is_archived", false);
  const { data: childRows, error: childError } = await childQuery;
  if (childError) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });

  let teamQuery = (supabase.from("planner_teams" as any) as any)
    .select("id,user_id,child_id,display_name,sport,season_label,sort_order,is_archived,created_at,updated_at")
    .eq("user_id", user.id)
    .order("is_archived", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (!includeArchived) teamQuery = teamQuery.eq("is_archived", false);
  const { data: teamRows, error: teamError } = await teamQuery;
  if (teamError) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });

  const teamsByChild = new Map<string, PlannerTeamRow[]>();
  for (const team of (teamRows ?? []) as PlannerTeamRow[]) {
    const list = teamsByChild.get(team.child_id) ?? [];
    list.push(team);
    teamsByChild.set(team.child_id, list);
  }

  const children = ((childRows ?? []) as PlannerChildRow[]).map((child) => ({
    ...child,
    teams: teamsByChild.get(child.id) ?? [],
  })) satisfies PlannerChildWithTeamsRow[];

  return NextResponse.json({ ok: true, children });
}

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as PlannerChildCreateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const displayName = clamp(asString((body as any).display_name), 80);
  if (!displayName) return NextResponse.json({ ok: false, error: "display_name_required" }, { status: 400 });

  const parsedSortOrder = parseSortOrder((body as any).sort_order);
  const sortOrder = parsedSortOrder ?? (await nextChildSortOrder(supabase, user.id));

  const { data, error } = await (supabase.from("planner_children" as any) as any)
    .insert({
      user_id: user.id,
      display_name: displayName,
      sort_order: sortOrder,
      is_archived: false,
    })
    .select("id,user_id,display_name,sort_order,is_archived,created_at,updated_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true, child: data });
}
