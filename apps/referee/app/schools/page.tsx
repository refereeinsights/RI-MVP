import Link from "next/link";
import RefereeWhistleBadge from "@/components/RefereeWhistleBadge";
import RefereeReviewList from "@/components/RefereeReviewList";
import InsightDisclaimer from "@/components/InsightDisclaimer";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import type { RefereeReviewPublic, RefereeWhistleScoreStatus } from "@/lib/types/refereeReview";
import "../tournaments/tournaments.css";

type School = {
  id: string;
  name: string | null;
  slug: string | null;
  city: string | null;
  state: string | null;
  zip?: string | null;
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

// Cache school listings for 5 minutes to reduce Supabase load.
export const revalidate = 300;

function cardVariant(sport: string | null) {
  const normalized = (sport ?? "").toLowerCase();
  if (normalized === "basketball") return "card-basketball";
  if (normalized === "football") return "card-football";
  return "card-grass";
}

export const metadata = {
  title: "School Reviews | RefereeInsights",
  description:
    "Referee insight on schools, venues, and organizers — focused on clarity, safety, and professionalism.",
};

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    state?: string;
    zip?: string;
    reviewed?: string;
    sports?: string | string[];
  };
}) {
  const supabase = createSupabaseServerClient();
  const q = (searchParams?.q ?? "").trim();
  const state = (searchParams?.state ?? "").trim().toUpperCase();
  const zip = (searchParams?.zip ?? "").trim();
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
    .select("id,name,slug,city,state,zip")
    .order("name", { ascending: true });

  if (state && FILTER_STATES.includes(state as any)) {
    query = query.eq("state", state);
  }

  if (q) {
    query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%`);
  }
  if (zip) {
    query = query.eq("zip", zip);
  }

  const { data, error } = await query;
  if (error) {
    return (
      <main className="pitchWrap">
        <section className="field">
          <div className="headerBlock">
            <h1 className="title">School Reviews</h1>
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
  const sportReviewStats = SPORT_FILTERS.map((sport) => ({
    sport,
    count: recentReviews.filter((review) => (review.sport ?? "").toLowerCase() === sport).length,
  }));
  const lastReviewTimestamp = recentReviews[0]?.created_at
    ? new Date(recentReviews[0].created_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <main className="pitchWrap tournamentsWrap schoolsPage">
      <section className="field tournamentsField">
        <div className="headerBlock schoolsHeader brandedHeader">
          <h1 className="title" style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.01em" }}>
            School Reviews
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
            Referee insight on schools, venues, and organizers — focused on clarity, safety, and professionalism.
          </p>
            <InsightDisclaimer />
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "flex-start",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 10,
                marginBottom: 12,
              }}
            >
              <a
                href="/feedback?type=school&name=School%20Insights&url=/schools"
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
                }}
              >
                Report an Issue
              </a>
              <span style={{ fontSize: 12, color: "#0b1f14" }}>
                Flag incorrect info, safety concerns, or policy violations.
              </span>
            </div>
          </div>

        <form
          method="GET"
          action="/schools"
          style={{
            marginTop: 20,
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.6)",
            background: "rgba(0,0,0,0.08)",
            padding: "18px 18px 12px",
            display: "grid",
            gap: 14,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", fontWeight: 700, color: "#0b1f14" }}>
              <span style={{ marginBottom: 6 }}>Search</span>
              <input
                id="q"
                name="q"
                placeholder="Search schools / venues / organizers..."
                defaultValue={q}
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  padding: "0.7rem 0.9rem",
                  fontSize: 15,
                }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", fontWeight: 700, color: "#0b1f14" }}>
              <span style={{ marginBottom: 6 }}>State</span>
              <select
                id="state"
                name="state"
                defaultValue={state}
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  padding: "0.7rem 0.9rem",
                  fontSize: 15,
                  backgroundColor: "#fff",
                }}
              >
                <option value="">All</option>
                {FILTER_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", fontWeight: 700, color: "#0b1f14" }}>
              <span style={{ marginBottom: 6 }}>ZIP</span>
              <input
                id="zip"
                name="zip"
                placeholder="e.g. 98101"
                defaultValue={zip}
                inputMode="numeric"
                pattern="\\d*"
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  padding: "0.7rem 0.9rem",
                  fontSize: 15,
                }}
              />
            </label>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
              alignItems: "center",
            }}
          >
            <label style={{ fontWeight: 700, color: "#0b1f14" }}>
              <span style={{ display: "block", marginBottom: 6 }}>Reviewed only</span>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,0.2)",
                  padding: "0.4rem 0.8rem",
                  background: "#fff",
                }}
              >
                <input type="checkbox" name="reviewed" value="true" defaultChecked={reviewedOnly} />
                <span style={{ fontWeight: 600 }}>Only schools with whistle scores</span>
              </label>
            </label>

            <div>
              <span style={{ display: "block", fontWeight: 700, color: "#0b1f14", marginBottom: 6 }}>
                Sports
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {SPORT_FILTERS.map((sport) => (
                  <label
                    key={sport}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      borderRadius: 999,
                      border: "1px solid rgba(0,0,0,0.2)",
                      padding: "0.35rem 0.8rem",
                      background: sportsSelected.includes(sport) ? "#0f3d2e" : "#fff",
                      color: sportsSelected.includes(sport) ? "#fff" : "#0b1f14",
                      fontWeight: 600,
                      textTransform: "capitalize",
                    }}
                  >
                    <input
                      type="checkbox"
                      name="sports"
                      value={sport}
                      defaultChecked={sportsSelected.includes(sport)}
                      style={{ accentColor: "#0f3d2e" }}
                    />
                    {sport}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              className="smallBtn"
              type="submit"
              style={{
                borderRadius: 999,
                border: "none",
                padding: "0.55rem 1.4rem",
                fontWeight: 800,
                background: "#0f3d2e",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Apply
            </button>
            <a
              className="smallBtn"
              href="/schools"
              style={{
                borderRadius: 999,
                border: "1px solid rgba(0,0,0,0.3)",
                padding: "0.5rem 1.3rem",
                fontWeight: 700,
                color: "#111",
                textDecoration: "none",
                background: "#fff",
              }}
            >
              Reset
            </a>
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

        <section
          style={{
            marginTop: 28,
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.55)",
            background: "#fff",
            color: "#0f241a",
            padding: "18px",
            boxShadow: "0 10px 28px rgba(0,0,0,0.18)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <p style={{ fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", margin: 0, color: "#0f3d2e" }}>
                Recent referee reviews
              </p>
              <h3 style={{ margin: "4px 0 0", fontSize: 22 }}>Field, locker room, and pay updates</h3>
            </div>
            <a
              href="/schools/review"
              style={{
                padding: "0.5rem 1.2rem",
                borderRadius: 999,
                border: "1px solid rgba(0,0,0,0.15)",
                textDecoration: "none",
                fontWeight: 700,
                color: "#0f3d2e",
                background: "#f6faf7",
              }}
            >
              + Share your school review
            </a>
          </div>
          {recentReviews.length > 0 && (
            <div
              style={{
                marginTop: 14,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
                gap: 12,
              }}
            >
              {sportReviewStats.map((stat) => (
                <div
                  key={stat.sport}
                  style={{
                    borderRadius: 14,
                    padding: "0.8rem",
                    background:
                      stat.sport === "basketball"
                        ? "linear-gradient(135deg,#f4a261,#c96c23)"
                        : stat.sport === "football"
                        ? "linear-gradient(135deg,#8c5a27,#5b3311)"
                        : "linear-gradient(135deg,#0d4c2b,#07331c)",
                    color: "#fff",
                    boxShadow: "0 8px 18px rgba(0,0,0,0.15)",
                  }}
                >
                  <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.8 }}>
                    {stat.sport}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>
                    {stat.count}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>reviews this week</div>
                </div>
              ))}
              {lastReviewTimestamp && (
                <div
                  style={{
                    borderRadius: 14,
                    padding: "0.8rem",
                    background: "linear-gradient(135deg,#1c2624,#121b19)",
                    color: "#fefefe",
                    boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
                  }}
                >
                  <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.7 }}>
                    Last submission
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{lastReviewTimestamp}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Auto-refreshes after moderator approval</div>
                </div>
              )}
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <RefereeReviewList reviews={recentReviews} />
          </div>
        </section>

        <div className="grid" style={{ marginTop: 24 }}>
          <div style={{ gridColumn: "1 / -1", color: "rgba(255,255,255,0.9)", marginBottom: 10 }}>
            Showing <strong>{filteredSchools.length}</strong> school{filteredSchools.length === 1 ? "" : "s"}
          </div>
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
                  {school.zip ? ` • ${school.zip}` : ""}
                  {score?.sport && (
                    <span style={{ marginLeft: 6, padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(0,0,0,0.25)", fontSize: 11 }}>
                      {score.sport}
                    </span>
                  )}
                </p>
                <p className="dates">
                  {score?.review_count ? (
                    <>
                      {score.review_count} verified review{score.review_count === 1 ? "" : "s"}
                      <br />
                      <span style={{ color: "rgba(255,255,255,0.85)" }}>
                        {score?.summary ?? "Officials are still weighing in."}
                      </span>
                    </>
                  ) : (
                    "Waiting for the first verified review."
                  )}
                </p>

                <div className="actions">
                  <Link className="btn" href={`/schools/review?school_id=${school.id}`}>
                    Add review
                  </Link>
                  <a
                    className="btn"
                    href={`/schools/review?intent=claim&entity_type=school&school_id=${school.id}&school_slug=${encodeURIComponent(
                      school.slug ?? ""
                    )}&source_url=${encodeURIComponent("/schools")}`}
                    style={{
                      background: "rgba(255,255,255,0.1)",
                      border: "1px solid rgba(255,255,255,0.4)",
                    }}
                  >
                    Claim this listing
                  </a>
                </div>
              </article>
            );
          })}
        </div>

        {filteredSchools.length === 0 && (
          <div className="schoolsEmpty">
            <p className="empty">No schools match those filters yet.</p>
          </div>
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
