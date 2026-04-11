import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  mapStateCodeToName,
  mapStateCodeToSlug,
  mapStateSlugToCode,
  normalizeSportSlug,
  sportDisplayName,
} from "@/lib/seoHub";
import { buildTIHubTitle, assertNoDoubleBrand } from "@/lib/seo/buildTITitle";
import "../../../tournaments/tournaments.css";

export const revalidate = 300;

const SITE_ORIGIN = "https://www.tournamentinsights.com";

const MIN_INDEXABLE_UPCOMING = 12;

type RouteParams = {
  sport: string;
  state: string;
  metro: string;
};

type MetroMarket = {
  id: string;
  slug: string;
  name: string;
};

type MetroMarketState = {
  state: string;
};

type MetroMarketCityRule = {
  city: string;
};

type TournamentRow = {
  id: string;
  slug: string;
  name: string;
  sport: string | null;
  state: string | null;
  city: string | null;
  level: string | null;
  start_date: string | null;
  end_date: string | null;
  official_website_url: string | null;
  source_url: string | null;
  updated_at?: string | null;
};

function formatDate(iso: string | null) {
  if (!iso) return "";
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function tryGetDomain(rawUrl: string | null) {
  const value = String(rawUrl ?? "").trim();
  if (!value) return null;
  try {
    const url = value.startsWith("http://") || value.startsWith("https://") ? new URL(value) : new URL(`https://${value}`);
    const host = (url.hostname || "").toLowerCase().replace(/^www\./, "").trim();
    return host || null;
  } catch {
    return null;
  }
}

function quoteOrValue(value: string) {
  // PostgREST `or=...` supports quoted values. Quotes avoid breaking on commas/spaces.
  const safe = value.replace(/"/g, '""');
  return `"${safe}"`;
}

function buildCityOrFilter(cities: string[]) {
  const terms = cities
    .map((c) => (c ?? "").trim())
    .filter(Boolean)
    .slice(0, 200)
    .map((c) => `city.ilike.${quoteOrValue(c)}`);
  return terms.join(",");
}

async function loadMetroContext({
  sport,
  state,
  metro,
}: RouteParams): Promise<{
  sportKey: string;
  sportSlug: string;
  sportName: string;
  stateCode: string;
  stateSlug: string;
  stateName: string;
  market: MetroMarket;
  cities: string[];
}> {
  const sportKey = normalizeSportSlug(sport);
  const stateCode = mapStateSlugToCode(state);
  const stateName = stateCode ? mapStateCodeToName(stateCode) : null;
  const stateSlug = stateCode ? mapStateCodeToSlug(stateCode) : null;
  if (!sportKey || !stateCode || !stateName || !stateSlug) notFound();

  const sportSlug = sportKey;
  const sportName = sportDisplayName(sportKey);

  const safeMetro = String(metro ?? "").trim().toLowerCase();
  if (!safeMetro) notFound();

  const { data: market, error: marketError } = await supabaseAdmin
    .from("metro_markets" as any)
    .select("id,slug,name")
    .eq("slug", safeMetro)
    .maybeSingle<MetroMarket>();
  if (marketError || !market?.id) notFound();

  const { data: statesRaw, error: statesError } = await supabaseAdmin
    .from("metro_market_states" as any)
    .select("state")
    .eq("metro_market_id", market.id)
    .returns<MetroMarketState[]>();
  if (statesError) notFound();

  const states = (statesRaw ?? []).map((r) => String(r.state ?? "").trim().toUpperCase()).filter(Boolean);
  if (states.length !== 1 || states[0] !== stateCode) notFound();

  const { data: rulesRaw, error: rulesError } = await supabaseAdmin
    .from("metro_market_city_rules" as any)
    .select("city")
    .eq("metro_market_id", market.id)
    .eq("state", stateCode)
    .returns<MetroMarketCityRule[]>();

  if (rulesError) notFound();

  const cities = (rulesRaw ?? []).map((r) => String(r.city ?? "").trim()).filter(Boolean);
  if (!cities.length) notFound();

  return { sportKey, sportSlug, sportName, stateCode, stateSlug, stateName, market, cities };
}

async function loadUpcomingTournamentCount({
  sportKey,
  stateCode,
  cities,
}: {
  sportKey: string;
  stateCode: string;
  cities: string[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const orFilter = buildCityOrFilter(cities);
  if (!orFilter) return 0;

  const { count } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("id", { count: "exact", head: true })
    .eq("sport", sportKey)
    .eq("state", stateCode)
    .or(orFilter)
    .or(`is_demo.eq.true,start_date.gte.${today},end_date.gte.${today}`);

  return count ?? 0;
}

export async function generateMetadata({ params }: { params: RouteParams }): Promise<Metadata> {
  try {
    const ctx = await loadMetroContext(params);
    const upcomingCount = await loadUpcomingTournamentCount({
      sportKey: ctx.sportKey,
      stateCode: ctx.stateCode,
      cities: ctx.cities,
    });

    const cityLabel = ctx.market.name;
    const title = buildTIHubTitle(`${cityLabel}`, ctx.sportName, new Date().getFullYear());
    assertNoDoubleBrand(title);
    const description = `Find upcoming youth ${ctx.sportName.toLowerCase()} tournaments in ${cityLabel}, ${ctx.stateCode}. Dates, venues, and official links to plan confidently.`;

    return {
      title: { absolute: title },
      description,
      robots: upcomingCount >= MIN_INDEXABLE_UPCOMING ? undefined : { index: false, follow: true },
      alternates: {
        canonical: `/${ctx.sportSlug}/${ctx.stateSlug}/${ctx.market.slug}`,
      },
      openGraph: {
        title,
        description,
        url: `${SITE_ORIGIN}/${ctx.sportSlug}/${ctx.stateSlug}/${ctx.market.slug}`,
        images: [{ url: "/og-default.png", width: 1200, height: 630 }],
      },
    };
  } catch {
    return { title: "Tournament Hub", robots: { index: false, follow: false } };
  }
}

export default async function SportStateMetroHubPage({
  params,
}: {
  params: RouteParams;
}) {
  const ctx = await loadMetroContext(params);
  const today = new Date().toISOString().slice(0, 10);
  const orFilter = buildCityOrFilter(ctx.cities);
  if (!orFilter) notFound();

  const { data, error } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("id,slug,name,sport,state,city,level,start_date,end_date,official_website_url,source_url,updated_at")
    .eq("sport", ctx.sportKey)
    .eq("state", ctx.stateCode)
    .or(orFilter)
    .or(`is_demo.eq.true,start_date.gte.${today},end_date.gte.${today}`)
    .order("start_date", { ascending: true })
    .order("name", { ascending: true })
    .limit(2000);

  if (error) {
    throw new Error(`Failed to load metro hub tournaments: ${error.message}`);
  }

  const tournaments: TournamentRow[] = ((data ?? []) as TournamentRow[]).filter((t) => t?.id && t?.slug && t?.name);

  const upcomingCount = tournaments.length;
  const venueHint = ctx.cities.length === 1 ? ctx.cities[0] : `${ctx.cities[0]} + ${ctx.cities.length - 1} more`;
  const organizerDomains = new Set(
    tournaments
      .map((t) => tryGetDomain(t.official_website_url || t.source_url))
      .filter(Boolean) as string[]
  );

  const cityCount = new Set(tournaments.map((t) => (t.city ?? "").trim()).filter(Boolean)).size;
  const nextUpcoming = tournaments.find((t) => t.start_date)?.start_date ?? tournaments[0]?.start_date ?? null;

  const canonicalPath = `/${ctx.sportSlug}/${ctx.stateSlug}/${ctx.market.slug}`;
  const stateHubPath = `/${ctx.sportSlug}/${ctx.stateSlug}`;

  const breadcrumbsJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_ORIGIN },
      { "@type": "ListItem", position: 2, name: "Tournaments", item: `${SITE_ORIGIN}/tournaments` },
      {
        "@type": "ListItem",
        position: 3,
        name: `${ctx.stateName} ${ctx.sportName} tournaments`,
        item: `${SITE_ORIGIN}${stateHubPath}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: `${ctx.market.name} ${ctx.sportName} tournaments`,
        item: `${SITE_ORIGIN}${canonicalPath}`,
      },
    ],
  };

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: tournaments.slice(0, 25).map((t, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `${SITE_ORIGIN}/tournaments/${t.slug}`,
      name: t.name,
    })),
  };

  const shouldIndex = upcomingCount >= MIN_INDEXABLE_UPCOMING;

  return (
    <main className="page">
      <div className="shell">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />

        <section className="hero">
          <h1>
            {ctx.market.name} Youth {ctx.sportName} Tournaments
          </h1>
          <p className="muted heroCopy">
            Upcoming youth {ctx.sportName.toLowerCase()} tournaments in {ctx.market.name}, {ctx.stateCode}. This metro hub is
            city-rule-based (for example: {venueHint}).
          </p>
          <div className="ctaRow">
            <Link href={stateHubPath} className="cta secondary">
              Back to {ctx.stateName}
            </Link>
            <Link href="/tournaments" className="cta primary">
              Browse all tournaments
            </Link>
          </div>
        </section>

        {!shouldIndex ? (
          <section className="bodyCard">
            <p className="clarity" style={{ margin: 0 }}>
              This page is not indexed yet because it does not meet our quality threshold (needs {MIN_INDEXABLE_UPCOMING}+ upcoming tournaments).
            </p>
          </section>
        ) : null}

        <section
          className="bodyCard"
          style={{
            background: "linear-gradient(135deg, rgba(6, 25, 147, 0.06), rgba(25, 115, 209, 0.06))",
            border: "1px solid rgba(25, 115, 209, 0.25)",
            borderRadius: 14,
            boxShadow: "0 12px 26px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ maxWidth: "72ch", margin: "0 auto", textAlign: "center", display: "grid", gap: 12 }}>
            <div>
              <strong>Upcoming tournaments:</strong> {upcomingCount}
            </div>
            <div>
              <strong>Next tournament date:</strong> {nextUpcoming ? formatDate(nextUpcoming) : "TBA"}
            </div>
            <div>
              <strong>Cities represented:</strong> {cityCount}
            </div>
            <div>
              <strong>Known organizer domains:</strong> {organizerDomains.size}
            </div>
          </div>
        </section>

        <section className="bodyCard">
          {tournaments.length === 0 ? (
            <div style={{ display: "grid", gap: 16 }}>
              <p className="clarity" style={{ margin: 0 }}>
                No upcoming {ctx.sportName.toLowerCase()} tournaments are listed for {ctx.market.name} right now.
              </p>
              <div>
                <Link href={stateHubPath} className="cta secondary">
                  Back to {ctx.stateName}
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid">
              {tournaments.slice(0, 60).map((t) => {
                const start = formatDate(t.start_date);
                const end = formatDate(t.end_date);
                const dateLabel = start && end && start !== end ? `${start} – ${end}` : start || end || "Dates TBA";
                const locationLabel = [t.city, t.state].filter(Boolean).join(", ");
                const officialUrl = t.official_website_url || t.source_url;
                return (
                  <article key={t.id} className="card bg-sport-default">
                    <h2>{t.name}</h2>
                    <p className="meta">
                      <strong>{ctx.sportName}</strong>
                      {locationLabel ? ` • ${locationLabel}` : ""}
                      {t.level ? ` • ${t.level}` : ""}
                    </p>
                    <p className="dates">{dateLabel}</p>
                    <div className="cardFooter">
                      {officialUrl ? (
                        <a href={officialUrl} target="_blank" rel="noopener noreferrer" className="secondaryLink">
                          <span>Official site</span>
                        </a>
                      ) : (
                        <div className="secondaryLink" aria-disabled="true" style={{ cursor: "default" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.2 }}>
                            <span>Official site</span>
                            <span className="tbdText">TBD</span>
                          </div>
                        </div>
                      )}
                      <Link href={`/tournaments/${t.slug}`} className="primaryLink">
                        View details
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: 18, textAlign: "center" }}>
            <Link href={`/tournaments/metro/${ctx.market.slug}?state=${ctx.stateCode}&sports=${ctx.sportKey}`} className="cta secondary">
              Open metro directory view
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
