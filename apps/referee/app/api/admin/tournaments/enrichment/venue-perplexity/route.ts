import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { trackExternalCall, EXTERNAL_API, EXTERNAL_API_SURFACE } from "@/lib/trackExternalCall";

export const runtime = "nodejs";
export const maxDuration = 60;

const PERPLEXITY_TIMEOUT_MS = 45_000;
const PERPLEXITY_VENUE_CONFIDENCE = 0.75;

const PLACEHOLDER_NAMES = ["tbd", "multiple locations", "various venues", "various locations", "area gyms", "surrounding area"];

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

function extractFirstJsonObject(text: string): string | null {
  const raw = String(text ?? "");
  if (!raw.trim()) return null;
  const trimmed = raw.replace(/```(?:json)?/gi, "").trim();
  const start = trimmed.indexOf("{");
  if (start === -1) return null;
  const end = trimmed.lastIndexOf("}");
  if (end === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}

function coerceCitations(value: unknown): string[] {
  const out: string[] = [];
  const pushUrl = (maybe: unknown) => {
    const s = String(maybe ?? "").trim();
    if (/^https:\/\/\S+$/i.test(s)) out.push(s);
  };
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") { pushUrl(item); continue; }
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        pushUrl(obj.url); pushUrl(obj.source_url); pushUrl(obj.href);
      }
    }
  }
  return Array.from(new Set(out));
}

function isPlaceholderVenueName(name: string): boolean {
  const v = name.toLowerCase().trim();
  return PLACEHOLDER_NAMES.some((p) => v === p || v.includes(p));
}

export async function POST(request: Request) {
  const admin = await ensureAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const tournamentId = String(body?.tournament_id ?? "").trim();
  if (!tournamentId) return NextResponse.json({ error: "tournament_id required" }, { status: 400 });

  const { data: tRaw, error: tErr } = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,name,city,state,sport,start_date,end_date")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  const t = tRaw as any;
  if (!t?.id) return NextResponse.json({ error: "tournament_not_found" }, { status: 404 });

  const name = String(t.name ?? "").trim();
  const city = String(t.city ?? "").trim();
  const state = String(t.state ?? "").trim().toUpperCase();
  const sport = String(t.sport ?? "").trim().toLowerCase();
  const startDate = String(t.start_date ?? "").trim();
  const endDate = String(t.end_date ?? "").trim();

  if (!name || !city || !state) {
    return NextResponse.json({ error: "tournament_missing_name_city_or_state" }, { status: 400 });
  }

  const apiKey = (process.env.PERPLEXITY_API_KEY ?? "").trim();
  if (!apiKey) return NextResponse.json({ error: "PERPLEXITY_API_KEY not configured" }, { status: 500 });

  const sportPart = sport ? ` (${sport})` : "";
  const datePart = startDate
    ? ` around ${startDate}${endDate && endDate !== startDate ? ` to ${endDate}` : ""}`
    : "";

  const systemPrompt =
    "You are a sports venue researcher. Given a tournament name, location, and sport, find the specific complexes or facilities where the tournament is held. Return ONLY valid JSON — no markdown, no explanation.";

  const userPrompt = [
    `Find all venues for "${name}"${sportPart} in ${city}, ${state}${datePart}.`,
    `Return a JSON object with key "venues" (array). Each item:`,
    `  venue_name (specific facility name — never "TBD" or "Multiple Locations"),`,
    `  venue_address (street address if found, or empty string),`,
    `  venue_city (string),`,
    `  venue_state (2-letter code),`,
    `  venue_zip (5-digit or empty),`,
    `  source_url (plain https:// URL where you found this — required).`,
    `Rules:`,
    `- Include ALL venues if the tournament uses multiple complexes.`,
    `- venue_name must be a specific named facility, not a placeholder.`,
    `- All URLs plain https:// — no markdown.`,
    `- If you cannot find any venues, return {"venues": []}.`,
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PERPLEXITY_TIMEOUT_MS);
  let perplexityJson: any = null;

  try {
    const resp = await trackExternalCall(
      EXTERNAL_API.perplexity,
      "venue_search",
      EXTERNAL_API_SURFACE.tournament_enrichment,
      async () => {
        const r = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: "sonar",
            max_tokens: 2000,
            temperature: 0.1,
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
          const err = new Error(msg) as any;
          err.httpStatus = r.status || 500;
          throw err;
        }
        return r;
      }
    );
    perplexityJson = await resp.json().catch(() => null);
  } catch (err: any) {
    const isAbort = err?.name === "AbortError";
    return NextResponse.json(
      { error: isAbort ? "Perplexity request timed out" : (err?.message || "Perplexity request failed") },
      { status: isAbort ? 504 : (err?.httpStatus ?? 500) }
    );
  } finally {
    clearTimeout(timeout);
  }

  const citations = coerceCitations(perplexityJson?.citations);
  const rawContent = String(perplexityJson?.choices?.[0]?.message?.content ?? "");

  // Audit: store raw response
  const { data: batch, error: batchErr } = await supabaseAdmin
    .from("discovery_batches" as any)
    .insert({
      created_by: admin.id,
      discovery_search_id: null,
      raw_paste: JSON.stringify(perplexityJson ?? {}, null, 2),
      provider: "perplexity",
      model: "sonar",
      generated_prompt: userPrompt,
      actual_prompt_sent: userPrompt,
      notes: `venue_search:${tournamentId}`,
    })
    .select("id")
    .single();
  if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 });
  const batchId = String((batch as any).id);

  // sonar may wrap reasoning in <think>...</think>; strip before parsing.
  const stripped = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const extracted = extractFirstJsonObject(stripped);
  if (!extracted) {
    return NextResponse.json({
      error: "No JSON found in Perplexity response",
      batch_id: batchId,
      debug: { content_chars: rawContent.length, citations_count: citations.length },
    }, { status: 400 });
  }

  let parsed: any;
  try { parsed = JSON.parse(extracted); } catch {
    return NextResponse.json({ error: "Invalid JSON from Perplexity", batch_id: batchId }, { status: 400 });
  }

  const venuesRaw: any[] = Array.isArray(parsed?.venues) ? parsed.venues : [];
  if (!venuesRaw.length) {
    return NextResponse.json({
      ok: true,
      inserted: 0,
      batch_id: batchId,
      message: "Perplexity found no venues for this tournament",
    });
  }

  const firstCitation = citations[0] ?? null;
  const toInsert: any[] = [];

  for (const v of venuesRaw) {
    const venueName = String(v?.venue_name ?? "").trim() || null;
    const venueAddress = String(v?.venue_address ?? "").trim() || null;
    const venueCity = String(v?.venue_city ?? "").trim() || city;
    const venueState = String(v?.venue_state ?? "").trim().toUpperCase() || state;
    const venueZip = String(v?.venue_zip ?? "").trim() || null;
    const sourceUrl = String(v?.source_url ?? "").trim() || firstCitation || null;

    if (!venueName && !venueAddress) continue;
    if (venueName && isPlaceholderVenueName(venueName)) continue;

    // Build address_text as full formatted address (street + city + state + zip when available).
    const addressParts = [venueAddress, venueCity, venueState, venueZip].filter(Boolean);
    const addressText = addressParts.length ? addressParts.join(", ") : null;

    toInsert.push({
      tournament_id: tournamentId,
      venue_name: venueName,
      address_text: addressText,
      venue_url: null,
      evidence_text: `reason=perplexity_search; batch_id=${batchId}${sourceUrl ? `; source=${sourceUrl}` : ""}`,
      confidence: PERPLEXITY_VENUE_CONFIDENCE,
      source_url: sourceUrl,
    });
  }

  if (!toInsert.length) {
    return NextResponse.json({
      ok: true,
      inserted: 0,
      batch_id: batchId,
      message: "No valid venue candidates extracted from Perplexity response",
    });
  }

  const { error: insertErr } = await supabaseAdmin
    .from("tournament_venue_candidates" as any)
    .insert(toInsert);
  if (insertErr) return NextResponse.json({ error: insertErr.message, batch_id: batchId }, { status: 500 });

  return NextResponse.json({
    ok: true,
    inserted: toInsert.length,
    batch_id: batchId,
    citations_count: citations.length,
    candidates: toInsert.map((c) => ({ venue_name: c.venue_name, address_text: c.address_text })),
  });
}
