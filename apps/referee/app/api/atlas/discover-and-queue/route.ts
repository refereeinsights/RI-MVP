import { NextResponse } from "next/server";
import { atlasSearch, getSearchProviderName } from "@/server/atlas/search";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRegistryRowByUrl, normalizeSourceUrl, upsertRegistry } from "@/server/admin/sources";
import crypto from "crypto";

type ResultPreview = {
  url: string;
  title?: string | null;
  snippet?: string | null;
  domain?: string | null;
  status: "inserted" | "existing";
};

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const rateBucket = new Map<string, { count: number; resetAt: number }>();

function jsonResponse(body: any, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function consumeRate(key: string, cost: number) {
  const now = Date.now();
  const bucket = rateBucket.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBucket.set(key, { count: cost, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count + cost > RATE_LIMIT) return false;
  bucket.count += cost;
  return true;
}

async function requireAdminUser() {
  const supa = createSupabaseServerClient();
  const { data, error } = await supa.auth.getUser();
  if (error || !data.user) {
    return { error: jsonResponse({ error: "not_authenticated" }, 401) };
  }
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("user_id, role")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") {
    return { error: jsonResponse({ error: "not_authorized" }, 403) };
  }
  return { user: data.user };
}

function normalizeDiscoveredUrl(raw: string) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProto);
  } catch {
    return null;
  }
  url.hash = "";
  const params = url.searchParams;
  Array.from(params.keys()).forEach((key) => {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || lower === "gclid" || lower === "fbclid") {
      params.delete(key);
    }
  });
  url.search = params.toString();
  const canonical = url.toString();
  const host = url.hostname.toLowerCase();
  return { url: canonical, host };
}

async function ensureAssignorSourceId(defaultSport: string | null, defaultState: string | null) {
  const SOURCE_URL = "atlas://discover";
  const SOURCE_NAME = "Atlas Discovery";

  const { data: existing, error } = (await supabaseAdmin
    .from("assignor_sources" as any)
    .select("id")
    .eq("source_url", SOURCE_URL)
    .maybeSingle()) as { data: { id: string } | null; error: any };
  if (error) throw new Error(`assignor_sources lookup failed: ${error.message}`);
  if (existing?.id) return existing.id as string;

  const { data: created, error: insertError } = (await supabaseAdmin
    .from("assignor_sources" as any)
    .insert({
      source_name: SOURCE_NAME,
      source_url: SOURCE_URL,
      default_sport: defaultSport,
      default_state: defaultState,
      is_active: true,
    })
    .select("id")
    .single()) as { data: { id: string } | null; error: any };
  if (insertError || !created?.id) {
    throw new Error(`assignor_sources insert failed: ${insertError?.message ?? "unknown error"}`);
  }
  return created.id as string;
}

function hashValue(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export async function POST(req: Request) {
  const admin = await requireAdminUser();
  if (admin.error) return admin.error;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const queries = Array.isArray(body?.queries) ? body.queries.map((q: any) => String(q || "").trim()).filter(Boolean) : [];
  if (!queries.length) return jsonResponse({ error: "queries_required" }, 400);
  const sport = typeof body?.sport === "string" ? body.sport.trim() : "";
  const source_type = typeof body?.source_type === "string" ? body.source_type.trim() : "";
  const target = typeof body?.target === "string" ? body.target.trim() : "tournament";
  const state = typeof body?.state === "string" ? body.state.trim() : "";
  if (!sport || (target === "tournament" && !source_type)) {
    return jsonResponse({ error: "sport_and_source_type_required" }, 400);
  }

  let perQueryLimit = Number(body?.result_limit_per_query ?? 10);
  if (!Number.isFinite(perQueryLimit)) perQueryLimit = 10;
  perQueryLimit = Math.max(1, Math.min(50, Math.floor(perQueryLimit)));

  let maxTotal = Number(body?.max_total_urls ?? 100);
  if (!Number.isFinite(maxTotal)) maxTotal = 100;
  maxTotal = Math.max(1, Math.min(200, Math.floor(maxTotal)));

  if (!consumeRate(admin.user!.id, queries.length)) {
    return jsonResponse({ error: "rate_limited" }, 429);
  }

  const deduped = new Map<string, { url: string; title?: string | null; snippet?: string | null; domain?: string | null }>();
  let totalFound = 0;

  for (const query of queries) {
    const results = await atlasSearch(query, perQueryLimit);
    totalFound += results.length;
    for (const result of results) {
      const normalized = normalizeDiscoveredUrl(result.url);
      if (!normalized) continue;
      if (!deduped.has(normalized.url)) {
        deduped.set(normalized.url, {
          url: normalized.url,
          title: result.title ?? null,
          snippet: result.snippet ?? null,
          domain: result.domain ?? normalized.host,
        });
        if (deduped.size >= maxTotal) break;
      }
    }
    if (deduped.size >= maxTotal) break;
  }

  let inserted = 0;
  let skipped_existing = 0;
  const previews: ResultPreview[] = [];
  const assignorSourceId =
    target === "assignor" ? await ensureAssignorSourceId(sport || null, state || null) : null;

  for (const item of deduped.values()) {
    const normalized = normalizeSourceUrl(item.url).canonical;
    if (target === "assignor") {
      const externalId = `atlas_${hashValue(normalized)}`;
      const { data: existingAssignor } = (await supabaseAdmin
        .from("assignor_source_records" as any)
        .select("id")
        .eq("source_id", assignorSourceId)
        .eq("external_id", externalId)
        .maybeSingle()) as { data: { id: string } | null; error: any };
      if (existingAssignor?.id) {
        skipped_existing += 1;
        previews.push({ ...item, url: normalized, status: "existing" });
        continue;
      }
      const raw = {
        name: item.title ?? item.domain ?? normalized,
        website_url: normalized,
        source_url: normalized,
        sport,
        state,
        search_title: item.title ?? null,
        search_snippet: item.snippet ?? null,
        discovered_via: "atlas",
      };
      const { error } = await supabaseAdmin.from("assignor_source_records" as any).insert({
        source_id: assignorSourceId,
        external_id: externalId,
        raw,
        confidence: 35,
        review_status: "needs_review",
      });
      if (error) {
        skipped_existing += 1;
        previews.push({ ...item, url: normalized, status: "existing" });
        continue;
      }
      inserted += 1;
      previews.push({ ...item, url: normalized, status: "inserted" });
      continue;
    }

    const existing = await getRegistryRowByUrl(normalized);
    if (existing.row) {
      skipped_existing += 1;
      previews.push({ ...item, url: normalized, status: "existing" });
      continue;
    }
    await upsertRegistry({
      source_url: normalized,
      source_type,
      sport,
      state: state || null,
      review_status: "needs_review",
      review_notes: "discovered via atlas",
      is_active: true,
    });
    inserted += 1;
    previews.push({ ...item, url: normalized, status: "inserted" });
  }

  const sample_urls = previews.slice(0, 10).map((p) => p.url);

  return jsonResponse({
    inserted,
    skipped_existing,
    total_found: totalFound,
    sample_urls,
    results: previews,
    meta: { provider: getSearchProviderName(), fetched_at: new Date().toISOString() },
  });
}
