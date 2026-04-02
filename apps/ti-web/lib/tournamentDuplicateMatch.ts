import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getSponsorCategoryFormState,
  type TournamentDuplicateMatch,
  type TournamentSponsorCategoryValue,
} from "@/lib/listTournamentForm";

type DuplicateLookupRow = {
  id: string;
  slug: string | null;
  name: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  official_website_url: string | null;
  team_fee: string | null;
  age_group: string | null;
  tournament_director: string | null;
  tournament_director_email: string | null;
  referee_contact: string | null;
  referee_contact_email: string | null;
  referee_pay: string | null;
  ref_cash_tournament: boolean | null;
  ref_mentors: "yes" | "no" | null;
  travel_lodging: "hotel" | "stipend" | null;
  tournament_venues?: Array<{
    is_inferred?: boolean | null;
    venues:
      | {
          id: string;
          name: string | null;
          address1: string | null;
          city: string | null;
          state: string | null;
          zip: string | null;
          venue_url: string | null;
          restrooms: string | null;
          bring_field_chairs: boolean | null;
        }
      | null;
  }> | null;
};

type TournamentPartnerRow = {
  id: string;
  name: string | null;
  address: string | null;
  sponsor_click_url: string | null;
  category: string | null;
  sort_order: number | null;
};

const DUPLICATE_LOOKUP_SELECT =
  "id,slug,name,sport,city,state,start_date,end_date,official_website_url,team_fee,age_group,tournament_director,tournament_director_email,referee_contact,referee_contact_email,referee_pay,ref_cash_tournament,ref_mentors,travel_lodging,tournament_venues(is_inferred,venues(id,name,address1,city,state,zip,venue_url,restrooms,bring_field_chairs))";

function normalizeLookupText(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function scoreDuplicateMatch(row: DuplicateLookupRow, name: string, city: string, state: string) {
  let score = 0;
  const targetName = normalizeLookupText(name);
  const rowName = normalizeLookupText(row.name ?? "");
  const targetCity = city.trim().toLowerCase();
  const rowCity = (row.city ?? "").trim().toLowerCase();
  const targetState = state.trim().toUpperCase();
  const rowState = (row.state ?? "").trim().toUpperCase();

  if (rowName === targetName) score += 10;
  else if (rowName.includes(targetName) || targetName.includes(rowName)) score += 5;
  if (targetCity && rowCity === targetCity) score += 3;
  if (targetState && rowState === targetState) score += 2;
  return score;
}

function mapDuplicateMatch(row: DuplicateLookupRow, sponsorRows: TournamentPartnerRow[] = []): TournamentDuplicateMatch {
  return {
    id: row.id,
    slug: row.slug ?? null,
    name: row.name ?? "",
    sport: row.sport ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    officialWebsiteUrl: row.official_website_url ?? null,
    teamFee: row.team_fee ?? null,
    ageGroup: row.age_group ?? null,
    tournamentDirector: row.tournament_director ?? null,
    tournamentDirectorEmail: row.tournament_director_email ?? null,
    refereeContact: row.referee_contact ?? null,
    refereeEmail: row.referee_contact_email ?? null,
    refereePay: row.referee_pay ?? null,
    refCashTournament: row.ref_cash_tournament ?? null,
    refMentors: row.ref_mentors ?? null,
    travelLodging: row.travel_lodging ?? null,
    sponsors: sponsorRows.map((sponsor) => {
      const categoryState = getSponsorCategoryFormState(sponsor.category);
      return {
        id: sponsor.id,
        name: sponsor.name ?? "",
        address: sponsor.address ?? "",
        websiteUrl: sponsor.sponsor_click_url ?? null,
        category: sponsor.category ?? null,
        categoryOption: categoryState.categoryOption as TournamentSponsorCategoryValue,
        otherCategory: categoryState.otherCategory,
      };
    }),
    venues: (row.tournament_venues ?? [])
      .filter((entry) => !entry?.is_inferred)
      .map((entry) => entry?.venues ?? null)
      .filter(
        (venue): venue is NonNullable<NonNullable<DuplicateLookupRow["tournament_venues"]>[number]["venues"]> =>
          Boolean(venue?.name)
      )
      .map((venue) => ({
        id: venue.id ?? null,
        name: venue.name ?? "",
        address1: venue.address1 ?? "",
        city: venue.city ?? "",
        state: venue.state ?? "",
        zip: venue.zip ?? "",
        venueUrl: venue.venue_url ?? null,
        restrooms:
          venue.restrooms === "Portable" || venue.restrooms === "Building" || venue.restrooms === "Both"
            ? venue.restrooms
            : "",
        bringFieldChairs:
          venue.bring_field_chairs === true ? "yes" : venue.bring_field_chairs === false ? "no" : "",
      })),
  };
}

async function loadTournamentPartnerRows(tournamentId: string) {
  const { data } = await (supabaseAdmin.from("tournament_partner_nearby" as any) as any)
    .select("id,name,address,sponsor_click_url,category,sort_order")
    .eq("tournament_id", tournamentId)
    .is("venue_id", null)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(4);

  return ((data ?? []) as TournamentPartnerRow[]).filter((row) => Boolean(row.name));
}

export async function getTournamentDuplicateMatchById(tournamentId: string): Promise<TournamentDuplicateMatch | null> {
  const { data, error } = await ((supabaseAdmin.from("tournaments" as any) as any)
    .select(DUPLICATE_LOOKUP_SELECT)
    .eq("id", tournamentId)
    .maybeSingle());

  if (error) throw error;
  const row = data as DuplicateLookupRow | null;
  if (!row?.id) return null;
  const sponsorRows = await loadTournamentPartnerRows(row.id);
  return mapDuplicateMatch(row, sponsorRows);
}

export async function findTournamentDuplicateMatchByName(input: {
  name: string;
  city: string;
  state: string;
}): Promise<TournamentDuplicateMatch | null> {
  let query = (supabaseAdmin.from("tournaments" as any) as any)
    .select(DUPLICATE_LOOKUP_SELECT)
    .ilike("name", `%${input.name}%`)
    .limit(8);

  if (input.city) query = query.ilike("city", `%${input.city}%`);
  if (input.state) query = query.eq("state", input.state);

  const { data, error } = await query;
  if (error) throw error;

  const rows = ((data ?? []) as DuplicateLookupRow[])
    .filter((row) => row.id && row.name)
    .sort(
      (a, b) =>
        scoreDuplicateMatch(b, input.name, input.city, input.state) -
        scoreDuplicateMatch(a, input.name, input.city, input.state)
    );

  const best = rows[0];
  if (!best?.id) return null;
  const sponsorRows = await loadTournamentPartnerRows(best.id);
  return mapDuplicateMatch(best, sponsorRows);
}
