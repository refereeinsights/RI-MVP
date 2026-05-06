import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  computeSearchKey,
  hashPrompt,
  normalizeSearchKeyPart,
  normalizeSport,
  normalizeStateUsps,
  type DiscoverySearchType,
} from "@/lib/admin/tiDiscovery";

export const runtime = "nodejs";

function asText(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

type UpsertBody = {
  id?: string | null;
  sport: string;
  state: string;
  metro?: string | null;
  venue_id?: string | null;
  organizer?: string | null;
  date_range_start: string;
  date_range_end: string;
  search_type: DiscoverySearchType;
  generated_prompt: string;
  actual_prompt_sent?: string | null;
  coverage_status?: "strong" | "weak" | "exhausted";
  last_run_model?: string | null;
  last_run_notes?: string | null;
};

export async function GET() {
  await requireAdmin();
  const { data, error } = await supabaseAdmin
    .from("discovery_searches" as any)
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(250);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: Request) {
  await requireAdmin();
  const body = (await req.json().catch(() => null)) as UpsertBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });

  const sport = normalizeSport(asText(body.sport));
  const state = normalizeStateUsps(asText(body.state));
  const dateRangeStart = asText(body.date_range_start);
  const dateRangeEnd = asText(body.date_range_end);
  const searchType = asText(body.search_type) as DiscoverySearchType;
  if (!sport || !state) return NextResponse.json({ ok: false, error: "Invalid sport/state" }, { status: 400 });
  if (!dateRangeStart || !dateRangeEnd) return NextResponse.json({ ok: false, error: "Missing date range" }, { status: 400 });
  if (!["metro", "venue", "organizer", "long_tail"].includes(searchType)) return NextResponse.json({ ok: false, error: "Invalid search_type" }, { status: 400 });

  const generatedPrompt = asText(body.generated_prompt);
  if (!generatedPrompt) return NextResponse.json({ ok: false, error: "generated_prompt is required" }, { status: 400 });

  const searchKey = computeSearchKey({
    sport,
    state,
    dateRangeStart,
    dateRangeEnd,
    searchType,
    metro: normalizeSearchKeyPart(body.metro ?? ""),
    venueId: asText(body.venue_id ?? "") || null,
    organizer: normalizeSearchKeyPart(body.organizer ?? ""),
  });

  const payload: Record<string, any> = {
    search_key: searchKey,
    sport,
    state,
    metro: asText(body.metro ?? "") || null,
    venue_id: asText(body.venue_id ?? "") || null,
    organizer: asText(body.organizer ?? "") || null,
    date_range_start: dateRangeStart,
    date_range_end: dateRangeEnd,
    search_type: searchType,
    generated_prompt: generatedPrompt,
    prompt_version: "v1",
    prompt_hash: hashPrompt(generatedPrompt),
    actual_prompt_sent: asText(body.actual_prompt_sent ?? "") || null,
    coverage_status: body.coverage_status ?? "weak",
    last_run_model: asText(body.last_run_model ?? "") || null,
    last_run_notes: asText(body.last_run_notes ?? "") || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("discovery_searches" as any)
    .upsert(payload, { onConflict: "search_key" })
    .select("id,search_key")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, row: data });
}

