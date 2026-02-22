import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTier, type TiTier } from "@/lib/entitlements";

type TiProfile = { plan: string | null; subscription_status: string | null } | null;

export async function getTiTierServer(user: User | null | undefined): Promise<{
  tier: TiTier;
  profile: TiProfile;
  unverified: boolean;
}> {
  if (!user) return { tier: "explorer", profile: null, unverified: false };

  const supabase = createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("ti_users" as any)
    .select("plan,subscription_status")
    .eq("id", user.id)
    .maybeSingle<{ plan: string | null; subscription_status: string | null }>();

  const unverified = !user.email_confirmed_at;
  const tier = getTier(user, profile ?? null);
  return { tier, profile: profile ?? null, unverified };
}
