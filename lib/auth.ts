import { supabase } from "@/lib/supabaseClient";

export type Sport = "soccer" | "basketball" | "football";

export function normalizeHandle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

export async function isHandleAvailable(handle: string): Promise<boolean> {
  const normalized = normalizeHandle(handle);
  if (normalized.length < 3) return false;

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
}) {
  const email = input.email.trim().toLowerCase();
  const handle = normalizeHandle(input.handle);

  if (handle.length < 3) throw new Error("Handle must be at least 3 characters.");
  if (handle.length > 20) throw new Error("Handle must be 20 characters or less.");
  if (!input.sports || input.sports.length === 0) {
    throw new Error("Select at least one sport.");
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
        sports: input.sports, // stored as array in metadata
      },
    },
  });

  if (error) throw error;
  return data;
}
