import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TI_SPORT_LABELS } from "@/lib/tiSports";
import { lookupZipLatLng } from "@/lib/lookupZipLatLng";
import StateMultiSelect from "@/app/tournaments/StateMultiSelect";
import MetroMarketChips from "@/app/tournaments/_components/MetroMarketChips";
import PlanWeekendCtaClient from "@/app/tournaments/PlanWeekendCtaClient";
import TournamentDirectoryAnalyticsClient from "@/app/tournaments/TournamentDirectoryAnalyticsClient";
import AutoSubmitCheckbox from "@/components/filters/AutoSubmitCheckbox";
import AutoSubmitSelect from "@/components/filters/AutoSubmitSelect";
import { buildTournamentHotelsHref, buildTournamentVrboHref } from "@/lib/affiliates/tournamentTravelLinks";
import UsTournamentHeatmap from "@/app/_components/UsTournamentHeatmap";
import VenueMapPreviewStrip from "@/app/tournaments/_components/VenueMapPreviewStrip";
import "@/app/tournaments/tournaments.css";

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

const SITE_ORIGIN = "https://www.tournamentinsights.com";
const SPORTS_LABELS: Record<string, string> = { ...TI_SPORT_LABELS, unknown: "Unknown" };
const ALL_STATES_VALUE = "__ALL__";

// Cache for 5 minutes (match /tournaments directory behavior).
export const revalidate = 300;

function safeIsoDate(value: string) {
  const v = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function dateLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function looksLikeLeagueListing(name: string) {
  const value = String(name ?? "").trim();
  if (!value) return false;
  return /\bleague\b/i.test(value);
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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

function defaultJuneRange() {
  return { startISO: "2026-06-01", endISO: "2026-06-30" };
}

function deriveDateRangeFromParams(params: { startDate?: string; endDate?: string }) {
  const def = defaultJuneRange();
  const startDate = safeIsoDate(params.startDate ?? "") ?? def.startISO;
  const endDate = safeIsoDate(params.endDate ?? "") ?? def.endISO;
  const start = startDate;
  const endExclusive = addDaysIso(endDate, 1); // half-open range
  return { start, endInclusive: endDate, endExclusive };
}

function isDefaultJuneAllMonth(params: URLSearchParams) {
  const def = defaultJuneRange();
  return (
    (params.get("startDate") ?? def.startISO) === def.startISO &&
    (params.get("endDate") ?? def.endISO) === def.endISO &&
    !params.get("q") &&
    !params.get("month") &&
    !params.get("zip") &&
    !params.get("radius") &&
    !params.get("sports") &&
    !params.get("state") &&
    !params.get("includePast") &&
    !params.get("aysoOnly")
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(v)) {
      for (const item of v) params.append(k, String(item));
    } else if (v != null && String(v).trim()) {
      params.set(k, String(v));
    }
  }
  const isDefault = isDefaultJuneAllMonth(params);

  const canonical = "/youth-sports-tournaments/june-2026";

  // Count-only aggregate for the default All-June range (no filters).
  // This must not rely on bounded list length.
  const def = defaultJuneRange();
  const { count } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("id", { count: "exact", head: true })
    .gte("start_date", def.startISO)
    .lt("start_date", addDaysIso(def.endISO, 1));
  const totalCount = Number(count ?? 0) || 0;
  const countText = totalCount ? String(totalCount) : "youth sports";

  return {
    title: `June 2026 Youth Sports Tournaments | TournamentInsights`,
    description: `Explore ${countText} tournaments happening June 1–30, 2026. Filter by sport, browse the map, view tournament locations, and plan your tournament weekend with TournamentInsights.`,
    alternates: { canonical },
    robots: isDefault ? { index: true, follow: true } : { index: false, follow: true },
    other: {
      // Lightweight marker for internal diagnostics/analytics.
      "ti:page": "june_2026_tournaments",
      "ti:source": "june_2026_seo_page",
    },
  };
}

export default async function June2026TournamentsPage({
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
    startDate?: string;
    endDate?: string;
  };
}) {
  const q = (searchParams?.q ?? "").trim();
  const includePastParam = searchParams?.includePast;
  const aysoOnlyParam = searchParams?.aysoOnly;
  const includeLeaguesParam = (searchParams?.includeLeagues ?? "").trim();
  const zipParam = (searchParams?.zip ?? "").trim();
  const radiusParam = (searchParams?.radius ?? "").trim();
  const sportsParam = searchParams?.sports;
  const stateParam = searchParams?.state;

  const includePast = Array.isArray(includePastParam)
    ? includePastParam.includes("true")
    : (includePastParam ?? "").toLowerCase() === "true";
  const aysoOnly = Array.isArray(aysoOnlyParam)
    ? aysoOnlyParam.includes("true")
    : (aysoOnlyParam ?? "").toLowerCase() === "true";
  const includeLeagues = ["1", "true", "yes"].includes(includeLeaguesParam.toLowerCase());

  const sportsSelectedRaw = Array.isArray(sportsParam) ? sportsParam : sportsParam ? [sportsParam] : [];
  const sportsSelected = sportsSelectedRaw.map((s) => s.toLowerCase()).filter(Boolean);

  const stateSelectionsRaw = (Array.isArray(stateParam) ? stateParam : stateParam ? [stateParam] : [])
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const stateSelections = stateSelectionsRaw.filter((s) => s !== ALL_STATES_VALUE);
  const isAllStates = stateSelections.length === 0 || stateSelectionsRaw.includes(ALL_STATES_VALUE);

  const range = deriveDateRangeFromParams({
    startDate: searchParams?.startDate,
    endDate: searchParams?.endDate,
  });

  // Headline count is computed for the default All-June scope only (no filters),
  // using a count-only query to avoid reliance on bounded list length.
  const def = defaultJuneRange();
  const { count: headlineCountRaw } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("id", { count: "exact", head: true })
    .gte("start_date", def.startISO)
    .lt("start_date", addDaysIso(def.endISO, 1));
  const headlineCount = Number(headlineCountRaw ?? 0) || 0;

  // Optional metro chips (reuse existing logic when a state is selected).
  const metroMarketChips =
    stateSelections.length === 1 && !isAllStates
      ? await MetroMarketChips({
          stateCode: stateSelections[0],
          sports: sportsSelected,
          q,
          month: "", // June page uses explicit date range instead of month.
          includePast,
          aysoOnly,
          title: "Explore by area",
        })
      : null;

  const zip = /^\d{5}$/.test(zipParam) ? zipParam : "";
  const radiusMilesRaw = Number.parseInt(radiusParam || "50", 10);
  const radiusMiles = Number.isFinite(radiusMilesRaw) ? Math.min(Math.max(radiusMilesRaw, 1), 500) : 50;
  const zipRequested = Boolean(zip);

  // Performance guardrail (match /tournaments): bounded list fetch for the UI.
  const pageSize = 200;
  const maxRows = 600;
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
    const { data, error: pageError } = await (async () => {
      if (!radiusActive) {
        let query = supabaseAdmin
          .from("tournaments_public" as any)
          .select(
            "id,name,slug,sport,tournament_association,state,city,zip,start_date,end_date,official_website_url,source_url,level,tournament_staff_verified,is_demo,tournament_venues(count)"
          )
          .order("start_date", { ascending: true })
          .range(offset, offset + pageSize - 1);

        // Default June range (or chip/filters) is always applied for this SEO page.
        query = query.gte("start_date", range.start).lt("start_date", range.endExclusive);

        if (!includePast) {
          const today = new Date().toISOString().slice(0, 10);
          query = query.or(`is_demo.eq.true,start_date.gte.${today},end_date.gte.${today}`);
        }

        if (!isAllStates && stateSelections.length > 0) {
          query = query.in("state", stateSelections);
        }

        if (sportsSelected.length > 0) {
          query = query.in("sport", sportsSelected);
        }

        if (q) {
          query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%`);
        }

        return query;
      }

      const rpc = supabaseAdmin.rpc("list_tournaments_public_within_radius_v1" as any, {
        p_center_lat: radiusCenter!.latitude,
        p_center_lng: radiusCenter!.longitude,
        p_radius_miles: radiusMiles,
        p_limit: pageSize,
        p_offset: offset,
        p_today: new Date().toISOString().slice(0, 10),
        p_include_past: includePast,
        p_q: q || null,
        p_start_date_gte: range.start,
        p_start_date_lt: range.endExclusive,
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
    if (tournamentsData.length >= maxRows) break;
  }

  if (error) {
    return (
      <main className="pitchWrap tournamentsWrap">
        <section className="field tournamentsField">
          <div className="headerBlock">
            <h1 className="title">June 2026 Youth Sports Tournaments</h1>
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

  const sportsCounts = tournamentsClean.reduce((acc: Record<string, number>, t) => {
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

  const stateSummaryLabel = isAllStates ? "All states" : stateSelections.length <= 3 ? stateSelections.join(", ") : `${stateSelections.length} states`;

  const heatmapCounts = await (async () => {
    const p_sport = sportsSelected.length === 1 ? sportsSelected[0] : null;
    const { data, error } = await (supabaseAdmin.rpc("get_public_directory_tournament_counts_by_state_sport" as any, { p_sport }) as any);
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

  const chipDefs = [
    { label: "All June", startDate: "2026-06-01", endDate: "2026-06-30" },
    { label: "Early June", startDate: "2026-06-01", endDate: "2026-06-09" },
    { label: "Mid June", startDate: "2026-06-10", endDate: "2026-06-20" },
    { label: "Late June", startDate: "2026-06-21", endDate: "2026-06-30" },
  ] as const;

  const isChipActive = (startDate: string, endDate: string) => range.start === startDate && range.endInclusive === endDate;

  const buildChipHref = (startDate: string, endDate: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("startDate", startDate);
    params.set("endDate", endDate);
    if (!isAllStates && stateSelections.length === 1) params.set("state", stateSelections[0]);
    for (const sport of sportsSelected) params.append("sports", sport);
    params.set("includePast", includePast ? "true" : "false");
    params.set("aysoOnly", aysoOnly ? "true" : "false");
    if (zip) params.set("zip", zip);
    if (radiusParam) params.set("radius", radiusParam);
    return `/youth-sports-tournaments/june-2026?${params.toString()}#results`;
  };

  const countLabel = headlineCount ? headlineCount.toLocaleString() : "Many";
  const rangeLabel = `${dateLabel("2026-06-01")} – ${dateLabel("2026-06-30")}, 2026`;

  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock brandedHeader">
          <h1 className="title" style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.01em" }}>
            June 2026 Youth Sports Tournaments
          </h1>
          <p className="subtitle" style={{ marginTop: 8, maxWidth: 780, fontSize: 14, lineHeight: 1.5 }}>
            Explore <strong>{countLabel}</strong> tournaments happening <strong>June 1–30, 2026</strong>. Filter by sport, browse the map, and plan your tournament weekend.
          </p>

          <div className="summaryTotalRow" style={{ marginTop: 14 }}>
            <article className="card card--mini bg-sport-default summary-total">
              <div className="summaryTotalRow__inner">
                <div className="summaryTotalRow__title">Tournaments</div>
                <div className="summaryTotalRow__value">{countLabel}</div>
              </div>
            </article>
            <article className="card card--mini bg-sport-default summary-total">
              <div className="summaryTotalRow__inner">
                <div className="summaryTotalRow__title">Dates</div>
                <div className="summaryTotalRow__value">Jun 1–30</div>
              </div>
            </article>
            <article className="card card--mini bg-sport-default summary-total">
              <div className="summaryTotalRow__inner">
                <div className="summaryTotalRow__title">Filters</div>
                <div className="summaryTotalRow__value">Map + sport</div>
              </div>
            </article>
          </div>

          <div className="actionsRow" style={{ marginTop: 14 }}>
            <a className="smallBtn" href="#map">
              Explore the map
            </a>
            <a className="smallBtn" href="#results">
              Browse tournaments
            </a>
            <a className="smallBtn" href="#results">
              Find hotels near venues
            </a>
          </div>

          <p className="subtitle" style={{ marginTop: 10, maxWidth: 780, fontSize: 13, lineHeight: 1.4 }}>
            Showing June tournaments for <strong>{rangeLabel}</strong>. Use filters below to narrow by sport and location.
          </p>
        </div>

        {zipRequested && zipError ? (
          <p className="subtitle" style={{ marginTop: 10, maxWidth: 720, fontSize: 13, lineHeight: 1.4 }}>
            ZIP radius filter unavailable for <strong>{zip}</strong>: {zipError}
          </p>
        ) : null}

        <div className="sportsRow" aria-label="June date range chips" style={{ marginBottom: 10 }}>
          {chipDefs.map((chip) => {
            const active = isChipActive(chip.startDate, chip.endDate);
            return (
              <a
                key={chip.label}
                className={`sportToggle${active ? " sportToggle--active" : ""}`}
                href={buildChipHref(chip.startDate, chip.endDate)}
                aria-current={active ? "page" : undefined}
              >
                <span>{chip.label}</span>
              </a>
            );
          })}
        </div>

        <TournamentDirectoryAnalyticsClient formId="june-2026-tournament-filters" resultCount={tournamentsClean.length} />

        <form id="june-2026-tournament-filters" className="filters" method="GET" action="/youth-sports-tournaments/june-2026">
          <input type="hidden" name="startDate" value={range.start} />
          <input type="hidden" name="endDate" value={range.endInclusive} />

          <div>
            <label className="label" htmlFor="q">
              Search
            </label>
            <input id="q" name="q" className="input" placeholder="Search tournaments..." defaultValue={q} />
          </div>

          <div>
            <span className="label">State</span>
            <StateMultiSelect
              availableStates={Object.keys(heatmapCounts.counts).sort()}
              stateSelections={stateSelections}
              isAllStates={isAllStates}
              allStatesValue={ALL_STATES_VALUE}
              summaryLabel={stateSummaryLabel}
              stateCounts={heatmapCounts.counts}
              totalCount={headlineCount}
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
              <AutoSubmitSelect id="radius" name="radius" className="select" defaultValue={String(radiusMiles)} style={{ width: 120 }}>
                {[10, 25, 50, 75, 100, 150, 200, 300].map((miles) => (
                  <option key={miles} value={String(miles)}>
                    {miles} mi
                  </option>
                ))}
              </AutoSubmitSelect>
            </div>
          </div>

          <div className="actionsRow">
            <button type="submit" className="smallBtn">
              Apply
            </button>
            <a className="smallBtn" href="/youth-sports-tournaments/june-2026">
              Reset
            </a>
          </div>

          <div className="sportsRow" aria-label="Sports filters">
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
        </form>

        {metroMarketChips}

        <div id="map">
          <UsTournamentHeatmap
            countsByState={heatmapCounts.counts}
            max={heatmapCounts.max}
            tipId="ti-directory-map-tip"
            pageType="directory"
            sport={sportsSelected.length === 1 ? sportsSelected[0] : "all"}
            hrefForState={(abbr) => {
              const params = new URLSearchParams();
              if (q) params.set("q", q);
              params.set("startDate", range.start);
              params.set("endDate", range.endInclusive);
              params.set("includePast", includePast ? "true" : "false");
              params.set("aysoOnly", aysoOnly ? "true" : "false");
              params.set("state", abbr);
              for (const sport of sportsSelected) params.append("sports", sport);
              return `/youth-sports-tournaments/june-2026?${params.toString()}#results`;
            }}
          />
        </div>

        <div id="results">
          {tournamentsClean.length === 0 ? (
            <div className="cards">
              <article className="card card-grass">
                <div className="cardHeader">
                  <div>
                    <div className="cardTitle" style={{ fontSize: 18 }}>
                      No tournaments match your filters
                    </div>
                    <div className="cardMeta">Try clearing search or selecting “All June”.</div>
                  </div>
                </div>
              </article>
            </div>
          ) : (
            <div className="grid">
              {tournamentsClean.map((t) => {
                const start = formatDate(t.start_date);
                const end = formatDate(t.end_date);
                const dateLabelText = start && end && start !== end ? `${start} – ${end}` : start || end || "Dates TBA";
                const locationLabel = [t.city, t.state].filter(Boolean).join(", ");
                const distanceLabel =
                  radiusActive && typeof t.distance_miles === "number" && Number.isFinite(t.distance_miles)
                    ? `${Math.round(t.distance_miles)} mi`
                    : "";
                const venueCount = (() => {
                  const rows = (t.tournament_venues ?? []) as Array<{ count?: number | null }>;
                  const first = rows && rows.length ? rows[0] : null;
                  return Number(first?.count ?? 0) || 0;
                })();
                const showVenueMapPreview = venueCount > 0;
                const mapHref = `/tournaments/${t.slug}/map`;
                const hasVrbo = Boolean(String(t.city ?? "").trim() && /^[A-Z]{2}$/.test(String(t.state ?? "").trim().toUpperCase()));

                return (
                  <article key={t.id} className={`card ${getSportCardClass(t.sport)}`}>
                    <h2>{t.name}</h2>
                    <p className="meta">
                      <strong>{SPORTS_LABELS[(t.sport ?? "unknown").toLowerCase()] ?? "Tournament"}</strong>
                      {locationLabel ? ` • ${locationLabel}` : ""}
                      {distanceLabel ? ` • ${distanceLabel}` : ""}
                      {t.level ? ` • ${t.level}` : ""}
                    </p>
                    <p className="dates">{dateLabelText}</p>

                    {showVenueMapPreview ? (
                      <VenueMapPreviewStrip tournamentName={t.name ?? "Tournament"} venueCount={venueCount} href={mapHref} />
                    ) : null}

                    <div className="cardFooter cardFooter--ctas">
                      {(() => {
                        const city = String(t.city ?? "").trim();
                        const state = String(t.state ?? "").trim().toUpperCase();
                        return (
                          <div className={`cardCtaGrid${hasVrbo ? " cardCtaGrid--twoUp" : ""}`}>
                            <PlanWeekendCtaClient
                              href={`/weekend/${t.slug}`}
                              className="primaryLink cardCta--plan"
                              tournamentId={t.id}
                              tournamentSlug={t.slug}
                              sport={t.sport ?? null}
                              state={t.state ?? null}
                            />
                            <a
                              className="secondaryLink cardCta--hotels"
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
                                Rentals
                              </a>
                            ) : null}
                            <Link className="secondaryLink cardStretchLink" href={`/tournaments/${t.slug}`}>
                              View tournament
                            </Link>
                          </div>
                        );
                      })()}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <section style={{ marginTop: 24 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Explore More Summer Tournaments</h2>
          <p className="subtitle" style={{ marginTop: 6, maxWidth: 820 }}>
            June is one of the busiest months for youth sports travel. TournamentInsights helps families, coaches, and teams find tournaments by date, sport, and location, then plan around tournament venues with maps and travel tools.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
            <Link className="smallBtn" href="/tournaments?month=2026-07#results">
              July 2026 (Directory)
            </Link>
            <Link className="smallBtn" href="/tournaments?month=2026-08#results">
              August 2026 (Directory)
            </Link>
            <Link className="smallBtn" href="/tournaments?sports=baseball#results">
              Baseball tournaments
            </Link>
            <Link className="smallBtn" href="/tournaments?sports=softball#results">
              Softball tournaments
            </Link>
            <Link className="smallBtn" href="/tournaments?sports=soccer#results">
              Soccer tournaments
            </Link>
            <Link className="smallBtn" href="/tournaments?sports=basketball#results">
              Basketball tournaments
            </Link>
            <Link className="smallBtn" href="/tournaments?sports=volleyball#results">
              Volleyball tournaments
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
