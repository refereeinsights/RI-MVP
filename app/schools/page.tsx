import Link from "next/link";
import RefereeWhistleBadge from "@/components/RefereeWhistleBadge";
import RefereeReviewList from "@/components/RefereeReviewList";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import type { RefereeReviewPublic, RefereeWhistleScoreStatus } from "@/lib/types/refereeReview";
import "../tournaments/tournaments.css";

type School = {
  id: string;
  name: string | null;
  slug: string | null;
  city: string | null;
  state: string | null;
};

type SchoolReviewRow = {
  id: string;
  school_id: string;
  created_at: string;
  reviewer_handle: string;
  reviewer_level?: string | null;
  worked_games?: number | null;
  overall_score: number;
  logistics_score: number;
  facilities_score: number;
  pay_score: number;
  support_score: number;
  shift_detail?: string | null;
  sport?: string | null;
};

const FILTER_STATES = ["WA", "OR", "CA"] as const;
const SPORT_FILTERS = ["soccer", "basketball", "football"] as const;

function cardVariant(sport: string | null) {
  const normalized = (sport ?? "").toLowerCase();
  if (normalized === "basketball") return "card-basketball";
  if (normalized === "football") return "card-football";
  return "card-grass";
}

export const metadata = {
  title: "School Reviews | Referee Insights",
  description: "Browse whistle scores and reviews for schools reported by verified referees.",
};

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams?: { q?: string; state?: string; reviewed?: string; sports?: string | string[] };
}) {
  const supabase = createSupabaseServerClient();
  const q = (searchParams?.q ?? "").trim();
  const state = (searchParams?.state ?? "").trim().toUpperCase();
  const reviewedOnly = (searchParams?.reviewed ?? "").toLowerCase() === "true";
  const sportsParam = searchParams?.sports;
  const sportsSelectedRaw = Array.isArray(sportsParam)
    ? sportsParam
    : sportsParam
    ? [sportsParam]
    : [];
  const sportsSelected = sportsSelectedRaw
    .map((s) => s.toLowerCase())
    .filter((s): s is (typeof SPORT_FILTERS)[number] => SPORT_FILTERS.includes(s as any));

  let query = supabase
    .from("schools")
    .select("id,name,slug,city,state")
    .order("name", { ascending: true });

  if (state && FILTER_STATES.includes(state as any)) {
    query = query.eq("state", state);
  }

  if (q) {
    query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return (
      <main className="pitchWrap">
        <section className="field">
          <div className="headerBlock">
            <h1 className="title">School reviews</h1>
            <p className="subtitle">Error loading schools: {error.message}</p>
          </div>
        </section>
      </main>
    );
  }

  const schools = (data ?? []) as School[];
  const scoreMap = await loadSchoolScores(
    supabase,
    schools.map((s) => s.id)
  );

  let filteredSchools = reviewedOnly
    ? schools.filter((s) => (scoreMap.get(s.id)?.review_count ?? 0) > 0)
    : schools;

  if (sportsSelected.length) {
    const sportIds = await loadSchoolIdsBySport(supabase, sportsSelected);
    filteredSchools = filteredSchools.filter((s) => sportIds.has(s.id));
  }

  const recentReviews = await loadRecentSchoolReviews(supabase);

  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock">
          <h1 className="title">Referee School Reviews</h1>
          <p className="subtitle">
            Search for schools and see whistle scores from verified officials. All submissions go through moderator review
            and whistle scores aggregate once enough reviews are approved.
          </p>
        </div>

        <form className="filters" method="GET" action="/schools">
          <div>
            <label className="label" htmlFor="q">
              Search
            </label>
            <input
              id="q"
              name="q"
              className="input"
              placeholder="School name or city"
              defaultValue={q}
            />
          </div>

          <div>
            <label className="label" htmlFor="state">
              State
            </label>
            <select id="state" name="state" className="select" defaultValue={state}>
              <option value="">All</option>
              {FILTER_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="actionsRow">
            <button className="smallBtn" type="submit">
              Apply
            </button>
            <a className="smallBtn" href="/schools">
              Reset
            </a>
          </div>

          <div className="sportsRow">
            <span className="label" style={{ marginBottom: 0 }}>
              Sports
            </span>
            <div className="sportsToggleWrap">
              <label className="sportToggle">
                <input type="checkbox" name="reviewed" value="true" defaultChecked={reviewedOnly} />
                <span>Reviewed only</span>
              </label>
              {SPORT_FILTERS.map((sport) => (
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
          <Link
            href="/schools/review"
            style={{
              borderRadius: 999,
              border: "none",
              padding: "0.65rem 1.6rem",
              color: "#000",
              background: "#ffffff",
              textDecoration: "none",
              fontWeight: 800,
              fontSize: 15,
              boxShadow: "0 8px 18px rgba(0,0,0,0.12)",
            }}
          >
            Submit a school review
          </Link>
        </div>

        <div
          style={{
            marginTop: 24,
            border: "1px dashed rgba(255,255,255,0.6)",
            borderRadius: 20,
            padding: "16px 18px",
            background: "rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ textAlign: "right", marginBottom: 10 }}>
            <a
              href="/schools/review"
              style={{
                color: "#111",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              + Share your school review
            </a>
          </div>
          <RefereeReviewList reviews={recentReviews} />
        </div>

        <div className="grid" style={{ marginTop: 18 }}>
          {filteredSchools.map((school) => {
            const score = scoreMap.get(school.id);
            return (
              <article key={school.id} className={`card ${cardVariant(score?.sport ?? null)}`}>
                <div className="cardWhistle">
                  <RefereeWhistleBadge
                    score={score?.ai_score ?? null}
                    reviewCount={score?.review_count ?? 0}
                    status={score?.status}
                  />
                </div>
                <h2>{school.name ?? "Unnamed school"}</h2>
                <p className="meta">
                  <strong>{school.state ?? "??"}</strong>
                  {school.city ? ` • ${school.city}` : ""}
                </p>
                <p className="dates">{score?.summary ?? "Waiting for the first verified review."}</p>

                <div className="actions">
                  <Link className="btn" href={`/schools/review?school_id=${school.id}`}>
                    Add review
                  </Link>
                </div>
              </article>
            );
          })}
        </div>

        {filteredSchools.length === 0 && (
          <p className="empty">No schools match those filters yet.</p>
        )}
      </section>
    </main>
  );
}

type SchoolScore = {
  ai_score: number | null;
  review_count: number;
  summary: string | null;
  status: RefereeWhistleScoreStatus | null;
  sport: string | null;
};

async function loadSchoolScores(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  ids: string[]
): Promise<Map<string, SchoolScore>> {
  const map = new Map<string, SchoolScore>();
  const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
  if (!uniqueIds.length) return map;

  const { data } = await supabase
    .from("school_referee_scores")
    .select("school_id,ai_score,review_count,summary,status,updated_at")
    .in("school_id", uniqueIds);

  (data ?? []).forEach((row: any) => {
    map.set(row.school_id, {
      ai_score: row.ai_score ?? null,
      review_count: row.review_count ?? 0,
      summary: row.summary ?? null,
      status: row.status ?? "clear",
      sport: row.sport ?? null,
    });
  });

  return map;
}

async function loadRecentSchoolReviews(
  supabase: ReturnType<typeof createSupabaseServerClient>
) {
  const { data } = await supabase
    .from("school_referee_reviews_public")
    .select(
      "id,school_id,created_at,reviewer_handle,reviewer_level,worked_games,overall_score,logistics_score,facilities_score,pay_score,support_score,shift_detail,school_name,school_city,school_state,sport"
    )
    .order("created_at", { ascending: false })
    .limit(5);

  const rows = (data ?? []) as SchoolReviewRow[];

  const missingSportIds = rows.filter((row) => !row.sport).map((row) => row.id);
  let sportFallback = new Map<string, string | null>();
  if (missingSportIds.length) {
    const { data: sportRows } = await supabase
      .from("school_referee_reviews")
      .select("id,sport")
      .in("id", missingSportIds);
    (sportRows ?? []).forEach((row: any) => {
      if (row?.id) {
        sportFallback.set(row.id, row.sport ?? null);
      }
    });
  }

  return rows.map((row) => ({
    ...row,
    tournament_id: row.school_id,
    reviewer_badges: [],
    school_name: (row as any).school_name ?? null,
    school_city: (row as any).school_city ?? null,
    school_state: (row as any).school_state ?? null,
    sport: (row as any).sport ?? sportFallback.get(row.id) ?? null,
  }));
}

async function loadSchoolIdsBySport(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  sports: string[]
) {
  const { data } = await supabase
    .from("school_referee_reviews")
    .select("school_id")
    .in("sport", sports)
    .eq("status", "approved");
  return new Set((data ?? []).map((row: any) => row.school_id).filter(Boolean));
}
