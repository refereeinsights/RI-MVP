import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import StateMultiSelect from "./StateMultiSelect";
import "./tournaments.css";

type Tournament = {
  id: string;
  name: string;
  slug: string;
  sport: string | null;
  state: string | null;
  city: string | null;
  zip?: string | null;
  start_date: string | null;
  end_date: string | null;
  official_website_url?: string | null;
  source_url?: string | null;
  level?: string | null;
};

// Cache for 5 minutes.
export const revalidate = 300;

export const metadata = {
  title: "Browse Youth Tournaments",
  description: "Search youth tournaments by sport, location, and date. View official event details and planning information.",
  alternates: {
    canonical: "/tournaments",
  },
};

const SPORTS_LABELS: Record<string, string> = {
  soccer: "Soccer",
  basketball: "Basketball",
  football: "Football",
  baseball: "Baseball",
  softball: "Softball",
  volleyball: "Volleyball",
  lacrosse: "Lacrosse",
  wrestling: "Wrestling",
  hockey: "Hockey",
  unknown: "Unknown",
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
  if (normalized === "lacrosse") {
    return <img className="sportSvgIcon" src="/brand/lacrosse_icon.svg" alt="" />;
  }
  switch (normalized) {
    case "soccer":
      return "⚽";
    case "football":
      return "🏈";
    case "baseball":
      return "⚾";
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
    lacrosse: "bg-sport-soccer",
    basketball: "bg-sport-basketball",
    football: "bg-sport-football",
    baseball: "bg-sport-baseball",
  };
  return map[normalized] ?? "bg-sport-default";
}

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    state?: string | string[];
    month?: string;
    sports?: string | string[];
    includePast?: string;
  };
}) {
  const q = (searchParams?.q ?? "").trim();
  const stateParam = searchParams?.state;
  const month = (searchParams?.month ?? "").trim(); // YYYY-MM
  const sportsParam = searchParams?.sports;
  const includePastParam = searchParams?.includePast;
  const includePast = Array.isArray(includePastParam)
    ? includePastParam.includes("true")
    : (includePastParam ?? "").toLowerCase() === "true";
  const sportsSelectedRaw = Array.isArray(sportsParam)
    ? sportsParam
    : sportsParam
    ? [sportsParam]
    : [];
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

  let query = supabaseAdmin
    .from("tournaments_public" as any)
    .select("id,name,slug,sport,state,city,zip,start_date,end_date,official_website_url,source_url,level")
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
    const startISO = start.toISOString().slice(0, 10);
    const endISO = end.toISOString().slice(0, 10);
    query = query.gte("start_date", startISO).lt("start_date", endISO);
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

  const tournamentsClean = (tournamentsData ?? []).filter((t): t is Tournament => Boolean(t?.id && t?.name && t?.slug));
  const sportsCounts = tournamentsClean.reduce((acc: Record<string, number>, t) => {
    const key = (t.sport ?? "unknown").toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

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

  const tournamentsSorted = [...tournaments].sort((a, b) => {
    const aDate = a.start_date || a.end_date || "";
    const bDate = b.start_date || b.end_date || "";
    return aDate.localeCompare(bDate);
  });

  const months = monthOptions();

  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock brandedHeader">
          <h1 className="title" style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.01em" }}>
            Tournament Directory
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
            Browse upcoming tournaments by sport, state, and month. This directory focuses on logistics and basic details
            — no ratings or referee reviews.
          </p>
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
              gap: 10,
              flexWrap: "wrap",
              marginTop: 10,
              marginBottom: 12,
            }}
          >
            <a
              href="/feedback?type=tournament&name=Tournament%20Insights&url=/tournaments"
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

        <form className="filters" method="GET" action="/tournaments">
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
            {sportsSorted.map(({ sport, count }) => (
              <label key={sport} className="sportToggle">
                <input type="checkbox" name="sports" value={sport} defaultChecked={sportsSelected.includes(sport)} />
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
          </div>

          <div className="actionsRow">
            <button type="submit" className="smallBtn">
              Apply
            </button>
            <a className="smallBtn" href="/tournaments">
              Reset
            </a>
          </div>
        </form>

        {sportsSorted.length ? (
          <div className="summaryGrid">
            <article className="card card--mini bg-sport-default">
              <div className="summaryCount">{tournamentsSorted.length}</div>
              <div className="summaryLabel">TOTAL TOURNAMENTS</div>
              <div className="summaryIcon" aria-hidden="true">🏟️</div>
            </article>
            {sportsSorted.map(({ sport, count }) => (
              <Link
                key={sport}
                href={(() => {
                  const params = new URLSearchParams();
                  if (q) params.set("q", q);
                  if (!isAllStates) {
                    stateSelections.forEach((st) => params.append("state", st));
                  }
                  if (month) params.set("month", month);
                  params.set("includePast", includePast ? "true" : "false");
                  params.set("sports", sport);
                  return `/tournaments?${params.toString()}`;
                })()}
                className={`card card--mini ${getSportCardClass(sport)}`}
              >
                <div className="summaryCount">{count}</div>
                <div className="summaryLabel">{SPORTS_LABELS[sport] || sport}</div>
                <div className="summaryIcon" aria-hidden="true">
                  {sportIcon(sport)}
                </div>
              </Link>
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

              return (
                <article key={t.id} className={`card ${getSportCardClass(t.sport)}`}>
                  <div className="cardWhistle" style={{ top: "1.1rem" }}>
                    <div className="summaryIcon" aria-hidden="true">
                      {sportIcon(t.sport)}
                    </div>
                  </div>

                  <h2>{t.name}</h2>

                  <p className="meta">
                    <strong>{SPORTS_LABELS[(t.sport ?? "unknown").toLowerCase()] ?? "Tournament"}</strong>
                    {locationLabel ? ` • ${locationLabel}` : ""}
                    {t.level ? ` • ${t.level}` : ""}
                  </p>

                  <p className="dates">{dateLabel}</p>

                  <div className="cardFooter">
                    {t.official_website_url ? (
                      <a
                        href={t.official_website_url}
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
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
