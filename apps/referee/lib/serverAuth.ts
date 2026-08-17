import "server-only";

import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

// React's cache is scoped to the current server render. It deduplicates auth
// verification between the root layout and nested server components without
// sharing a user's result across requests.
export const getServerUser = cache(async () => {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return { user: data.user, error };
});
