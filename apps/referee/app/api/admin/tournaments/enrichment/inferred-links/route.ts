import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function ensureAdmin() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") return null;
  return data.user;
}

function clampInt(value: string | null, def: number, min: number, max: number) {
  const n = value == null ? def : Number(value);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export async function GET(request: Request) {
  const admin = await ensureAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = clampInt(searchParams.get("limit"), 50, 1, 200);
  const offset = clampInt(searchParams.get("offset"), 0, 0, 50_000);
  const only = (searchParams.get("only") ?? "1").trim(); // "1" = only inferred (no confirmed)

  const rpc =
    only === "0" ? "list_tournaments_with_inferred_venues" : "list_tournaments_with_only_inferred_venues";
  const { data: tournaments, error: rpcErr } = await supabaseAdmin.rpc(rpc as any, {
    p_limit: limit,
    p_offset: offset,
  });
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

  const tournamentRows = (tournaments ?? []) as Array<{
    tournament_id: string;
    name: string | null;
    city: string | null;
    state: string | null;
    sport: string | null;
    start_date: string | null;
  }>;

  const ids = tournamentRows.map((t) => t.tournament_id).filter(Boolean);
  if (!ids.length) return NextResponse.json({ ok: true, tournaments: [] });

  const { data: links, error: linksErr } = await supabaseAdmin
    .from("tournament_venues" as any)
    .select(
      "tournament_id,venue_id,is_inferred,is_primary,inference_confidence,inference_method,inferred_at,venues(id,name,address,city,state,zip,venue_url)"
    )
    .eq("is_inferred", true)
    .in("tournament_id", ids)
    .order("inference_confidence", { ascending: false, nullsFirst: false })
    .limit(5000);
  if (linksErr) return NextResponse.json({ error: linksErr.message }, { status: 500 });

  const byTournament = new Map<string, any[]>();
  for (const row of (links ?? []) as any[]) {
    const tid = String(row?.tournament_id ?? "");
    if (!tid) continue;
    const arr = byTournament.get(tid) ?? [];
    arr.push(row);
    byTournament.set(tid, arr);
  }

  const payload = tournamentRows.map((t) => ({
    ...t,
    inferred_venues: (byTournament.get(t.tournament_id) ?? []).map((tv: any) => ({
      tournament_id: tv.tournament_id,
      venue_id: tv.venue_id,
      inference_confidence: tv.inference_confidence ?? null,
      inference_method: tv.inference_method ?? null,
      inferred_at: tv.inferred_at ?? null,
      venue: tv.venues ?? null,
    })),
  }));

  return NextResponse.json({ ok: true, tournaments: payload });
}

