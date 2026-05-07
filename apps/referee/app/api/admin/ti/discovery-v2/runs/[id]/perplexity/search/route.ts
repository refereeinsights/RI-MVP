import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildMasterCsv, parseDiscoveryV2CsvChunk, toCandidateInsert } from "@/lib/admin/tiDiscoveryV2Csv";

export const runtime = "nodejs";

type Body = {
  sport: string;
  state: string;
  date_start: string;
  date_end: string;
  future_only?: boolean;
  additional_context?: string;
};

const MAX_CONTEXT_CHARS = 300;
const MAX_TOURNAMENTS = 20;
const MAX_VENUES_PER_TOURNAMENT = 20;
const MAX_ROWS_ACCEPTED_PER_REQUEST = 200;
const PERPLEXITY_TIMEOUT_MS = 25_000;
const RESPONSE_CHAR_LIMIT = 250_000;
const RATE_LIMIT_WINDOW_MS = 30_000;

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTwoLetterState(value: string) {
  return /^[A-Z]{2}$/.test(value);
}

function isPlainHttpsUrl(value: string) {
  return /^https:\/\/\S+$/i.test(value);
}

function truncate(value: string, max: number) {
  const s = String(value ?? "");
  return s.length > max ? s.slice(0, max) : s;
}

function lastNonWhitespaceChar(s: string) {
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s[i];
    if (!c) continue;
    if (!/\s/.test(c)) return c;
  }
  return "";
}

function extractFirstJsonObject(text: string) {
  const raw = String(text ?? "");
  if (!raw.trim()) return null;
  const trimmed = raw.replace(/```(?:json)?/gi, "").trim();
  const start = trimmed.indexOf("{");
  if (start === -1) return null;
  const end = trimmed.lastIndexOf("}");
  if (end === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}

function looksLikePlaceholderVenue(name: string) {
  const v = String(name ?? "").trim().toLowerCase();
  if (!v) return true;
  const bad = [
    "tbd",
    "multiple locations",
    "various venues",
    "area gyms",
    "surrounding area",
    "portland area gyms",
    "surrounding area locations",
    "various locations",
  ];
  return bad.some((b) => v === b || v.includes(b));
}

function coerceCitations(value: unknown): string[] {
  const out: string[] = [];
  const pushUrl = (maybe: unknown) => {
    const s = String(maybe ?? "").trim();
    if (isPlainHttpsUrl(s)) out.push(s);
  };

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        pushUrl(item);
        continue;
      }
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        pushUrl(obj.url);
        pushUrl(obj.source_url);
        pushUrl(obj.href);
      }
    }
  }

  return Array.from(new Set(out));
}

function buildUserPrompt(input: { sport: string; state: string; dateStart: string; dateEnd: string; additionalContext?: string | null }) {
  const base = [
    `Find real upcoming youth ${input.sport} tournaments in ${input.state} from ${input.dateStart} to ${input.dateEnd}.`,
    "Return JSON only, no other text. Use schema below.",
    "",
    "Schema:",
    "{",
    '  "tournaments": [',
    "    {",
    '      "tournament_name": "string — full official name",',
    `      "sport": "${input.sport}",`,
    '      "city": "string — tournament city",',
    `      "state": "${input.state}",`,
    '      "start_date": "YYYY-MM-DD",',
    '      "end_date": "YYYY-MM-DD",',
    '      "official_website_url": "string or empty — plain https:// only",',
    '      "source_url": "string — REQUIRED — plain https:// only",',
    '      "host_org": "string or empty",',
    '      "venues": [',
    "        {",
    '          "venue_name": "string — specific facility name, no placeholders like TBD or Multiple Locations",',
    '          "venue_address": "string or empty — street address preferred when known",',
    '          "venue_city": "string",',
    '          "venue_state": "2-letter state code",',
    '          "venue_zip": "string or empty",',
    '          "venue_url": "string or empty — plain https:// only"',
    "        }",
    "      ]",
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- Only real verified tournaments (not leagues, clinics, weekly play, camps).",
    "- Dates must be YYYY-MM-DD.",
    "- One entry per tournament; multi-venue goes inside venues[].",
    "- Every venue must be specific; reject placeholders: TBD, Multiple Locations, Various Venues, Area Gyms, Surrounding Area, Portland Area Gyms, etc.",
    "- All URLs must be plain https:// strings (no markdown link format).",
    "- source_url required for every tournament.",
    `- Max ${MAX_TOURNAMENTS} tournaments.`,
  ].join("\n");

  const extra = (input.additionalContext ?? "").trim();
  if (!extra) return base;
  return `${base}\n\nAdditional search context: ${extra}`;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await ctx.params;
  const runId = String(id ?? "").trim();
  if (!runId) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });

  const sport = String(body.sport ?? "").trim().toLowerCase();
  const state = String(body.state ?? "").trim().toUpperCase();
  const dateStart = String(body.date_start ?? "").trim();
  const dateEnd = String(body.date_end ?? "").trim();
  const futureOnly = body.future_only !== false;

  if (!sport) return NextResponse.json({ ok: false, error: "sport is required" }, { status: 400 });
  if (!isTwoLetterState(state)) return NextResponse.json({ ok: false, error: "state must be 2-letter code" }, { status: 400 });
  if (!isIsoDate(dateStart) || !isIsoDate(dateEnd)) {
    return NextResponse.json({ ok: false, error: "date_start and date_end must be YYYY-MM-DD" }, { status: 400 });
  }
  if (dateStart > dateEnd) return NextResponse.json({ ok: false, error: "date_start must be <= date_end" }, { status: 400 });

  const additionalContext = body.additional_context != null ? String(body.additional_context) : "";
  const additionalContextTrimmed = additionalContext.trim();
  if (additionalContextTrimmed.length > MAX_CONTEXT_CHARS) {
    return NextResponse.json({ ok: false, error: "additional_context exceeds 300 characters" }, { status: 400 });
  }

  // Verify run is attachable (draft only).
  const { data: runRowData, error: runErr } = await supabaseAdmin
    .from("discovery_csv_runs" as any)
    .select("id,status")
    .eq("id", runId)
    .maybeSingle();
  if (runErr) return NextResponse.json({ ok: false, error: runErr.message }, { status: 500 });
  const runRow = runRowData as any;
  if (!runRow?.id) return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
  if (String(runRow?.status ?? "") !== "draft") {
    return NextResponse.json({ ok: false, error: "Run is not attachable in current status" }, { status: 409 });
  }

  // Rate limit: prevent repeated perplexity calls for this run within 30s (success or failure).
  const { data: recentData, error: recentErr } = await supabaseAdmin
    .from("discovery_csv_run_batches" as any)
    .select("created_at,discovery_batches(provider,created_at)")
    .eq("csv_run_id", runId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (recentErr) return NextResponse.json({ ok: false, error: recentErr.message }, { status: 500 });

  const now = Date.now();
  const recent = (recentData ?? []) as any[];
  const lastPerplexity = recent.find((r: any) => String(r?.discovery_batches?.provider ?? "") === "perplexity");
  const lastAt = lastPerplexity?.discovery_batches?.created_at ? Date.parse(String(lastPerplexity.discovery_batches.created_at)) : null;
  if (lastAt && Number.isFinite(lastAt) && now - lastAt < RATE_LIMIT_WINDOW_MS) {
    return NextResponse.json({ ok: false, error: "Rate limited: wait a moment before running Perplexity again." }, { status: 429 });
  }

  const apiKey = (process.env.PERPLEXITY_API_KEY ?? "").trim();
  if (!apiKey) return NextResponse.json({ ok: false, error: "Missing PERPLEXITY_API_KEY" }, { status: 500 });

  const systemPrompt =
    'You are a tournament research assistant. Search the web for real upcoming youth sports tournaments matching the user\'s query. Return ONLY valid JSON — no markdown, no explanation. Output a single JSON object with key "tournaments" containing an array. Each tournament must have all required fields.';
  const userPrompt = buildUserPrompt({ sport, state, dateStart, dateEnd, additionalContext: additionalContextTrimmed || null });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PERPLEXITY_TIMEOUT_MS);
  let perplexityJson: any = null;
  let rawContent = "";
  let citations: string[] = [];

  try {
    const resp = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        response_format: { type: "json_object" },
        max_tokens: 8000,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    perplexityJson = await resp.json().catch(() => null);
    if (!resp.ok) {
      const msg = String(perplexityJson?.error?.message ?? perplexityJson?.message ?? "Perplexity request failed");
      return NextResponse.json({ ok: false, error: msg }, { status: resp.status || 500 });
    }
  } catch (err: any) {
    const isAbort = err?.name === "AbortError";
    return NextResponse.json({ ok: false, error: isAbort ? "Perplexity request timed out. Try a narrower date range." : "Perplexity request failed." }, { status: isAbort ? 504 : 500 });
  } finally {
    clearTimeout(timeout);
  }

  citations = coerceCitations(perplexityJson?.citations);

  rawContent = String(perplexityJson?.choices?.[0]?.message?.content ?? "");
  if (rawContent.length > RESPONSE_CHAR_LIMIT) {
    return NextResponse.json({ ok: false, error: "Perplexity response too large. Try a narrower date range." }, { status: 400 });
  }

  // Always store the raw response JSON (as text) as a batch for auditability.
  // NOTE: For future master CSV rebuilds, we also persist the derived CSV payload in `notes`
  // (raw_paste stays raw JSON per spec).
  const rawPasteToStore = JSON.stringify(perplexityJson ?? {}, null, 2);
  const { data: batch, error: batchErr } = await supabaseAdmin
    .from("discovery_batches" as any)
    .insert({
      created_by: user.id,
      discovery_search_id: null,
      raw_paste: rawPasteToStore,
      provider: "perplexity",
      model: "sonar-pro",
      generated_prompt: userPrompt,
      actual_prompt_sent: userPrompt,
      notes: null,
    })
    .select("id")
    .single();
  if (batchErr) return NextResponse.json({ ok: false, error: batchErr.message }, { status: 500 });
  const batchId = String((batch as any).id);

  // Link batch to run even on parse failures (rate limit + audit).
  const { error: linkErr } = await supabaseAdmin.from("discovery_csv_run_batches" as any).insert({
    csv_run_id: runId,
    batch_id: batchId,
  });
  if (linkErr) {
    return NextResponse.json({ ok: false, batch_id: batchId, error: linkErr.message }, { status: 500 });
  }

  // Parse assistant content into JSON tournaments object.
  const extracted = extractFirstJsonObject(rawContent);
  if (!extracted) {
    await supabaseAdmin.from("discovery_batch_parse_log" as any).insert({
      batch_id: batchId,
      parse_status: "failed",
      error_summary: "No JSON object found in Perplexity response content.",
      warnings: null,
      row_count_detected: 0,
      row_count_accepted: 0,
    });
    return NextResponse.json({ ok: false, batch_id: batchId, error: "No JSON object found in Perplexity response." }, { status: 400 });
  }

  // Truncation guard (before JSON.parse).
  if (lastNonWhitespaceChar(extracted) !== "}") {
    await supabaseAdmin.from("discovery_batch_parse_log" as any).insert({
      batch_id: batchId,
      parse_status: "failed",
      error_summary: "Perplexity response was truncated. Try a narrower date range or reduce the number of expected results.",
      warnings: null,
      row_count_detected: 0,
      row_count_accepted: 0,
    });
    return NextResponse.json(
      {
        ok: false,
        batch_id: batchId,
        error: "Perplexity response was truncated. Try a narrower date range or reduce the number of expected results.",
      },
      { status: 400 }
    );
  }

  let parsedJson: any = null;
  try {
    parsedJson = JSON.parse(extracted);
  } catch {
    await supabaseAdmin.from("discovery_batch_parse_log" as any).insert({
      batch_id: batchId,
      parse_status: "failed",
      error_summary: "Invalid JSON returned by Perplexity.",
      warnings: null,
      row_count_detected: 0,
      row_count_accepted: 0,
    });
    return NextResponse.json({ ok: false, batch_id: batchId, error: "Invalid JSON returned by Perplexity." }, { status: 400 });
  }

  // Coerce tournaments array.
  let tournaments: any[] = [];
  if (Array.isArray(parsedJson)) {
    tournaments = parsedJson;
  } else if (parsedJson && typeof parsedJson === "object") {
    if (Array.isArray(parsedJson.tournaments)) tournaments = parsedJson.tournaments;
    else {
      const firstArrayKey = Object.keys(parsedJson).find((k) => Array.isArray((parsedJson as any)[k]));
      if (firstArrayKey) tournaments = (parsedJson as any)[firstArrayKey];
    }
  }

  if (!Array.isArray(tournaments) || tournaments.length === 0) {
    await supabaseAdmin.from("discovery_batch_parse_log" as any).insert({
      batch_id: batchId,
      parse_status: "failed",
      error_summary: "No tournaments array found in Perplexity JSON.",
      warnings: null,
      row_count_detected: 0,
      row_count_accepted: 0,
    });
    return NextResponse.json({ ok: false, batch_id: batchId, error: "No tournaments array found in Perplexity JSON." }, { status: 400 });
  }

  const warnings: string[] = [];
  const rows: any[] = [];
  let droppedNoValidVenues = 0;
  let trimmedVenues = 0;

  const tournamentsLimited = tournaments.slice(0, MAX_TOURNAMENTS);
  if (tournaments.length > MAX_TOURNAMENTS) warnings.push(`tournaments_trimmed:${tournaments.length - MAX_TOURNAMENTS}`);

  for (const t of tournamentsLimited) {
    const tournamentName = String(t?.tournament_name ?? "").trim();
    const tournamentSport = String(t?.sport ?? sport).trim().toLowerCase() || sport;
    const city = String(t?.city ?? "").trim();
    const st = String(t?.state ?? state).trim().toUpperCase() || state;
    const startDate = String(t?.start_date ?? "").trim();
    const endDate = String(t?.end_date ?? "").trim();
    const officialWebsiteUrl = String(t?.official_website_url ?? "").trim();
    const sourceUrl = String(t?.source_url ?? "").trim();
    const hostOrg = String(t?.host_org ?? "").trim();

    // Tournament-level minimal sanity (CSV parser will enforce more later).
    if (!tournamentName || !city || !isTwoLetterState(st) || !isIsoDate(startDate) || !isIsoDate(endDate) || !isPlainHttpsUrl(sourceUrl)) {
      warnings.push(`tournament_skipped_invalid:${truncate(tournamentName || sourceUrl || "unknown", 80)}`);
      continue;
    }

    const venuesRaw = Array.isArray(t?.venues) ? t.venues : [];
    const venuesFiltered = venuesRaw
      .map((v: any) => ({
        venue_name: String(v?.venue_name ?? "").trim(),
        venue_address: String(v?.venue_address ?? "").trim(),
        venue_city: String(v?.venue_city ?? "").trim(),
        venue_state: String(v?.venue_state ?? "").trim().toUpperCase(),
        venue_zip: String(v?.venue_zip ?? "").trim(),
        venue_url: String(v?.venue_url ?? "").trim(),
      }))
      .filter((v: any) => {
        if (!v.venue_name || !v.venue_city || !isTwoLetterState(v.venue_state)) return false;
        if (looksLikePlaceholderVenue(v.venue_name)) return false;
        return true;
      });

    if (venuesFiltered.length === 0) {
      droppedNoValidVenues += 1;
      continue;
    }

    const venuesLimited = venuesFiltered.slice(0, MAX_VENUES_PER_TOURNAMENT);
    if (venuesFiltered.length > MAX_VENUES_PER_TOURNAMENT) trimmedVenues += venuesFiltered.length - MAX_VENUES_PER_TOURNAMENT;

    for (const v of venuesLimited) {
      rows.push({
        tournament_name: tournamentName,
        sport: tournamentSport,
        city,
        state: st,
        start_date: startDate,
        end_date: endDate,
        official_website_url: officialWebsiteUrl && isPlainHttpsUrl(officialWebsiteUrl) ? officialWebsiteUrl : null,
        source_url: sourceUrl,
        host_org: hostOrg || null,
        tournament_director: null,
        tournament_director_email: null,
        referee_contact: null,
        referee_contact_email: null,
        venue_name: v.venue_name,
        venue_address: v.venue_address || null,
        venue_city: v.venue_city,
        venue_state: v.venue_state,
        venue_zip: v.venue_zip || null,
        venue_url: v.venue_url && isPlainHttpsUrl(v.venue_url) ? v.venue_url : null,
        venue_latitude: null,
        venue_longitude: null,
        confidence: null,
        notes: null,
      });
    }
  }

  if (droppedNoValidVenues > 0) warnings.push(`dropped_no_valid_venues:${droppedNoValidVenues}`);
  if (trimmedVenues > 0) warnings.push(`venues_trimmed:${trimmedVenues}`);

  if (rows.length > MAX_ROWS_ACCEPTED_PER_REQUEST) {
    await supabaseAdmin.from("discovery_batch_parse_log" as any).insert({
      batch_id: batchId,
      parse_status: "failed",
      error_summary: `Too many rows (${rows.length}). Narrow the date range.`,
      warnings: warnings.length ? warnings : null,
      row_count_detected: rows.length,
      row_count_accepted: 0,
    });
    return NextResponse.json({ ok: false, batch_id: batchId, error: "Too many rows. Narrow the date range." }, { status: 400 });
  }

  // Build CSV and re-parse with the exact same rules as manual paste.
  const csv = buildMasterCsv(rows as any).csv;
  const parsed = parseDiscoveryV2CsvChunk({ csvText: csv, futureOnly });
  if (parsed.ok === false) {
    await supabaseAdmin.from("discovery_batch_parse_log" as any).insert({
      batch_id: batchId,
      parse_status: "failed",
      error_summary: parsed.error,
      warnings: warnings.length ? warnings : null,
      row_count_detected: parsed.detected,
      row_count_accepted: 0,
    });
    return NextResponse.json({ ok: false, batch_id: batchId, error: parsed.error }, { status: 400 });
  }

  const mergedWarnings = [...warnings, ...(parsed.warnings ?? [])];

  // Persist the derived CSV for future master rebuilds (and to allow cross-batch merges).
  await supabaseAdmin
    .from("discovery_batches" as any)
    .update({ notes: `derived_csv\n${csv}` })
    .eq("id", batchId);

  await supabaseAdmin.from("discovery_batch_parse_log" as any).insert({
    batch_id: batchId,
    parse_status: "ok",
    error_summary: null,
    warnings: mergedWarnings.length ? mergedWarnings : null,
    row_count_detected: parsed.detected,
    row_count_accepted: parsed.rows.length,
  });

  // Save candidates for queue/review (reuses V1 candidates table).
  const candidateRows = parsed.rows.map((row) => toCandidateInsert({ batchId, row }));
  const { error: candErr } = await supabaseAdmin.from("tournament_discovery_candidates" as any).insert(candidateRows);
  if (candErr) {
    return NextResponse.json({ ok: false, batch_id: batchId, error: candErr.message }, { status: 500 });
  }

  // Rebuild master CSV by re-parsing all raw pastes in the run.
  const { data: joined, error: joinErr } = await supabaseAdmin
    .from("discovery_csv_run_batches" as any)
    .select("batch_id,discovery_batches(raw_paste)")
    .eq("csv_run_id", runId);
  if (joinErr) {
    return NextResponse.json({ ok: false, batch_id: batchId, error: joinErr.message }, { status: 500 });
  }

  const allRows: any[] = [];
  for (const r of joined ?? []) {
    const batchProvider = String((r as any).discovery_batches?.provider ?? "");
    const rawPaste = String((r as any).discovery_batches?.raw_paste ?? "");
    const notes = String((r as any).discovery_batches?.notes ?? "");
    const csvText =
      batchProvider === "perplexity" && notes.startsWith("derived_csv\n") ? notes.slice("derived_csv\n".length) : rawPaste;
    if (!csvText.trim().startsWith("tournament_name,")) continue;
    const parsedBatch = parseDiscoveryV2CsvChunk({ csvText, futureOnly });
    if (parsedBatch.ok) allRows.push(...parsedBatch.rows);
  }

  const master = buildMasterCsv(allRows as any);

  await supabaseAdmin
    .from("discovery_csv_runs" as any)
    .update({ master_csv: master.csv, master_csv_row_count: master.rowCount })
    .eq("id", runId);

  return NextResponse.json({
    ok: true,
    batch_id: batchId,
    accepted: parsed.rows.length,
    rejected: Math.max(0, parsed.detected - parsed.rows.length),
    warnings: mergedWarnings,
    master_csv_row_count: master.rowCount,
    perplexity_citations: citations,
  });
}
