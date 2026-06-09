import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTiTierServer } from "@/lib/entitlementsServer";
import { getPlannerCalendarFeedPanelStateForOwner } from "@/lib/planner/calendarFeeds";

import PlannerCalendarFeedPanelClient from "./PlannerCalendarFeedPanelClient";

export default async function PlannerCalendarFeedPanel() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) return null;

  const tierInfo = await getTiTierServer(user);
  const initialState = await getPlannerCalendarFeedPanelStateForOwner({
    supabase,
    userId: user.id,
    tier: tierInfo.tier,
    unverified: tierInfo.unverified,
  });

  return <PlannerCalendarFeedPanelClient initialState={initialState} />;
}
