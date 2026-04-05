import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/supabase";
import { parse, serialize } from "cookie";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase public env vars are missing.");
  }

  const secure = typeof window !== "undefined" && window.location.protocol === "https:";
  browserClient = createBrowserClient<Database>(url, anonKey, {
    cookies: {
      // Keep cookies small to avoid mobile Safari/Chrome dropping chunks (which can cause "random logouts").
      encode: "tokens-only",
      getAll() {
        if (typeof document === "undefined") return [];
        const parsed = parse(document.cookie || "");
        return Object.keys(parsed).map((name) => ({ name, value: parsed[name] ?? "" }));
      },
      setAll(cookiesToSet) {
        if (typeof document === "undefined") return;
        cookiesToSet.forEach(({ name, value, options }) => {
          document.cookie = serialize(name, value, {
            ...options,
            path: "/",
            sameSite: options?.sameSite ?? "lax",
            secure,
          });
        });
      },
    },
  });
  return browserClient;
}
