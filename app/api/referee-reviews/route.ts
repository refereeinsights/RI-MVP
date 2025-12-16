import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const NUMBER_FIELDS = [
  "overall_score",
  "logistics_score",
  "facilities_score",
  "pay_score",
  "support_score",
] as const;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to submit a review." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id,is_referee_verified")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile?.is_referee_verified) {
    return NextResponse.json(
      { error: "Only verified referees can submit reviews." },
      { status: 403 }
    );
  }

  const payload: Record<string, any> = {
    tournament_id: body.tournament_id,
    user_id: user.id,
    shift_detail:
      typeof body.shift_detail === "string" ? body.shift_detail.slice(0, 1200) : null,
    worked_games:
      typeof body.worked_games === "number" && Number.isFinite(body.worked_games)
        ? body.worked_games
        : null,
    status: "pending",
  };

  if (!payload.tournament_id) {
    return NextResponse.json({ error: "Missing tournament_id." }, { status: 400 });
  }

  for (const field of NUMBER_FIELDS) {
    const value = Number(body[field]);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return NextResponse.json(
        { error: `Field ${field} must be between 0 and 100.` },
        { status: 400 }
      );
    }
    payload[field] = value;
  }

  const { error } = await supabaseAdmin
    .from("tournament_referee_reviews")
    .insert([payload]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
