import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/supabase";

export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Match browser/middleware encoding to avoid cookie bloat and chunk drops.
        encode: "tokens-only",
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Server Components can't set cookies. Middleware handles updates.
        },
      },
    }
  );
}
