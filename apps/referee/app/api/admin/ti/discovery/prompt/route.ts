import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import {
  buildDiscoveryPrompt,
  computeSearchKey,
  hashPrompt,
  normalizeSearchKeyPart,
  normalizeSport,
  normalizeStateUsps,
  todayUtcDateIso,
  type DiscoverySearchType,
} from "@/lib/admin/tiDiscovery";

export const runtime = "nodejs";

type Body = {
  sport: string;
  state: string;
  date_range_start: string;
  date_range_end: string;
  search_type: DiscoverySearchType;
  metro?: string | null;
  organizer?: string | null;
  venue_name?: string | null;
  venue_city?: string | null;
  venue_state?: string | null;
  venue_id?: string | null;
};

function asText(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  await requireAdmin();

  const json = (await req.json().catch(() => null)) as Body | null;
  if (!json) return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });

  const sportRaw = asText(json.sport);
  const stateRaw = asText(json.state);
  const dateRangeStart = asText(json.date_range_start);
  const dateRangeEnd = asText(json.date_range_end);
  const searchType = asText(json.search_type) as DiscoverySearchType;

  const sport = normalizeSport(sportRaw);
  if (!sport) return NextResponse.json({ ok: false, error: "Invalid sport" }, { status: 400 });

  const state = normalizeStateUsps(stateRaw);
  if (!state) return NextResponse.json({ ok: false, error: "Invalid state" }, { status: 400 });

  if (!dateRangeStart || !dateRangeEnd) {
    return NextResponse.json({ ok: false, error: "date_range_start and date_range_end are required" }, { status: 400 });
  }

  if (!["metro", "venue", "organizer", "long_tail"].includes(searchType)) {
    return NextResponse.json({ ok: false, error: "Invalid search_type" }, { status: 400 });
  }

  const prompt = buildDiscoveryPrompt({
    sport,
    state,
    dateRangeStart,
    dateRangeEnd,
    metro: asText(json.metro ?? "") || null,
    organizer: asText(json.organizer ?? "") || null,
    venueName: asText(json.venue_name ?? "") || null,
    venueCity: asText(json.venue_city ?? "") || null,
    venueState: asText(json.venue_state ?? "") || null,
  });

  const searchKey = computeSearchKey({
    sport,
    state,
    dateRangeStart,
    dateRangeEnd,
    searchType,
    metro: normalizeSearchKeyPart(json.metro ?? ""),
    venueId: asText(json.venue_id ?? "") || null,
    organizer: normalizeSearchKeyPart(json.organizer ?? ""),
  });

  return NextResponse.json({
    ok: true,
    today_utc_date: todayUtcDateIso(),
    sport,
    state,
    search_key: searchKey,
    prompt_version: "v1",
    prompt_hash: hashPrompt(prompt),
    generated_prompt: prompt,
  });
}

