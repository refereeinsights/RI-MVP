import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import type { PlannerTeamCreateBody } from "@/lib/planner/types";
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

function normalizeSport(value: string | null) {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || null;
}

async function nextTeamSortOrder(supabase: any, userId: string, childId: string) {
  const { data } = await (supabase.from("planner_teams" as any) as any)
    .select("sort_order")
    .eq("user_id", userId)
    .eq("child_id", childId)
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
  const childId = asString(url.searchParams.get("child_id"));
  const includeArchived = ["1", "true", "yes"].includes(String(url.searchParams.get("include_archived") ?? "").toLowerCase());

  let query = (supabase.from("planner_teams" as any) as any)
    .select("id,user_id,child_id,display_name,sport,season_label,sort_order,is_archived,created_at,updated_at")
    .eq("user_id", user.id)
    .order("is_archived", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (childId) query = query.eq("child_id", childId);
  if (!includeArchived) query = query.eq("is_archived", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true, teams: data ?? [] });
}

export async function POST(req: Request) {
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

  const body = (await req.json().catch(() => null)) as PlannerTeamCreateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const childId = asString((body as any).child_id);
  if (!childId) return NextResponse.json({ ok: false, error: "child_id_required" }, { status: 400 });

  const displayName = clamp(asString((body as any).display_name), 100);
  if (!displayName) return NextResponse.json({ ok: false, error: "display_name_required" }, { status: 400 });

  const sport = normalizeSport(clamp(asString((body as any).sport), 40));
  if (!sport) return NextResponse.json({ ok: false, error: "sport_required" }, { status: 400 });

  const seasonLabel = clamp(asString((body as any).season_label), 40);
  const parsedSortOrder = parseSortOrder((body as any).sort_order);

  const { data: child, error: childError } = await (supabase.from("planner_children" as any) as any)
    .select("id,is_archived")
    .eq("id", childId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (childError) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  if (!child) return NextResponse.json({ ok: false, error: "child_not_found" }, { status: 404 });
  if (child.is_archived) return NextResponse.json({ ok: false, error: "child_is_archived" }, { status: 409 });

  const { count: activeTeamCount, error: teamCountError } = await (supabase.from("planner_teams" as any) as any)
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_archived", false);
  if (teamCountError) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  if (typeof activeTeamCount === "number" && activeTeamCount >= 2) {
    return NextResponse.json({ ok: false, error: "team_cap_reached" }, { status: 409 });
  }

  const sortOrder = parsedSortOrder ?? (await nextTeamSortOrder(supabase, user.id, childId));

  const { data, error } = await (supabase.from("planner_teams" as any) as any)
    .insert({
      user_id: user.id,
      child_id: childId,
      display_name: displayName,
      sport,
      season_label: seasonLabel,
      sort_order: sortOrder,
      is_archived: false,
    })
    .select("id,user_id,child_id,display_name,sport,season_label,sort_order,is_archived,created_at,updated_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true, team: data });
}
