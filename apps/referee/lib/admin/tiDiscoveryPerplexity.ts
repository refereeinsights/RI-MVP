import { buildMasterCsv, parseDiscoveryV2CsvChunk, toCandidateInsert } from "@/lib/admin/tiDiscoveryV2Csv";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { trackExternalCall, EXTERNAL_API, EXTERNAL_API_SURFACE } from "@/lib/trackExternalCall";

// Dominant registration/tournament platforms by sport — injected into search prompts
// so Perplexity targets the right sites before falling back to generic search.
const SPORT_PLATFORMS: Record<string, string[]> = {
  basketball: ["basketball.exposureevents.com", "grassroots365.com", "hoopsourcebasketball.com", "aausports.org"],
  softball:   ["softballconnected.com", "usssa.com", "advancedeventsystems.com", "toptiersports.net"],
  baseball:   ["usssa.com", "perfectgame.org", "toptiersports.net"],
  soccer:     ["usclubsoccer.org", "gotsport.com", "soccerwire.com", "state soccer association sites"],
  lacrosse:   ["victoryeventseries.com", "uslaxevents.com", "mylacrossetournaments.com"],
  hockey:     ["myhockeytournaments.com", "usahockey.com district sites"],
  volleyball: ["advancedeventsystems.com", "aausports.org", "usav.org region sites"],
  wrestling:  ["themat.com state sites", "sportsengine.com"],
  swimming:   ["usaswimming.org LSC sites"],
  track:      ["usatf.org region sites", "milesplit.com"],
};

const MAX_CONTEXT_CHARS = 300;
const MAX_TOURNAMENTS = 20;
const MAX_VENUES_PER_TOURNAMENT = 20;
const MAX_ROWS_ACCEPTED_PER_REQUEST = 200;
const PERPLEXITY_TIMEOUT_MS = 90_000;
const RESPONSE_CHAR_LIMIT = 250_000;
const RATE_LIMIT_WINDOW_MS = 30_000;

export class HttpError extends Error {
  status: number;
  payload?: any;
  constructor(status: number, message: string, payload?: any) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTwoLetterState(value: string) {
  return /^[A-Z]{2}$/.test(value);
}

function bestEffortState2(value: string, fallback: string) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (isTwoLetterState(raw)) return raw;
  const m = raw.match(/\b([A-Z]{2})\b/);
  if (m?.[1] && isTwoLetterState(m[1])) return m[1];
  return fallback;
}

function isPlainHttpsUrl(value: string) {
  return /^https:\/\/\S+$/i.test(value);
}

function bestEffortNormalizeHttpsUrl(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/https:\/\/[^\s)\],"]+/i);
  const candidate = match?.[0] ? match[0] : raw;
  let cleaned = candidate.trim();
  cleaned = cleaned.replace(/[),.;\]]+$/g, "");
  try {
    const normalized = new URL(cleaned).toString();
    return normalized.startsWith("https://") ? normalized : null;
  } catch {
    return null;
  }
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

function parseDebugSnapshot(args: { rawContent: string; extracted: string | null; parsedJson: unknown; citations: string[] }) {
  const topLevelType = Array.isArray(args.parsedJson)
    ? "array"
    : args.parsedJson === null
    ? "null"
    : typeof args.parsedJson;

  const topLevelKeys =
    args.parsedJson && typeof args.parsedJson === "object" && !Array.isArray(args.parsedJson)
      ? Object.keys(args.parsedJson as any).slice(0, 25)
      : [];

  const arrayKeysFound: string[] =
    args.parsedJson && typeof args.parsedJson === "object" && !Array.isArray(args.parsedJson)
      ? Object.keys(args.parsedJson as any)
          .filter((k) => Array.isArray((args.parsedJson as any)[k]))
          .slice(0, 25)
      : [];

  const tournamentsDetected = (() => {
    if (Array.isArray(args.parsedJson)) return args.parsedJson.length;
    if (args.parsedJson && typeof args.parsedJson === "object") {
      const t = (args.parsedJson as any).tournaments;
      if (Array.isArray(t)) return t.length;
    }
    return 0;
  })();

  const firstTournamentKeys = (() => {
    const getFirst = () => {
      if (Array.isArray(args.parsedJson)) return args.parsedJson[0];
      if (args.parsedJson && typeof args.parsedJson === "object") {
        const t = (args.parsedJson as any).tournaments;
        if (Array.isArray(t)) return t[0];
      }
      return null;
    };
    const first = getFirst();
    if (!first || typeof first !== "object") return [];
    return Object.keys(first as any).slice(0, 25);
  })();

  // Extract the <think> block text (sonar-reasoning-pro wraps reasoning in <think>...</think>)
  const thinkMatch = args.rawContent.match(/<think>([\s\S]*?)<\/think>/i);
  const thinkPreview = thinkMatch ? thinkMatch[1].trim().slice(0, 800) : null;

  return {
    content_chars: args.rawContent.length,
    extracted_json_chars: args.extracted ? args.extracted.length : 0,
    top_level_type: topLevelType,
    top_level_keys: topLevelKeys,
    array_keys_found: arrayKeysFound,
    tournaments_detected: tournamentsDetected,
    first_item_keys: firstTournamentKeys,
    citations_count: args.citations.length,
    think_preview: thinkPreview,
    citations: args.citations.slice(0, 10),
    note: "Expected a JSON object with key 'tournaments' (array).",
  };
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

function isValidZip5(value: string) {
  return /^\d{5}$/.test(String(value ?? "").trim());
}

function looksLikeStreetAddress(value: string) {
  const v = String(value ?? "").trim();
  if (!v) return false;
  if (v.length < 8) return false;
  return /\d/.test(v);
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

function urlMatchKey(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    // Keep path only; drop query/hash since citations often vary by tracking params.
    let path = u.pathname || "/";
    if (path.length > 1) path = path.replace(/\/+$/g, "");
    return `${host}${path}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function buildUserPrompt(input: {
  sport: string;
  stateLabel: string;
  stateSchemaHint: string;
  dateStart: string;
  dateEnd: string;
  additionalContext?: string | null;
}) {
  const platforms = SPORT_PLATFORMS[input.sport.toLowerCase()] ?? [];
  const platformLine = platforms.length
    ? `These platforms often list ${input.sport} tournaments (use as examples, not an exclusive list): ${platforms.join(", ")}. Search broadly — run multiple queries like "youth ${input.sport} tournament ${input.stateLabel} ${input.dateStart.slice(0, 4)}", check the state ${input.sport} association site, state referee committee site, regional hubs, and individual club tournament pages.`
    : `Search broadly — run multiple queries like "youth ${input.sport} tournament ${input.stateLabel} ${input.dateStart.slice(0, 4)}", check sport-specific registration platforms, the state ${input.sport} association site, and individual club tournament pages.`;

  // For dates more than 3 months out, many tournaments aren't posted yet.
  // Guide Perplexity to surface recurring annual events from prior years.
  const today = new Date();
  const startMs = Date.parse(input.dateStart);
  const monthsOut = Number.isFinite(startMs) ? (startMs - today.getTime()) / (1000 * 60 * 60 * 24 * 30) : 0;
  const priorYear = new Date(startMs).getFullYear() - 1;
  const targetYear = new Date(startMs).getFullYear();
  const timingNote = monthsOut > 3
    ? `Registration for ${targetYear} events is likely not open yet. ` +
      `Search explicitly for ${priorYear} versions of the same tournaments (e.g. site:advancedeventsystems.com november ${priorYear} ${input.sport} ${input.stateLabel}). ` +
      `Even if you find a ${targetYear} page that says "schedule coming soon" or dates not yet released, you MUST also find and include the ${priorYear} version of that same tournament — use the ${priorYear} source_url and estimate ${targetYear} dates in the same month window. ` +
      `Do not return an empty array just because ${targetYear} pages haven't been published — prior-year recurrences are expected and required.`
    : "";

  const lines = [
    `Find real upcoming youth ${input.sport} tournaments in or near ${input.stateLabel} from ${input.dateStart} to ${input.dateEnd}.`,
    platformLine,
    timingNote,
    "Return ONLY a JSON object with key \"tournaments\" (array). Each item:",
    `  tournament_name (string), sport ("${input.sport}"), city (string), state ("2-letter code"),`,
    "  start_date (YYYY-MM-DD), end_date (YYYY-MM-DD),",
    "  official_website_url (plain https:// or empty), source_url (plain https:// — REQUIRED),",
    "  host_org (string or empty),",
    "  venues (array, each: venue_name (specific facility name or empty), venue_address (street address if known or empty),",
    "    venue_city, venue_state (2-letter), venue_zip (5-digit), venue_url (plain https:// or empty)).",
    "Rules:",
    "- Real tournaments only — not leagues, clinics, camps, or weekly play.",
    "- One entry per tournament; list all venues in venues[].",
    "- venue_name must be a specific facility — no TBD / Multiple Locations / Various Venues.",
    `- State: include tournaments primarily in ${input.stateLabel}, but you MAY include nearby border-state tournaments if they are commonly attended by ${input.stateLabel} teams (do not force the state to match the target).`,
    "- venue_city + venue_state required per venue; venue_zip and venue_address are best-effort (omit rather than guess).",
    "- All URLs plain https:// — no markdown [text](url) format.",
    `- Max ${MAX_TOURNAMENTS} tournaments.`,
  ].filter(Boolean).join("\n");

  const extra = (input.additionalContext ?? "").trim();
  return extra ? `${lines}\n\nAdditional context: ${extra}` : lines;
}

export type RunPerplexityChunkArgs = {
  userId: string;
  runId: string;
  sport: string;
  state: string; // one or more 2-letter codes, comma-separated
  dateStart: string; // YYYY-MM-DD
  dateEnd: string; // YYYY-MM-DD
  futureOnly: boolean;
  additionalContext?: string | null;
  bypassRateLimit?: boolean;
};

export async function runPerplexityChunk(args: RunPerplexityChunkArgs) {
  const runId = String(args.runId ?? "").trim();
  if (!runId) throw new HttpError(400, "Missing id");

  const sport = String(args.sport ?? "").trim().toLowerCase();
  const rawState = String(args.state ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const stateCodes = rawState.split(",").map((s) => s.trim()).filter(Boolean);
  const dateStart = String(args.dateStart ?? "").trim();
  const dateEnd = String(args.dateEnd ?? "").trim();
  const futureOnly = args.futureOnly !== false;

  if (!sport) throw new HttpError(400, "sport is required");
  if (stateCodes.length === 0 || !stateCodes.every(isTwoLetterState)) {
    throw new HttpError(400, "state must be one or more 2-letter codes (e.g. CA or RI,CT,NH)");
  }
  const state = stateCodes[0];
  const stateLabel =
    stateCodes.length === 1 ? stateCodes[0] : `${stateCodes.slice(0, -1).join(", ")} and ${stateCodes[stateCodes.length - 1]}`;
  const stateSchemaHint =
    stateCodes.length === 1 ? `"${stateCodes[0]}"` : `"2-letter code — one of: ${stateCodes.join(", ")}"`;

  if (!isIsoDate(dateStart) || !isIsoDate(dateEnd)) throw new HttpError(400, "date_start and date_end must be YYYY-MM-DD");
  if (dateStart > dateEnd) throw new HttpError(400, "date_start must be <= date_end");

  const additionalContext = args.additionalContext != null ? String(args.additionalContext) : "";
  const additionalContextTrimmed = additionalContext.trim();
  if (additionalContextTrimmed.length > MAX_CONTEXT_CHARS) throw new HttpError(400, "additional_context exceeds 300 characters");

  // Verify run is attachable (draft only).
  const { data: runRowData, error: runErr } = await supabaseAdmin.from("discovery_csv_runs" as any).select("id,status").eq("id", runId).maybeSingle();
  if (runErr) throw new HttpError(500, runErr.message);
  const runRow = runRowData as any;
  if (!runRow?.id) throw new HttpError(404, "Run not found");
  const attachableStatuses = ["draft", "imported", "imported_partial"];
  if (!attachableStatuses.includes(String(runRow?.status ?? ""))) throw new HttpError(409, "Run is not attachable in current status");

  // Rate limit: prevent repeated perplexity calls for this run within 30s (success or failure).
  if (!args.bypassRateLimit) {
    const { data: recentData, error: recentErr } = await supabaseAdmin
      .from("discovery_csv_run_batches" as any)
      .select("created_at,discovery_batches(provider,created_at)")
      .eq("csv_run_id", runId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (recentErr) throw new HttpError(500, recentErr.message);

    const now = Date.now();
    const recent = (recentData ?? []) as any[];
    const lastPerplexity = recent.find((r: any) => String(r?.discovery_batches?.provider ?? "") === "perplexity");
    const lastAt = lastPerplexity?.discovery_batches?.created_at ? Date.parse(String(lastPerplexity.discovery_batches.created_at)) : null;
    if (lastAt && Number.isFinite(lastAt) && now - lastAt < RATE_LIMIT_WINDOW_MS) {
      throw new HttpError(429, "Rate limited: wait a moment before running Perplexity again.");
    }
  }

  const apiKey = (process.env.PERPLEXITY_API_KEY ?? "").trim();
  if (!apiKey) throw new HttpError(500, "Missing PERPLEXITY_API_KEY");

  const systemPrompt =
    'You are a tournament research assistant. Search sport-specific registration platforms, state/regional association sites, and club tournament pages to find real upcoming youth sports tournaments. ' +
    'Make multiple targeted searches — check the platforms named in the user prompt, then search broadly for any additional events. ' +
    'Return ONLY valid JSON — no markdown, no explanation. Output a single JSON object with key "tournaments" (array). Include any tournament you find — omit a field rather than inventing it, but never omit the tournament itself.';
  const userPrompt = buildUserPrompt({ sport, stateLabel, stateSchemaHint, dateStart, dateEnd, additionalContext: additionalContextTrimmed || null });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PERPLEXITY_TIMEOUT_MS);
  let perplexityJson: any = null;
  let rawContent = "";
  let citations: string[] = [];

  try {
    const resp = await trackExternalCall(EXTERNAL_API.perplexity, "chat_completions", EXTERNAL_API_SURFACE.ti_discovery, async () => {
      const r = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "sonar-reasoning-pro",
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "tournament_discovery_results",
              schema: {
                type: "object",
                additionalProperties: true,
                properties: {
                  tournaments: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: true,
                      properties: {
                        tournament_name: { type: "string" },
                        sport: { type: "string" },
                        city: { type: "string" },
                        state: { type: "string" },
                        start_date: { type: "string" },
                        end_date: { type: "string" },
                        official_website_url: { type: ["string", "null"] },
                        source_url: { type: "string" },
                        host_org: { type: ["string", "null"] },
                        venues: {
                          type: "array",
                          items: {
                            type: "object",
                            additionalProperties: true,
                            properties: {
                              venue_name: { type: ["string", "null"] },
                              venue_address: { type: ["string", "null"] },
                              venue_city: { type: "string" },
                              venue_state: { type: "string" },
                              venue_zip: { type: "string" },
                              venue_url: { type: ["string", "null"] },
                            },
                            required: ["venue_city", "venue_state"],
                          },
                        },
                      },
                      required: ["tournament_name", "sport", "city", "state", "start_date", "end_date", "source_url", "venues"],
                    },
                  },
                },
                required: ["tournaments"],
              },
            },
          },
          max_tokens: 8000,
          temperature: 0.2,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });
      if (!r.ok) {
        const errBody = await r.json().catch(() => null);
        const msg = String(errBody?.error?.message ?? errBody?.message ?? "Perplexity request failed");
        const httpErr = new Error(msg) as any;
        httpErr.httpStatus = r.status || 500;
        throw httpErr;
      }
      return r;
    });
    perplexityJson = await resp.json().catch(() => null);
  } catch (err: any) {
    const isAbort = err?.name === "AbortError";
    throw new HttpError(
      isAbort ? 504 : (err?.httpStatus ?? 500),
      isAbort ? "Perplexity request timed out. Try a narrower date range." : err.message || "Perplexity request failed."
    );
  } finally {
    clearTimeout(timeout);
  }

  citations = coerceCitations(perplexityJson?.citations);
  const citationKeys = new Set(citations.map(urlMatchKey).filter(Boolean));
  rawContent = String(perplexityJson?.choices?.[0]?.message?.content ?? "");
  if (rawContent.length > RESPONSE_CHAR_LIMIT) throw new HttpError(400, "Perplexity response too large. Try a narrower date range.");

  // Always store the raw response JSON (as text) as a batch for auditability.
  const rawPasteToStore = JSON.stringify(perplexityJson ?? {}, null, 2);
  const { data: batch, error: batchErr } = await supabaseAdmin
    .from("discovery_batches" as any)
    .insert({
      created_by: args.userId,
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
  if (batchErr) throw new HttpError(500, batchErr.message);
  const batchId = String((batch as any).id);

  // Link batch to run even on parse failures (rate limit + audit).
  const { error: linkErr } = await supabaseAdmin.from("discovery_csv_run_batches" as any).insert({ csv_run_id: runId, batch_id: batchId });
  if (linkErr) throw new HttpError(500, linkErr.message, { batch_id: batchId });

  // sonar-reasoning-pro prepends <think>...</think> before the JSON output.
  // Strip it first so extractFirstJsonObject doesn't anchor on a { inside the reasoning.
  const rawContentStripped = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const extracted = extractFirstJsonObject(rawContentStripped);
  if (!extracted) {
    const debug = parseDebugSnapshot({ rawContent, extracted: null, parsedJson: null, citations });
    await supabaseAdmin.from("discovery_batch_parse_log" as any).insert({
      batch_id: batchId,
      parse_status: "failed",
      error_summary: "No JSON object found in Perplexity response content.",
      warnings: debug,
      row_count_detected: 0,
      row_count_accepted: 0,
    });
    throw new HttpError(400, "No JSON object found in Perplexity response.", { batch_id: batchId, debug });
  }

  if (lastNonWhitespaceChar(extracted) !== "}") {
    const debug = parseDebugSnapshot({ rawContent, extracted, parsedJson: null, citations });
    await supabaseAdmin.from("discovery_batch_parse_log" as any).insert({
      batch_id: batchId,
      parse_status: "failed",
      error_summary: "Perplexity response was truncated. Try a narrower date range or reduce the number of expected results.",
      warnings: debug,
      row_count_detected: 0,
      row_count_accepted: 0,
    });
    throw new HttpError(400, "Perplexity response was truncated. Try a narrower date range or reduce the number of expected results.", { batch_id: batchId, debug });
  }

  let parsedJson: any = null;
  try {
    parsedJson = JSON.parse(extracted);
  } catch {
    const debug = parseDebugSnapshot({ rawContent, extracted, parsedJson: null, citations });
    await supabaseAdmin.from("discovery_batch_parse_log" as any).insert({
      batch_id: batchId,
      parse_status: "failed",
      error_summary: "Invalid JSON returned by Perplexity.",
      warnings: debug,
      row_count_detected: 0,
      row_count_accepted: 0,
    });
    throw new HttpError(400, "Invalid JSON returned by Perplexity.", { batch_id: batchId, debug });
  }

  let tournaments: any[] = [];
  if (Array.isArray(parsedJson)) tournaments = parsedJson;
  else if (parsedJson && typeof parsedJson === "object") {
    if (Array.isArray(parsedJson.tournaments)) tournaments = parsedJson.tournaments;
    else {
      const firstArrayKey = Object.keys(parsedJson).find((k) => Array.isArray((parsedJson as any)[k]));
      if (firstArrayKey) tournaments = (parsedJson as any)[firstArrayKey];
    }
  }

  if (!Array.isArray(tournaments) || tournaments.length === 0) {
    const debug = parseDebugSnapshot({ rawContent, extracted, parsedJson, citations });
    await supabaseAdmin.from("discovery_batch_parse_log" as any).insert({
      batch_id: batchId,
      parse_status: "failed",
      error_summary: "No tournaments array found in Perplexity JSON.",
      warnings: debug,
      row_count_detected: 0,
      row_count_accepted: 0,
    });
    throw new HttpError(400, "No tournaments array found in Perplexity JSON.", { batch_id: batchId, debug });
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
    // Allow tournaments outside the target state; only use target as a fallback when the model omits/garbles state.
    const st = bestEffortState2(String(t?.state ?? ""), state);
    const startDate = String(t?.start_date ?? "").trim();
    const endDate = String(t?.end_date ?? "").trim();
    const officialWebsiteUrlRaw = String(t?.official_website_url ?? "").trim();
    const sourceUrlRaw = String(t?.source_url ?? "").trim();
    const hostOrg = String(t?.host_org ?? "").trim();

    const sourceUrl = bestEffortNormalizeHttpsUrl(sourceUrlRaw);
    if (!tournamentName || !city || !isTwoLetterState(st) || !isIsoDate(startDate) || !isIsoDate(endDate) || !sourceUrl) {
      warnings.push(`tournament_skipped_invalid:${truncate(tournamentName || sourceUrl || "unknown", 80)}`);
      continue;
    }
    // Hard anti-hallucination gate: Perplexity tournament source_url must be backed by Perplexity citations.
    // This prevents the model from inventing a URL we didn't actually retrieve.
    if (!citationKeys.has(urlMatchKey(sourceUrl))) {
      warnings.push(`tournament_skipped_unbacked_source:${truncate(tournamentName || sourceUrl, 80)}`);
      continue;
    }

    const venuesRaw = Array.isArray(t?.venues) ? t.venues : [];
    const venuesFiltered = venuesRaw
      .map((v: any) => {
        const venue_name = String(v?.venue_name ?? "").trim();
        const venue_address = String(v?.venue_address ?? "").trim();
        const venue_city = String(v?.venue_city ?? "").trim() || city;
        const venue_state = bestEffortState2(String(v?.venue_state ?? ""), st);
        const venue_zip = String(v?.venue_zip ?? "").trim();
        const venue_url = String(v?.venue_url ?? "").trim();
        return { venue_name, venue_address, venue_city, venue_state, venue_zip, venue_url };
      })
      .filter((v: any) => {
        // City/state: fall back to tournament city/state when omitted.
        if (!v.venue_city || !isTwoLetterState(v.venue_state)) return false;
        if (v.venue_name && looksLikePlaceholderVenue(v.venue_name)) return false;
        // Accept named venues or proper street addresses; zip/address can be missing (to backfill later).
        if (!looksLikeStreetAddress(v.venue_address) && !v.venue_name) return false;
        return true;
      });

    if (venuesFiltered.length === 0) {
      droppedNoValidVenues += 1;
      continue;
    }

    const venuesLimited = venuesFiltered.slice(0, MAX_VENUES_PER_TOURNAMENT);
    if (venuesFiltered.length > MAX_VENUES_PER_TOURNAMENT) trimmedVenues += venuesFiltered.length - MAX_VENUES_PER_TOURNAMENT;

    for (const v of venuesLimited) {
      const officialWebsiteUrl = bestEffortNormalizeHttpsUrl(officialWebsiteUrlRaw);
      const venueUrl = bestEffortNormalizeHttpsUrl(v.venue_url);
      rows.push({
        tournament_name: tournamentName,
        sport: tournamentSport,
        city,
        state: st,
        start_date: startDate,
        end_date: endDate,
        official_website_url: officialWebsiteUrl,
        source_url: sourceUrl,
        host_org: hostOrg || null,
        tournament_director: null,
        tournament_director_email: null,
        referee_contact: null,
        referee_contact_email: null,
        venue_name: v.venue_name,
        venue_address: v.venue_address,
        venue_city: v.venue_city,
        venue_state: v.venue_state,
        venue_zip: v.venue_zip,
        venue_url: venueUrl,
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
    throw new HttpError(400, "Too many rows. Narrow the date range.", { batch_id: batchId });
  }

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
    throw new HttpError(400, parsed.error, { batch_id: batchId });
  }

  const mergedWarnings = [...warnings, ...(parsed.warnings ?? [])];

  await supabaseAdmin.from("discovery_batches" as any).update({ notes: `derived_csv\n${csv}` }).eq("id", batchId);
  await supabaseAdmin.from("discovery_batch_parse_log" as any).insert({
    batch_id: batchId,
    parse_status: "ok",
    error_summary: null,
    warnings: mergedWarnings.length ? mergedWarnings : null,
    row_count_detected: parsed.detected,
    row_count_accepted: parsed.rows.length,
  });

  const candidateRows = parsed.rows.map((row) => toCandidateInsert({ batchId, row }));
  const { error: candErr } = await supabaseAdmin.from("tournament_discovery_candidates" as any).insert(candidateRows);
  if (candErr) throw new HttpError(500, candErr.message, { batch_id: batchId });

  const { data: joined, error: joinErr } = await supabaseAdmin
    .from("discovery_csv_run_batches" as any)
    .select("batch_id,discovery_batches(provider,raw_paste,notes)")
    .eq("csv_run_id", runId);
  if (joinErr) throw new HttpError(500, joinErr.message, { batch_id: batchId });

  const allRows: any[] = [];
  for (const r of joined ?? []) {
    const batchProvider = String((r as any).discovery_batches?.provider ?? "");
    const rawPaste = String((r as any).discovery_batches?.raw_paste ?? "");
    const notes = String((r as any).discovery_batches?.notes ?? "");
    const csvText = batchProvider === "perplexity" && notes.startsWith("derived_csv\n") ? notes.slice("derived_csv\n".length) : rawPaste;
    if (!csvText.trim().startsWith("tournament_name,")) continue;
    const parsedBatch = parseDiscoveryV2CsvChunk({ csvText, futureOnly });
    if (parsedBatch.ok) allRows.push(...parsedBatch.rows);
  }

  const master = buildMasterCsv(allRows as any);
  await supabaseAdmin.from("discovery_csv_runs" as any).update({ master_csv: master.csv, master_csv_row_count: master.rowCount }).eq("id", runId);

  return {
    ok: true,
    batch_id: batchId,
    accepted: parsed.rows.length,
    rejected: Math.max(0, parsed.detected - parsed.rows.length),
    warnings: mergedWarnings,
    master_csv_row_count: master.rowCount,
    perplexity_citations: citations,
  };
}
