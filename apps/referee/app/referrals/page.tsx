import { createSupabaseServerClient } from "@/lib/supabaseServer";
import ReferralsClient from "./ReferralsClient";

export default async function ReferralsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <ReferralsClient isAuthenticated={!!user} />;
}
