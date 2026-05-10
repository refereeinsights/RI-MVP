import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TI_SPORT_LABELS } from "@/lib/tiSports";
import { lookupZipLatLng } from "@/lib/lookupZipLatLng";
import StateMultiSelect from "./StateMultiSelect";
import MetroMarketChips from "./_components/MetroMarketChips";
import AutoSubmitCheckbox from "@/components/filters/AutoSubmitCheckbox";
import AutoSubmitSelect from "@/components/filters/AutoSubmitSelect";
import { buildTournamentHotelsHref, buildTournamentVrboHref } from "@/lib/affiliates/tournamentTravelLinks";
import UsTournamentHeatmap from "@/app/_components/UsTournamentHeatmap";
import VenueMapPreviewStrip from "@/app/tournaments/_components/VenueMapPreviewStrip";
import "./tournaments.css";

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
  distance_miles?: number | null;
  tournament_venues?: Array<{ count?: number | null }> | null;
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

export const metadata = {
  title: "Tournament Directory",
  description: "Browse youth tournaments by sport, state, and month with official links and location details.",
  alternates: {
    canonical: "/tournaments",
  },
};

const ISSUE_EMAIL = "tournamentinsights@gmail.com";
const SITE_ORIGIN = "https://www.tournamentinsights.com";

const SPORTS_LABELS: Record<string, string> = { ...TI_SPORT_LABELS, unknown: "Unknown" };
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

function looksLikeLeagueListing(name: string) {
  const value = String(name ?? "").trim();
  if (!value) return false;
  return /\bleague\b/i.test(value);
}

function getSummarySportClass(sport: string) {
  return `summary-sport-${sport.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
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
    aysoOnly?: string;
    includeLeagues?: string;
    zip?: string;
    radius?: string;
  };
}) {
  const q = (searchParams?.q ?? "").trim();
  const tournamentsIssueMailto = `mailto:${ISSUE_EMAIL}?subject=${encodeURIComponent(
    "Tournament issue report"
  )}&body=${encodeURIComponent(`Page: ${SITE_ORIGIN}/tournaments\n\nDescribe the issue:`)}`;
  const stateParam = searchParams?.state;
  const month = (searchParams?.month ?? "").trim(); // YYYY-MM
  const sportsParam = searchParams?.sports;
  const includePastParam = searchParams?.includePast;
  const aysoOnlyParam = searchParams?.aysoOnly;
  const includeLeaguesParam = (searchParams?.includeLeagues ?? "").trim();
  const zipParam = (searchParams?.zip ?? "").trim();
  const radiusParam = (searchParams?.radius ?? "").trim();
  const includePast = Array.isArray(includePastParam)
    ? includePastParam.includes("true")
    : (includePastParam ?? "").toLowerCase() === "true";
  const aysoOnly = Array.isArray(aysoOnlyParam)
    ? aysoOnlyParam.includes("true")
    : (aysoOnlyParam ?? "").toLowerCase() === "true";
  const includeLeagues = ["1", "true", "yes"].includes(includeLeaguesParam.toLowerCase());
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
  const metroMarketChips =
    stateSelections.length === 1 && !isAllStates
      ? await MetroMarketChips({
          stateCode: stateSelections[0],
          sports: sportsSelected,
          q,
          month,
          includePast,
          aysoOnly,
          title: "Explore by area",
        })
      : null;
  const stateSummaryLabel = isAllStates
    ? "All states"
    : stateSelections.length <= 3
    ? stateSelections.join(", ")
    : `${stateSelections.length} states`;

  const today = new Date().toISOString().slice(0, 10);
  const zip = /^\d{5}$/.test(zipParam) ? zipParam : "";
  const radiusMilesRaw = Number.parseInt(radiusParam || "50", 10);
  const radiusMiles = Number.isFinite(radiusMilesRaw) ? Math.min(Math.max(radiusMilesRaw, 1), 500) : 50;
  const zipRequested = Boolean(zip);

  const pageSize = 1000;
  let offset = 0;
  let tournamentsData: any[] = [];
  let error = null as any;
  let zipError: string | null = null;
  const radiusCenter = zipRequested
    ? await (async () => {
        try {
          const center = await lookupZipLatLng(zip);
          if (!center) zipError = "ZIP radius filter unavailable (missing geocode).";
          return center;
        } catch (err: any) {
          zipError = err?.message ? String(err.message) : "ZIP lookup failed.";
          return null;
        }
      })()
    : null;
  const radiusActive = Boolean(zipRequested && radiusCenter);
  while (true) {
    const monthRange = month && /^\d{4}-\d{2}$/.test(month) ? (() => {
      const [y, m] = month.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 1));
      return {
        startISO: start.toISOString().slice(0, 10),
        endISO: end.toISOString().slice(0, 10),
      };
    })() : null;

    const { data, error: pageError } = await (async () => {
      if (!radiusActive) {
        let query = supabaseAdmin
          .from("tournaments_public" as any)
          .select(
            "id,name,slug,sport,tournament_association,state,city,zip,start_date,end_date,official_website_url,source_url,level,tournament_staff_verified,is_demo,tournament_venues(count)"
          )
          .order("start_date", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (!includePast) {
          query = query.or(`is_demo.eq.true,start_date.gte.${today},end_date.gte.${today}`);
        }

        if (q) {
          query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%`);
        }
        if (monthRange) {
          query = query.gte("start_date", monthRange.startISO).lt("start_date", monthRange.endISO);
        }

        return query;
      }

      const rpc = supabaseAdmin.rpc("list_tournaments_public_within_radius_v1" as any, {
        p_center_lat: radiusCenter!.latitude,
        p_center_lng: radiusCenter!.longitude,
        p_radius_miles: radiusMiles,
        p_limit: pageSize,
        p_offset: offset,
        p_today: today,
        p_include_past: includePast,
        p_q: q || null,
        p_start_date_gte: monthRange ? monthRange.startISO : null,
        p_start_date_lt: monthRange ? monthRange.endISO : null,
        p_ayso_only: aysoOnly,
      });

      return rpc;
    })();

    if (pageError) {
      error = pageError;
      break;
    }
    tournamentsData.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }

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
      if (includeLeagues) return true;
      return !looksLikeLeagueListing(t.name);
    })
    .filter((t) => {
      if (!aysoOnly) return true; // default: include AYSO + non-AYSO
      return (t.tournament_association ?? "").trim().toUpperCase() === "AYSO";
    });

  // Important UX detail: when users land here from the map with a state filter,
  // the per-sport counts should reflect *that* state (not national totals).
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

  const heatmapCounts = await (async () => {
    const p_sport = sportsSelected.length === 1 ? sportsSelected[0] : null;
    const { data, error } = await (supabaseAdmin.rpc("get_public_directory_tournament_counts_by_state_sport" as any, {
      p_sport,
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
          {radiusActive ? (
            <p className="subtitle" style={{ marginTop: 6, maxWidth: 720, fontSize: 13, lineHeight: 1.4 }}>
              Showing tournaments within <strong>{radiusMiles} miles</strong> of ZIP <strong>{zip}</strong>
              {zipError ? ` (ZIP lookup issue: ${zipError})` : ""}.
            </p>
          ) : zipRequested && zipError ? (
            <p className="subtitle" style={{ marginTop: 6, maxWidth: 720, fontSize: 13, lineHeight: 1.4 }}>
              ZIP radius filter unavailable for <strong>{zip}</strong>: {zipError}
            </p>
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
            <Link href="/tournaments/metro/dc-metro" style={{ textDecoration: "underline", color: "inherit" }}>
              DC Metro
            </Link>
            <Link href="/tournaments/metro/new-england" style={{ textDecoration: "underline", color: "inherit" }}>
              New England
            </Link>
            <Link href="/tournaments/metro/southern-california" style={{ textDecoration: "underline", color: "inherit" }}>
              Southern California
            </Link>
            <Link href="/tournaments/metro/northern-california" style={{ textDecoration: "underline", color: "inherit" }}>
              Northern California
            </Link>
            <Link href="/tournaments/metro/texas-triangle" style={{ textDecoration: "underline", color: "inherit" }}>
              Texas Triangle
            </Link>
            <Link href="/tournaments/metro/great-lakes" style={{ textDecoration: "underline", color: "inherit" }}>
              Great Lakes
            </Link>
            <Link href="/tournaments/metro/southeast" style={{ textDecoration: "underline", color: "inherit" }}>
              Southeast
            </Link>
            <Link href="/tournaments/metro/mountain-west" style={{ textDecoration: "underline", color: "inherit" }}>
              Mountain West
            </Link>
            <Link href="/tournaments/metro/pacific-northwest" style={{ textDecoration: "underline", color: "inherit" }}>
              Pacific Northwest
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
              gap: 10,
              flexWrap: "wrap",
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
              autoSubmit
            />
          </div>

          <div>
            <label className="label" htmlFor="zip">
              ZIP + radius
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                id="zip"
                name="zip"
                className="input"
                placeholder="ZIP (e.g. 02139)"
                inputMode="numeric"
                pattern="\\d{5}"
                maxLength={5}
                defaultValue={zipParam}
                style={{ flex: 1, minWidth: 0 }}
              />
              <AutoSubmitSelect
                id="radius"
                name="radius"
                className="select"
                defaultValue={String(radiusMiles)}
                style={{ width: 120 }}
              >
                {[10, 25, 50, 75, 100, 150, 200, 300].map((miles) => (
                  <option key={miles} value={String(miles)}>
                    {miles} mi
                  </option>
                ))}
              </AutoSubmitSelect>
            </div>
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
            <a className="smallBtn" href="/tournaments">
              Reset
            </a>
          </div>
        </form>

        {metroMarketChips}

        <UsTournamentHeatmap
          countsByState={heatmapCounts.counts}
          max={heatmapCounts.max}
          tipId="ti-directory-map-tip"
          pageType="directory"
          sport={sportsSelected.length === 1 ? sportsSelected[0] : "all"}
          hrefForState={(abbr) => {
            const params = new URLSearchParams();
            if (q) params.set("q", q);
            if (month) params.set("month", month);
            params.set("includePast", includePast ? "true" : "false");
            params.set("aysoOnly", aysoOnly ? "true" : "false");
            params.set("state", abbr);
            if (sportsSelected.length === 1) params.set("sports", sportsSelected[0]);
            return `/tournaments?${params.toString()}#results`;
          }}
        />

        <div id="results">
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

              <article className="card card-grass">
                <div className="cardHeader">
                  <div>
                    <div className="cardTitle" style={{ fontSize: 18 }}>
                      Don’t see your tournament?
                    </div>
                    <div className="cardMeta">
                      Plan your tournament weekend by city while we keep expanding our tournament coverage.
                    </div>
                  </div>
                </div>
                <div className="cardFooter" style={{ padding: "0 1.15rem 1.15rem" }}>
                  <Link
                    href={(() => {
                      const params = new URLSearchParams();
                      if (stateSelections.length === 1) params.set("state", stateSelections[0]);
                      const cityStateMatch = (q ?? "").match(/^\s*([^,]+)\s*,\s*([A-Za-z]{2})\s*$/);
                      if (cityStateMatch) {
                        params.set("city", cityStateMatch[1].trim());
                        params.set("state", cityStateMatch[2].trim().toUpperCase());
                      }
                      // Note: sport is not currently a planner input; keep it as a harmless hint for future use.
                      if (sportsSelected.length === 1) params.set("sport", sportsSelected[0]);
                      return `/weekend-planner${params.toString() ? `?${params.toString()}` : ""}`;
                    })()}
                    className="primaryLink"
                  >
                    Plan by city
                  </Link>
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
              const distanceLabel =
                radiusActive && typeof t.distance_miles === "number" && Number.isFinite(t.distance_miles)
                  ? `${Math.round(t.distance_miles)} mi`
                  : "";
              const isDemoTournament = t.slug === DEMO_TOURNAMENT_SLUG;
              const showOwlsEyeBadge = isDemoTournament || Boolean(hasOwlsEyeByTournament.get(t.id));
              const showStaffVerified = Boolean(t.tournament_staff_verified) || isDemoTournament;
              const venueCount = (() => {
                const rows = (t.tournament_venues ?? []) as Array<{ count?: number | null }>;
                const first = rows && rows.length ? rows[0] : null;
                return Number(first?.count ?? 0) || 0;
              })();
              const showVenueMapPreview = venueCount > 0;
              const mapHref = `/tournaments/${t.slug}/map`;

              return (
                <article key={t.id} className={`card ${getSportCardClass(t.sport)}`}>
                  <h2>{t.name}</h2>

                  <p className="meta">
                    <strong>{SPORTS_LABELS[(t.sport ?? "unknown").toLowerCase()] ?? "Tournament"}</strong>
                    {locationLabel ? ` • ${locationLabel}` : ""}
                    {distanceLabel ? ` • ${distanceLabel}` : ""}
                    {t.level ? ` • ${t.level}` : ""}
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
                        <div className="cardCtaGrid">
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
        </div>
      </section>
    </main>
  );
}
