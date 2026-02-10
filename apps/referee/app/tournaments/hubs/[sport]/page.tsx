import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { WhistleScale } from "@/components/RefereeReviewList";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { aggregateWhistleScoreRows, loadSeriesTournamentIds } from "@/lib/tournamentSeries";
import type { RawWhistleScoreRow, TournamentSeriesEntry } from "@/lib/tournamentSeries";
import type { RefereeWhistleScore } from "@/lib/types/refereeReview";
import { FEATURE_TOURNAMENT_ENGAGEMENT_BADGES } from "@/lib/featureFlags";
import type { Metadata } from "next";
import { getSportCardClass } from "@/lib/ui/sportBackground";
import StateMultiSelect from "@/app/tournaments/StateMultiSelect";
import "../../tournaments.css";

type Tournament = {
  id: string;
  name: string;
  slug: string;
  sport: string | null;
  level: string | null;
  city: string | null;
  state: string | null;
  zip?: string | null;
  start_date: string | null;
  end_date: string | null;
  source_url: string | null;
  official_website_url?: string | null;
};

type EngagementRow = {
  tournament_id: string;
  clicks_7d: number | null;
  clicks_30d: number | null;
  clicks_90d: number | null;
  unique_users_30d: number | null;
};

export const revalidate = 300;

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.refereeinsights.com").replace(/\/+$/, "");

function toTitleCase(value: string) {
  return value.replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeSportParam(sport: string) {
  return sport.trim().toLowerCase().replace(/-/g, " ");
}

function sportLabelFromParam(sport: string) {
  return toTitleCase(normalizeSportParam(sport));
}

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

function toWhistleScore(aiScore: number | null) {
  if (!Number.isFinite(aiScore ?? NaN)) return null;
  return Math.max(1, Math.min(5, (aiScore ?? 0) / 20));
}

function sportIcon(sport: string | null) {
  const normalized = (sport ?? "").toLowerCase();
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

function getEngagementSignals(row?: EngagementRow) {
  if (!row) return [];
  const clicks7 = row.clicks_7d ?? 0;
  const clicks30 = row.clicks_30d ?? 0;
  const clicks90 = row.clicks_90d ?? 0;
  const unique30 = row.unique_users_30d ?? 0;
  const hasUnique = unique30 > 0;
  const popular = clicks30 >= 10 && (!hasUnique || unique30 >= 5);
  const frequent = clicks90 >= 25 && (!hasUnique || unique30 >= 10);
  const high = clicks30 >= 20 || (clicks30 >= 10 && clicks7 >= 5);
  const ordered: string[] = [];
  if (high) ordered.push("High engagement tournament");
  if (popular) ordered.push("Popular this month");
  if (frequent) ordered.push("Frequently visited by referees");
  return ordered.slice(0, 2);
}

async function loadWhistleScores(
  supabase: SupabaseClient,
  seriesMap: Map<string, TournamentSeriesEntry>
): Promise<Map<string, RefereeWhistleScore>> {
  const map = new Map<string, RefereeWhistleScore>();
  if (!seriesMap.size) return map;

  const uniqueIds = Array.from(
    new Set(
      Array.from(seriesMap.values()).flatMap((entry) => entry.tournamentIds)
    )
  ).filter(Boolean);
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
    const rows = entry.tournamentIds
      .map((id) => rowMap.get(id))
      .filter((row): row is RawWhistleScoreRow => Boolean(row));
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

export async function generateMetadata({
  params,
}: {
  params: { sport: string };
}): Promise<Metadata> {
  const sportLabel = sportLabelFromParam(params.sport);
  return {
    title: `${sportLabel} Tournament Directory | RefereeInsights`,
    description: `Public beta directory for ${sportLabel} tournaments. Details sourced from public listings with referee insights coming soon.`,
    alternates: {
      canonical: `${SITE_ORIGIN}/tournaments/hubs/${params.sport.toLowerCase()}`,
    },
  };
}

export default async function SportTournamentHub({
  params,
  searchParams,
}: {
  params: { sport: string };
  searchParams?: {
    q?: string;
    state?: string | string[];
    month?: string;
    reviewed?: string;
    includePast?: string | string[];
  };
}) {
  const sportQuery = normalizeSportParam(params.sport);
  const q = (searchParams?.q ?? "").trim();
  const stateParam = searchParams?.state;
  const month = (searchParams?.month ?? "").trim();
  const reviewedParam = searchParams?.reviewed;
  const reviewedOnly = Array.isArray(reviewedParam)
    ? reviewedParam.includes("true")
    : reviewedParam
    ? reviewedParam.toLowerCase() === "true"
    : false;
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
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("tournaments")
    .select("id,name,slug,sport,level,state,city,zip,start_date,end_date,source_url,official_website_url,status,is_canonical")
    .eq("status", "published")
    .eq("is_canonical", true)
    .ilike("sport", `%${sportQuery}%`)
    .order("start_date", { ascending: true });
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
  const today = new Date().toISOString().slice(0, 10);
  if (!includePast) {
    query = query.or(`start_date.gte.${today},end_date.gte.${today}`);
  }
  const { data, error } = await query;

  const demoSlug = "refereeinsights-demo-tournament";
  const tournaments = ((data ?? []) as Tournament[]).sort((a, b) => {
    if (a.slug === demoSlug && b.slug !== demoSlug) return -1;
    if (b.slug === demoSlug && a.slug !== demoSlug) return 1;
    return 0;
  });
  const sportLabel = sportLabelFromParam(params.sport);
  const seriesMap = await loadSeriesTournamentIds(
    supabase,
    tournaments.map((t) => ({ id: t.id, slug: t.slug }))
  );
  const whistleMap = await loadWhistleScores(supabase, seriesMap);
  const months = monthOptions(9);
  const reviewedTournaments = reviewedOnly
    ? tournaments.filter((t) => (whistleMap.get(t.id)?.review_count ?? 0) > 0)
    : tournaments;
  const availableStates = Array.from(
    new Set(
      reviewedTournaments
        .map((t) => (t.state ?? "").trim().toUpperCase())
        .filter(Boolean)
    )
  ).sort();
  const tournamentsSorted = isAllStates
    ? reviewedTournaments
    : reviewedTournaments.filter((t) => stateSelections.includes((t.state ?? "").trim().toUpperCase()));
  const engagementMap = new Map<string, EngagementRow>();
  if (FEATURE_TOURNAMENT_ENGAGEMENT_BADGES && tournamentsSorted.length) {
    const { data: engagementRows } = await supabaseAdmin
      .from("tournament_engagement_rolling" as any)
      .select("tournament_id,clicks_7d,clicks_30d,clicks_90d,unique_users_30d")
      .in("tournament_id", tournamentsSorted.map((t) => t.id));
    (engagementRows ?? []).forEach((row: EngagementRow) => {
      engagementMap.set(row.tournament_id, row);
    });
  }

  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock brandedHeader">
          <h1 className="title" style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.01em" }}>
            {sportLabel} Tournament Directory
          </h1>
          <div className="subtitle" style={{ marginTop: 12, maxWidth: 860, fontSize: 14, lineHeight: 1.6 }}>
            <p style={{ marginTop: 0 }}>
              RefereeInsights is building a public beta directory focused on {sportLabel.toLowerCase()} tournaments so
              officials can plan assignments with fewer surprises. Listings on this page are sourced from public
              tournament information and may be incomplete or in progress. We publish only what can be traced to a
              public listing and avoid filling in gaps with assumptions. That means you might see missing venues,
              partial dates, or limited contact information while the catalog fills in. The goal is not marketing
              copy; it is a practical, referee-first record that helps crews compare events by timing, location, and
              level before committing. Over time this should make it easier to plan travel, manage weekend workloads,
              and coordinate with other officials.
            </p>
            <p>
              As referee reviews are collected and verified, this hub will gain richer insight into logistics, crew
              support, and working conditions. Until then, treat each listing as a starting point for your own research
              and outreach. We do not publish ratings or pay claims unless they are supported by verified referee
              submissions. If you are working one of these events, you can help by reporting issues, requesting verified
              updates, or submitting a review once it is approved. Every correction improves the public beta and helps
              other officials prepare with clearer expectations for assignments.
            </p>
          </div>
        </div>

        {error ? (
          <p className="empty">Error loading tournaments: {error.message}</p>
        ) : (
          <>
            <form className="filters" method="GET" action={`/tournaments/hubs/${sportQuery}`}>
              <div>
                <label className="label" htmlFor="q">Search</label>
                <input
                  id="q"
                  name="q"
                  className="input"
                  type="search"
                  placeholder="Search tournaments..."
                  defaultValue={q}
                />
              </div>

              <div>
                <span className="label">State</span>
                <StateMultiSelect
                  availableStates={availableStates}
                  stateSelections={stateSelections}
                  isAllStates={isAllStates}
                  allStatesValue={ALL_STATES_VALUE}
                  summaryLabel={stateSummaryLabel}
                />
              </div>

              <div>
                <label className="label" htmlFor="month">Month</label>
                <select id="month" name="month" className="select" defaultValue={month}>
                  <option value="">Any</option>
                  {months.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div className="sportsRow">
                <label className="sportToggle">
                  <input type="hidden" name="reviewed" value="false" />
                  <input
                    type="checkbox"
                    name="reviewed"
                    value="true"
                    defaultChecked={reviewedOnly}
                  />
                  <span>Reviewed only</span>
                </label>
                <label className="sportToggle">
                  <input type="hidden" name="includePast" value="false" />
                  <input
                    type="checkbox"
                    name="includePast"
                    value="true"
                    defaultChecked={includePast}
                  />
                  <span>Include past events</span>
                </label>
              </div>

              <div className="actionsRow">
                <button className="smallBtn" type="submit">Apply</button>
                <a className="smallBtn" href={`/tournaments/hubs/${sportQuery}`}>Reset</a>
              </div>
            </form>

            <div className="grid">
              {tournamentsSorted.map((t) => {
                return (
                  <article key={t.id} className={`card ${getSportCardClass(t.sport)}`}>
                    <div className="cardWhistle">
                      {toWhistleScore(whistleMap.get(t.id)?.ai_score ?? null) ? (
                        <>
                          <WhistleScale score={toWhistleScore(whistleMap.get(t.id)?.ai_score ?? null) ?? 1} />
                          <div
                            style={{
                              fontSize: "0.7rem",
                              marginTop: 2,
                              color: "rgba(255,255,255,0.95)",
                              textAlign: "center",
                              textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                              fontWeight: 600,
                            }}
                          >
                            {`${(toWhistleScore(whistleMap.get(t.id)?.ai_score ?? null) ?? 1).toFixed(1)} - ${whistleMap.get(t.id)?.review_count ?? 0} verified review${(whistleMap.get(t.id)?.review_count ?? 0) === 1 ? "" : "s"}`}
                          </div>
                        </>
                      ) : null}
                    </div>
                    <h2>{t.name}</h2>

                    <p className="meta">
                      <strong>{t.state}</strong>
                      {t.city ? ` • ${t.city}` : ""}
                      {t.zip ? ` • ${t.zip}` : ""}
                      {t.level ? ` • ${t.level}` : ""}
                    </p>

                    <p className="dates">
                      {formatDate(t.start_date)}
                      {t.end_date && t.end_date !== t.start_date ? ` – ${formatDate(t.end_date)}` : ""}
                    </p>

                    {FEATURE_TOURNAMENT_ENGAGEMENT_BADGES ? (
                      <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                        {getEngagementSignals(engagementMap.get(t.id)).map((label) => (
                          <span
                            key={label}
                            title="Based on recent outbound link clicks from RefereeInsights users."
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 12,
                              padding: "4px 10px",
                              borderRadius: 999,
                              background: "rgba(0,0,0,0.08)",
                              color: "#0b1f14",
                              width: "fit-content",
                            }}
                          >
                            <span aria-hidden="true">🔥</span>
                            {label}
                          </span>
                        ))}
                      </div>
                    ) : null}

                  <div className="actions">
                    <Link className="btn" href={`/tournaments/${t.slug}`}>View details</Link>
                    {(t.official_website_url || t.source_url) ? (
                        <a
                          className="btn"
                          href={
                            t.slug === "refereeinsights-demo-tournament"
                              ? `/tournaments/${t.slug}`
                              : `/go/tournament/${t.id}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Official site
                        </a>
                    ) : null}
                  </div>

                    <div className="sportIcon" aria-label={t.sport ?? "tournament sport"}>
                      {sportIcon(t.sport)}
                    </div>
                  </article>
                );
              })}
            </div>

            {tournamentsSorted.length === 0 && (
              <p className="empty">No {sportLabel.toLowerCase()} tournaments are listed yet.</p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
