import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { userIsVerifiedReferee } from "@/lib/refereeVerification";
import { sendLowScoreAlertEmail } from "@/lib/email";

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

  const isVerified = await userIsVerifiedReferee(supabase, user.id);
  if (!isVerified) {
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

  const scores: Record<string, number> = {};
  for (const field of NUMBER_FIELDS) {
    const value = Number(body[field]);
    if (!Number.isFinite(value) || value < 1 || value > 5) {
      return NextResponse.json(
        { error: `Field ${field} must be between 1 and 5.` },
        { status: 400 }
      );
    }
    payload[field] = value;
    scores[field] = value;
  }

  const { error } = await supabaseAdmin
    .from("tournament_referee_reviews")
    .insert([payload]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body?.cash_tournament === true) {
    await supabaseAdmin
      .from("tournaments")
      .update({ cash_tournament: true })
      .eq("id", payload.tournament_id);
  }

  const minScore = Math.min(...Object.values(scores));
  if (Number.isFinite(minScore) && minScore < 3) {
    const { data: reviewerProfile } = await supabase
      .from("profiles")
      .select("handle")
      .eq("user_id", user.id)
      .maybeSingle();

    const reviewerHandle =
      typeof reviewerProfile?.handle === "string" ? reviewerProfile.handle : null;
    const fallbackEmail = typeof user.email === "string" ? user.email : null;

    sendLowScoreAlertEmail({
      tournamentName: body.tournament_name ?? "Unknown tournament",
      tournamentId: body.tournament_id,
      reviewerHandle: reviewerHandle ?? fallbackEmail ?? user.id,
      minScore,
      scores,
    }).catch((err) => {
      console.error("Failed to send low-score alert", err);
    });
  }

  return NextResponse.json({ success: true });
}
