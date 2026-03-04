import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TI_SPORT_LABELS } from "@/lib/tiSports";
import StateMultiSelect from "../tournaments/StateMultiSelect";
import AutoSubmitCheckbox from "@/components/filters/AutoSubmitCheckbox";
import AutoSubmitSelect from "@/components/filters/AutoSubmitSelect";
import VenueCard from "@/components/venues/VenueCard";
import styles from "./VenuesPage.module.css";
import { getSportCardClass, getSummarySportClass, getVenueCardClassFromSports } from "./sportSurface";
import "../tournaments/tournaments.css";

type LinkedTournament = {
  id: string;
  name: string | null;
  slug: string | null;
  sport: string | null;
  start_date: string | null;
  end_date: string | null;
};

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  venue_url: string | null;
  notes: string | null;
  sport: string | null;
  restroom_cleanliness_avg: number | null;
  shade_score_avg: number | null;
  vendor_score_avg: number | null;
  parking_convenience_score_avg: number | null;
  review_count: number | null;
  reviews_last_updated_at: string | null;
  tournament_venues?: {
    tournaments?: LinkedTournament | null;
  }[] | null;
};

type VenueModel = VenueRow & {
  sports: string[];
  tournamentCount: number;
  linkedTournamentCount: number;
  hasLinkedTournaments: boolean;
  hasOwlsEye: boolean;
  upcomingTournaments: {
    id: string;
    name: string;
    slug: string;
    start_date: string | null;
  }[];
};

type OwlsEyeRunRow = {
  id: string;
  run_id?: string | null;
  venue_id: string;
  updated_at?: string | null;
  created_at?: string | null;
};

export const revalidate = 300;

export const metadata = {
  title: "Browse Tournament Venues",
  description: "Search tournament venues by sport and location.",
  alternates: {
    canonical: "/venues",
  },
};

const SPORTS_LABELS: Record<string, string> = { ...TI_SPORT_LABELS, unknown: "Unknown" };

function canonicalSport(sport: string | null | undefined) {
  const key = (sport ?? "").trim().toLowerCase();
  return key || "unknown";
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

function buildMapLinks(query: string) {
  const encoded = encodeURIComponent(query);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    apple: `https://maps.apple.com/?q=${encoded}`,
    waze: `https://waze.com/ul?q=${encoded}&navigate=yes`,
  };
}

function venueIcon(sports: string[]) {
  if (sports.includes("lacrosse")) {
    return <img className="sportSvgIcon" src="/brand/lacrosse_icon.svg" alt="" />;
  }
  if (sports.includes("hockey")) {
    return <img className="sportSvgIcon" src="/svg/sports/hockey_puck_icon.svg" alt="" />;
  }
  if (sports.includes("soccer")) return "⚽";
  if (sports.includes("basketball")) return "🏀";
  if (sports.includes("football")) return "🏈";
  if (sports.includes("baseball")) return "⚾";
  if (sports.includes("softball")) return "🥎";
  return "📍";
}

function stateKey(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}

async function fetchLatestOwlsEyeRuns(venueIds: string[]) {
  if (!venueIds.length) return [] as OwlsEyeRunRow[];

  const primary = await supabaseAdmin
    .from("owls_eye_runs" as any)
    .select("id,run_id,venue_id,updated_at,created_at")
    .in("venue_id", venueIds)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  const primaryErrCode = (primary as any)?.error?.code;
  if (!primary.error) {
    return (primary.data as OwlsEyeRunRow[] | null) ?? [];
  }

  if (primaryErrCode === "42703" || primaryErrCode === "PGRST204") {
    const fallback = await supabaseAdmin
      .from("owls_eye_runs" as any)
      .select("id,run_id,venue_id,created_at")
      .in("venue_id", venueIds)
      .order("created_at", { ascending: false });
    return (fallback.data as OwlsEyeRunRow[] | null) ?? [];
  }

  return [];
}

function matchesText(v: VenueRow, q: string) {
  if (!q) return true;
  const haystack = [v.name, v.city, v.state, v.address, v.zip].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(q.toLowerCase());
}

export default async function VenuesPage({
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
  const month = (searchParams?.month ?? "").trim();
  const sportsParam = searchParams?.sports;
  const includePastParam = searchParams?.includePast;
  const includePast = Array.isArray(includePastParam)
    ? includePastParam.includes("true")
    : (includePastParam ?? "").toLowerCase() === "true";
  const sportsSelectedRaw = Array.isArray(sportsParam) ? sportsParam : sportsParam ? [sportsParam] : [];
  const sportsSelected = sportsSelectedRaw.map((s) => canonicalSport(s)).filter(Boolean);

  const stateSelectionsRaw = (Array.isArray(stateParam) ? stateParam : stateParam ? [stateParam] : [])
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const ALL_STATES_VALUE = "__ALL__";
  const stateSelections = stateSelectionsRaw.filter((s) => s !== ALL_STATES_VALUE);
  const isAllStates = stateSelections.length === 0 || stateSelectionsRaw.includes(ALL_STATES_VALUE);

  const today = new Date().toISOString().slice(0, 10);

  let monthStartISO = "";
  let monthEndISO = "";
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    monthStartISO = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
    monthEndISO = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  }

  const { data: venuesData, error } = await supabaseAdmin
    .from("venues" as any)
    .select(
      "id,name,address,city,state,zip,latitude,longitude,venue_url,notes,sport,restroom_cleanliness_avg,shade_score_avg,vendor_score_avg,parking_convenience_score_avg,review_count,reviews_last_updated_at,tournament_venues(tournaments(id,name,slug,sport,start_date,end_date))"
    )
    .order("name", { ascending: true });

  if (error) {
    return (
      <main className="pitchWrap tournamentsWrap">
        <section className="field tournamentsField">
          <div className="headerBlock">
            <h1 className="title">Venue Directory</h1>
            <p className="subtitle">We couldn’t load venues right now. Please try again.</p>
          </div>
        </section>
      </main>
    );
  }

  const rawVenues = (venuesData ?? []) as VenueRow[];
  const venueIds = rawVenues.map((v) => v.id).filter(Boolean);
  const runRows = await fetchLatestOwlsEyeRuns(venueIds);
  const latestRunByVenue = new Map<string, OwlsEyeRunRow>();
  for (const row of runRows) {
    if (!row?.venue_id) continue;
    if (latestRunByVenue.has(row.venue_id)) continue;
    latestRunByVenue.set(row.venue_id, row);
  }
  const runIds = Array.from(latestRunByVenue.values())
    .map((row) => row.run_id ?? row.id)
    .filter((value): value is string => Boolean(value));
  const hasNearbyByRunId = new Set<string>();
  if (runIds.length) {
    const { data: nearbyRows } = await supabaseAdmin
      .from("owls_eye_nearby_food" as any)
      .select("run_id")
      .in("run_id", runIds);
    for (const row of ((nearbyRows as Array<{ run_id: string }> | null) ?? [])) {
      if (row?.run_id) hasNearbyByRunId.add(row.run_id);
    }
  }
  const hasOwlsEyeByVenueId = new Map<string, boolean>();
  for (const [venueId, run] of latestRunByVenue.entries()) {
    const runId = run.run_id ?? run.id;
    hasOwlsEyeByVenueId.set(venueId, hasNearbyByRunId.has(runId));
  }

  const venuesClean: VenueModel[] = rawVenues
    .filter((v) => Boolean(v?.id && v?.name))
    .map((venue) => {
      const linkedTournaments = (venue.tournament_venues ?? [])
        .map((tv) => tv?.tournaments)
        .filter((t): t is LinkedTournament => Boolean(t?.id));

      const eligibleLinkedTournaments = linkedTournaments.filter((t) => {
        if (!includePast) {
          const startOk = Boolean(t.start_date && t.start_date >= today);
          const endOk = Boolean(t.end_date && t.end_date >= today);
          if (!startOk && !endOk) return false;
        }
        if (monthStartISO && monthEndISO) {
          if (!t.start_date) return false;
          if (!(t.start_date >= monthStartISO && t.start_date < monthEndISO)) return false;
        }
        return true;
      });

      const upcomingTournaments = linkedTournaments
        .filter((t) => {
          const startOk = Boolean(t.start_date && t.start_date >= today);
          const endOk = Boolean(t.end_date && t.end_date >= today);
          return startOk || endOk;
        })
        .filter((t): t is LinkedTournament & { slug: string; name: string } => Boolean(t.slug && t.name))
        .sort((a, b) => (a.start_date ?? "9999-12-31").localeCompare(b.start_date ?? "9999-12-31"))
        .slice(0, 3)
        .map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          start_date: t.start_date,
        }));

      const sportsFromLinked = new Set(
        eligibleLinkedTournaments
          .map((t) => canonicalSport(t.sport))
          .filter((sport) => sport && sport !== "unknown")
      );

      if (linkedTournaments.length === 0) {
        const fallbackSport = canonicalSport(venue.sport);
        if (fallbackSport !== "unknown") {
          sportsFromLinked.add(fallbackSport);
        }
      }

      return {
        ...venue,
        sports: Array.from(sportsFromLinked).sort(),
        tournamentCount: eligibleLinkedTournaments.length,
        linkedTournamentCount: linkedTournaments.length,
        hasLinkedTournaments: linkedTournaments.length > 0,
        hasOwlsEye: Boolean(hasOwlsEyeByVenueId.get(venue.id)),
        upcomingTournaments,
      };
    });

  const venuesDateFiltered = venuesClean.filter((v) => !v.hasLinkedTournaments || v.tournamentCount > 0);
  const venuesBase = venuesDateFiltered.filter((v) => matchesText(v, q));

  const sportsCounts = venuesBase.reduce((acc: Record<string, number>, v) => {
    v.sports.forEach((sport) => {
      acc[sport] = (acc[sport] || 0) + 1;
    });
    return acc;
  }, {});

  const sportsSorted = Object.entries(sportsCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([sport, count]) => ({ sport, count }));

  const venuesBySport = sportsSelected.length
    ? venuesBase.filter((v) => v.sports.some((sport) => sportsSelected.includes(sport)))
    : venuesBase;

  const availableStates = Array.from(new Set(venuesBySport.map((v) => stateKey(v.state)).filter(Boolean))).sort();

  const stateCounts = venuesBySport.reduce<Record<string, number>>((acc, v) => {
    const key = stateKey(v.state);
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const applyStateFilter = (list: VenueModel[]) =>
    isAllStates ? list : list.filter((v) => stateSelections.includes(stateKey(v.state)));

  const venuesAllSportCleared = applyStateFilter(venuesBase);
  const venues = applyStateFilter(venuesBySport);

  const stateSummaryLabel = isAllStates
    ? "All states"
    : stateSelections.length <= 3
    ? stateSelections.join(", ")
    : `${stateSelections.length} states`;

  const months = monthOptions();

  const buildParams = (overrideSport?: string | null) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (!isAllStates) {
      stateSelections.forEach((st) => params.append("state", st));
    }
    if (month) params.set("month", month);
    params.set("includePast", includePast ? "true" : "false");
    if (overrideSport) params.set("sports", overrideSport);
    return params.toString();
  };

  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock brandedHeader">
          <h1 className="title" style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.01em" }}>
            Venue Directory
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
            Browse tournament venues by sport, location, and month. Listings focus on practical planning details and
            official links.
          </p>
          <p className="subtitle" style={{ marginTop: 6, maxWidth: 720, fontSize: 13, lineHeight: 1.5 }}>
            Venue links and map data are third-party sources. Confirm important details before travel.{" "}
            <Link href="/terms">Terms</Link> • <Link href="/disclaimer">Disclaimer</Link>
          </p>
        </div>

        <form className="filters" method="GET" action="/venues">
          <div>
            <label className="label" htmlFor="q">
              Search
            </label>
            <input id="q" name="q" className="input" placeholder="Search venues..." defaultValue={q} />
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
              totalCount={venuesBySport.length}
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
                <AutoSubmitCheckbox type="checkbox" name="sports" value={sport} defaultChecked={sportsSelected.includes(sport)} />
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
            <a className="smallBtn" href="/venues">
              Reset
            </a>
          </div>
        </form>

        <div className="summaryGrid">
          <Link
            href={`/venues?${buildParams(null)}`}
            className={`card card--mini summary-total ${styles.summaryAllLink} ${sportsSelected.length === 0 ? styles.summaryActive : ""}`}
          >
            <div className="summaryCount">{venuesAllSportCleared.length}</div>
            <div className="summaryLabel">ALL VENUES</div>
            <div className="summaryIcon" aria-hidden="true">
              📍
            </div>
          </Link>

          {sportsSorted.map(({ sport, count }) => {
            const isOnlyActiveSport = sportsSelected.length === 1 && sportsSelected[0] === sport;
            const href = isOnlyActiveSport ? `/venues?${buildParams(null)}` : `/venues?${buildParams(sport)}`;
            return (
              <Link
                key={sport}
                href={href}
                className={`card card--mini ${getSportCardClass(sport)} ${getSummarySportClass(sport)} ${sportsSelected.includes(sport) ? styles.summaryActive : ""}`}
              >
                <div className="summaryCount">{count}</div>
                <div className="summaryLabel">{SPORTS_LABELS[sport] || sport}</div>
                <div className="summaryIcon" aria-hidden="true">
                  {venueIcon([sport])}
                </div>
              </Link>
            );
          })}
        </div>

        {venues.length === 0 ? (
          <div className="cards">
            <article className="card card-grass">
              <div className="cardHeader">
                <div>
                  <div className="cardTitle" style={{ fontSize: 18 }}>
                    No venues found
                  </div>
                  <div className="cardMeta">Try clearing search or selecting “Any” filters.</div>
                </div>
              </div>
            </article>
          </div>
        ) : (
          <div className="grid">
            {venues.map((venue) => {
              const addressQuery = [venue.name, venue.address, venue.city, venue.state, venue.zip].filter(Boolean).join(", ");
              const mapLinks = addressQuery ? buildMapLinks(addressQuery) : null;
              return (
                <VenueCard
                  key={venue.id}
                  venueId={venue.id}
                  name={venue.name || "Venue"}
                  city={venue.city}
                  state={venue.state}
                  address={venue.address}
                  zip={venue.zip}
                  notes={venue.notes}
                  sportCardClass={getVenueCardClassFromSports(venue.sports)}
                  upcomingTournaments={venue.upcomingTournaments}
                  venueUrl={venue.venue_url}
                  mapLinks={mapLinks}
                  icon={venueIcon(venue.sports)}
                  hasOwlsEye={venue.hasOwlsEye}
                  restroom_cleanliness_avg={venue.restroom_cleanliness_avg}
                  shade_score_avg={venue.shade_score_avg}
                  vendor_score_avg={venue.vendor_score_avg}
                  parking_convenience_score_avg={venue.parking_convenience_score_avg}
                  review_count={venue.review_count}
                  reviews_last_updated_at={venue.reviews_last_updated_at}
                />
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
