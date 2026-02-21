import Link from "next/link";
import type { Metadata } from "next";
import StateMultiSelect from "../StateMultiSelect";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import "../tournaments.css";
import { HUBS, type HubKey, SPORTS_LABELS } from "./config";

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
};
type TournamentVenueLink = {
  tournament_id: string;
  venue_id: string;
};
type OwlRunRow = {
  id: string;
  run_id?: string | null;
  venue_id: string;
};
type OwlNearbyRow = {
  run_id: string;
};

type HubSearchParams = {
  q?: string;
  state?: string | string[];
  month?: string;
  includePast?: string;
};

const DEMO_TOURNAMENT_SLUG = "refereeinsights-demo-tournament";

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

function getSportCardClass(sport: string | null) {
  const normalized = (sport ?? "").toLowerCase();
  const map: Record<string, string> = {
    soccer: "bg-sport-soccer",
    lacrosse: "bg-sport-lacrosse",
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

function getHubHeading(hub: HubKey) {
  return hub === "ayso" ? "AYSO Soccer Tournaments" : `${SPORTS_LABELS[HUBS[hub].sport] ?? "Youth"} Tournaments`;
}

function canonicalPath(hub: HubKey) {
  return `/tournaments/${hub}`;
}

const SITE_ORIGIN = "https://www.tournamentinsights.com";

export function getHubMetadata(hub: HubKey): Metadata {
  const heading = getHubHeading(hub);
  const description =
    hub === "ayso"
      ? "Browse AYSO soccer tournaments with dates, locations, and official links for logistics-first planning."
      : `Browse youth ${HUBS[hub].sport} tournaments with dates, locations, and official links for logistics-first planning.`;

  return {
    title: heading,
    description,
    alternates: {
      canonical: canonicalPath(hub),
    },
    openGraph: {
      title: heading,
      description,
      url: `${SITE_ORIGIN}${canonicalPath(hub)}`,
      images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    },
  };
}

export async function HubTournamentsPage({
  hub,
  searchParams,
}: {
  hub: HubKey;
  searchParams?: HubSearchParams;
}) {
  const config = HUBS[hub];
  const q = (searchParams?.q ?? "").trim();
  const stateParam = searchParams?.state;
  const month = (searchParams?.month ?? "").trim();
  const includePastParam = searchParams?.includePast;
  const includePast = Array.isArray(includePastParam)
    ? includePastParam.includes("true")
    : (includePastParam ?? "").toLowerCase() === "true";

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

  let query = supabaseAdmin
    .from("tournaments_public" as any)
    .select("id,name,slug,sport,tournament_association,state,city,zip,start_date,end_date,official_website_url,source_url,level")
    .eq("sport", config.sport)
    .order("start_date", { ascending: true });

  const today = new Date().toISOString().slice(0, 10);
  if (!includePast) {
    query = query.or(`start_date.gte.${today},end_date.gte.${today}`);
  }
  if (q) {
    query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%`);
  }
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    query = query.gte("start_date", start.toISOString().slice(0, 10)).lt("start_date", end.toISOString().slice(0, 10));
  }

  const { data: tournamentsData, error } = await query;
  if (error) {
    return (
      <main className="pitchWrap tournamentsWrap">
        <section className="field tournamentsField">
          <div className="headerBlock">
            <h1 className="title">Tournament Directory</h1>
            <p className="subtitle">We couldn’t load tournaments right now. Please try again.</p>
          </div>
        </section>
      </main>
    );
  }

  const tournamentsClean = (tournamentsData ?? [])
    .filter((t): t is Tournament => Boolean(t?.id && t?.name && t?.slug))
    .filter((t) => {
      const association = (t.tournament_association ?? "").trim().toUpperCase();
      if (hub === "ayso") return association === "AYSO";
      return association !== "AYSO";
    });

  const sportsCounts = tournamentsClean.reduce((acc: Record<string, number>, t) => {
    const key = (t.sport ?? "unknown").toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const sportsSorted = Object.entries(sportsCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([sport, count]) => ({ sport, count }));

  const availableStates = Array.from(
    new Set(
      tournamentsClean
        .map((t) => (t.state ?? "").trim().toUpperCase())
        .filter(Boolean)
    )
  ).sort();

  const stateCounts = tournamentsClean.reduce<Record<string, number>>((acc, t) => {
    const key = (t.state ?? "").trim().toUpperCase();
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const tournaments = isAllStates
    ? tournamentsClean
    : tournamentsClean.filter((t) => stateSelections.includes((t.state ?? "").trim().toUpperCase()));

  const hasOwlsEyeByTournament = new Map<string, boolean>();
  if (tournaments.length > 0) {
    const tournamentIds = tournaments.map((t) => t.id);
    const { data: linkRows } = await supabaseAdmin
      .from("tournament_venues" as any)
      .select("tournament_id,venue_id")
      .in("tournament_id", tournamentIds);

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
        .select("id,run_id,venue_id")
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
    if (a.slug === DEMO_TOURNAMENT_SLUG && b.slug !== DEMO_TOURNAMENT_SLUG) return -1;
    if (b.slug === DEMO_TOURNAMENT_SLUG && a.slug !== DEMO_TOURNAMENT_SLUG) return 1;
    const aDate = a.start_date || a.end_date || "";
    const bDate = b.start_date || b.end_date || "";
    return aDate.localeCompare(bDate);
  });

  const months = monthOptions();
  const formAction = canonicalPath(hub);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: tournamentsSorted.map((t, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_ORIGIN}/tournaments/${t.slug}`,
      name: t.name,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="pitchWrap tournamentsWrap">
        <section className="field tournamentsField">
          <div className="headerBlock brandedHeader">
            <h1 className="title" style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.01em" }}>
              {getHubHeading(hub)}
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
              Browse upcoming tournaments by state and month. This directory focuses on logistics and basic details.
            </p>
          </div>

          <form className="filters" method="GET" action={formAction}>
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
                totalCount={tournamentsClean.length}
              />
            </div>

            <div>
              <label className="label" htmlFor="month">
                Month
              </label>
              <select id="month" name="month" className="select" defaultValue={month}>
                <option value="">Any</option>
                {months.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sportsRow">
              <label className="sportToggle">
                <input type="hidden" name="includePast" value="false" />
                <input type="checkbox" name="includePast" value="true" defaultChecked={includePast} />
                <span>Include past events</span>
              </label>
            </div>

            <div className="actionsRow">
              <button type="submit" className="smallBtn">
                Apply
              </button>
              <a className="smallBtn" href={formAction}>
                Reset
              </a>
            </div>
          </form>

          {sportsSorted.length ? (
            <div className="summaryGrid">
              <article className="card card--mini bg-sport-default summary-total">
                <div className="summaryCount">{tournamentsSorted.length}</div>
                <div className="summaryLabel">TOTAL TOURNAMENTS</div>
                <div className="summaryIcon summaryIcon--ri" aria-hidden="true">
                  <img src="/svg/ti/tournamentinsights_mark_transparent.svg" alt="" />
                </div>
              </article>
              {sportsSorted.map(({ sport, count }) => (
                <article key={sport} className={`card card--mini ${getSportCardClass(sport)} ${getSummarySportClass(sport)}`}>
                  <div className="summaryCount">{count}</div>
                  <div className="summaryLabel">{SPORTS_LABELS[sport] || sport}</div>
                  <div className="summaryIcon" aria-hidden="true">
                    {sportIcon(sport)}
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {tournamentsSorted.length === 0 ? (
            <div className="cards">
              <article className="card card-grass">
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
                const dateLabel =
                  start && end && start !== end ? `${start} – ${end}` : start || end || "Dates TBA";
                const locationLabel = [t.city, t.state].filter(Boolean).join(", ");
                const isDemoTournament = t.slug === DEMO_TOURNAMENT_SLUG;
                const showOwlsEyeBadge = isDemoTournament || Boolean(hasOwlsEyeByTournament.get(t.id));
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
                      <div className="cardFooterBadge cardFooterBadge--left" />
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
        </section>
      </main>
    </>
  );
}
