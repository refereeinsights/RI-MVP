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

const ENUM_FIELDS: Record<string, string[]> = {
  referee_food: ["snacks", "meal"],
  facilities: ["restrooms", "portables"],
  referee_tents: ["yes", "no"],
  travel_lodging: ["hotel", "stipend"],
  ref_game_schedule: ["too close", "just right", "too much down time"],
  ref_parking: ["close", "a stroll", "a hike"],
  ref_parking_cost: ["free", "paid"],
  ref_mentors: ["yes", "no"],
  assigned_appropriately: ["yes", "no"],
};

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
    level_of_competition:
      typeof body.level_of_competition === "string" && body.level_of_competition.trim()
        ? body.level_of_competition.trim().slice(0, 120)
        : null,
    ref_cash_at_field: body.ref_cash_at_field === true ? true : false,
    referee_food: typeof body.referee_food === "string" ? body.referee_food : null,
    facilities: typeof body.facilities === "string" ? body.facilities : null,
    referee_tents: typeof body.referee_tents === "string" ? body.referee_tents : null,
    travel_lodging: typeof body.travel_lodging === "string" ? body.travel_lodging : null,
    ref_game_schedule: typeof body.ref_game_schedule === "string" ? body.ref_game_schedule : null,
    ref_parking: typeof body.ref_parking === "string" ? body.ref_parking : null,
    ref_parking_cost: typeof body.ref_parking_cost === "string" ? body.ref_parking_cost : null,
    ref_mentors: typeof body.ref_mentors === "string" ? body.ref_mentors : null,
    assigned_appropriately:
      typeof body.assigned_appropriately === "string" ? body.assigned_appropriately : null,
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

  for (const [field, allowed] of Object.entries(ENUM_FIELDS)) {
    const raw = payload[field];
    if (raw == null || raw === "") {
      payload[field] = null;
      continue;
    }
    if (!allowed.includes(raw)) {
      return NextResponse.json(
        { error: `Field ${field} must be one of: ${allowed.join(", ")}.` },
        { status: 400 }
      );
    }
  }

  if (payload.ref_cash_at_field && body?.ref_cash_tournament !== true) {
    return NextResponse.json(
      { error: "ref_cash_at_field requires ref_cash_tournament to be true." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("tournament_referee_reviews")
    .insert([payload]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body?.ref_cash_tournament === true) {
    await supabaseAdmin
      .from("tournaments")
      .update({ ref_cash_tournament: true })
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
