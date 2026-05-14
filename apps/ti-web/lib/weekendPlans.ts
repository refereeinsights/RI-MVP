import { createSupabaseServerClient } from "@/lib/supabaseServer";

export type WeekendPlanRow = {
  id: string;
  user_id: string;
  tournament_id: string;
  selected_venue_id: string | null;
  status: "active" | "archived" | string;
  created_at?: string | null;
  updated_at?: string | null;
};

export async function getWeekendPlanForTournament(params: { userId: string; tournamentId: string }) {
  const supabase = createSupabaseServerClient();
  const table = (supabase.from("ti_weekend_plans" as any) as any);
  const { data, error } = await table
    .select("id,user_id,tournament_id,selected_venue_id,status,created_at,updated_at")
    .eq("user_id", params.userId)
    .eq("tournament_id", params.tournamentId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false as const, plan: null, error: error.message || String(error) };
  }

  return { ok: true as const, plan: (data as WeekendPlanRow | null) ?? null, error: null as string | null };
}

async function validateSelectedVenueBelongsToTournament(params: { tournamentId: string; selectedVenueId: string }) {
  const supabase = createSupabaseServerClient();
  const table = (supabase.from("tournament_venues" as any) as any);
  const { data } = await table
    .select("venue_id")
    .eq("tournament_id", params.tournamentId)
    .eq("venue_id", params.selectedVenueId)
    .limit(1)
    .maybeSingle();
  return Boolean((data as any)?.venue_id);
}

export async function saveWeekendPlanForTournament(params: {
  userId: string;
  tournamentId: string;
  selectedVenueId?: string | null;
}) {
  const supabase = createSupabaseServerClient();
  const table = (supabase.from("ti_weekend_plans" as any) as any);

  const selectedVenueId =
    params.selectedVenueId && (await validateSelectedVenueBelongsToTournament({ tournamentId: params.tournamentId, selectedVenueId: params.selectedVenueId }))
      ? params.selectedVenueId
      : null;

  const existingRes = await table
    .select("id")
    .eq("user_id", params.userId)
    .eq("tournament_id", params.tournamentId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (existingRes.error) {
    return { ok: false as const, planId: null as any, error: existingRes.error.message || String(existingRes.error) };
  }

  if (existingRes.data?.id) {
    const { error } = await table.update({ selected_venue_id: selectedVenueId }).eq("id", existingRes.data.id).eq("user_id", params.userId);
    if (error) return { ok: false as const, planId: null as any, error: error.message || String(error) };
    return { ok: true as const, planId: existingRes.data.id, error: null as string | null };
  }

  const insertRes = await table
    .insert({
      user_id: params.userId,
      tournament_id: params.tournamentId,
      selected_venue_id: selectedVenueId,
      status: "active",
    })
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!insertRes.error && insertRes.data?.id) {
    return { ok: true as const, planId: insertRes.data.id, error: null as string | null };
  }

  // Race handling: if another request inserted the active row first, recover by re-selecting and updating.
  if ((insertRes.error as any)?.code === "23505") {
    const retryRes = await table
      .select("id")
      .eq("user_id", params.userId)
      .eq("tournament_id", params.tournamentId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (retryRes.data?.id) {
      const { error } = await table.update({ selected_venue_id: selectedVenueId }).eq("id", retryRes.data.id).eq("user_id", params.userId);
      if (!error) return { ok: true as const, planId: retryRes.data.id, error: null as string | null };
      return { ok: false as const, planId: null as any, error: error.message || String(error) };
    }
  }

  return { ok: false as const, planId: null as any, error: insertRes.error?.message || String(insertRes.error) };
}
