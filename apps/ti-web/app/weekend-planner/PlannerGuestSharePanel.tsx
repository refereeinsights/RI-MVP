import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTiTierServer } from "@/lib/entitlementsServer";
import { getPlannerGuestSharePanelStateForOwner } from "@/lib/planner/guestShares";

import PlannerGuestSharePanelClient from "./PlannerGuestSharePanelClient";

export default async function PlannerGuestSharePanel() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) return null;

  const tierInfo = await getTiTierServer(user);
  const initialState = await getPlannerGuestSharePanelStateForOwner({
    supabase,
    userId: user.id,
    tier: tierInfo.tier,
    unverified: tierInfo.unverified,
  });

  return (
    <PlannerGuestSharePanelClient
      initialState={initialState}
      entitlement={tierInfo.tier}
      authState={tierInfo.unverified ? "unverified" : "verified"}
    />
  );
}
