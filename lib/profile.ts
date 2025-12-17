import { supabaseAdmin } from "./supabaseAdmin";
import { normalizeHandle, handleContainsProhibitedTerm } from "./handles";

export type ProfileRow = {
  user_id: string;
  email: string;
  handle: string;
  real_name: string | null;
  years_refereeing: number | null;
  email_opt_in_tournaments: boolean | null;
  email_opt_in_marketing: boolean | null;
};

export type UserBadgeRow = {
  badge_id: number;
  status: string | null;
  awarded_at: string | null;
  badges: {
    id: number;
    code: string | null;
    label: string | null;
  } | null;
};

type DBProfileRow = ProfileRow;

export async function fetchOrCreateProfile(
  user_id: string,
  email?: string,
  metadata?: Record<string, any>
): Promise<ProfileRow> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(
      "user_id,email,handle,real_name,years_refereeing,email_opt_in_tournaments,email_opt_in_marketing"
    )
    .eq("user_id", user_id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) return data as DBProfileRow;

  if (!email) {
    throw new Error("Profile missing and email unavailable.");
  }

  const rawHandleCandidate =
    (metadata?.handle as string | undefined)?.replace(/[^\w]+/g, "") ||
    email.split("@")[0].replace(/[^\w]+/g, "") ||
    `ref-${user_id.slice(0, 6)}`;

  const fallbackHandle = normalizeHandle(`ref-${user_id.slice(0, 6)}`) || `ref-${user_id.slice(0, 6)}`;
  let attemptHandle = normalizeHandle(rawHandleCandidate) || fallbackHandle;
  if (!attemptHandle || handleContainsProhibitedTerm(attemptHandle)) {
    attemptHandle = fallbackHandle;
  }

  for (let i = 0; i < 5; i++) {
    if (!attemptHandle || attemptHandle.length < 3 || handleContainsProhibitedTerm(attemptHandle)) {
      attemptHandle = normalizeHandle(`${fallbackHandle}${Math.floor(Math.random() * 900 + 100)}`);
      continue;
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("profiles")
      .insert([
        {
          user_id,
          email,
          handle: attemptHandle,
          real_name: (metadata?.real_name as string | undefined) ?? null,
          years_refereeing: (metadata?.years_refereeing as number | undefined) ?? null,
          email_opt_in_tournaments: true,
          email_opt_in_marketing: false,
        },
      ])
      .select(
        "user_id,email,handle,real_name,years_refereeing,email_opt_in_tournaments,email_opt_in_marketing"
      )
      .single();

    if (!insertError) {
      return inserted as DBProfileRow;
    }

    if (insertError.message && insertError.message.includes("profiles_handle_key")) {
      attemptHandle = normalizeHandle(`${rawHandleCandidate}${Math.floor(Math.random() * 900 + 100)}`);
      continue;
    }

    throw new Error(insertError.message);
  }

  throw new Error("Could not create profile. Please contact support.");
}

export async function fetchUserBadges(user_id: string) {
  const { data, error } = await supabaseAdmin
    .from("user_badges")
    .select("badge_id,status,awarded_at,badges(id,code,label)")
    .eq("user_id", user_id)
    .order("awarded_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const badge = row.badges ? (Array.isArray(row.badges) ? row.badges[0] : row.badges) : null;
    return {
      badge_id: row.badge_id,
      status: row.status,
      awarded_at: row.awarded_at,
      badges: badge
        ? {
            id: badge.id,
            code: badge.code ?? null,
            label: badge.label ?? null,
          }
        : null,
    };
  });
}
