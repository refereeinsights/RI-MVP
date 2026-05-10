import Link from "next/link";
import { mapStateCodeToSlug, mapStateCodeToName } from "@/lib/seoHub";
import { buildTIHubTitle, assertNoDoubleBrand } from "@/lib/seo/buildTITitle";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSportHubTournaments, SPORT_HUB_PAGE_SIZE } from "../_lib/getSportHubTournaments";
import { buildTournamentHotelsHref, buildTournamentVrboHref } from "@/lib/affiliates/tournamentTravelLinks";
import UsTournamentHeatmap from "@/app/_components/UsTournamentHeatmap";
import VenueMapPreviewStrip from "@/app/tournaments/_components/VenueMapPreviewStrip";
import "../tournaments.css";

const SITE_ORIGIN = "https://www.tournamentinsights.com";
const MAX_STATE_LINKS = 12;

type SportConfig = {
  displayName: string;
  intro: string;
  icon: string;
  cardClass: string;
};

const SPORT_CONFIGS: Record<string, SportConfig> = {
  soccer: {
    displayName: "Soccer",
    icon: "⚽",
    cardClass: "bg-sport-soccer",
    intro:
      "Youth soccer tournaments run year-round across the country, from spring recreational showcases to competitive summer cups and fall league events. Whether your team competes at the recreational, club, or travel level, you'll find events across every major region. TournamentInsights lists upcoming youth soccer tournaments with dates, host city, state, and links to official event websites when available. Use this directory to plan travel, confirm registration windows, and compare tournament locations ahead of time. State-level pages provide deeper views with more results filtered to your area.",
  },
  baseball: {
    displayName: "Baseball",
    icon: "⚾",
    cardClass: "bg-sport-baseball",
    intro:
      "Youth baseball tournaments span from early spring into summer, with peak activity around Memorial Day, July 4th, and end-of-season championship weekends. Events range from age-bracket classics to multi-day travel ball invitationals across the country. TournamentInsights lists upcoming youth baseball tournaments with start dates, host city, state, and official website links where available. Browse the national list for a quick overview, then drill into state pages for deeper results by region. Whether scouting a local weekend tournament or planning a multi-state trip, this directory gives you the essentials.",
  },
  softball: {
    displayName: "Softball",
    icon: "🥎",
    cardClass: "bg-sport-softball",
    intro:
      "Youth softball tournaments draw competitive travel teams and recreational leagues alike across spring, summer, and fall seasons. Fastpitch tournaments dominate the competitive calendar, while slowpitch events offer family-friendly weekend play at parks nationwide. TournamentInsights lists upcoming youth softball tournaments with dates, locations, and official website links when available. Start with this national directory to get a broad picture of upcoming events, then use state-level pages to narrow your search to nearby tournaments. Whether you're a coach, parent, or tournament director, find the basic logistics details you need here.",
  },
  basketball: {
    displayName: "Basketball",
    icon: "🏀",
    cardClass: "bg-sport-basketball",
    intro:
      "Youth basketball tournaments run nearly year-round, with high activity during winter and spring when school and club seasons overlap. Events include local in-gym invitationals, regional showcases, and large-scale national qualifier circuits. TournamentInsights lists upcoming youth basketball tournaments with dates, host city, state, and official website links when available. Filter by state to find nearby events or browse the national calendar for larger circuit tournaments. This directory focuses on practical details — where, when, and how to learn more — so you can plan your season without the guesswork.",
  },
  lacrosse: {
    displayName: "Lacrosse",
    icon: "🥍",
    cardClass: "bg-sport-lacrosse",
    intro:
      "Youth lacrosse tournaments peak in spring and early summer, when teams across the Northeast, Mid-Atlantic, and growing new regions compete in showcases, invitationals, and championship events. Both box lacrosse and field lacrosse events draw families and coaches planning multi-day travel. TournamentInsights lists upcoming youth lacrosse tournaments with dates, host city, state, and official links when available. Browse the national list to see what's coming up across all regions, or use state pages to find tournaments close to home. Clear logistics details help coaches and families plan travel well ahead of game day.",
  },
};

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function getSportConfig(sport: string): SportConfig {
  return (
    SPORT_CONFIGS[sport.toLowerCase()] ?? {
      displayName: sport.charAt(0).toUpperCase() + sport.slice(1),
      icon: "🏅",
      cardClass: "bg-sport-default",
      intro: `Browse upcoming youth ${sport} tournaments across the U.S. with dates, locations, and official links.`,
    }
  );
}

export async function SportHubPage({ sport, page }: { sport: string; page: number }) {
  const config = getSportConfig(sport);
  const { tournaments, hasMore, page: currentPage } = await getSportHubTournaments(sport, page);

  const heatmapCounts = await (async () => {
    const { data, error } = await (supabaseAdmin.rpc("get_public_directory_tournament_counts_by_state_sport" as any, {
      p_sport: sport,
    }) as any);
    if (error) return { counts: {} as Record<string, number>, max: 0 };
    const rows = (Array.isArray(data) ? data : []) as Array<{ state?: unknown; count?: unknown }>;
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const state = String(row.state ?? "").trim().toUpperCase();
      const count = Number(row.count ?? 0) || 0;
      if (!state || state.length !== 2) continue;
      counts[state] = count;
    }
    const max = Math.max(0, ...Object.values(counts));
    return { counts, max };
  })();

  const basePath = `/tournaments/${sport}`;

  // Derive up to MAX_STATE_LINKS unique states with valid slugs from results
  const stateCodesSeen = new Set<string>();
  const stateLinkItems: { code: string; slug: string; name: string }[] = [];
  for (const t of tournaments) {
    const code = (t.state ?? "").trim().toUpperCase();
    if (!code || stateCodesSeen.has(code)) continue;
    stateCodesSeen.add(code);
    const slug = mapStateCodeToSlug(code);
    const name = mapStateCodeToName(code);
    if (slug && name) {
      stateLinkItems.push({ code, slug, name });
    }
    if (stateLinkItems.length >= MAX_STATE_LINKS) break;
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Youth ${config.displayName} Tournaments`,
    url: `${SITE_ORIGIN}${basePath}`,
    itemListElement: tournaments.map((t, index) => ({
      "@type": "ListItem",
      position: (currentPage - 1) * SPORT_HUB_PAGE_SIZE + index + 1,
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
              Youth {config.displayName} Tournaments
            </h1>
            <p
              className="subtitle"
              style={{ marginTop: 8, maxWidth: 720, fontSize: 14, lineHeight: 1.6 }}
            >
              Browse upcoming tournaments, then use the map to plan hotels and Team Stays by venue location.
            </p>
          </div>

          <UsTournamentHeatmap
            countsByState={heatmapCounts.counts}
            max={heatmapCounts.max}
            tipId={`ti-sporthub-map-tip-${sport}`}
            pageType="sport_directory"
            sport={sport}
            hrefForState={(abbr) => `/tournaments?state=${encodeURIComponent(abbr)}&sports=${encodeURIComponent(sport)}#results`}
          />

          <div id="results">
          {tournaments.length === 0 ? (
            <div className="cards">
              <article className="card card-grass">
                <div className="cardHeader">
                  <div>
                    <div className="cardTitle" style={{ fontSize: 18 }}>
                      No upcoming tournaments found
                    </div>
                    <div className="cardMeta">Check back soon — new events are added regularly.</div>
                  </div>
                </div>
              </article>
            </div>
          ) : (
            <div className="grid">
              {tournaments.map((t) => {
                const start = formatDate(t.start_date);
                const end = formatDate(t.end_date);
                const dateLabel =
                  start && end && start !== end ? `${start} – ${end}` : start || end || "Dates TBA";
                const locationLabel = [t.city, t.state].filter(Boolean).join(", ");
                const venueCount = (() => {
                  const rows = (t.tournament_venues ?? []) as Array<{ count?: number | null }>;
                  const first = rows && rows.length ? rows[0] : null;
                  return Number(first?.count ?? 0) || 0;
                })();
                const showVenueMapPreview = venueCount > 0;
                const mapHref = `/tournaments/${t.slug}/map`;
                return (
                  <article key={t.id} className={`card ${config.cardClass}`}>
                    <h2>{t.name}</h2>
                    <p className="meta">
                      {config.icon} {config.displayName}
                      {locationLabel ? ` • ${locationLabel}` : ""}
                    </p>
                    <p className="dates">{dateLabel}</p>
                    {showVenueMapPreview ? (
                      <VenueMapPreviewStrip tournamentName={t.name ?? "Tournament"} venueCount={venueCount} href={mapHref} />
                    ) : null}
                    <div className="cardFooter cardFooter--ctas">
                        {(() => {
                          const city = String(t.city ?? "").trim();
                          const state = String(t.state ?? "").trim().toUpperCase();
                          const hasVrbo = Boolean(city && /^[A-Z]{2}$/.test(state));
                          return (
                            <div className={`cardCtaGrid${hasVrbo ? " cardCtaGrid--twoUp" : ""}`}>
                              <a
                                className="primaryLink cardCta--hotels"
                                href={buildTournamentHotelsHref({
                                  source: "tournament_directory",
                                  tournamentId: t.id,
                                  city: t.city ?? null,
                                  state: t.state ?? null,
                                })}
                                target="_blank"
                                rel="noopener noreferrer sponsored"
                              >
                                Find Hotels
                              </a>
                              {hasVrbo ? (
                                <a
                                  className="secondaryLink"
                                  href={buildTournamentVrboHref({
                                    source: "tournament_directory",
                                    tournamentId: t.id,
                                    city: t.city ?? null,
                                    state: t.state ?? null,
                                  })}
                                  target="_blank"
                                  rel="noopener noreferrer sponsored"
                                >
                                  Team Stays
                                </a>
                              ) : null}
                              {!showVenueMapPreview && venueCount > 0 ? (
                                <Link href={`/tournaments/${t.slug}#venues`} className="secondaryLink">
                                  See Venues
                                </Link>
                              ) : null}
                              <Link href={`/tournaments/${t.slug}`} className="cardDetailsLink">
                                Tournament Details
                              </Link>
                            </div>
                          );
                        })()}
                    </div>
                    <div className="cardFooterBadgeRow">
                      <div className="cardFooterBadge cardFooterBadge--left" />
                      <div className="sportIcon" aria-label={config.displayName}>
                        {config.icon}
                      </div>
                      <div className="cardFooterBadge cardFooterBadge--right" />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          </div>

          <section
            className="subtitle"
            style={{
              marginTop: 16,
              maxWidth: 900,
              fontSize: 14,
              lineHeight: 1.6,
              color: "#1f2937",
            }}
          >
            <p style={{ marginTop: 0, marginBottom: 0 }}>{config.intro}</p>
          </section>

          {/* Pagination */}
          {(currentPage > 1 || hasMore) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginTop: 24,
                justifyContent: "center",
              }}
            >
              {currentPage > 1 ? (
                <Link
                  href={currentPage === 2 ? basePath : `${basePath}?page=${currentPage - 1}`}
                  className="cta secondary"
                >
                  ← Prev
                </Link>
              ) : (
                <span className="cta secondary" aria-disabled="true" style={{ opacity: 0.4, cursor: "default" }}>
                  ← Prev
                </span>
              )}
              <span style={{ fontSize: 14, color: "var(--color-text-muted, #666)" }}>
                Page {currentPage}
              </span>
              {hasMore ? (
                <Link href={`${basePath}?page=${currentPage + 1}`} className="cta secondary">
                  Next →
                </Link>
              ) : (
                <span className="cta secondary" aria-disabled="true" style={{ opacity: 0.4, cursor: "default" }}>
                  Next →
                </span>
              )}
            </div>
          )}

          {/* Browse by state */}
          {stateLinkItems.length > 0 && (
            <aside
              style={{
                marginTop: 40,
                padding: "20px 24px",
                background: "var(--color-surface-subtle, #f5f5f2)",
                borderRadius: 10,
              }}
            >
              <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 12 }}>
                Browse {config.displayName} Tournaments by State
              </h2>
              <ul
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px 16px",
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                }}
              >
                {stateLinkItems.map(({ code, slug, name }) => (
                  <li key={code}>
                    <Link
                      href={`/${sport}/${slug}`}
                      style={{ fontSize: 14, textDecoration: "underline", color: "inherit" }}
                    >
                      {name}
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </section>
      </main>
    </>
  );
}

export function getSportHubMetadata(sport: string) {
  const config = getSportConfig(sport);
  const title = buildTIHubTitle("All States", config.displayName, new Date().getFullYear());
  assertNoDoubleBrand(title);
  const description = `Find upcoming youth ${config.displayName.toLowerCase()} tournaments across the U.S. Dates, locations, venues, and official links.`;
  const canonicalPath = `/tournaments/${sport}`;

  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_ORIGIN}${canonicalPath}`,
      images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    },
  };
}
