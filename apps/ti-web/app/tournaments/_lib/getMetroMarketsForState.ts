import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type MetroMarketWithStates = {
  id: string;
  slug: string;
  name: string;
  states: string[];
};

const CA_PREFERRED_ORDER = ["southern-california", "northern-california"];

function isStateCode(value: string) {
  return /^[A-Z]{2}$/.test(value);
}

export async function getMetroMarketsForState(stateCode: string): Promise<MetroMarketWithStates[]> {
  const st = (stateCode ?? "").trim().toUpperCase();
  if (!isStateCode(st)) return [];

  const { data: stateLinks, error: linksError } = await supabaseAdmin
    .from("metro_market_states" as any)
    .select("metro_market_id, state, metro_markets (id, slug, name)")
    .eq("state", st);

  if (linksError) return [];

  const marketsRaw = (Array.isArray(stateLinks) ? stateLinks : [])
    .map((row: any) => row?.metro_markets)
    .filter(Boolean) as Array<{ id?: unknown; slug?: unknown; name?: unknown }>;

  const marketsById = new Map<string, { id: string; slug: string; name: string }>();
  for (const m of marketsRaw) {
    const id = String(m.id ?? "").trim();
    const slug = String(m.slug ?? "").trim();
    const name = String(m.name ?? "").trim();
    if (!id || !slug || !name) continue;
    marketsById.set(id, { id, slug, name });
  }

  const marketIds = Array.from(marketsById.keys());
  if (marketIds.length === 0) return [];

  const { data: allStatesRows } = await supabaseAdmin
    .from("metro_market_states" as any)
    .select("metro_market_id, state")
    .in("metro_market_id", marketIds);

  const statesByMarketId = new Map<string, string[]>();
  for (const row of (Array.isArray(allStatesRows) ? allStatesRows : []) as any[]) {
    const metroMarketId = String(row?.metro_market_id ?? "").trim();
    const rowState = String(row?.state ?? "").trim().toUpperCase();
    if (!metroMarketId || !isStateCode(rowState)) continue;
    const current = statesByMarketId.get(metroMarketId) ?? [];
    if (!current.includes(rowState)) current.push(rowState);
    statesByMarketId.set(metroMarketId, current);
  }

  const out: MetroMarketWithStates[] = marketIds
    .map((id) => {
      const market = marketsById.get(id);
      if (!market) return null;
      const states = (statesByMarketId.get(id) ?? []).slice().sort();
      return { ...market, states };
    })
    .filter(Boolean) as MetroMarketWithStates[];

  out.sort((a, b) => {
    if (st === "CA") {
      const ai = CA_PREFERRED_ORDER.indexOf(a.slug);
      const bi = CA_PREFERRED_ORDER.indexOf(b.slug);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    }
    return a.name.localeCompare(b.name);
  });

  return out;
}

