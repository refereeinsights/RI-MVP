import Link from "next/link";
import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import InsightDisclaimer from "@/components/InsightDisclaimer";
import AutoSubmitSelect from "@/components/filters/AutoSubmitSelect";
import StateMultiSelect from "@/app/tournaments/StateMultiSelect";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { aggregateWhistleScoreRows, loadSeriesTournamentIds } from "@/lib/tournamentSeries";
import type { RawWhistleScoreRow, TournamentSeriesEntry } from "@/lib/tournamentSeries";
import type { RefereeWhistleScore } from "@/lib/types/refereeReview";
import { ALL_STATES_VALUE, buildMonthRange, monthOptions, parseStateSelections, parseToggle } from "../../../../../packages/lib/tournament";
import type { TournamentMapItem } from "../../../../../packages/lib/tournament-map";
import { buildTournamentMapHref, hasValidCoordinates } from "../../../../../packages/lib/tournament-map";
import TournamentMapPageClient from "./TournamentMapPageClient";
import "../tournaments.css";

type SearchParams = {
  q?: string;
  state?: string | string[];
  month?: string;
  sports?: string | string[];
  reviewed?: string | string[];
  includePast?: string | string[];
  city?: string;
  sourcePage?: string;
};

type TournamentRow = {
  id: string;
  slug: string;
  name: string;
  sport: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  latitude: number | null;
  longitude: number | null;
};

type TournamentVenueLinkRow = {
  tournament_id: string;
  venue_id: string;
  venues: {
    id: string;
    seo_slug: string | null;
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
};

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.refereeinsights.com").replace(/\/+$/, "");

export const metadata: Metadata = {
  title: "Tournament travel map | RefereeInsights",
  description: "Browse tournaments geographically to understand officiating travel patterns and venue distribution.",
  alternates: {
    canonical: `${SITE_ORIGIN}/tournaments/map`,
  },
  robots: {
    index: false,
    follow: true,
  },
};

async function loadWhistleScores(
  supabase: SupabaseClient,
  seriesMap: Map<string, TournamentSeriesEntry>
): Promise<Map<string, RefereeWhistleScore>> {
  const map = new Map<string, RefereeWhistleScore>();
  if (!seriesMap.size) return map;

  const uniqueIds = Array.from(new Set(Array.from(seriesMap.values()).flatMap((entry) => entry.tournamentIds))).filter(Boolean);
  if (!uniqueIds.length) return map;

  const { data, error } = await supabase
    .from("tournament_referee_scores")
    .select("tournament_id,ai_score,review_count,summary,status,updated_at")
    .in("tournament_id", uniqueIds);

  if (error || !data) return map;

  const rowMap = new Map<string, RawWhistleScoreRow>();
  for (const row of data as RawWhistleScoreRow[]) {
    rowMap.set(row.tournament_id, row);
  }

  for (const [canonicalId, entry] of seriesMap.entries()) {
    const rows = entry.tournamentIds.map((id) => rowMap.get(id)).filter((row): row is RawWhistleScoreRow => Boolean(row));
    const aggregated = aggregateWhistleScoreRows(rows);
    map.set(canonicalId, {
      tournament_id: canonicalId,
      ai_score: aggregated.ai_score,
      review_count: aggregated.review_count ?? 0,
      summary: aggregated.summary,
      status: aggregated.status,
      updated_at: null,
    });
  }

  return map;
}

export default async function TournamentMapPage({ searchParams }: { searchParams?: SearchParams }) {
  const q = (searchParams?.q ?? "").trim();
  const month = (searchParams?.month ?? "").trim();
  const city = (searchParams?.city ?? "").trim();
  const reviewedOnly = parseToggle(searchParams?.reviewed);
  const includePast = parseToggle(searchParams?.includePast);
  const sportsSelected = (Array.isArray(searchParams?.sports) ? searchParams?.sports : searchParams?.sports ? [searchParams.sports] : [])
    .map((sport) => sport.trim().toLowerCase())
    .filter(Boolean);
  const sourcePage = String(searchParams?.sourcePage ?? "").trim() || null;
  const {
    selections: stateSelections,
    isAllStates,
    summaryLabel: stateSummaryLabel,
  } = parseStateSelections(searchParams?.state);

  const today = new Date().toISOString().slice(0, 10);
  const months = monthOptions(9);
  const pageSize = 2000;
  let offset = 0;
  const rows: TournamentRow[] = [];
  let error: string | null = null;

  while (true) {
    let query = supabaseAdmin
      .from("tournaments_public" as any)
      .select("id,slug,name,sport,city,state,start_date,end_date,latitude,longitude")
      .order("start_date", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (!includePast) {
      query = query.or(`start_date.gte.${today},end_date.gte.${today}`);
    }
    if (q) {
      query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%`);
    }
    if (city) {
      query = query.ilike("city", `%${city}%`);
    }
    if (sportsSelected.length === 1) {
      query = query.eq("sport", sportsSelected[0]);
    } else if (sportsSelected.length > 1) {
      query = query.in("sport", sportsSelected);
    }
    if (month) {
      const monthRange = buildMonthRange(month);
      if (monthRange) {
        query = query.gte("start_date", monthRange.startISO).lt("start_date", monthRange.endISO);
      }
    }

    const { data, error: pageError } = await query;
    if (pageError) {
      error = pageError.message;
      break;
    }
    rows.push(...(((data ?? []) as TournamentRow[]).filter((row) => row.slug)));
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }

  let preStateRows = rows;
  if (reviewedOnly && rows.length > 0) {
    const seriesMap = await loadSeriesTournamentIds(
      supabaseAdmin,
      rows.map((row) => ({ id: row.id, slug: row.slug }))
    );
    const whistleMap = await loadWhistleScores(supabaseAdmin, seriesMap);
    preStateRows = rows.filter((row) => (whistleMap.get(row.id)?.review_count ?? 0) > 0);
  }

  const availableStates = Array.from(
    new Set(preStateRows.map((row) => (row.state ?? "").trim().toUpperCase()).filter(Boolean))
  ).sort();
  const stateCounts = preStateRows.reduce<Record<string, number>>((acc, row) => {
    const key = (row.state ?? "").trim().toUpperCase();
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const filteredRows = isAllStates
    ? preStateRows
    : preStateRows.filter((row) => stateSelections.includes((row.state ?? "").trim().toUpperCase()));

  const tournamentIds = filteredRows.map((row) => row.id);
  let venueLinks: TournamentVenueLinkRow[] = [];
  if (tournamentIds.length) {
    const { data: venueLinkRows } = await supabaseAdmin
      .from("tournament_venues" as any)
      .select("tournament_id,venue_id,venues(id,seo_slug,name,address,city,state,latitude,longitude)")
      .in("tournament_id", tournamentIds)
      .eq("is_inferred", false);
    venueLinks = ((venueLinkRows ?? []) as unknown) as TournamentVenueLinkRow[];
  }

  const venuesByTournament = new Map<string, TournamentVenueLinkRow["venues"][]>();
  for (const row of venueLinks) {
    if (!row.tournament_id || !row.venues) continue;
    const next = venuesByTournament.get(row.tournament_id) ?? [];
    next.push(row.venues);
    venuesByTournament.set(row.tournament_id, next);
  }

  const items: TournamentMapItem[] = filteredRows.map((row) => {
    const linkedVenues = venuesByTournament.get(row.id) ?? [];
    const mappedVenue =
      linkedVenues.find((venue) => hasValidCoordinates(venue?.latitude, venue?.longitude)) ?? null;
    const primaryVenue = mappedVenue ?? linkedVenues[0] ?? null;
    const tournamentHasGeo = hasValidCoordinates(row.latitude, row.longitude);
    const fallbackVenueGeo = mappedVenue && hasValidCoordinates(mappedVenue.latitude, mappedVenue.longitude);

    return {
      id: `${row.id}:${primaryVenue?.id ?? "no-venue"}`,
      tournamentId: row.id,
      tournamentSlug: row.slug,
      tournamentName: row.name,
      sport: row.sport,
      city: row.city,
      state: row.state,
      startDate: row.start_date,
      endDate: row.end_date,
      venue: primaryVenue || tournamentHasGeo
        ? {
            id: primaryVenue?.id ?? null,
            slug: primaryVenue?.seo_slug ?? null,
            name: primaryVenue?.name ?? "Tournament area",
            address: primaryVenue?.address ?? null,
            city: primaryVenue?.city ?? row.city,
            state: primaryVenue?.state ?? row.state,
            latitude: fallbackVenueGeo ? primaryVenue?.latitude ?? null : row.latitude,
            longitude: fallbackVenueGeo ? primaryVenue?.longitude ?? null : row.longitude,
          }
        : null,
    };
  });

  const directoryMapHref = buildTournamentMapHref("/tournaments/map", {
    q,
    state: stateSelections,
    month,
    sports: sportsSelected,
    reviewed: reviewedOnly,
    includePast,
    city,
    sourcePage: sourcePage ?? "map",
  });

  if (error) {
    return (
      <main className="pitchWrap tournamentsWrap">
        <section className="field tournamentsField">
          <div className="headerBlock">
            <h1 className="title">Tournament travel map</h1>
            <p className="subtitle">
              Error loading tournaments: <code>{error}</code>
            </p>
            <div className="actionsRow" style={{ marginTop: 12 }}>
              <Link href="/tournaments" className="smallBtn">
                Back to directory
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock brandedHeader">
          <h1 className="title" style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.01em" }}>
            Tournament travel map
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
            Browse tournaments geographically to understand venue spread, likely travel distance, and where officiating weekends cluster.
          </p>
          <InsightDisclaimer />
          <div className="actionsRow" style={{ marginTop: 12 }}>
            <Link className="smallBtn" href="/tournaments">
              Directory view
            </Link>
            <Link className="smallBtn" href={directoryMapHref}>
              Share this map view
            </Link>
          </div>
        </div>

        <form className="filters" method="GET" action="/tournaments/map">
          {sourcePage ? <input type="hidden" name="sourcePage" value={sourcePage} /> : null}
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
              totalCount={preStateRows.length}
            />
          </div>

          <div>
            <label className="label" htmlFor="city">
              City
            </label>
            <input id="city" name="city" className="input" placeholder="Any city" defaultValue={city} />
          </div>

          <div>
            <label className="label" htmlFor="month">
              Month
            </label>
            <AutoSubmitSelect id="month" name="month" className="select" defaultValue={month}>
              <option value="">Any</option>
              {months.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </AutoSubmitSelect>
          </div>

          <div className="sportsRow">
            <label className="sportToggle">
              <input type="checkbox" name="reviewed" value="true" defaultChecked={reviewedOnly} />
              <span>Reviewed only</span>
            </label>
            {["soccer", "basketball", "football", "baseball", "softball", "volleyball", "lacrosse", "hockey"].map((sportName) => (
              <label key={sportName} className="sportToggle">
                <input type="checkbox" name="sports" value={sportName} defaultChecked={sportsSelected.includes(sportName)} />
                <span>{sportName[0]?.toUpperCase() + sportName.slice(1)}</span>
              </label>
            ))}
            <label className="sportToggle">
              <input type="checkbox" name="includePast" value="true" defaultChecked={includePast} />
              <span>Include past events</span>
            </label>
          </div>

          <div className="actionsRow">
            <button className="smallBtn" type="submit">
              Apply
            </button>
            <a className="smallBtn" href="/tournaments/map">
              Reset
            </a>
          </div>
        </form>

        {items.length === 0 ? (
          <p className="empty">No tournaments match the current map filters yet.</p>
        ) : (
          <TournamentMapPageClient
            items={items}
            sourcePage={sourcePage}
            sport={sportsSelected.length === 1 ? sportsSelected[0] : sportsSelected.length > 1 ? sportsSelected.join(",") : null}
            stateLabel={!isAllStates ? stateSelections.join(",") : null}
            city={city || null}
            month={month || null}
          />
        )}
      </section>
    </main>
  );
}
