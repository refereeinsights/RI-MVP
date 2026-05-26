import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTiTierServer } from "@/lib/entitlementsServer";
import PlannerClient from "./PlannerClient";
import type { PlannerEventRow } from "@/lib/planner/types";

export const metadata = {
  title: "Planner | TournamentInsights",
  description: "Weekend logistics planner for tournament travel and schedules.",
};

export const runtime = "nodejs";

export default async function PlannerPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent("/planner")}`);
  }

  const tierInfo = await getTiTierServer(user);
  const isPaid = tierInfo.tier === "weekend_pro";

  const { data, error } = await (supabase.from("planner_events" as any) as any)
    .select(
      "id,user_id,weekend_id,title,event_type,team_name,opponent_name,tournament_id,venue_id,field_label,address_text,city,state,starts_at,ends_at,timezone,notes,source_type,source_id,created_at,updated_at"
    )
    .eq("user_id", user.id)
    .order("starts_at", { ascending: true })
    .limit(250);

  const events: PlannerEventRow[] = (error ? [] : (data ?? [])) as PlannerEventRow[];

  return <PlannerClient initialEvents={events} isPaid={isPaid} />;
}

