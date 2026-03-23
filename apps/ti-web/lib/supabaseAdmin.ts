import { createClient } from "@supabase/supabase-js";

function sanitizeSupabaseKey(value: string | undefined) {
  // Keys should be base64url-ish JWTs; strip invisible/unexpected characters from copy/paste.
  return (value ?? "").trim().replace(/[^A-Za-z0-9._-]+/g, "");
}

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "",
  sanitizeSupabaseKey(process.env.SUPABASE_SERVICE_ROLE_KEY),
  {
    auth: { persistSession: false },
  }
);
