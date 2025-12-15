// lib/auth.ts
import { supabase } from "./supabaseClient";

/**
 * Handle rules (keep consistent with DB constraints):
 * - lowercase letters, numbers, underscore
 * - 3–20 chars
 */
export function normalizeHandle(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_]{3,20}$/.test(handle);
}

export type Sport = "soccer" | "basketball" | "football";

export async function isHandleAvailable(handle: string): Promise<boolean> {
  const normalized = normalizeHandle(handle);
  if (!isValidHandle(normalized)) return false;

  const { data, error } = await supabase.rpc("is_handle_available", {
    handle_input: normalized,
  });

  if (error) throw error;
  return Boolean(data);
}

export type SignUpInput = {
  email: string;
  password: string;
  handle: string;
  realName: string;
  yearsRefereeing?: number | null;
  sports?: Sport[]; // stored privately in profiles, can be public if you want
};

export async function signUpUser(input: SignUpInput) {
  const email = input.email.trim();
  const password = input.password;
  const handle = normalizeHandle(input.handle);
  const realName = input.realName.trim();

  const years = input.yearsRefereeing;
  const sports = input.sports ?? [];

  if (!email) throw new Error("Email is required");
  if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");
  if (!realName) throw new Error("Real name is required");
  if (!isValidHandle(handle)) {
    throw new Error("Handle must be 3–20 characters: lowercase letters, numbers, underscores");
  }

  if (years != null && (Number.isNaN(years) || years < 0 || years > 80)) {
    throw new Error("Years as a referee must be between 0 and 80");
  }

  const available = await isHandleAvailable(handle);
  if (!available) throw new Error("That handle is already taken");

  // IMPORTANT: we send sports as a comma-separated string for the DB trigger to parse
  const sportsCsv = sports.join(",");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        handle,
        real_name: realName,
        years_refereeing: years == null ? "" : String(years),
        sports: sportsCsv, // e.g. "soccer,basketball"
      },
    },
  });

  if (error) throw error;
  return data;
}

export type SignInInput = {
  email: string;
  password: string;
};

export async function signInUser(input: SignInInput) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });
  if (error) throw error;
  return data;
}

export async function signOutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}
