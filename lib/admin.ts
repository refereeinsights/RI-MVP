"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "./supabaseAdmin";
import { createSupabaseServerClient } from "./supabaseServer";

type VerificationStatus = "pending" | "approved" | "rejected";

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
