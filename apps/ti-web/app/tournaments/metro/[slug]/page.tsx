import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TI_SPORT_LABELS } from "@/lib/tiSports";
import StateMultiSelect from "../../StateMultiSelect";
import AutoSubmitCheckbox from "@/components/filters/AutoSubmitCheckbox";
import AutoSubmitSelect from "@/components/filters/AutoSubmitSelect";
import { getMetroMarketTournaments } from "../../_lib/getMetroMarketTournaments";
import "../../tournaments.css";

type Tournament = {
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
type TournamentVenueLink = {
  tournament_id: string;
  venue_id: string;
};
type OwlRunRow = {
  id: string;
  run_id?: string | null;
  venue_id: string;
  status?: string | null;
};
type OwlNearbyRow = {
  run_id: string;
};

// Cache for 5 minutes.
export const revalidate = 300;

const ISSUE_EMAIL = "tournamentinsights@gmail.com";
const SITE_ORIGIN = "https://www.tournamentinsights.com";

const DEMO_TOURNAMENT_SLUG = "refereeinsights-demo-tournament";
const SPORTS_LABELS: Record<string, string> = { ...TI_SPORT_LABELS, unknown: "Unknown" };

type MetroMarketFaqItem = { q: string; a: string };
type MetroMarketSeoContent = {
  title: string;
  label: string;
  states: string[];
  intro: string;
  faq: MetroMarketFaqItem[];
};

const metroMarketSeoContent: Record<
  string,
  MetroMarketSeoContent
> = {
  "dc-metro": {
    title: "DC Metro Youth Sports Tournaments",
    label: "DC Metro",
    states: ["DC", "VA", "MD"],
    intro:
      "The DC Metro area is a highly active youth sports travel market connecting Washington DC, Northern Virginia, and Maryland. This page brings together tournaments across the region so families, teams, and officials can discover events and plan more efficiently.",
    faq: [
      {
        q: "What does the DC Metro area include?",
        a: "This page groups tournaments across Washington DC, Northern Virginia, and Maryland to make regional tournament discovery easier.",
      },
      {
        q: "Are tournaments limited to Washington DC?",
        a: "No. This page includes tournaments across the broader DC Metro region, including nearby areas in Virginia and Maryland.",
      },
    ],
  },
  "new-england": {
    title: "New England Youth Sports Tournaments",
    label: "New England",
    states: ["CT", "RI", "ME", "NH"],
    intro:
      "New England offers a wide range of youth sports tournaments across several closely connected states. This page combines tournaments from across the region to help families and teams find more opportunities and plan travel efficiently.",
    faq: [
      {
        q: "Which states are included in New England on this page?",
        a: "This page groups tournaments across our New England market, including Connecticut, Rhode Island, Maine, and New Hampshire.",
      },
      {
        q: "Why are multiple states combined?",
        a: "Many teams travel across New England for tournaments, so a regional view makes it easier to compare and plan.",
      },
    ],
  },
  "southern-california": {
    title: "Southern California Youth Sports Tournaments",
    label: "Southern California",
    states: ["CA"],
    intro:
      "Southern California is one of the busiest youth sports regions in the country, with a dense network of tournament venues. This page highlights tournaments across key Southern California cities so families, teams, and officials can discover events and plan trips more efficiently.",
    faq: [
      {
        q: "What does Southern California include on this page?",
        a: "This page groups youth sports tournaments across Southern California, including events held in major tournament cities and venues throughout the region.",
      },
      {
        q: "Are tournaments shown here limited to one city?",
        a: "No. This page is designed to help families, teams, and officials explore tournaments across the broader Southern California region.",
      },
    ],
  },
  "northern-california": {
    title: "Northern California Youth Sports Tournaments",
    label: "Northern California",
    states: ["CA"],
    intro:
      "Northern California has a strong network of youth sports venues across the Bay Area, Sacramento region, and surrounding areas. This page brings together tournaments across those locations to provide a more complete regional view.",
    faq: [
      {
        q: "What does Northern California include on this page?",
        a: "This page groups tournaments across key Northern California cities and tournament venues to improve regional discovery.",
      },
      {
        q: "Why use a Northern California page instead of a city search?",
        a: "Regional pages help users discover more tournaments across connected areas rather than limiting results to a single city.",
      },
    ],
  },
  "texas-triangle": {
    title: "Texas Triangle Youth Sports Tournaments",
    label: "Texas Triangle",
    states: ["TX"],
    intro:
      "The Texas Triangle is one of the largest and most active youth sports regions in the United States. This page combines tournaments across major Texas travel hubs to help families and teams find more events and plan efficiently.",
    faq: [
      {
        q: "What is the Texas Triangle in this context?",
        a: "It refers to a major Texas travel region where many youth sports tournaments are hosted across connected cities.",
      },
      {
        q: "Why use a regional tournament page?",
        a: "Regional pages make it easier to compare tournaments across a broader travel area instead of searching one location at a time.",
      },
    ],
  },
  "great-lakes": {
    title: "Great Lakes Youth Sports Tournaments",
    label: "Great Lakes",
    states: ["IL", "IN", "OH", "MI"],
    intro:
      "The Great Lakes region supports a high volume of youth sports tournaments across multiple connected states. This page helps families and teams explore events across the region in one place.",
    faq: [
      {
        q: "Which states are included in the Great Lakes region?",
        a: "This page groups tournaments from Illinois, Indiana, Ohio, and Michigan.",
      },
      {
        q: "Is this page only for one sport?",
        a: "No. It is designed to support tournament discovery across all supported sports.",
      },
    ],
  },
  southeast: {
    title: "Southeast Youth Sports Tournaments",
    label: "Southeast",
    states: ["GA", "FL", "NC", "SC", "TN"],
    intro:
      "The Southeast is one of the most active youth sports regions, with tournaments happening across multiple connected states year-round. This page helps families and teams discover more opportunities across the region.",
    faq: [
      {
        q: "What does the Southeast region include?",
        a: "This page groups tournaments across our Southeast market, including Georgia, Florida, North Carolina, South Carolina, and Tennessee.",
      },
      {
        q: "Why combine multiple states?",
        a: "Many teams travel across the Southeast, so a regional page makes discovery and planning easier.",
      },
    ],
  },
  "mountain-west": {
    title: "Mountain West Youth Sports Tournaments",
    label: "Mountain West",
    states: ["CO", "UT", "NV", "AZ"],
    intro:
      "The Mountain West region continues to grow as a destination for youth sports tournaments. This page combines tournaments across key states to provide a broader regional view for families and teams.",
    faq: [
      {
        q: "Which states are included in the Mountain West?",
        a: "This page groups tournaments across Colorado, Utah, Nevada, and Arizona.",
      },
      {
        q: "Who is this page for?",
        a: "It is designed for families, teams, coaches, and officials looking to discover tournaments across the region.",
      },
    ],
  },
  "pacific-northwest": {
    title: "Pacific Northwest Youth Sports Tournaments",
    label: "Pacific Northwest",
    states: ["WA", "OR", "ID"],
    intro:
      "The Pacific Northwest offers a strong mix of local and travel youth sports tournaments. This page provides a regional view of tournaments across Washington, Oregon, and Idaho.",
    faq: [
      {
        q: "Which states are included in the Pacific Northwest?",
        a: "This page groups tournaments across Washington, Oregon, and Idaho.",
      },
      {
        q: "Why use a regional page instead of a single state?",
        a: "Regional pages help users discover more relevant tournaments across connected travel areas.",
      },
    ],
  },
};

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function monthOptions(count = 9) {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    out.push({ value, label });
  }
  return out;
}

function sportIcon(sport: string | null) {
  const normalized = (sport ?? "").toLowerCase();
  if (normalized === "lacrosse") return <img className="sportSvgIcon" src="/brand/lacrosse_icon.svg" alt="" />;
  if (normalized === "hockey") return <img className="sportSvgIcon" src="/svg/sports/hockey_puck_icon.svg" alt="" />;
  if (normalized === "volleyball") return "🏐";
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
    default:
      return "🏅";
  }
}

function cardVariant(sport: string | null) {
  const normalized = (sport ?? "").toLowerCase();
  if (normalized === "basketball") return "card-basketball";
  return "card-grass";
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

function getSummarySportClass(sport: string) {
  return `summary-sport-${sport.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const safeSlug = (params.slug ?? "").toLowerCase();
  const seo = metroMarketSeoContent[safeSlug];
  if (!seo) return { robots: { index: false, follow: false } };

  const canonical = `/tournaments/metro/${safeSlug}`;
  const description = seo.intro;
  return {
    title: seo.title,
    description,
    alternates: { canonical },
    openGraph: {
      title: seo.title,
      description,
      type: "website",
      url: `${SITE_ORIGIN}${canonical}`,
      siteName: "TournamentInsights",
      images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description,
      images: ["/og-default.png"],
    },
  };
}

export default async function MetroMarketTournamentsPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: {
    q?: string;
    state?: string | string[];
    month?: string;
    sports?: string | string[];
    includePast?: string;
    aysoOnly?: string;
  };
}) {
  const marketSlug = (params.slug ?? "").trim().toLowerCase();
  const seo = metroMarketSeoContent[marketSlug] ?? null;

  const q = (searchParams?.q ?? "").trim();
  const stateParam = searchParams?.state;
  const month = (searchParams?.month ?? "").trim(); // YYYY-MM
  const sportsParam = searchParams?.sports;
  const includePastParam = searchParams?.includePast;
  const aysoOnlyParam = searchParams?.aysoOnly;
  const includePast = Array.isArray(includePastParam)
    ? includePastParam.includes("true")
    : (includePastParam ?? "").toLowerCase() === "true";
  const aysoOnly = Array.isArray(aysoOnlyParam)
    ? aysoOnlyParam.includes("true")
    : (aysoOnlyParam ?? "").toLowerCase() === "true";
  const sportsSelectedRaw = Array.isArray(sportsParam) ? sportsParam : sportsParam ? [sportsParam] : [];
  const sportsSelected = sportsSelectedRaw.map((s) => s.toLowerCase()).filter(Boolean);
  const stateSelectionsRaw = (Array.isArray(stateParam) ? stateParam : stateParam ? [stateParam] : [])
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const ALL_STATES_VALUE = "__ALL__";
  const stateSelections = stateSelectionsRaw.filter((s) => s !== ALL_STATES_VALUE);
  const isAllStates = stateSelections.length === 0 || stateSelectionsRaw.includes(ALL_STATES_VALUE);
  const stateSummaryLabel = isAllStates
    ? "All states"
    : stateSelections.length <= 3
    ? stateSelections.join(", ")
    : `${stateSelections.length} states`;

  const tournamentsIssueMailto = `mailto:${ISSUE_EMAIL}?subject=${encodeURIComponent(
    "Tournament issue report"
  )}&body=${encodeURIComponent(
    `Page: ${SITE_ORIGIN}/tournaments/metro/${marketSlug}\n\nDescribe the issue:`
  )}`;

  const { market, tournaments: tournamentsData } = await getMetroMarketTournaments({
    slug: marketSlug,
    q,
    month,
    includePast,
  });

  if (!market) notFound();

  // Keep directory behavior identical from here down (filters + badges + sorting).
  const tournamentsClean = (tournamentsData ?? [])
    .filter((t): t is Tournament => Boolean(t?.id && t?.name && t?.slug))
    .filter((t) => {
      if (!aysoOnly) return true; // default: include AYSO + non-AYSO
      return (t.tournament_association ?? "").trim().toUpperCase() === "AYSO";
    });

  const stateFilterActive = !isAllStates && stateSelections.length > 0;
  const tournamentsScopedForSportCounts = stateFilterActive
    ? tournamentsClean.filter((t) => stateSelections.includes((t.state ?? "").trim().toUpperCase()))
    : tournamentsClean;

  const sportsCounts = tournamentsScopedForSportCounts.reduce((acc: Record<string, number>, t) => {
    const key = (t.sport ?? "unknown").toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  if (!Object.prototype.hasOwnProperty.call(sportsCounts, "lacrosse")) {
    sportsCounts.lacrosse = 0;
  }

  const sportsSorted = Object.entries(sportsCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([sport, count]) => ({ sport, count }));

  const tournamentsBySport = sportsSelected.length
    ? tournamentsClean.filter((t) => {
        const key = (t.sport ?? "unknown").toLowerCase();
        return sportsSelected.includes(key);
      })
    : tournamentsClean;

  const availableStates = Array.from(
    new Set(
      tournamentsBySport
        .map((t) => (t.state ?? "").trim().toUpperCase())
        .filter(Boolean)
    )
  ).sort();

  const stateCounts = tournamentsBySport.reduce<Record<string, number>>((acc, t) => {
    const key = (t.state ?? "").trim().toUpperCase();
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const tournaments = isAllStates
    ? tournamentsBySport
    : tournamentsBySport.filter((t) => stateSelections.includes((t.state ?? "").trim().toUpperCase()));

  const filteredSportCounts = tournaments.reduce<Record<string, number>>((acc, t) => {
    const key = (t.sport ?? "unknown").toLowerCase();
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const hasOwlsEyeByTournament = new Map<string, boolean>();
  if (tournaments.length > 0) {
    const tournamentIds = tournaments.map((t) => t.id);
    const { data: linkRows } = await supabaseAdmin
      .from("tournament_venues" as any)
      .select("tournament_id,venue_id")
      .in("tournament_id", tournamentIds)
      .eq("is_inferred", false);

    const links = (linkRows as TournamentVenueLink[] | null) ?? [];
    const linksByTournament = new Map<string, string[]>();
    const venueIds = new Set<string>();
    for (const row of links) {
      if (!row?.tournament_id || !row?.venue_id) continue;
      const list = linksByTournament.get(row.tournament_id) ?? [];
      list.push(row.venue_id);
      linksByTournament.set(row.tournament_id, list);
      venueIds.add(row.venue_id);
    }

    if (venueIds.size > 0) {
      const { data: runRows } = await supabaseAdmin
        .from("owls_eye_runs" as any)
        .select("id,run_id,venue_id,status")
        .in("venue_id", Array.from(venueIds));
      const runs = (runRows as OwlRunRow[] | null) ?? [];
      const runIds = Array.from(new Set(runs.map((r) => r.run_id ?? r.id).filter(Boolean))) as string[];

      if (runIds.length > 0) {
        const { data: nearbyRows } = await supabaseAdmin
          .from("owls_eye_nearby_food" as any)
          .select("run_id")
          .in("run_id", runIds);
        const nearbyRunIds = new Set(((nearbyRows as OwlNearbyRow[] | null) ?? []).map((row) => row.run_id));
        const venuesWithNearby = new Set(
          runs.filter((run) => nearbyRunIds.has((run.run_id ?? run.id) as string)).map((run) => run.venue_id)
        );
        for (const tournamentId of tournamentIds) {
          const venueList = linksByTournament.get(tournamentId) ?? [];
          hasOwlsEyeByTournament.set(tournamentId, venueList.some((venueId) => venuesWithNearby.has(venueId)));
        }
      }
    }
  }

  const tournamentsSorted = [...tournaments].sort((a, b) => {
    const aDemo = Boolean(a.is_demo) || a.slug === DEMO_TOURNAMENT_SLUG;
    const bDemo = Boolean(b.is_demo) || b.slug === DEMO_TOURNAMENT_SLUG;
    if (aDemo !== bDemo) return aDemo ? -1 : 1;
    const aDate = a.start_date || a.end_date || "";
    const bDate = b.start_date || b.end_date || "";
    return aDate.localeCompare(bDate);
  });

  const months = monthOptions();
  const actionPath = `/tournaments/metro/${marketSlug}`;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: seo?.title ?? `${market.name} Tournaments`,
    url: `${SITE_ORIGIN}${actionPath}`,
    description: seo?.intro,
  };

  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        <div className="headerBlock brandedHeader">
          <h1 className="title" style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.01em" }}>
            {seo?.label ? `${seo.label} Tournaments` : "Tournament Directory"}
          </h1>
          <p
            className="subtitle"
            style={{
              marginTop: 8,
              maxWidth: 720,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {seo?.states?.length
              ? `Browse upcoming tournaments in ${seo.label} (${seo.states.join(", ")}).`
              : "Browse upcoming tournaments by sport, state, and month."}{" "}
            This directory focuses on logistics and basic details — no ratings or referee reviews.
          </p>
          {seo?.intro ? (
            <div
              className="subtitle"
              style={{
                marginTop: 10,
                maxWidth: 860,
                fontSize: 14,
                lineHeight: 1.6,
                color: "#1f2937",
              }}
            >
              <p style={{ marginTop: 0, marginBottom: 0 }}>{seo.intro}</p>
            </div>
          ) : null}
          <nav
            aria-label="Browse tournament sport hubs"
            style={{
              marginTop: 12,
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              fontSize: 14,
            }}
          >
            <Link href="/tournaments" style={{ textDecoration: "underline", color: "inherit" }}>
              All tournaments
            </Link>
            <Link href="/tournaments/soccer" style={{ textDecoration: "underline", color: "inherit" }}>
              Soccer
            </Link>
            <Link href="/tournaments/baseball" style={{ textDecoration: "underline", color: "inherit" }}>
              Baseball
            </Link>
            <Link href="/tournaments/softball" style={{ textDecoration: "underline", color: "inherit" }}>
              Softball
            </Link>
            <Link href="/tournaments/basketball" style={{ textDecoration: "underline", color: "inherit" }}>
              Basketball
            </Link>
            <Link href="/tournaments/lacrosse" style={{ textDecoration: "underline", color: "inherit" }}>
              Lacrosse
            </Link>
            <Link href="/tournaments/hockey" style={{ textDecoration: "underline", color: "inherit" }}>
              Hockey
            </Link>
            <Link href="/tournaments/ayso" style={{ textDecoration: "underline", color: "inherit" }}>
              AYSO
            </Link>
          </nav>
          <div
            className="subtitle"
            style={{
              marginTop: 12,
              maxWidth: 860,
              fontSize: 14,
              lineHeight: 1.6,
              color: "#1f2937",
            }}
          >
            <p style={{ marginTop: 0 }}>
              Tournament Insights is building a public directory so teams and families can evaluate events before
              committing. Listings are compiled from public sources and organizer submissions; we show what we have and
              invite corrections. No ratings or crowd reviews are shown—just the dates, location, sport, and official
              links you need to plan.
            </p>
            <p style={{ marginBottom: 0 }}>
              If you see an issue, flag it and we’ll verify with the organizer. This is a logistics-first directory:
              simple, factual, and focused on helping you make faster decisions.
            </p>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              gap: 12,
              marginTop: 10,
              marginBottom: 12,
            }}
          >
            <a
              href={tournamentsIssueMailto}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
                color: "#0b1f14",
                background: "rgba(0,0,0,0.04)",
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: 999,
                padding: "6px 12px",
                fontWeight: 700,
                fontSize: 13,
                minHeight: 40,
              }}
            >
              Report an issue
            </a>
            <span style={{ fontSize: 12, color: "#0b1f14" }}>
              Flag incorrect info or request an update from organizers.
            </span>
          </div>
        </div>

        <form className="filters" method="GET" action={actionPath}>
          <div>
            <label className="label" htmlFor="q">
              Search
            </label>
            <input id="q" name="q" className="input" placeholder="Search tournaments..." defaultValue={q} />
          </div>

          <div>
            <span className="label">State</span>
            <StateMultiSelect
              availableStates={availableStates}
              stateSelections={stateSelections}
              isAllStates={isAllStates}
              allStatesValue={ALL_STATES_VALUE}
              summaryLabel={stateSummaryLabel}
              stateCounts={stateCounts}
              totalCount={tournamentsBySport.length}
              autoSubmit
            />
          </div>

          <div>
            <label className="label" htmlFor="month">
              Month
            </label>
            <AutoSubmitSelect id="month" name="month" className="select" defaultValue={month}>
              <option value="">Any</option>
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </AutoSubmitSelect>
          </div>

          <div className="sportsRow">
            {sportsSorted.map(({ sport, count }) => (
              <label key={sport} className="sportToggle">
                <AutoSubmitCheckbox
                  type="checkbox"
                  name="sports"
                  value={sport}
                  defaultChecked={sportsSelected.includes(sport)}
                />
                <span>
                  {SPORTS_LABELS[sport] || sport} ({count})
                </span>
              </label>
            ))}
            <label className="sportToggle">
              <input type="hidden" name="includePast" value="false" />
              <input type="checkbox" name="includePast" value="true" defaultChecked={includePast} />
              <span>Include past events</span>
            </label>
            <label className="sportToggle">
              <input type="hidden" name="aysoOnly" value="false" />
              <input type="checkbox" name="aysoOnly" value="true" defaultChecked={aysoOnly} />
              <span>AYSO only</span>
            </label>
          </div>

          <div className="actionsRow">
            <button type="submit" className="smallBtn">
              Apply
            </button>
            <a className="smallBtn" href={actionPath}>
              Reset
            </a>
          </div>
        </form>

        {sportsSorted.length
          ? (() => {
              const badges =
                sportsSelected.length > 0
                  ? sportsSelected.map((sport) => ({ sport, count: filteredSportCounts[sport] ?? 0 }))
                  : sportsSorted.slice(0, 7);
              const row1 = badges.slice(0, 3);
              const row2 = badges.slice(3, 7);

              const renderCard = (sport: string, count: number) => (
                <Link
                  key={sport}
                  href={(() => {
                    const params = new URLSearchParams();
                    if (q) params.set("q", q);
                    if (!isAllStates) stateSelections.forEach((st) => params.append("state", st));
                    if (month) params.set("month", month);
                    params.set("includePast", includePast ? "true" : "false");
                    params.set("aysoOnly", aysoOnly ? "true" : "false");
                    params.set("sports", sport);
                    return `${actionPath}?${params.toString()}`;
                  })()}
                  className={`card card--mini ${getSportCardClass(sport)} ${getSummarySportClass(
                    sport
                  )} summaryBadgeFixed`}
                >
                  <div className="summaryCount">{count}</div>
                  <div className="summaryLabel">{SPORTS_LABELS[sport] || sport}</div>
                  <div className="summaryIcon" aria-hidden="true">
                    {sportIcon(sport)}
                  </div>
                </Link>
              );

              return (
                <>
                  <div className="summaryTotalRow">
                    <article className="card card--mini bg-sport-default summary-total">
                      <div className="summaryCount">{tournamentsSorted.length}</div>
                      <div className="summaryLabel">TOTAL TOURNAMENTS</div>
                      <div className="summaryIcon summaryIcon--ri" aria-hidden="true">
                        <img src="/svg/ti/tournamentinsights_mark_transparent.svg" alt="" />
                      </div>
                    </article>
                  </div>
                  <div className="summaryGrid summaryGrid--twoRows">
                    <div className="summaryRow summaryRow--top">
                      {row1.map(({ sport, count }) => renderCard(sport, count))}
                    </div>
                    <div className="summaryRow summaryRow--bottom">
                      {row2.map(({ sport, count }) => renderCard(sport, count))}
                    </div>
                  </div>
                </>
              );
            })()
          : null}

        {tournamentsSorted.length === 0 ? (
          <div className="cards">
            <article className={`card ${cardVariant(null)}`}>
              <div className="cardHeader">
                <div>
                  <div className="cardTitle" style={{ fontSize: 18 }}>
                    No tournaments match your filters
                  </div>
                  <div className="cardMeta">Try clearing search or selecting “Any” filters.</div>
                </div>
              </div>
            </article>
          </div>
        ) : (
          <div className="grid">
            {tournamentsSorted.map((t) => {
              const start = formatDate(t.start_date);
              const end = formatDate(t.end_date);
              const dateLabel = start && end && start !== end ? `${start} – ${end}` : start || end || "Dates TBA";
              const locationLabel = [t.city, t.state].filter(Boolean).join(", ");
              const isDemoTournament = t.slug === DEMO_TOURNAMENT_SLUG;
              const showOwlsEyeBadge = isDemoTournament || Boolean(hasOwlsEyeByTournament.get(t.id));
              const showStaffVerified = Boolean(t.tournament_staff_verified) || isDemoTournament;
              const hasOfficialSite = Boolean(t.official_website_url) && !isDemoTournament;

              return (
                <article key={t.id} className={`card ${getSportCardClass(t.sport)}`}>
                  <h2>{t.name}</h2>

                  <p className="meta">
                    <strong>{SPORTS_LABELS[(t.sport ?? "unknown").toLowerCase()] ?? "Tournament"}</strong>
                    {locationLabel ? ` • ${locationLabel}` : ""}
                    {t.level ? ` • ${t.level}` : ""}
                  </p>

                  <p className="dates">{dateLabel}</p>

                  <div className="cardFooter">
                    {hasOfficialSite ? (
                      <a
                        href={t.official_website_url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="secondaryLink"
                      >
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
                  <div className="cardFooterBadgeRow">
                    <div className="cardFooterBadge cardFooterBadge--left">
                      {showStaffVerified ? (
                        <img
                          className="listingBadgeIcon listingBadgeIcon--verified"
                          src="/svg/ri/tournament_staff_verified.svg"
                          alt="Tournament staff verified"
                        />
                      ) : null}
                    </div>
                    <div className="sportIcon" aria-label={t.sport ?? "tournament sport"}>
                      {sportIcon(t.sport)}
                    </div>
                    <div className="cardFooterBadge cardFooterBadge--right">
                      {showOwlsEyeBadge ? (
                        <img
                          className="listingBadgeIcon listingBadgeIcon--owlsEye"
                          src="/svg/ri/owls_eye_badge.svg"
                          alt="Owl's Eye insights available"
                        />
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {seo?.faq?.length ? (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(0,0,0,0.12)" }}>
            <h2 style={{ margin: "0 0 10px 0", fontSize: 15 }}>FAQ</h2>
            {seo.faq.map((item) => (
              <div key={item.q} style={{ margin: "0 0 12px 0" }}>
                <div style={{ fontWeight: 800 }}>{item.q}</div>
                <div style={{ marginTop: 4, color: "#334155", lineHeight: 1.5 }}>{item.a}</div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
