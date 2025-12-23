import { supabase } from "@/lib/supabaseClient";
import {
  normalizeHandle,
  handleContainsProhibitedTerm,
  isHandleAllowed,
} from "./handles";

export type Sport = "soccer" | "basketball" | "football";

export { normalizeHandle } from "./handles";

export async function isHandleAvailable(handle: string): Promise<boolean> {
  const normalized = normalizeHandle(handle);
  if (!isHandleAllowed(normalized)) return false;

  const { data, error } = await supabase
    .from("profiles")
    .select("handle")
    .eq("handle", normalized)
    .maybeSingle();

  if (error) throw error;
  return !data;
}

export async function signUpUser(input: {
  email: string;
  password: string;
  handle: string;
  realName: string;
  yearsRefereeing: number | null;
  sports: Sport[];
  referralCode?: string | null;
  zip?: string | null;
  city?: string | null;
  state?: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  const handle = normalizeHandle(input.handle);
  const sportsCsv = input.sports.map((s) => s.trim()).filter(Boolean).join(",");
  const referralCode = input.referralCode?.trim() || null;
  const zip = input.zip?.trim() || null;
  const city = input.city?.trim() || null;
  const state = input.state?.trim().toUpperCase() || null;

  if (handle.length < 3) throw new Error("Handle must be at least 3 characters.");
  if (handle.length > 20) throw new Error("Handle must be 20 characters or less.");
  if (handleContainsProhibitedTerm(handle)) {
    throw new Error("Handle contains language we do not allow. Please choose another handle.");
  }
  if (!input.sports || input.sports.length === 0) {
    throw new Error("Select at least one sport.");
  }

  // Try to resolve referrer id (best-effort; ignore if not found/RLS blocked)
  let referrerId: string | null = null;
  if (referralCode) {
    try {
      const { data } = await supabase
        .from("referral_codes" as any)
        .select("user_id")
        .eq("code", referralCode)
        .maybeSingle();
      referrerId = (data as any)?.user_id ?? null;
    } catch (err) {
      console.warn("referral lookup failed", err);
    }
  }

  // send metadata to auth.users so your trigger can populate profiles
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: {
        handle,
        real_name: input.realName,
        years_refereeing: input.yearsRefereeing,
        sports: sportsCsv, // trigger expects CSV string
        referrer_id: referrerId,
        referral_code: referralCode,
        zip,
        city,
        state,
      },
    },
  });

  if (error) throw error;
  return data;
}
