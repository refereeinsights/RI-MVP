import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import AdSlot from "@/components/AdSlot";
import ReferralCTA from "@/components/ReferralCTA";
import { WhistleScale } from "@/components/RefereeReviewList";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { aggregateWhistleScoreRows, loadSeriesTournamentIds } from "@/lib/tournamentSeries";
import type { RawWhistleScoreRow, TournamentSeriesEntry } from "@/lib/tournamentSeries";
import type { RefereeWhistleScore } from "@/lib/types/refereeReview";
import { getSportCardClass } from "@/lib/ui/sportBackground";
import InsightDisclaimer from "@/components/InsightDisclaimer";
import StateMultiSelect from "./StateMultiSelect";
import { FEATURE_TOURNAMENT_ENGAGEMENT_BADGES } from "@/lib/featureFlags";
import "./tournaments.css";

type Tournament = {
  id: string;
  name: string;
  slug: string;
  sport: string | null;
  level: string | null;
  state: string;
  city: string | null;
  zip?: string | null;
  start_date: string | null;
  end_date: string | null;
  source_url: string;
  official_website_url?: string | null;
};
type EngagementRow = {
  tournament_id: string;
  clicks_7d: number | null;
  clicks_30d: number | null;
  clicks_90d: number | null;
  unique_users_30d: number | null;
};

// Cache this listing for 5 minutes to reduce Supabase load while keeping results fresh.
export const revalidate = 300;

export const metadata = {
  title: "Tournament Listings and Reviews | RefereeInsights",
  description:
    "Referee-submitted insight on pay, organization, and on-site experience — so you can decide with confidence.",
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

function toWhistleScore(aiScore: number | null) {
  if (!Number.isFinite(aiScore ?? NaN)) return null;
  return Math.max(1, Math.min(5, (aiScore ?? 0) / 20));
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

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    state?: string | string[];
    month?: string;
    sports?: string | string[];
    reviewed?: string;
    includePast?: string;
  };
}) {
  const supabase = createSupabaseServerClient();
  const q = (searchParams?.q ?? "").trim();
  const stateParam = searchParams?.state;
  const month = (searchParams?.month ?? "").trim(); // YYYY-MM
  const sportsParam = searchParams?.sports;
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

  let query = supabase
    .from("tournaments")
    .select("id,name,slug,sport,level,state,city,zip,start_date,end_date,source_url,official_website_url,status,is_canonical")
    .eq("status", "published")
    .eq("is_canonical", true)
    .order("start_date", { ascending: true });

  const today = new Date().toISOString().slice(0, 10);
  if (!includePast) {
    // Show only upcoming (or currently running) tournaments by default
    query = query.or(`start_date.gte.${today},end_date.gte.${today}`);
  }

  if (q) {
    // simple name/city search (Supabase OR syntax)
    // Note: this uses ilike for partial matches
    query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%`);
  }
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    // Use UTC to avoid timezone drift moving the month window
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    const startISO = start.toISOString().slice(0, 10);
    const endISO = end.toISOString().slice(0, 10);
    query = query.gte("start_date", startISO).lt("start_date", endISO);
  }
  const { data, error } = await query;

  if (error) {
    return (
      <main className="pitchWrap">
        <section className="field">
          <div className="headerBlock">
            <h1 className="title">Upcoming Tournaments</h1>
            <p className="subtitle">
              Error loading tournaments: <code>{error.message}</code>
            </p>
          </div>
        </section>
      </main>
    );
  }

  const tournamentsData = (data ?? []) as Tournament[];
  const seriesMap = await loadSeriesTournamentIds(
    supabase,
    tournamentsData.map((t) => ({ id: t.id, slug: t.slug }))
  );
  const whistleMap = await loadWhistleScores(supabase, seriesMap);
  const months = monthOptions(9);
  const reviewedTournaments = reviewedOnly
    ? tournamentsData.filter((t) => (whistleMap.get(t.id)?.review_count ?? 0) > 0)
    : tournamentsData;

  const sportsCounts = reviewedTournaments.reduce((acc: Record<string, number>, t) => {
    const key = (t.sport ?? "unknown").toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const sportsSorted = Object.entries(sportsCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([sport, count]) => ({ sport, count }));

  const tournamentsBySport = sportsSelected.length
    ? reviewedTournaments.filter((t) => {
        const key = (t.sport ?? "unknown").toLowerCase();
        return sportsSelected.includes(key);
      })
    : reviewedTournaments;
  const availableStates = Array.from(
    new Set(
      tournamentsBySport
        .map((t) => (t.state ?? "").trim().toUpperCase())
        .filter(Boolean)
    )
  ).sort();
  const tournaments = isAllStates
    ? tournamentsBySport
    : tournamentsBySport.filter((t) => stateSelections.includes((t.state ?? "").trim().toUpperCase()));

  const engagementMap = new Map<string, EngagementRow>();
  if (FEATURE_TOURNAMENT_ENGAGEMENT_BADGES && tournaments.length) {
    const { data: engagementRows } = await supabaseAdmin
      .from("tournament_engagement_rolling" as any)
      .select("tournament_id,clicks_7d,clicks_30d,clicks_90d,unique_users_30d")
      .in("tournament_id", tournaments.map((t) => t.id));
    (engagementRows ?? []).forEach((row: EngagementRow) => {
      engagementMap.set(row.tournament_id, row);
    });
  }

  const demoSlug = "refereeinsights-demo-tournament";
  const tournamentsSorted = [...tournaments].sort((a, b) => {
    if (a.slug === demoSlug && b.slug !== demoSlug) return -1;
    if (b.slug === demoSlug && a.slug !== demoSlug) return 1;
    return 0;
  });

  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock brandedHeader">
          <h1 className="title" style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.01em" }}>
            Tournament Listings and Reviews
          </h1>
          <p
            className="subtitle"
            style={{
              marginTop: 8,
              maxWidth: 680,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            Referee-submitted insight on pay, organization, and on-site experience — so you can decide with confidence.
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
              RefereeInsights is building a public beta directory for tournaments so officials can evaluate assignments
              before committing. Listings are compiled from public sources and may be incomplete or outdated; we show
              what we have and invite corrections. This page is designed to help referees compare events by location,
              timing, and sport while we gather verified insights from working crews. As reviews and decision signals
              arrive, you will see richer context like logistics, support, and on-site conditions. Until then, treat each
              listing as a starting point, not a promise of quality or pay.
            </p>
            <p>
              If you are working an event, you can help improve the directory by reporting issues or submitting verified
              updates. We are intentionally conservative about what we claim — no ratings or guarantees, just factual
              details that can be sourced and confirmed. The goal is simple: a referee-first resource that reduces
              surprises and helps crews plan travel, time, and expectations. Thank you for helping us grow this catalog
              responsibly as the public beta expands.
            </p>
          </div>
          <InsightDisclaimer />
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
              Report an Issue
            </a>
            <span style={{ fontSize: 12, color: "#0b1f14" }}>
              Flag incorrect info, safety concerns, or policy violations.
            </span>
          </div>
        </div>

        {/* Filters */}
        <form className="filters" method="GET" action="/tournaments">
          <div>
            <label className="label" htmlFor="q">Search</label>
            <input
              id="q"
              name="q"
              className="input"
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
            {sportsSorted.map(({ sport, count }) => (
              <label key={sport} className="sportToggle">
                <input
                  type="checkbox"
                  name="sports"
                  value={sport}
                  defaultChecked={sportsSelected.includes(sport)}
                />
                <span>{(SPORTS_LABELS[sport] || sport)} ({count})</span>
              </label>
            ))}
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
            <a className="smallBtn" href="/tournaments">Reset</a>
          </div>
        </form>

        <div
          style={{
            marginTop: "1rem",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <AdSlot placement="tournaments_sidebar" />
        </div>

        {sportsSorted.length ? (
          <div className="summaryGrid">
            <article className="card card--mini bg-sport-default">
              <div className="summaryCount">{tournamentsSorted.length}</div>
              <div className="summaryLabel">Total tournaments</div>
              <div className="summaryIcon summaryIcon--ri" aria-hidden="true">
                <img src="/refereeinsights_mark.svg" alt="" />
              </div>
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
                  params.set("reviewed", reviewedOnly ? "true" : "false");
                  params.set("includePast", includePast ? "true" : "false");
                  params.set("sports", sport);
                  return `/tournaments?${params.toString()}`;
                })()}
                className={`card card--mini ${getSportCardClass(sport)}`}
              >
                <div className="summaryCount">{count}</div>
                <div className="summaryLabel">{SPORTS_LABELS[sport] || sport}</div>
                <div className="summaryIcon" aria-hidden="true">{sportIcon(sport)}</div>
              </Link>
            ))}
          </div>
        ) : null}

        <div className="grid">
          {tournamentsSorted.map((t) => (
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

              {(!includePast && t.start_date && t.start_date < today && t.end_date && t.end_date < today) ||
              (includePast && t.start_date && t.start_date < today && (!t.end_date || t.end_date < today)) ? (
                <p
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: "rgba(0,0,0,0.06)",
                    color: "#374151",
                    fontSize: 12,
                    fontWeight: 700,
                    width: "fit-content",
                    marginTop: 4,
                    marginBottom: 0,
                  }}
                >
                  Past event
                </p>
              ) : null}

              {FEATURE_TOURNAMENT_ENGAGEMENT_BADGES ? (() => {
                const signals = getEngagementSignals(engagementMap.get(t.id));
                return signals.length ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    {signals.map((label) => (
                      <span
                        key={label}
                        title="Based on recent outbound link clicks from RefereeInsights users."
                        style={{
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.35)",
                          background: "rgba(15,23,42,0.08)",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#0f172a",
                        }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null;
              })() : null}

              <div className="actions">
                <Link className="btn" href={`/tournaments/${t.slug}`}>View details</Link>
                {(t.official_website_url || t.source_url) ? (
                  <a className="btn" href={`/go/tournament/${t.id}`} target="_blank" rel="noopener noreferrer">Official site</a>
                ) : null}
              </div>

              <div className="sportIcon" aria-label={t.sport ?? "tournament sport"}>
                {sportIcon(t.sport)}
              </div>
            </article>
          ))}
        </div>

        {tournaments.length === 0 && (
          <p className="empty">No tournaments match those filters yet.</p>
        )}

        <div style={{ marginTop: "2.5rem" }}>
          <ReferralCTA placement="tournament_referral" />
        </div>
      </section>
    </main>
  );
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
