import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function getSavedTournamentIdsForUser(userId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ti_saved_tournaments" as any)
    .select("tournament_id")
    .eq("user_id", userId);
  if (error) return [] as string[];
  return ((data ?? []) as Array<{ tournament_id: string | null }>)
    .map((row) => row.tournament_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

export async function isTournamentSaved(userId: string, tournamentId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ti_saved_tournaments" as any)
    .select("id")
    .eq("user_id", userId)
    .eq("tournament_id", tournamentId)
    .limit(1)
    .maybeSingle();
  if (error) return false;
  const row = data as { id?: string } | null;
  return Boolean(row?.id);
}
