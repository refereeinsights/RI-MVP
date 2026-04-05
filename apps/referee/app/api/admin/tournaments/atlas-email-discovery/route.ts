import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { findTournamentEmailsViaAtlas } from "@/server/atlas/tournamentEmails";

async function ensureAdmin() {
  const supa = createSupabaseServerClient();
  const { data: userData, error: userErr } = await supa.auth.getUser();
  if (userErr || !userData.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("user_id, role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") return null;
  return userData.user;
}

export async function POST(req: Request) {
  const admin = await ensureAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const tournamentId = String(body?.tournament_id ?? "").trim() || null;
  const apply = Boolean(body?.apply ?? false);
  const limitInput = Number(body?.limit ?? "10");
  const limit = Number.isFinite(limitInput) ? Math.max(1, Math.min(limitInput, 25)) : 10;

  const baseQuery = (supabaseAdmin as any)
    .from("tournaments")
    .select("id,name,state,city,sport,official_website_url,source_url,tournament_director_email,do_not_contact")
    .eq("do_not_contact", false);

  const resp = tournamentId
    ? await baseQuery.eq("id", tournamentId).limit(1)
    : await baseQuery
        .or("tournament_director_email.is.null,tournament_director_email.eq.")
        .order("updated_at", { ascending: false })
        .limit(limit);

  if (resp.error) {
    return NextResponse.json({ ok: false, error: resp.error.message }, { status: 500 });
  }
  const tournaments: any[] = Array.isArray(resp.data) ? resp.data : [];
  const rows = tournaments.filter((t: any) => t?.id && t?.do_not_contact !== true);
  if (!rows.length) {
    return NextResponse.json({ ok: false, message: "No tournaments found." }, { status: 404 });
  }

  const results: any[] = [];
  let updated = 0;

  for (const t of rows) {
    const search = await findTournamentEmailsViaAtlas({
      id: t.id,
      name: t.name ?? null,
      state: t.state ?? null,
      city: t.city ?? null,
      sport: t.sport ?? null,
      official_website_url: t.official_website_url ?? null,
      source_url: t.source_url ?? null,
    });

    const topEmail = (search.emails ?? [])[0] ?? null;
    let didUpdate = false;
    if (apply && topEmail && !(t.tournament_director_email ?? "").trim()) {
      const updateResp = await (supabaseAdmin as any)
        .from("tournaments")
        .update({ tournament_director_email: topEmail })
        .eq("id", t.id)
        .select("id")
        .maybeSingle();
      if (!updateResp.error && updateResp.data?.id) {
        updated += 1;
        didUpdate = true;
      }
    }

    results.push({
      tournament_id: t.id,
      tournament_name: t.name ?? null,
      state: t.state ?? null,
      city: t.city ?? null,
      existing_director_email: t.tournament_director_email ?? null,
      top_email: topEmail,
      emails: search.emails,
      sources: search.sources,
      queries: search.queries,
      updated: didUpdate,
    });
  }

  return NextResponse.json({
    ok: true,
    applied: apply,
    tournaments: rows.length,
    updated,
    results,
  });
}
