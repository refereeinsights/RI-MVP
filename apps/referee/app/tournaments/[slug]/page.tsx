import Link from "next/link";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import ReferralCTA from "@/components/ReferralCTA";
import AdSlot from "@/components/AdSlot";
import RefereeWhistleBadge from "@/components/RefereeWhistleBadge";
import RefereeReviewList from "@/components/RefereeReviewList";
import RefereeReviewForm from "@/components/RefereeReviewForm";
import DecisionSignals from "@/components/DecisionSignals";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { userIsVerifiedReferee } from "@/lib/refereeVerification";
import { aggregateWhistleScoreRows, loadSeriesTournamentIds } from "@/lib/tournamentSeries";
import type { RawWhistleScoreRow } from "@/lib/tournamentSeries";
import type { RefereeReviewPublic, RefereeWhistleScore } from "@/lib/types/refereeReview";
import { getSportCardClass } from "@/lib/ui/sportBackground";
import { FEATURE_TOURNAMENT_ENGAGEMENT_BADGES } from "@/lib/featureFlags";
import "../tournaments.css";

type TournamentDetailRow = {
  id: string;
  slug: string | null;
  name: string;
  city: string | null;
  state: string | null;
  zip?: string | null;
  start_date: string | null;
  end_date: string | null;
  summary: string | null;
  source_url: string | null;
  official_website_url?: string | null;
  level: string | null;
  venue: string | null;
  address: string | null;
  sport: string | null;
};
type EngagementRow = {
  tournament_id: string;
  clicks_7d: number | null;
  clicks_30d: number | null;
  clicks_90d: number | null;
  unique_users_30d: number | null;
};

// Revalidate tournament detail pages every 5 minutes.
export const revalidate = 300;

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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

function detailPanelVariant(sport: string | null) {
  return `detailPanel ${getSportCardClass(sport)}`;
}

function formatWhistleAverage(score: number | null) {
  if (score === null || Number.isNaN(score)) return null;
  const whistles = Math.round((score / 20) * 10) / 10; // convert percentage to 1-5 scale
  if (!Number.isFinite(whistles)) return null;
  return whistles % 1 === 0 ? whistles.toFixed(0) : whistles.toFixed(1);
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

export default async function TournamentDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("tournaments")
    .select(
      "id,slug,name,city,state,zip,start_date,end_date,summary,source_url,official_website_url,level,venue,address,sport"
    )
    .eq("slug", params.slug)
    .single<TournamentDetailRow>();

  if (error || !data) {
    return (
      <main className="pitchWrap">
        <section className="field">
          <div className="headerBlock">
            <h1 className="title">Tournament not found</h1>
            <p className="subtitle">This tournament may have been removed or the link is incorrect.</p>
            <div style={{ marginTop: "1rem" }}>
              <Link className="btn" href="/tournaments">Back to tournaments</Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const seriesMap = await loadSeriesTournamentIds(supabase, [{ id: data.id, slug: data.slug }]);
  const seriesEntry = seriesMap.get(data.id);
  const relatedTournamentIds = seriesEntry?.tournamentIds ?? [data.id];

  const whistleScore = await loadWhistleScore(supabase, relatedTournamentIds);
  const reviews = await loadPublicReviews(supabase, relatedTournamentIds);
  const detailPath = `/tournaments/${data.slug ?? params.slug}`;
  const addInsightHref = `/tournaments/list?intent=insight&entity_type=tournament&tournament_slug=${encodeURIComponent(
    data.slug ?? ""
  )}&tournament_id=${encodeURIComponent(data.id)}&source_url=${encodeURIComponent(detailPath)}`;

  let engagementRow: EngagementRow | null = null;
  if (FEATURE_TOURNAMENT_ENGAGEMENT_BADGES) {
    const { data: engagementData } = await supabaseAdmin
      .from("tournament_engagement_rolling" as any)
      .select("tournament_id,clicks_7d,clicks_30d,clicks_90d,unique_users_30d")
      .eq("tournament_id", data.id)
      .maybeSingle<EngagementRow>();
    engagementRow = engagementData ?? null;
  }

  let canSubmitReview = false;
  let disabledMessage: string | null = "Sign in to submit a referee review.";

  if (user) {
    const isVerified = await userIsVerifiedReferee(supabase, user.id);
    if (isVerified) {
      canSubmitReview = true;
      disabledMessage = null;
    } else {
      disabledMessage = "Only verified referees can submit reviews.";
    }
  }

  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField detailField">
        <div className="breadcrumbs">
          <Link href="/tournaments">Tournaments</Link>
          <span>›</span>
          <span>{data.name}</span>
        </div>

        <div className={detailPanelVariant(data.sport)}>
          <h1 className="detailTitle">{data.name}</h1>

          <p className="detailMeta">
            <strong>{data.state}</strong>
            {data.city ? ` • ${data.city}` : ""}
            {data.zip ? ` • ${data.zip}` : ""}
            {data.level ? ` • ${data.level}` : ""}
          </p>

          <p className="detailMeta">
            {formatDate(data.start_date)}
            {data.end_date && data.end_date !== data.start_date ? ` – ${formatDate(data.end_date)}` : ""}
          </p>

          {(data.venue || data.address) && (
            <p className="detailMeta">
              {data.venue ? `${data.venue}` : ""}
              {data.venue && data.address ? " • " : ""}
              {data.address ? `${data.address}` : ""}
            </p>
          )}

          <p className="detailBody">
            {data.summary ||
              "Tournament details sourced from public listings. More referee insights coming soon."}
          </p>

          <div
            style={{
              display: "inline-flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 14,
              background: "rgba(255,255,255,0.9)",
              border: "1px solid #d9e3f0",
              borderRadius: 14,
              padding: "10px 12px",
              boxShadow: "0 3px 10px rgba(0,0,0,0.18)",
            }}
          >
            <a
              href={`/feedback?type=tournament&name=${encodeURIComponent(
                data.name
              )}&url=${encodeURIComponent(`/tournaments/${data.slug ?? params.slug}`)}`}
              style={{
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 13,
                padding: "10px 16px",
                borderRadius: 999,
                border: "1px solid #d9e3f0",
                background: "#ffffff",
                color: "#0b172a",
                minHeight: 42,
                boxShadow: "0 2px 6px rgba(0,0,0,0.14)",
              }}
            >
              Report an Issue
            </a>
            <a
              href={`/tournaments/list?intent=claim&entity_type=tournament&tournament_slug=${encodeURIComponent(
                data.slug ?? ""
              )}&tournament_id=${encodeURIComponent(data.id)}&source_url=${encodeURIComponent(
                `/tournaments/${data.slug ?? params.slug}`
              )}`}
              style={{
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 13,
                padding: "10px 16px",
                borderRadius: 999,
                border: "1px solid #d9e3f0",
                background: "#ffffff",
                color: "#0b172a",
                minHeight: 42,
                boxShadow: "0 2px 6px rgba(0,0,0,0.14)",
              }}
            >
              Claim this listing
            </a>
            <span style={{ fontSize: 12, color: "#0b172a", fontWeight: 700 }}>
              Request verified contact info and updates.
            </span>
          </div>

          <DecisionSignals />

          <div
            style={{
              marginTop: 8,
              marginBottom: 16,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <a
              href={addInsightHref}
              style={{
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 13,
                padding: "10px 16px",
                borderRadius: 999,
                border: "1px solid #d9e3f0",
                background: "#ffffff",
                color: "#0b172a",
                boxShadow: "0 2px 6px rgba(0,0,0,0.14)",
              }}
            >
              Add referee insight
            </a>
            <span style={{ fontSize: 12, color: "#ffffff", fontWeight: 700, textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>
              Help other officials decide before accepting.
            </span>
          </div>

          <div className="refereeInsights">
            <div className="refereeInsights__header">
              <div>
                <h2 style={{ color: "#ffffff", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>Referee Score Card</h2>
                <p className="refereeInsights__subhead">
                  AI-generated confidence from verified referee submissions.
                </p>
              </div>
              <RefereeWhistleBadge
                score={whistleScore?.ai_score ?? null}
                reviewCount={whistleScore?.review_count ?? 0}
                status={whistleScore?.status}
                summary={whistleScore?.summary ?? undefined}
                size="large"
                showLabel
              />
            </div>

            {(() => {
              const averageWhistle =
                whistleScore?.ai_score != null ? formatWhistleAverage(whistleScore.ai_score) : null;
              const reviewCount = whistleScore?.review_count ?? 0;
              const averageText =
                averageWhistle && reviewCount > 0
                  ? `Refs rate this ${averageWhistle} whistle${averageWhistle === "1" ? "" : "s"} across ${reviewCount} review${
                      reviewCount === 1 ? "" : "s"
                    }.`
                  : null;

              const summaryText =
                averageText ||
                whistleScore?.summary ||
                "Referee whistle scores appear once verified officials report back from their assignments.";

              return (
                <p className="refereeInsights__summary">
                  {summaryText}
                  {whistleScore?.status === "needs_moderation" && (
                    <strong style={{ marginLeft: "0.4rem", color: "#c62828" }}>
                      This tournament is currently under moderator review.
                    </strong>
                  )}
                </p>
              );
            })()}

            <div className="refereeInsights__layout">
              <div className="refereeInsights__column">
                <h3 style={{ color: "#ffffff", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>Recent referee reviews</h3>
                <RefereeReviewList reviews={reviews} showReviewerHandle={false} />
              </div>
              <div className="refereeInsights__column">
                <div
                  style={{
                    marginBottom: 12,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.08)",
                    background: "rgba(0,0,0,0.02)",
                    fontSize: 13,
                    color: "#ffffff",
                    lineHeight: 1.5,
                  }}
                >
                  <strong style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#ffffff" }}>
                    Don’t see your tournament?
                  </strong>
                  Add it first so refs can submit insight:{" "}
                  <a
                    href="/tournaments/list?intent=insight"
                    style={{ color: "#0f5132", fontWeight: 700, textDecoration: "underline" }}
                  >
                    add a tournament
                  </a>.
                </div>
                <RefereeReviewForm
                  tournamentId={data.id}
                  tournamentName={data.name}
                  canSubmit={canSubmitReview}
                  disabledMessage={disabledMessage}
                />
              </div>
            </div>
          </div>

          <div className="sportIcon" aria-label={data.sport ?? "tournament sport"} style={{ marginTop: "1rem" }}>
            {sportIcon(data.sport)}
          </div>

          <div style={{ marginTop: "1.5rem" }}>
            <ReferralCTA placement="tournament_referral" />
          </div>

          <div style={{ marginTop: "1rem", display: "flex", justifyContent: "center" }}>
            <AdSlot placement="tournament_detail_mid" />
          </div>

          {FEATURE_TOURNAMENT_ENGAGEMENT_BADGES ? (() => {
            const signals = getEngagementSignals(engagementRow ?? undefined);
            return signals.length ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {signals.map((label) => (
                  <span
                    key={label}
                    title="Based on recent outbound link clicks from RefereeInsights users."
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.4)",
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
            {(data.official_website_url || data.source_url) ? (
              <a className="btn" href={`/go/tournament/${data.id}`} target="_blank" rel="noopener noreferrer">
                Visit official site
              </a>
            ) : null}
            <Link className="btn" href="/tournaments">
              Back to tournaments
            </Link>
          </div>

          {!data.official_website_url ? (
            <div style={{ marginTop: 16, padding: 12, borderRadius: 10, border: "1px solid #d7d7d7", background: "#fff" }}>
              <strong style={{ display: "block", marginBottom: 6 }}>Know the official website?</strong>
              <form action="/api/tournaments/url-suggestions" method="post" style={{ display: "grid", gap: 8 }}>
                <input type="hidden" name="tournament_id" value={data.id} />
                <input
                  name="suggested_url"
                  required
                  placeholder="https://example.com/tournament"
                  style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc" }}
                />
                <input
                  name="submitter_email"
                  type="email"
                  placeholder="Your email (optional)"
                  style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc" }}
                />
                <button type="submit" className="btn" style={{ width: "fit-content" }}>
                  Submit URL
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

async function loadWhistleScore(
  supabase: SupabaseClient,
  ids: string[]
): Promise<RefereeWhistleScore> {
  const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
  const anchorId = uniqueIds[0] ?? "";
  if (!uniqueIds.length) {
    return {
      tournament_id: anchorId,
      ai_score: null,
      review_count: 0,
      summary: null,
      status: "clear",
      updated_at: null,
    };
  }

  const { data } = await supabase
    .from("tournament_referee_scores")
    .select("tournament_id,ai_score,review_count,summary,status,updated_at")
    .in("tournament_id", uniqueIds);

  const aggregated = aggregateWhistleScoreRows((data ?? []) as RawWhistleScoreRow[]);
  return {
    tournament_id: anchorId,
    ai_score: aggregated.ai_score,
    review_count: aggregated.review_count ?? 0,
    summary: aggregated.summary,
    status: aggregated.status,
    updated_at: null,
  };
}

async function loadPublicReviews(
  supabase: SupabaseClient,
  ids: string[]
): Promise<RefereeReviewPublic[]> {
  const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
  if (!uniqueIds.length) return [];

  const { data } = await supabase
    .from("tournament_referee_reviews_public")
    .select(
      "id,tournament_id,created_at,reviewer_handle,reviewer_level,worked_games,overall_score,logistics_score,facilities_score,pay_score,support_score,shift_detail,is_demo,pinned_rank"
    )
    .in("tournament_id", uniqueIds)
    .order("is_demo", { ascending: false })
    .order("pinned_rank", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(10);

  const reviews = (data ?? []) as RefereeReviewPublic[];
  const handles = Array.from(new Set(reviews.map((r) => r.reviewer_handle).filter(Boolean)));
  if (!handles.length) return reviews;

  const badgeMap = await fetchReviewerBadgeCodes(handles);
  return reviews.map((review) => ({
    ...review,
    reviewer_badges: badgeMap[review.reviewer_handle] ?? [],
  }));
}

async function fetchReviewerBadgeCodes(handlesInput: string[]) {
  const handles = Array.from(new Set(handlesInput.filter(Boolean)));
  if (!handles.length) return {} as Record<string, string[]>;

  const load = unstable_cache(
    async () => {
      const { data: profileRows, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("user_id,handle")
        .in("handle", handles);

      if (profileError) {
        console.error("Failed to load reviewer profiles for badges", profileError);
        return {};
      }

      const handleToUser = new Map<string, string>();
      (profileRows ?? []).forEach((row: any) => {
        if (row?.handle && row?.user_id) {
          handleToUser.set(row.handle, row.user_id);
        }
      });

      const userIds = Array.from(new Set(Array.from(handleToUser.values()).filter(Boolean)));
      if (!userIds.length) return {};

      const { data: badgeRows, error: badgeError } = await supabaseAdmin
        .from("user_badges")
        .select("user_id,badges(code)")
        .in("user_id", userIds);

      if (badgeError) {
        console.error("Failed to load reviewer badges", badgeError);
        return {};
      }

      const userBadgeMap = new Map<string, string[]>();
      (badgeRows ?? []).forEach((row: any) => {
        if (!row?.user_id) return;
        const existing = userBadgeMap.get(row.user_id) ?? [];
        const codes: string[] = Array.isArray(row.badges)
          ? row.badges.map((b: any) => b?.code).filter(Boolean)
          : row.badges?.code
          ? [row.badges.code]
          : [];
        userBadgeMap.set(row.user_id, Array.from(new Set([...existing, ...codes])));
      });

      const result: Record<string, string[]> = {};
      for (const [handle, userId] of handleToUser.entries()) {
        result[handle] = userId ? userBadgeMap.get(userId) ?? [] : [];
      }

      return result;
    },
    ["reviewer-badge-codes", ...handles.sort()],
    { revalidate: 60 * 60 * 24 * 7 }
  );

  return load();
}
