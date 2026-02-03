import { NextResponse } from "next/server";
import { atlasSearch, getSearchProviderName } from "@/server/atlas/search";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

export async function POST(req: Request) {
  const admin = await requireAdminUser();
  if (admin.error) return admin.error;

  if (!consumeRate(admin.user!.id, 1)) {
    return jsonResponse({ error: "rate_limited" }, 429);
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const rawQuery = typeof body?.query === "string" ? body.query.trim() : "";
  if (!rawQuery) return jsonResponse({ error: "query_required" }, 400);
  if (rawQuery.length > 400) return jsonResponse({ error: "query_too_long" }, 400);

  let limit = Number(body?.limit ?? 10);
  if (!Number.isFinite(limit)) limit = 10;
  limit = Math.max(1, Math.min(50, Math.floor(limit)));

  const results = await atlasSearch(rawQuery, limit);

  return jsonResponse({
    query: rawQuery,
    results,
    meta: { provider: getSearchProviderName(), fetched_at: new Date().toISOString() },
  });
}
