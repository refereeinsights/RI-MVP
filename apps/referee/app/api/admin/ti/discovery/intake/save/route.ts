import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  classifyCandidateConfidence,
  dateDiffDays,
  hostFromUrl,
  isHttpUrl,
  normalizeNameForDedupe,
  normalizeSport,
  normalizeStateUsps,
  tokenizeNormalizedName,
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
  notes?: string | null;
};

function parseIsoDate(value: string) {
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) ? v : null;
}

function addDays(dateIso: string, deltaDays: number) {
  const t = Date.parse(`${dateIso}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const next = new Date(t + deltaDays * 24 * 60 * 60 * 1000);
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function POST(req: Request) {
  const user = await requireAdmin();

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
  if (parsed.length > 100) return NextResponse.json({ ok: false, error: "Paste exceeds hard cap (100)" }, { status: 400 });

  const todayUtc = todayUtcDateIso();

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
    if (!name || !city) continue;

    const sport = normalizeSport(sportRaw);
    const state = normalizeStateUsps(stateRaw);
    const startDate = parseIsoDate(startDateRaw);
    const endDate = parseIsoDate(endDateRaw);
    const sourceUrl = tryNormalizeHttpUrl(sourceUrlRaw);
    if (!sport || !state || !startDate || !endDate || !sourceUrl || !isHttpUrl(sourceUrl)) continue;
    if (startDate > endDate) continue;
    if (startDate < todayUtc) continue;

    const officialWebsiteRaw = typeof item?.official_website_url === "string" ? item.official_website_url.trim() : "";
    const officialWebsiteUrl = officialWebsiteRaw ? tryNormalizeHttpUrl(officialWebsiteRaw) : null;

    const venueRaw = typeof item?.venue === "string" ? item.venue.trim() : "";
    const organizer = typeof item?.organizer === "string" ? item.organizer.trim() : "";

    const normalizedName = normalizeNameForDedupe(name);
    const sig = `${normalizedName}|${sport}|${state}|${startDate}`;
    if (seen.has(sig)) continue;
    seen.add(sig);

    const confidence = classifyCandidateConfidence({
      officialWebsiteUrl,
      sourceUrl,
      venueRaw: venueRaw || null,
      organizer: organizer || null,
    });

    rows.push({
      discovery_search_id: body.discovery_search_id ?? null,
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
      raw_row_json: item,
      source_domain: hostFromUrl(sourceUrl),
      normalized_name: normalizedName,
      confidence_label: confidence,
    });
  }

  if (rows.length === 0) return NextResponse.json({ ok: false, error: "No valid rows to save" }, { status: 400 });

  // Dedupe against tournaments (not canonical-only) and against prior candidates (import_status != rejected).
  // This is best-effort and intentionally conservative.
  const states = Array.from(new Set(rows.map((r) => r.state)));
  const sports = Array.from(new Set(rows.map((r) => r.sport)));
  const startDates = rows.map((r) => r.start_date).sort();
  const minStart = startDates[0];
  const maxStart = startDates[startDates.length - 1];
  const windowStart = addDays(minStart, -7) ?? minStart;
  const windowEnd = addDays(maxStart, 7) ?? maxStart;

  const [tRes, cRes] = await Promise.all([
    supabaseAdmin
      .from("tournaments" as any)
      .select("id,name,sport,state,start_date,source_url,official_website_url")
      .in("state", states)
      .in("sport", sports)
      .gte("start_date", windowStart)
      .lte("start_date", windowEnd)
      .limit(2000),
    supabaseAdmin
      .from("tournament_discovery_candidates" as any)
      .select("id,normalized_name,sport,state,start_date,source_url,official_website_url,import_status")
      .neq("import_status", "rejected")
      .in("state", states)
      .in("sport", sports)
      .gte("start_date", windowStart)
      .lte("start_date", windowEnd)
      .limit(5000),
  ]);

  const tournaments = ((tRes.data ?? []) as any[]).map((t) => ({
    id: String(t.id),
    normalized_name: normalizeNameForDedupe(String(t.name ?? "")),
    sport: String(t.sport ?? ""),
    state: String(t.state ?? ""),
    start_date: String(t.start_date ?? ""),
    source_url: (t.source_url as string | null) ?? null,
    official_website_url: (t.official_website_url as string | null) ?? null,
  }));
  const priorCandidates = ((cRes.data ?? []) as any[]).map((c) => ({
    id: String(c.id),
    normalized_name: String(c.normalized_name ?? ""),
    sport: String(c.sport ?? ""),
    state: String(c.state ?? ""),
    start_date: String(c.start_date ?? ""),
    source_url: (c.source_url as string | null) ?? null,
    official_website_url: (c.official_website_url as string | null) ?? null,
  }));

  function classifyAgainstTournaments(row: any) {
    const candidates = tournaments.filter((t) => t.sport === row.sport && t.state === row.state);
    let best: { status: string; targetId: string | null } = { status: "none", targetId: null };
    for (const t of candidates) {
      const diff = dateDiffDays(row.start_date, t.start_date);
      if (diff === null || diff > 7) continue;
      const urlMatch =
        (row.source_url && t.source_url && row.source_url === t.source_url) ||
        (row.official_website_url && t.official_website_url && row.official_website_url === t.official_website_url);
      if (urlMatch) return { status: "exact", targetId: t.id };
      if (row.normalized_name === t.normalized_name && diff <= 1) return { status: "exact", targetId: t.id };
      if (row.normalized_name === t.normalized_name) best = best.status === "exact" ? best : { status: "likely", targetId: t.id };
      else {
        const a = row.normalized_name;
        const b = t.normalized_name;
        const shorter = a.length <= b.length ? a : b;
        const longer = a.length <= b.length ? b : a;
        const shorterTokens = tokenizeNormalizedName(shorter);
        if (shorterTokens.length >= 3 && longer.includes(shorter)) {
          const shared = shorterTokens.filter((tok: string) => longer.split(" ").includes(tok)).length;
          if (shared >= 2) best = best.status === "none" ? { status: "possible", targetId: t.id } : best;
        }
      }
    }
    return best;
  }

  function matchPriorCandidate(row: any) {
    for (const c of priorCandidates) {
      if (c.sport !== row.sport || c.state !== row.state) continue;
      const diff = dateDiffDays(row.start_date, c.start_date);
      if (diff === null || diff > 7) continue;
      const urlMatch =
        (row.source_url && c.source_url && row.source_url === c.source_url) ||
        (row.official_website_url && c.official_website_url && row.official_website_url === c.official_website_url);
      if (urlMatch) return c.id;
      if (row.normalized_name === c.normalized_name && diff <= 7) return c.id;
    }
    return null;
  }

  for (const row of rows) {
    const classified = classifyAgainstTournaments(row);
    row.dedupe_status = classified.status;
    row.dedupe_target_tournament_id = classified.targetId;
    const seen = matchPriorCandidate(row);
    if (seen) {
      row.seen_before = true;
      row.seen_before_candidate_id = seen;
    }
  }

  const batchInsert: Record<string, any> = {
    created_by: user.id,
    discovery_search_id: body.discovery_search_id ?? null,
    raw_paste: rawPaste,
    model: body.model ?? null,
    provider: body.provider ?? "chatgpt",
    generated_prompt: body.generated_prompt ?? null,
    actual_prompt_sent: body.actual_prompt_sent ?? null,
    notes: body.notes ?? null,
  };

  const { data: batchRow, error: batchErr } = await supabaseAdmin
    .from("discovery_batches" as any)
    .insert(batchInsert)
    .select("id")
    .maybeSingle();
  const batch = batchRow as any;
  if (batchErr || !batch?.id) return NextResponse.json({ ok: false, error: batchErr?.message ?? "Failed to create batch" }, { status: 500 });

  const batchId = String(batch.id);
  const insertRows = rows.map((r) => ({ ...r, discovery_batch_id: batchId }));

  const { error: candErr } = await supabaseAdmin.from("tournament_discovery_candidates" as any).insert(insertRows);
  if (candErr) return NextResponse.json({ ok: false, error: candErr.message }, { status: 500 });

  // Best-effort update result_count/last_run
  if (body.discovery_search_id) {
    await supabaseAdmin
      .from("discovery_searches" as any)
      .update({
        result_count: rows.length,
        last_run_at: new Date().toISOString(),
        last_run_by: user.id,
      })
      .eq("id", body.discovery_search_id);
  }

  return NextResponse.json({ ok: true, batch_id: batchId, saved: rows.length });
}
