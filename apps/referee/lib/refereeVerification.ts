import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns true when the user has either the legacy `is_referee_verified`
 * profile flag or the newer `verified_referee` badge.
 */
export async function userIsVerifiedReferee(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  if (!userId) return false;

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_referee_verified")
      .eq("user_id", userId)
      .maybeSingle();

    if (profile?.is_referee_verified) {
      return true;
    }
  } catch (error) {
    console.error("Failed to load profile verification flag", error);
  }

  try {
    const { data: badges } = await supabase
      .from("user_badges")
      .select("badge_id,badges!inner(code)")
      .eq("user_id", userId)
      .eq("badges.code", "verified_referee")
      .limit(1);

    return Array.isArray(badges) && badges.length > 0;
  } catch (error) {
    console.error("Failed to load verified_referee badge", error);
    return false;
  }
}
