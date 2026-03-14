import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  curatedSports,
  curatedStates,
  mapStateCodeToName,
  mapStateSlugToCode,
  normalizeSportSlug,
  sportDisplayName,
} from "@/lib/seoHub";
import { buildTIHubTitle, assertNoDoubleBrand } from "@/lib/seo/buildTITitle";
import { validateTournamentSport } from "@/lib/validation/validateTournamentSport";
import "../../tournaments/tournaments.css";

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
};

const SITE_ORIGIN = "https://www.tournamentinsights.com";
const PAGE_SIZE = 60;

function formatDate(iso: string | null) {
  if (!iso) return "";
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function sportIcon(sport: string | null) {
  const normalized = (sport ?? "").toLowerCase();
  if (normalized === "lacrosse") return <img className="sportSvgIcon" src="/brand/lacrosse_icon.svg" alt="" />;
  if (normalized === "hockey") return <img className="sportSvgIcon" src="/svg/sports/hockey_puck_icon.svg" alt="" />;
  switch (normalized) {
    case "soccer":
      return "⚽";
    case "football":
      return "🏈";
    case "baseball":
      return "⚾";
    case "softball":
      return "🥎";
    case "basketball":
      return "🏀";
    case "volleyball":
      return "🏐";
    default:
      return "🏅";
  }
}

function getSportCardClass(sport: string | null) {
  const normalized = (sport ?? "").toLowerCase();
  const map: Record<string, string> = {
    soccer: "bg-sport-soccer",
    lacrosse: "bg-sport-lacrosse",
    volleyball: "bg-sport-volleyball",
    basketball: "bg-sport-basketball",
    football: "bg-sport-football",
    baseball: "bg-sport-baseball",
    softball: "bg-sport-softball",
    hockey: "bg-sport-hockey",
  };
  return map[normalized] ?? "bg-sport-default";
}

type RouteParams = {
  sport: string;
  state: string;
};

export async function generateMetadata({ params }: { params: RouteParams }): Promise<Metadata> {
  const sportKey = normalizeSportSlug(params.sport);
  const stateCode = mapStateSlugToCode(params.state);
  const stateName = stateCode ? mapStateCodeToName(stateCode) : null;
  if (!sportKey || !stateCode || !stateName) {
    return {
      title: "Tournament Hub",
      robots: { index: false, follow: false },
    };
  }
  const sportName = sportDisplayName(sportKey);
  const description = `Find upcoming youth ${sportName.toLowerCase()} tournaments in ${stateName}. Dates, locations, levels, and official links to plan confidently.`;
  const title = buildTIHubTitle(stateName, sportName, new Date().getFullYear());
  assertNoDoubleBrand(title);
  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: `/${params.sport.toLowerCase()}/${params.state.toLowerCase()}`,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_ORIGIN}/${params.sport.toLowerCase()}/${params.state.toLowerCase()}`,
      images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    },
  };
}

export default async function SportStateHubPage({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams?: { page?: string };
}) {
  const sportKey = normalizeSportSlug(params.sport);
  const stateCode = mapStateSlugToCode(params.state);
  const stateName = stateCode ? mapStateCodeToName(stateCode) : null;

  if (!sportKey || !stateCode || !stateName) {
    notFound();
  }

  const page = Math.max(1, Number.parseInt(searchParams?.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const today = new Date().toISOString().slice(0, 10);
  const sportName = sportDisplayName(sportKey);

  const base = supabaseAdmin
    .from("tournaments_public" as any)
    .select("id,slug,name,sport,state,city,level,start_date,end_date,official_website_url,source_url", { count: "exact" })
    .eq("sport", sportKey)
    .eq("state", stateCode)
    .gte("end_date", today)
    .order("start_date", { ascending: true })
    .order("name", { ascending: true });

  const { data, error, count } = await base.range(offset, offset + PAGE_SIZE - 1);
  if (error) {
    throw new Error(`Failed to load SEO hub tournaments: ${error.message}`);
  }

  const tournaments: TournamentRow[] = ((data ?? []) as TournamentRow[])
    .filter((t) => t?.id && t?.slug && t?.name)
    .filter((t) => validateTournamentSport(t, sportKey) === "valid");
  const totalCount = count ?? tournaments.length;
  const hasMore = offset + tournaments.length < totalCount;

  const statsQuery = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("id,city,start_date,end_date")
    .eq("sport", sportKey)
    .eq("state", stateCode)
    .gte("end_date", today)
    .order("start_date", { ascending: true })
    .limit(2000);

  const statsRows = (statsQuery.data ?? []) as Array<{ city: string | null; start_date: string | null; end_date: string | null }>;
  const nextUpcoming = statsRows.find((row) => row.start_date)?.start_date ?? tournaments[0]?.start_date ?? null;
  const cityCount = new Set(statsRows.map((row) => (row.city ?? "").trim()).filter(Boolean)).size;

  const pagePath = `/${params.sport.toLowerCase()}/${params.state.toLowerCase()}`;
  const nextPageHref = `${pagePath}?page=${page + 1}`;
  const sportHubHref = "/tournaments";

  const faq = [
    {
      question: `How often is this ${stateName} ${sportName.toLowerCase()} tournament page updated?`,
      answer:
        "This hub updates continuously as new tournaments are published and existing listings are refreshed with schedule and location changes.",
    },
    {
      question: `Are these ${sportName.toLowerCase()} tournaments only for elite teams?`,
      answer:
        "No. Listings can include multiple levels and age groups. Review each tournament detail page for level and eligibility notes.",
    },
    {
      question: `Where do official links come from for ${stateName} tournaments?`,
      answer:
        "Each listing links to organizer-provided or source-verified pages so families can confirm registration details directly with the event organizer.",
    },
    {
      question: `What should families verify before registering for a ${sportName.toLowerCase()} tournament?`,
      answer:
        "Verify dates, venue details, team level fit, and official registration links before booking travel.",
    },
  ];

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  const otherSportsInState = curatedSports.filter((sport) => sport.key !== sportKey);
  const otherStatesForSport = curatedStates.filter((state) => state.code !== stateCode);

  return (
    <main className="page">
      <div className="shell">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

        <section className="hero">
          <h1>{stateName} Youth {sportName} Tournaments</h1>
          <p className="muted heroCopy">
            Find upcoming youth {sportName.toLowerCase()} tournaments in {stateName} with dates, locations, levels, and official links so your family can plan confidently.
          </p>
          <div className="ctaRow">
            <Link href="/tournaments" className="cta primary">Browse all tournaments</Link>
            <Link href={sportHubHref} className="cta secondary">View {sportName} hubs</Link>
          </div>
        </section>

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
            <div><strong>Upcoming tournaments:</strong> {totalCount}</div>
            <div><strong>Next tournament date:</strong> {nextUpcoming ? formatDate(nextUpcoming) : "TBA"}</div>
            <div><strong>Cities represented:</strong> {cityCount}</div>
          </div>
        </section>

        <section className="bodyCard">
          {tournaments.length === 0 ? (
            <div style={{ display: "grid", gap: 16 }}>
              <p className="clarity" style={{ margin: 0 }}>
                No upcoming {sportName.toLowerCase()} tournaments are listed for {stateName} right now.
              </p>
              <div className="notice">
                <p className="clarity" style={{ margin: 0 }}>
                  Try nearby states:{" "}
                  {curatedStates.map((state, idx) => (
                    <span key={state.code}>
                      <Link href={`/${params.sport.toLowerCase()}/${state.slug}`} style={{ textDecoration: "underline" }}>
                        {state.code}
                      </Link>
                      {idx < curatedStates.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </p>
              </div>
              <div>
                <Link href="/tournaments" className="cta secondary">Back to directory</Link>
              </div>
            </div>
          ) : (
            <>
              <div className="grid">
                {tournaments.map((t) => {
                  const start = formatDate(t.start_date);
                  const end = formatDate(t.end_date);
                  const dateLabel = start && end && start !== end ? `${start} – ${end}` : start || end || "Dates TBA";
                  const locationLabel = [t.city, t.state].filter(Boolean).join(", ");
                  const officialUrl = t.official_website_url || t.source_url;

                  return (
                    <article key={t.id} className={`card ${getSportCardClass(t.sport)}`}>
                      <h2>{t.name}</h2>
                      <p className="meta">
                        <strong>{sportName}</strong>
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
                        <Link href={`/tournaments/${t.slug}`} className="primaryLink">View details</Link>
                      </div>
                      <div className="cardFooterBadgeRow">
                        <div className="cardFooterBadge cardFooterBadge--left" />
                        <div className="sportIcon" aria-label={t.sport ?? "tournament sport"}>{sportIcon(t.sport)}</div>
                        <div className="cardFooterBadge cardFooterBadge--right" />
                      </div>
                    </article>
                  );
                })}
              </div>
              {hasMore ? (
                <div style={{ marginTop: 16, textAlign: "center" }}>
                  <Link href={nextPageHref} className="cta secondary">Load more</Link>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className="bodyCard bodyCardCenteredList">
          <h2>FAQ: {stateName} {sportName} Tournaments</h2>
          <ul className="list">
            {faq.map((item) => (
              <li key={item.question}>
                <strong>{item.question}</strong>
                <br />
                {item.answer}
              </li>
            ))}
          </ul>
        </section>

        <section className="bodyCard bodyCardCenteredList">
          <h2>Explore other sports in {stateName}</h2>
          <ul className="list">
            {otherSportsInState.map((sport) => (
              <li key={sport.key}>
                <Link href={`/${sport.slug}/${params.state.toLowerCase()}`} style={{ textDecoration: "underline" }}>
                  {sport.name} tournaments in {stateName}
                </Link>
              </li>
            ))}
          </ul>
          <h2 style={{ marginTop: 16 }}>Explore {sportName} in other states</h2>
          <ul className="list">
            {otherStatesForSport.map((state) => (
              <li key={state.code}>
                <Link href={`/${params.sport.toLowerCase()}/${state.slug}`} style={{ textDecoration: "underline" }}>
                  {sportName} tournaments in {state.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
