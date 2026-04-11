import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { mapStateCodeToSlug, sportDisplayName } from "@/lib/seoHub";

const MIN_INDEXABLE_UPCOMING = 12;

type Props = {
  sportKey: string;
  stateCode: string;
  title?: string;
};

type IndexableMetroRow = {
  sport: string | null;
  state: string | null;
  metro_slug: string | null;
  upcoming_tournament_count: number | null;
};

type MetroMarket = {
  slug: string;
  name: string;
};

export default async function SeoMetroHubChips({ sportKey, stateCode, title }: Props) {
  const safeSport = String(sportKey ?? "").trim().toLowerCase();
  const safeState = String(stateCode ?? "").trim().toUpperCase();
  const stateSlug = mapStateCodeToSlug(safeState);
  if (!safeSport || !stateSlug) return null;

  let rows: IndexableMetroRow[] = [];
  try {
    const { data, error } = await supabaseAdmin.rpc("list_indexable_city_metro_hub_urls_v1" as any, {
      p_min_upcoming: MIN_INDEXABLE_UPCOMING,
    });
    if (error) return null;
    rows = (Array.isArray(data) ? data : []) as IndexableMetroRow[];
  } catch {
    return null;
  }

  const metrosForPage = rows
    .filter((r) => String(r.state ?? "").trim().toUpperCase() === safeState)
    .filter((r) => String(r.sport ?? "").trim().toLowerCase() === safeSport)
    .map((r) => ({
      metroSlug: String(r.metro_slug ?? "").trim().toLowerCase(),
      upcoming: Number(r.upcoming_tournament_count ?? 0) || 0,
    }))
    .filter((r) => r.metroSlug)
    .sort((a, b) => b.upcoming - a.upcoming)
    .slice(0, 12);

  if (!metrosForPage.length) return null;

  const slugs = metrosForPage.map((m) => m.metroSlug);
  const { data: marketsRaw } = await supabaseAdmin
    .from("metro_markets" as any)
    .select("slug,name")
    .in("slug", slugs)
    .returns<MetroMarket[]>();

  const marketNameBySlug = new Map(
    (marketsRaw ?? [])
      .map((m) => [String(m.slug ?? "").trim().toLowerCase(), String(m.name ?? "").trim()] as const)
      .filter(([slug, name]) => slug && name)
  );

  const sportName = sportDisplayName(safeSport);
  const heading = title ?? `Top ${sportName} metro hubs`;

  return (
    <section className="bodyCard" aria-label="Metro hubs">
      <div className="areaHeader">
        <div className="areaTitle">{heading}</div>
        <div className="areaSubtitle">City-based metro hubs with enough upcoming tournaments to be indexable.</div>
      </div>

      <div className="areaChips">
        {metrosForPage.map((m) => {
          const label = marketNameBySlug.get(m.metroSlug) ?? m.metroSlug;
          const href = `/${safeSport}/${stateSlug}/${m.metroSlug}`;
          return (
            <Link key={href} href={href} className="areaChip" aria-label={`${label} (${m.upcoming} upcoming)`}>
              <span className="areaChipLabel">{label}</span>
              <span className="areaChipHint">{m.upcoming} upcoming</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

