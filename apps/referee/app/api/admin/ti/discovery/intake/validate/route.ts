import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import {
  hostFromUrl,
  isHttpUrl,
  normalizeNameForDedupe,
  normalizeSport,
  normalizeStateUsps,
  todayUtcDateIso,
  tryNormalizeHttpUrl,
} from "@/lib/admin/tiDiscovery";

export const runtime = "nodejs";

type CandidateJson = {
  name: string;
  sport: string;
  start_date: string;
  end_date: string;
  city: string;
  state: string;
  venue?: string | null;
  organizer?: string | null;
  official_website_url?: string | null;
  source_url: string;
};

type Body = {
  discovery_search_id?: string | null;
  raw_paste: string;
  model?: string | null;
  provider?: string | null;
  generated_prompt?: string | null;
  actual_prompt_sent?: string | null;
};

function parseIsoDate(value: string) {
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) ? v : null;
}

export async function POST(req: Request) {
  await requireAdmin();

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });

  const rawPaste = String(body.raw_paste ?? "").trim();
  if (!rawPaste) return NextResponse.json({ ok: false, error: "raw_paste is required" }, { status: 400 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPaste);
  } catch {
    return NextResponse.json({ ok: false, error: "Paste must be a JSON array" }, { status: 400 });
  }

  if (!Array.isArray(parsed)) return NextResponse.json({ ok: false, error: "Paste must be a JSON array" }, { status: 400 });

  const todayUtc = todayUtcDateIso();
  const maxRows = 100;
  if (parsed.length > maxRows) {
    return NextResponse.json({ ok: false, error: `Paste exceeds hard cap (${maxRows})` }, { status: 400 });
  }

  const errors: Array<{ index: number; error: string }> = [];
  const rows: Array<any> = [];

  const seen = new Set<string>();
  for (let i = 0; i < parsed.length; i += 1) {
    const item = parsed[i] as CandidateJson;
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const sportRaw = typeof item?.sport === "string" ? item.sport.trim() : "";
    const city = typeof item?.city === "string" ? item.city.trim() : "";
    const stateRaw = typeof item?.state === "string" ? item.state.trim() : "";
    const startDateRaw = typeof item?.start_date === "string" ? item.start_date.trim() : "";
    const endDateRaw = typeof item?.end_date === "string" ? item.end_date.trim() : "";
    const sourceUrlRaw = typeof item?.source_url === "string" ? item.source_url.trim() : "";

    if (!name) {
      errors.push({ index: i, error: "Missing name" });
      continue;
    }
    const sport = normalizeSport(sportRaw);
    if (!sport) {
      errors.push({ index: i, error: "Invalid sport (must be in TI_SPORTS)" });
      continue;
    }
    if (!city) {
      errors.push({ index: i, error: "Missing city" });
      continue;
    }
    const state = normalizeStateUsps(stateRaw);
    if (!state) {
      errors.push({ index: i, error: "Invalid state (USPS 2-letter required)" });
      continue;
    }

    const startDate = parseIsoDate(startDateRaw);
    const endDate = parseIsoDate(endDateRaw);
    if (!startDate || !endDate) {
      errors.push({ index: i, error: "Invalid start_date/end_date (YYYY-MM-DD required)" });
      continue;
    }
    if (startDate > endDate) {
      errors.push({ index: i, error: "start_date must be <= end_date" });
      continue;
    }
    if (startDate < todayUtc) {
      errors.push({ index: i, error: `start_date must be >= ${todayUtc} (UTC)` });
      continue;
    }

    const sourceUrl = tryNormalizeHttpUrl(sourceUrlRaw);
    if (!sourceUrl || !isHttpUrl(sourceUrl)) {
      errors.push({ index: i, error: "Invalid source_url (http/https required)" });
      continue;
    }

    const officialWebsiteRaw = typeof item?.official_website_url === "string" ? item.official_website_url.trim() : "";
    const officialWebsiteUrl = officialWebsiteRaw ? tryNormalizeHttpUrl(officialWebsiteRaw) : null;
    if (officialWebsiteRaw && !officialWebsiteUrl) {
      errors.push({ index: i, error: "Invalid official_website_url" });
      continue;
    }

    const venueRaw = typeof item?.venue === "string" ? item.venue.trim() : "";
    const organizer = typeof item?.organizer === "string" ? item.organizer.trim() : "";

    const normalizedName = normalizeNameForDedupe(name);
    const sig = `${normalizedName}|${sport}|${state}|${startDate}`;
    if (seen.has(sig)) continue;
    seen.add(sig);

    rows.push({
      name,
      sport,
      start_date: startDate,
      end_date: endDate,
      city,
      state,
      venue_raw: venueRaw || null,
      organizer: organizer || null,
      official_website_url: officialWebsiteUrl,
      source_url: sourceUrl,
      normalized_name: normalizedName,
      source_domain: hostFromUrl(sourceUrl),
      raw_row_json: item,
    });
  }

  return NextResponse.json({
    ok: errors.length === 0,
    today_utc_date: todayUtc,
    rows_valid: rows.length,
    rows_total: parsed.length,
    errors,
    preview: rows.slice(0, 50),
  });
}

