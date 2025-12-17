import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import AdSlot from "@/components/AdSlot";
import ReferralCTA from "@/components/ReferralCTA";
import RefereeWhistleBadge from "@/components/RefereeWhistleBadge";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { aggregateWhistleScoreRows, loadSeriesTournamentIds } from "@/lib/tournamentSeries";
import type { RawWhistleScoreRow, TournamentSeriesEntry } from "@/lib/tournamentSeries";
import type { RefereeWhistleScore } from "@/lib/types/refereeReview";
import "./tournaments.css";

type Tournament = {
  id: string;
  name: string;
  slug: string;
  sport: string | null;
  level: string | null;
  state: string;
  city: string | null;
  start_date: string | null;
  end_date: string | null;
  source_url: string;
};

const FILTER_SPORTS = ["soccer", "basketball", "football"] as const;

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

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    state?: string;
    month?: string;
    sports?: string | string[];
    reviewed?: string;
  };
}) {
  const supabase = createSupabaseServerClient();
  const q = (searchParams?.q ?? "").trim();
  const state = (searchParams?.state ?? "").trim().toUpperCase();
  const month = (searchParams?.month ?? "").trim(); // YYYY-MM
  const sportsParam = searchParams?.sports;
  const reviewedOnly = (searchParams?.reviewed ?? "").toLowerCase() === "true";
  const sportsSelectedRaw = Array.isArray(sportsParam)
    ? sportsParam
    : sportsParam
    ? [sportsParam]
    : [];
  const sportsSelected = sportsSelectedRaw
    .map((s) => s.toLowerCase())
    .filter((s): s is (typeof FILTER_SPORTS)[number] => FILTER_SPORTS.includes(s as any));

  let query = supabase
    .from("tournaments")
    .select("id,name,slug,sport,level,state,city,start_date,end_date,source_url,status,is_canonical")
    .eq("status", "published")
    .eq("is_canonical", true)
    .order("start_date", { ascending: true });

  if (state === "WA" || state === "OR" || state === "CA") {
    query = query.eq("state", state);
  }

  if (q) {
    // simple name/city search (Supabase OR syntax)
    // Note: this uses ilike for partial matches
    query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%`);
  }

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);
    const startISO = start.toISOString().slice(0, 10);
    const endISO = end.toISOString().slice(0, 10);
    query = query.gte("start_date", startISO).lt("start_date", endISO);
  }
  if (sportsSelected.length) {
    query = query.in("sport", sportsSelected);
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
  const tournaments = reviewedOnly
    ? tournamentsData.filter((t) => (whistleMap.get(t.id)?.review_count ?? 0) > 0)
    : tournamentsData;

  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock">
          <h1 className="title">Upcoming Tournaments</h1>
          <p className="subtitle">
            Youth soccer, basketball and football tournaments from public listings. Dates and details may change—always confirm on the official site.
          </p>
        </div>

        {/* Filters */}
        <form className="filters" method="GET" action="/tournaments">
          <div>
            <label className="label" htmlFor="q">Search</label>
            <input
              id="q"
              name="q"
              className="input"
              placeholder="Tournament name or city"
              defaultValue={q}
            />
          </div>

          <div>
            <label className="label" htmlFor="state">State</label>
            <select id="state" name="state" className="select" defaultValue={state}>
              <option value="">All</option>
              <option value="WA">WA</option>
              <option value="OR">OR</option>
              <option value="CA">CA</option>
            </select>
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

          <div className="actionsRow">
            <button className="smallBtn" type="submit">Apply</button>
            <a className="smallBtn" href="/tournaments">Reset</a>
          </div>

          <div className="sportsRow">
            <span className="label" style={{ marginBottom: 0 }}>Sports</span>
            <div className="sportsToggleWrap">
              <label className="sportToggle">
                <input
                  type="checkbox"
                  name="reviewed"
                  value="true"
                  defaultChecked={reviewedOnly}
                />
                <span>Reviewed only</span>
              </label>
              {FILTER_SPORTS.map((sport) => (
                <label key={sport} className="sportToggle">
                  <input
                    type="checkbox"
                    name="sports"
                    value={sport}
                    defaultChecked={sportsSelected.includes(sport)}
                  />
                  <span>{sport.charAt(0).toUpperCase() + sport.slice(1)}</span>
                </label>
              ))}
            </div>
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

        <div className="grid">
          {tournaments.map((t) => (
            <article key={t.id} className={`card ${cardVariant(t.sport)}`}>
              <div className="cardWhistle">
                <RefereeWhistleBadge
                  score={whistleMap.get(t.id)?.ai_score ?? null}
                  reviewCount={whistleMap.get(t.id)?.review_count ?? 0}
                  status={whistleMap.get(t.id)?.status}
                />
              </div>
              <h2>{t.name}</h2>

              <p className="meta">
                <strong>{t.state}</strong>
                {t.city ? ` • ${t.city}` : ""}
                {t.level ? ` • ${t.level}` : ""}
              </p>

              <p className="dates">
                {formatDate(t.start_date)}
                {t.end_date && t.end_date !== t.start_date ? ` – ${formatDate(t.end_date)}` : ""}
              </p>

              <div className="actions">
                <Link className="btn" href={`/tournaments/${t.slug}`}>View details</Link>
                <a className="btn" href={t.source_url} target="_blank" rel="noopener noreferrer">Official site</a>
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
