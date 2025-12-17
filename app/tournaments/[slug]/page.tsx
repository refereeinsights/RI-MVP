import Link from "next/link";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import ReferralCTA from "@/components/ReferralCTA";
import AdSlot from "@/components/AdSlot";
import RefereeWhistleBadge from "@/components/RefereeWhistleBadge";
import RefereeReviewList from "@/components/RefereeReviewList";
import RefereeReviewForm from "@/components/RefereeReviewForm";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { userIsVerifiedReferee } from "@/lib/refereeVerification";
import type { RefereeReviewPublic, RefereeWhistleScore } from "@/lib/types/refereeReview";
import "../tournaments.css";

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
    .select("id,name,city,state,start_date,end_date,summary,source_url,level,venue,address,sport")
    .eq("slug", params.slug)
    .single();

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

  const whistleScore = await loadWhistleScore(supabase, data.id);
  const reviews = await loadPublicReviews(supabase, data.id);

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
    <main className="pitchWrap">
      <section className="field">
        <div className="breadcrumbs">
          <Link href="/tournaments">Tournaments</Link>
          <span>›</span>
          <span>{data.name}</span>
        </div>

        <div className="detailPanel">
          <h1 className="detailTitle">{data.name}</h1>

          <p className="detailMeta">
            <strong>{data.state}</strong>
            {data.city ? ` • ${data.city}` : ""}
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

          <div className="refereeInsights">
            <div className="refereeInsights__header">
              <div>
                <h2>Referee whistle score</h2>
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

            <p className="refereeInsights__summary">
              {whistleScore?.summary ||
                "Referee whistle scores appear once verified officials report back from their assignments."}
              {whistleScore?.status === "needs_moderation" && (
                <strong style={{ marginLeft: "0.4rem", color: "#c62828" }}>
                  This tournament is currently under moderator review.
                </strong>
              )}
            </p>

            <div className="refereeInsights__layout">
              <div className="refereeInsights__column">
                <h3>Recent referee reviews</h3>
                <RefereeReviewList reviews={reviews} />
              </div>
              <div className="refereeInsights__column">
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

          <div className="actions">
            <a className="btn" href={data.source_url} target="_blank" rel="noreferrer">
              Visit official site
            </a>
            <Link className="btn" href="/tournaments">
              Back to tournaments
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

async function loadWhistleScore(supabase: SupabaseClient, id: string) {
  const { data } = await supabase
    .from("tournament_referee_scores")
    .select("tournament_id,ai_score,review_count,summary,status,updated_at")
    .eq("tournament_id", id)
    .maybeSingle();
  return (data ?? null) as RefereeWhistleScore | null;
}

async function loadPublicReviews(supabase: SupabaseClient, id: string) {
  const { data } = await supabase
    .from("tournament_referee_reviews_public")
    .select(
      "id,tournament_id,created_at,reviewer_handle,reviewer_level,worked_games,overall_score,logistics_score,facilities_score,pay_score,support_score,shift_detail"
    )
    .eq("tournament_id", id)
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

const fetchReviewerBadgeCodes = unstable_cache(
  async (handlesInput: string[]) => {
    const handles = Array.from(new Set(handlesInput.filter(Boolean)));
    if (!handles.length) return {} as Record<string, string[]>;

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
  ["reviewer-badge-codes"],
  { revalidate: 60 * 60 * 24 * 7 }
);
