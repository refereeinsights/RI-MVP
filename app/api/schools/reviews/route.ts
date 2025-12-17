import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { userIsVerifiedReferee } from "@/lib/refereeVerification";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { findOrCreateSchool } from "@/lib/schools";

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

  const verified = await userIsVerifiedReferee(supabase, user.id);
  if (!verified) {
    return NextResponse.json(
      { error: "Only verified referees can submit reviews." },
      { status: 403 }
    );
  }

  const schoolInput = {
    name: String(body?.school?.name ?? "").trim(),
    city: String(body?.school?.city ?? "").trim(),
    state: String(body?.school?.state ?? "").trim(),
    address: body?.school?.address ?? null,
    placeId: body?.school?.placeId ?? null,
    latitude:
      typeof body?.school?.latitude === "number" ? Number(body.school.latitude) : null,
    longitude:
      typeof body?.school?.longitude === "number" ? Number(body.school.longitude) : null,
  };

  if (!schoolInput.name || !schoolInput.city || !schoolInput.state) {
    return NextResponse.json({ error: "Select a school before submitting." }, { status: 400 });
  }

  let schoolRow;
  try {
    schoolRow = await findOrCreateSchool(schoolInput);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Unable to save school." }, { status: 400 });
  }

  const payload: Record<string, any> = {
    school_id: schoolRow.id,
    user_id: user.id,
    shift_detail: typeof body.shift_detail === "string" ? body.shift_detail.slice(0, 1200) : null,
    worked_games:
      typeof body.worked_games === "number" && Number.isFinite(body.worked_games)
        ? body.worked_games
        : null,
    status: "pending",
  };

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

  const { error } = await supabaseAdmin.from("school_referee_reviews").insert([payload]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, school: schoolRow });
}
