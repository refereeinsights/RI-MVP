import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function ensureAdminRequest() {
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
  const adminUser = await ensureAdminRequest();
  if (!adminUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = clampInt(searchParams.get("limit_per_tournament"), 3, 1, 10);

  const { data: rows, error: rpcErr } = await (supabaseAdmin as any).rpc("apply_inferred_venue_candidates_for_drafts", {
    limit_per_tournament: limit,
    dry_run: true,
  });
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

  const candidates = (rows ?? []) as Array<{
    tournament_id: string;
    venue_id: string;
    confidence_score: string | number;
    inference_method: string;
    rank_inference: number;
    wrote: boolean;
    existing_link_type: "none" | "inferred" | "confirmed";
  }>;

  const tournamentIds = Array.from(new Set(candidates.map((r) => r.tournament_id).filter(Boolean)));
  const venueIds = Array.from(new Set(candidates.map((r) => r.venue_id).filter(Boolean)));

  const { data: tournaments, error: tErr } = tournamentIds.length
    ? await supabaseAdmin
        .from("tournaments" as any)
        .select("id,name,city,state,sport,start_date,updated_at,venue,address,source_url,official_website_url")
        .in("id", tournamentIds)
    : { data: [], error: null };
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  const { data: venues, error: vErr } = venueIds.length
    ? await supabaseAdmin.from("venues" as any).select("id,name,address,city,state,zip,venue_url").in("id", venueIds)
    : { data: [], error: null };
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

  const tournamentById = new Map<string, any>();
  for (const t of (tournaments ?? []) as any[]) tournamentById.set(String(t.id), t);
  const venueById = new Map<string, any>();
  for (const v of (venues ?? []) as any[]) venueById.set(String(v.id), v);

  const grouped = new Map<string, any>();
  for (const row of candidates) {
    const tid = row.tournament_id;
    if (!tid) continue;
    const entry =
      grouped.get(tid) ??
      ({
        tournament: tournamentById.get(tid) ?? { id: tid },
        candidates: [],
      } as any);
    entry.candidates.push({
      ...row,
      venue: venueById.get(row.venue_id) ?? { id: row.venue_id },
    });
    grouped.set(tid, entry);
  }

  const payload = Array.from(grouped.values()).sort((a, b) => {
    const au = Date.parse(String(a?.tournament?.updated_at ?? "")) || 0;
    const bu = Date.parse(String(b?.tournament?.updated_at ?? "")) || 0;
    return bu - au;
  });

  return NextResponse.json({ ok: true, limit_per_tournament: limit, items: payload });
}

export async function POST(request: Request) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const limit = clampInt(String(body?.limit_per_tournament ?? "3"), 3, 1, 10);
  const dryRun = typeof body?.dry_run === "boolean" ? body.dry_run : true;

  const { data: rows, error: rpcErr } = await (supabaseAdmin as any).rpc("apply_inferred_venue_candidates_for_drafts", {
    limit_per_tournament: limit,
    dry_run: dryRun,
  });
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, dry_run: dryRun, rows: rows ?? [] });
}

