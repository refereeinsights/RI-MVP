"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "./supabaseAdmin";
import { createSupabaseServerClient } from "./supabaseServer";

type VerificationStatus = "pending" | "approved" | "rejected";
export type ReviewStatus = "pending" | "approved" | "rejected";

/**
 * If not logged in -> redirect to /admin/login
 * If logged in but not admin -> redirect to /admin/login?error=not_authorized
 */
export async function requireAdmin() {
  const supa = createSupabaseServerClient();

  const { data: userData, error: userErr } = await supa.auth.getUser();

  if (userErr || !userData.user) {
    redirect("/admin/login");
  }

  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("user_id, role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (profErr) {
    // If DB is down/misconfigured, fail “softly” back to login rather than crashing.
    redirect("/admin/login?error=server_error");
  }

  if (!profile || profile.role !== "admin") {
    redirect("/admin/login?error=not_authorized");
  }

  return userData.user;
}

/** USERS **/
export async function adminSearchUsers(q: string) {
  await requireAdmin();
  const query = q.trim();

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("user_id, email, handle, real_name, years_refereeing, sports, role, created_at")
    .or(`email.ilike.%${query}%,handle.ilike.%${query}%,real_name.ilike.%${query}%`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

export async function adminUpdateUserProfile(input: {
  user_id: string;
  handle?: string;
  real_name?: string;
  years_refereeing?: number | null;
  sports?: string[] | null;
  role?: string | null;
}) {
  await requireAdmin();
  const { user_id, ...updates } = input;

  const { error } = await supabaseAdmin.from("profiles").update(updates).eq("user_id", user_id);
  if (error) throw error;
}

export async function adminSetUserDisabled(user_id: string, disabled: boolean) {
  await requireAdmin();

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
    ban_duration: disabled ? "87600h" : "none",
  });

  if (error) throw error;
}

export async function adminResendConfirmationEmail(params: { email: string }) {
  await requireAdmin();

  const { error } = await supabaseAdmin.auth.resend({
    type: "signup",
    email: params.email,
  });

  if (error) throw error;
}

/** BADGES **/
export async function adminListBadges() {
  await requireAdmin();

  const { data, error } = await supabaseAdmin
    .from("badges")
    .select("id, code, label, description, is_public")
    .order("id", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function adminGetUserBadges(user_id: string) {
  await requireAdmin();

  const { data, error } = await supabaseAdmin
    .from("user_badges")
    .select("badge_id, status, awarded_at, awarded_by, badges (id, code, label)")
    .eq("user_id", user_id)
    .order("awarded_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function adminAwardBadge(params: { user_id: string; badge_id: number }) {
  const admin = await requireAdmin();

  const { error } = await supabaseAdmin
    .from("user_badges")
    .upsert(
      {
        user_id: params.user_id,
        badge_id: params.badge_id,
        status: "earned",
        awarded_at: new Date().toISOString(),
        awarded_by: admin.id,
      },
      { onConflict: "user_id,badge_id" }
    );

  if (error) throw error;
}

export async function adminRevokeBadge(params: { user_id: string; badge_id: number }) {
  await requireAdmin();

  const { error } = await supabaseAdmin
    .from("user_badges")
    .delete()
    .eq("user_id", params.user_id)
    .eq("badge_id", params.badge_id);

  if (error) throw error;
}

/** VERIFICATION REQUESTS **/
export async function adminListVerificationRequests(status: VerificationStatus = "pending") {
  await requireAdmin();

  const { data, error } = await supabaseAdmin
    .from("referee_verification_requests")
    .select(
      `
      id,
      user_id,
      association,
      level,
      notes,
      evidence_url,
      status,
      submitted_at,
      reviewed_at,
      reviewed_by,
      admin_notes,
      user_profile:profiles!referee_verification_requests_user_id_fkey (
        email,
        handle,
        real_name
      ),
      reviewer_profile:profiles!referee_verification_requests_reviewed_by_fkey (
        email,
        handle
      )
    `
    )
    .eq("status", status)
    .order("submitted_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return data ?? [];
}

export async function adminSetVerificationStatus(params: {
  request_id: number;
  status: "approved" | "rejected";
  admin_notes?: string | null;
}) {
  const admin = await requireAdmin();

  const { error } = await supabaseAdmin
    .from("referee_verification_requests")
    .update({
      status: params.status,
      admin_notes: params.admin_notes ?? null,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", params.request_id);

  if (error) throw error;
}

/** TOURNAMENT REVIEWS **/
export type AdminTournamentReview = {
  id: string;
  tournament_id: string;
  user_id: string;
  created_at: string;
  status: ReviewStatus;
  overall_score: number;
  logistics_score: number;
  facilities_score: number;
  pay_score: number;
  support_score: number;
  worked_games: number | null;
  shift_detail: string | null;
  reviewer?: {
    handle: string | null;
    email: string | null;
  } | null;
  tournament?: {
    name: string | null;
    city: string | null;
    state: string | null;
  } | null;
};

export type AdminSchoolReview = {
  id: string;
  school_id: string;
  user_id: string;
  created_at: string;
  status: ReviewStatus;
  sport: string | null;
  overall_score: number;
  logistics_score: number;
  facilities_score: number;
  pay_score: number;
  support_score: number;
  worked_games: number | null;
  shift_detail: string | null;
  reviewer?: {
    handle: string | null;
    email: string | null;
  } | null;
  school?: {
    name: string | null;
    city: string | null;
    state: string | null;
  } | null;
};

export async function adminListTournamentReviews(status: ReviewStatus = "pending") {
  await requireAdmin();

  const { data, error } = await supabaseAdmin
    .from("tournament_referee_reviews")
    .select(
      "id,tournament_id,user_id,created_at,status,overall_score,logistics_score,facilities_score,pay_score,support_score,worked_games,shift_detail,sport"
    )
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  const reviews = data ?? [];
  if (reviews.length === 0) return [];

  const userIds = Array.from(new Set(reviews.map((row) => row.user_id).filter(Boolean)));
  const tournamentIds = Array.from(
    new Set(reviews.map((row) => row.tournament_id).filter(Boolean))
  );

  const [{ data: profileRows }, { data: tournamentRows }] = await Promise.all([
    userIds.length
      ? supabaseAdmin
          .from("profiles")
          .select("user_id,handle,email")
          .in("user_id", userIds)
      : Promise.resolve({ data: [] }),
    tournamentIds.length
      ? supabaseAdmin
          .from("tournaments")
          .select("id,name,city,state")
          .in("id", tournamentIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map(
    (profileRows ?? []).map((p: any) => [p.user_id, { handle: p.handle ?? null, email: p.email ?? null }])
  );

  const tournamentMap = new Map(
    (tournamentRows ?? []).map((t: any) => [
      t.id,
      { name: t.name ?? null, city: t.city ?? null, state: t.state ?? null },
    ])
  );

  return reviews.map(
    (row) =>
      ({
        id: row.id,
        tournament_id: row.tournament_id,
        user_id: row.user_id,
        created_at: row.created_at,
        status: row.status,
        sport: row.sport ?? null,
        overall_score: row.overall_score,
        logistics_score: row.logistics_score,
        facilities_score: row.facilities_score,
        pay_score: row.pay_score,
        support_score: row.support_score,
        worked_games: row.worked_games,
        shift_detail: row.shift_detail,
        reviewer: profileMap.get(row.user_id) ?? null,
        tournament: tournamentMap.get(row.tournament_id) ?? null,
      }) as AdminTournamentReview
  );
}

export async function adminUpdateTournamentReview(params: {
  review_id: string;
  updates: {
    status?: ReviewStatus;
    overall_score?: number;
    logistics_score?: number;
    facilities_score?: number;
    pay_score?: number;
    support_score?: number;
    worked_games?: number | null;
    shift_detail?: string | null;
  };
}) {
  await requireAdmin();
  const updatePayload: Record<string, any> = {};

  for (const [key, value] of Object.entries(params.updates)) {
    if (typeof value !== "undefined") {
      updatePayload[key] = value;
    }
  }

  if (Object.keys(updatePayload).length === 0) return;

  const { error } = await supabaseAdmin
    .from("tournament_referee_reviews")
    .update(updatePayload)
    .eq("id", params.review_id);

  if (error) throw error;
}

export async function adminDeleteTournamentReview(review_id: string) {
  await requireAdmin();
  const { error } = await supabaseAdmin
    .from("tournament_referee_reviews")
    .delete()
    .eq("id", review_id);

  if (error) throw error;
}

export async function adminListSchoolReviews(status: ReviewStatus = "pending") {
  await requireAdmin();

  const { data, error } = await supabaseAdmin
    .from("school_referee_reviews")
    .select(
      "id,school_id,user_id,created_at,status,sport,overall_score,logistics_score,facilities_score,pay_score,support_score,worked_games,shift_detail"
    )
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  const reviews = data ?? [];
  if (!reviews.length) return [];

  const userIds = Array.from(new Set(reviews.map((row) => row.user_id).filter(Boolean)));
  const schoolIds = Array.from(new Set(reviews.map((row) => row.school_id).filter(Boolean)));

  const [{ data: profileRows }, { data: schoolRows }] = await Promise.all([
    userIds.length
      ? supabaseAdmin.from("profiles").select("user_id,handle,email").in("user_id", userIds)
      : Promise.resolve({ data: [] }),
    schoolIds.length
      ? supabaseAdmin.from("schools").select("id,name,city,state").in("id", schoolIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map(
    (profileRows ?? []).map((p: any) => [p.user_id, { handle: p.handle ?? null, email: p.email ?? null }])
  );
  const schoolMap = new Map(
    (schoolRows ?? []).map((s: any) => [
      s.id,
      { name: s.name ?? null, city: s.city ?? null, state: s.state ?? null },
    ])
  );

  return reviews.map(
    (row) =>
      ({
        id: row.id,
        school_id: row.school_id,
        user_id: row.user_id,
        created_at: row.created_at,
        status: row.status,
        overall_score: row.overall_score,
        logistics_score: row.logistics_score,
        facilities_score: row.facilities_score,
        pay_score: row.pay_score,
        support_score: row.support_score,
        worked_games: row.worked_games,
        shift_detail: row.shift_detail,
        reviewer: profileMap.get(row.user_id) ?? null,
        school: schoolMap.get(row.school_id) ?? null,
      }) as AdminSchoolReview
  );
}

export async function adminUpdateSchoolReview(params: {
  review_id: string;
  updates: {
    status?: ReviewStatus;
    overall_score?: number;
    logistics_score?: number;
    facilities_score?: number;
    pay_score?: number;
    support_score?: number;
    worked_games?: number | null;
    shift_detail?: string | null;
  };
}) {
  await requireAdmin();
  const updatePayload: Record<string, any> = {};

  for (const [key, value] of Object.entries(params.updates)) {
    if (typeof value !== "undefined") {
      updatePayload[key] = value;
    }
  }
  if (Object.keys(updatePayload).length === 0) return;

  const { error } = await supabaseAdmin
    .from("school_referee_reviews")
    .update(updatePayload)
    .eq("id", params.review_id);
  if (error) throw error;
}

export async function adminDeleteSchoolReview(review_id: string) {
  await requireAdmin();
  const { error } = await supabaseAdmin
    .from("school_referee_reviews")
    .delete()
    .eq("id", review_id);
  if (error) throw error;
}
