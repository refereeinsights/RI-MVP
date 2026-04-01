import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type RouteParams = {
  params: {
    tournamentId: string;
  };
};

async function getAuthedUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function normalizeTournamentId(raw: string | undefined) {
  return String(raw ?? "").trim();
}

async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  const tournamentId = normalizeTournamentId(params?.tournamentId);
  if (!tournamentId) return NextResponse.json({ ok: false, error: "invalid_tournament_id" }, { status: 400 });

  const { supabase, user } = await getAuthedUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("ti_saved_tournaments" as any)
    .select("id,notify_on_changes")
    .eq("user_id", user.id)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const row = data as { id?: string; notify_on_changes?: boolean } | null;
  return NextResponse.json({ ok: true, saved: Boolean(row?.id), notify_on_changes: Boolean(row?.notify_on_changes) });
}

export async function POST(_request: Request, { params }: RouteParams) {
  const tournamentId = normalizeTournamentId(params?.tournamentId);
  if (!tournamentId) return NextResponse.json({ ok: false, error: "invalid_tournament_id" }, { status: 400 });

  const { supabase, user } = await getAuthedUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!user.email_confirmed_at) {
    return NextResponse.json({ ok: false, code: "EMAIL_UNVERIFIED", error: "email_unverified" }, { status: 403 });
  }

  const existing = await supabase
    .from("ti_saved_tournaments" as any)
    .select("id,notify_on_changes")
    .eq("user_id", user.id)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (existing.error) return NextResponse.json({ ok: false, error: existing.error.message }, { status: 500 });
  const existingRow = existing.data as { id?: string; notify_on_changes?: boolean } | null;

  if (existingRow?.id) {
    return NextResponse.json({
      ok: true,
      saved: true,
      created: false,
      notify_on_changes: Boolean(existingRow.notify_on_changes),
    });
  }

  const { data, error } = await (supabase.from("ti_saved_tournaments" as any) as any)
    .insert({
      user_id: user.id,
      tournament_id: tournamentId,
      // keep notify_on_changes false by default; prompt handles opt-in
    })
    .select("id,notify_on_changes")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const row = data as { id?: string; notify_on_changes?: boolean } | null;
  return NextResponse.json({
    ok: true,
    saved: Boolean(row?.id),
    created: true,
    notify_on_changes: Boolean(row?.notify_on_changes),
  });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const tournamentId = normalizeTournamentId(params?.tournamentId);
  if (!tournamentId) return NextResponse.json({ ok: false, error: "invalid_tournament_id" }, { status: 400 });

  const { supabase, user } = await getAuthedUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!user.email_confirmed_at) {
    return NextResponse.json({ ok: false, code: "EMAIL_UNVERIFIED", error: "email_unverified" }, { status: 403 });
  }

  const { error } = await (supabase.from("ti_saved_tournaments" as any) as any)
    .delete()
    .eq("user_id", user.id)
    .eq("tournament_id", tournamentId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, saved: false });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const tournamentId = normalizeTournamentId(params?.tournamentId);
  if (!tournamentId) return NextResponse.json({ ok: false, error: "invalid_tournament_id" }, { status: 400 });

  const { supabase, user } = await getAuthedUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!user.email_confirmed_at) {
    return NextResponse.json({ ok: false, code: "EMAIL_UNVERIFIED", error: "email_unverified" }, { status: 403 });
  }

  const body = await readJsonBody<{ notify_on_changes?: unknown }>(request);
  const notify = Boolean((body as any)?.notify_on_changes);

  const { data, error } = await (supabase.from("ti_saved_tournaments" as any) as any)
    .update({ notify_on_changes: notify })
    .eq("user_id", user.id)
    .eq("tournament_id", tournamentId)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "not_saved" }, { status: 404 });
  return NextResponse.json({ ok: true, notify_on_changes: notify });
}
