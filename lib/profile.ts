import { supabaseAdmin } from "./supabaseAdmin";

export type ProfileRow = {
  user_id: string;
  email: string;
  handle: string;
  real_name: string | null;
  years_refereeing: number | null;
  email_opt_in_tournaments: boolean | null;
  email_opt_in_marketing: boolean | null;
};

export async function fetchOrCreateProfile(
  user_id: string,
  email?: string,
  metadata?: Record<string, any>
) {
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

  if (data) return data;

  if (!email) {
    throw new Error("Profile missing and email unavailable.");
  }

  const baseHandle =
    (metadata?.handle as string | undefined)?.replace(/[^\w]+/g, "") ||
    email.split("@")[0].replace(/[^\w]+/g, "") ||
    `ref-${user_id.slice(0, 6)}`;

  let attemptHandle = baseHandle.slice(0, 20) || `ref-${user_id.slice(0, 6)}`;

  for (let i = 0; i < 5; i++) {
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
      return inserted;
    }

    if (insertError.message && insertError.message.includes("profiles_handle_key")) {
      attemptHandle = `${baseHandle}${Math.floor(Math.random() * 900 + 100)}`
        .replace(/[^\w]+/g, "")
        .slice(0, 20);
      continue;
    }

    throw new Error(insertError.message);
  }

  throw new Error("Could not create profile. Please contact support.");
}
