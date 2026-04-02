import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type MetroMarket = {
  id: string;
  name: string;
  slug: string;
};

export type MetroMarketState = {
  metro_market_id: string;
  state: string;
};

type MetroMarketCityRule = {
  metro_market_id: string;
  state: string;
  city: string;
};

export type MetroMarketTournament = {
  id: string;
  name: string;
  slug: string;
  sport: string | null;
  tournament_association?: string | null;
  state: string | null;
  city: string | null;
  zip?: string | null;
  start_date: string | null;
  end_date: string | null;
  official_website_url?: string | null;
  source_url?: string | null;
  level?: string | null;
  tournament_staff_verified?: boolean | null;
  is_demo?: boolean | null;
};

export type GetMetroMarketTournamentsParams = {
  slug: string;
  q?: string;
  month?: string; // YYYY-MM
  includePast?: boolean;
};

const TOURNAMENTS_PUBLIC_SELECT =
  "id,name,slug,sport,tournament_association,state,city,zip,start_date,end_date,official_website_url,source_url,level,tournament_staff_verified,is_demo";

const CA_CITY_RULE_MARKETS = new Set(["southern-california", "northern-california"]);

export async function getMetroMarketTournaments({
  slug,
  q,
  month,
  includePast,
}: GetMetroMarketTournamentsParams): Promise<{ market: MetroMarket | null; tournaments: MetroMarketTournament[] }> {
  const safeSlug = (slug ?? "").trim().toLowerCase();
  if (!safeSlug) return { market: null, tournaments: [] };

  const { data: market } = await supabaseAdmin
    .from("metro_markets" as any)
    .select("id,name,slug")
    .eq("slug", safeSlug)
    .maybeSingle<MetroMarket>();

  if (!market?.id) return { market: null, tournaments: [] };

  const { data: statesRaw } = await supabaseAdmin
    .from("metro_market_states" as any)
    .select("metro_market_id,state")
    .eq("metro_market_id", market.id)
    .returns<MetroMarketState[]>();

  const states = (statesRaw ?? [])
    .map((s) => (s.state ?? "").trim().toUpperCase())
    .filter(Boolean);

  if (states.length === 0) return { market, tournaments: [] };

  // California city-split overlay:
  // If the market is one of the California slugs and it has configured city rules, use (CA + city rules) instead of state-only.
  let caCities: string[] | null = null;
  if (CA_CITY_RULE_MARKETS.has(safeSlug)) {
    const { data: cityRulesRaw } = await supabaseAdmin
      .from("metro_market_city_rules" as any)
      .select("metro_market_id,state,city")
      .eq("metro_market_id", market.id)
      .eq("state", "CA")
      .returns<MetroMarketCityRule[]>();

    const cities = (cityRulesRaw ?? [])
      .map((r) => (r.city ?? "").trim())
      .filter(Boolean);

    if (cities.length > 0) {
      caCities = cities;
    }
  }

  // Directory query shape: copy select + order + range batching from `apps/ti-web/app/tournaments/page.tsx`.
  const today = new Date().toISOString().slice(0, 10);
  const safeQ = (q ?? "").trim();
  const safeMonth = (month ?? "").trim();
  const shouldIncludePast = Boolean(includePast);

  const pageSize = 1000;
  let offset = 0;
  const tournamentsData: any[] = [];

  while (true) {
    let query = supabaseAdmin
      .from("tournaments_public" as any)
      .select(TOURNAMENTS_PUBLIC_SELECT)
      .order("start_date", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (caCities) {
      // Case-insensitive exact match (ilike without wildcards) against configured city list.
      // We intentionally do not do fuzzy matching in v1.
      query = query.eq("state", "CA").or(caCities.map((c) => `city.ilike.${c}`).join(","));
    } else {
      query = query.in("state", states);
    }

    if (!shouldIncludePast) {
      query = query.or(`is_demo.eq.true,start_date.gte.${today},end_date.gte.${today}`);
    }

    if (safeQ) {
      query = query.or(`name.ilike.%${safeQ}%,city.ilike.%${safeQ}%`);
    }

    if (safeMonth && /^\d{4}-\d{2}$/.test(safeMonth)) {
      const [y, m] = safeMonth.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 1));
      const startISO = start.toISOString().slice(0, 10);
      const endISO = end.toISOString().slice(0, 10);
      query = query.gte("start_date", startISO).lt("start_date", endISO);
    }

    const { data, error } = await query;
    if (error) break;

    tournamentsData.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }

  const tournamentsClean = (tournamentsData ?? []).filter(
    (t): t is MetroMarketTournament => Boolean(t?.id && t?.name && t?.slug)
  );

  return { market, tournaments: tournamentsClean };
}
