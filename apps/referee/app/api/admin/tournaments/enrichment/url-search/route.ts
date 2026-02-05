import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { findTournamentUrlCandidates } from "@/server/enrichment/urlCandidates";
import { normalizeSourceUrl } from "@/server/admin/sources";

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

export async function POST(request: Request) {
  const admin = await ensureAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const ids = Array.isArray(body?.tournament_ids)
    ? body.tournament_ids.filter((id: any) => typeof id === "string")
    : [];
  if (!ids.length) return NextResponse.json({ error: "no_ids" }, { status: 400 });

  const { data: tournaments, error } = await supabaseAdmin
    .from("tournaments")
    .select("id,name,state,city,sport,level,source_url")
    .in("id", ids);
  if (error) {
    console.error("[enrichment] url search load failed", error);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const results: any[] = [];
  for (const row of tournaments ?? []) {
    if (row.source_url) {
      results.push({ tournament_id: row.id, skipped: "already_has_url", candidates: [] });
      continue;
    }
    const ctx = {
      id: String(row.id),
      name: row.name ? String(row.name) : null,
      state: row.state ? String(row.state) : null,
      city: row.city ? String(row.city) : null,
      sport: row.sport ? String(row.sport) : null,
      host_org: row.level ? String(row.level) : null,
    };
    try {
      const { candidates, auto_apply_threshold } = await findTournamentUrlCandidates(ctx);
      const toInsert = candidates.map((c) => ({
        tournament_id: row.id,
        candidate_url: c.normalized,
        candidate_domain: c.domain ?? null,
        score: c.score,
        matched_fields: {
          ...c.matched_fields,
          title: c.title,
          snippet: c.snippet,
          http_status: c.http_status ?? null,
          content_type: c.content_type ?? null,
          final_url: c.final_url ?? null,
        },
      }));
      if (toInsert.length) {
        const insertResp = await supabaseAdmin
          .from("tournament_url_candidates" as any)
          .upsert(toInsert, { onConflict: "tournament_id,candidate_url" });
        if (insertResp.error) {
          console.warn("[enrichment] url candidates insert failed", insertResp.error);
        }
      }

      let appliedUrl: string | null = null;
      const best = candidates[0];
      if (best && best.score >= auto_apply_threshold) {
        const candidateUrl = best.final_url || best.normalized;
        const updateResp = await supabaseAdmin
          .from("tournaments" as any)
          .update({ source_url: candidateUrl })
          .eq("id", row.id)
          .is("source_url", null);
        if (updateResp.error) {
          console.warn("[enrichment] auto-apply failed", updateResp.error);
        } else {
          appliedUrl = candidateUrl;
          await supabaseAdmin
            .from("tournament_url_candidates" as any)
            .update({ auto_applied: true, applied_at: new Date().toISOString() })
            .eq("tournament_id", row.id)
            .eq("candidate_url", normalizeSourceUrl(candidateUrl).normalized);
        }
      }

      results.push({
        tournament_id: row.id,
        applied_url: appliedUrl,
        auto_apply_threshold,
        candidates: candidates.map((c) => ({
          url: c.normalized,
          score: c.score,
          title: c.title,
          snippet: c.snippet,
          final_url: c.final_url ?? null,
          content_type: c.content_type ?? null,
        })),
      });
    } catch (err: any) {
      console.error("[enrichment] url search failed", err);
      results.push({ tournament_id: row.id, error: err?.message ?? "search_failed", candidates: [] });
    }
  }

  return NextResponse.json({ ok: true, results });
}
