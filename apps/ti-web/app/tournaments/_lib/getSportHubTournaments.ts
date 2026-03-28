import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateTournamentSport } from "@/lib/validation/validateTournamentSport";

export type SportHubTournament = {
  id: string;
  name: string;
  slug: string;
  sport: string | null;
  state: string | null;
  city: string | null;
  start_date: string | null;
  end_date: string | null;
  official_website_url: string | null;
};

export const SPORT_HUB_PAGE_SIZE = 50;
const MAX_PAGE = 20;
const DEMO_TOURNAMENT_SLUG = "refereeinsights-demo-tournament";

export async function getSportHubTournaments(
  sport: string,
  page: number
): Promise<{ tournaments: SportHubTournament[]; hasMore: boolean; page: number }> {
  const safePage = Math.min(Math.max(1, page), MAX_PAGE);
  const offset = (safePage - 1) * SPORT_HUB_PAGE_SIZE;
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("id,name,slug,sport,state,city,start_date,end_date,official_website_url")
    .eq("sport", sport)
    .or(`is_demo.eq.true,start_date.gte.${today},end_date.gte.${today}`)
    .order("is_demo", { ascending: false })
    .order("start_date", { ascending: true })
    .order("name", { ascending: true })
    .range(offset, offset + SPORT_HUB_PAGE_SIZE - 1);

  if (error) {
    return { tournaments: [], hasMore: false, page: safePage };
  }

  const tournaments = (data ?? [])
    .filter((t): t is SportHubTournament => Boolean(t?.id && t?.name && t?.slug))
    .filter((t) => validateTournamentSport(t, sport) === "valid");

  return {
    tournaments: [...tournaments].sort((a, b) => {
      const aDemo = a.slug === DEMO_TOURNAMENT_SLUG;
      const bDemo = b.slug === DEMO_TOURNAMENT_SLUG;
      if (aDemo !== bDemo) return aDemo ? -1 : 1;
      const dateCmp = (a.start_date ?? "9999-12-31").localeCompare(b.start_date ?? "9999-12-31");
      if (dateCmp !== 0) return dateCmp;
      return a.name.localeCompare(b.name);
    }),
    hasMore: tournaments.length === SPORT_HUB_PAGE_SIZE,
    page: safePage,
  };
}
