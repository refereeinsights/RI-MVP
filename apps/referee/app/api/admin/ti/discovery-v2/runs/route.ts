import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type CreateBody = {
  sport: string;
  state: string;
  date_range_start: string;
  date_range_end: string;
  run_mode?: "state_sport_window" | "venue_focus" | "organizer_focus";
  notes?: string | null;
};

function normalizeKeyPart(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export async function POST(req: Request) {
  const user = await requireAdmin();

  const body = (await req.json().catch(() => null)) as CreateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });

  const sport = normalizeKeyPart(body.sport);
  const state = normalizeKeyPart(body.state).toUpperCase();
  const dateStart = String(body.date_range_start ?? "").trim();
  const dateEnd = String(body.date_range_end ?? "").trim();
  const runMode = body.run_mode ?? "state_sport_window";
  const notes = body.notes ? String(body.notes).trim() : null;

  if (!sport || !state || !dateStart || !dateEnd) {
    return NextResponse.json({ ok: false, error: "sport, state, date_range_start, date_range_end are required" }, { status: 400 });
  }

  const searchKey = [sport, state, dateStart, dateEnd, runMode].map((p) => p || "").join("|");

  const { data, error } = await supabaseAdmin
    .from("discovery_csv_runs" as any)
    .insert({
      created_by: user.id,
      sport,
      state,
      date_range_start: dateStart,
      date_range_end: dateEnd,
      run_mode: runMode,
      status: "draft",
      search_key: searchKey,
      notes,
    })
    .select("id,sport,state,date_range_start,date_range_end,run_mode,status,master_csv_row_count,created_at")
    .single();

  if (error) {
    if ((error as any).code === "23505") {
      // Duplicate — return the existing run so the client can select it without a separate lookup.
      const { data: existing } = await supabaseAdmin
        .from("discovery_csv_runs" as any)
        .select("id,sport,state,date_range_start,date_range_end,run_mode,status,master_csv_row_count,created_at")
        .eq("search_key", searchKey)
        .single();
      if (existing) return NextResponse.json({ ok: true, run: existing, existing: true });
    }
    return NextResponse.json({ ok: false, error: error.message, code: (error as any).code ?? null }, { status: 400 });
  }

  return NextResponse.json({ ok: true, run: data });
}

export async function GET() {
  await requireAdmin();
  const { data, error } = await supabaseAdmin
    .from("discovery_csv_runs" as any)
    .select("id,sport,state,date_range_start,date_range_end,run_mode,status,master_csv_row_count,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, runs: data ?? [] });
}

