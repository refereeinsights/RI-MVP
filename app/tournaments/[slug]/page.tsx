import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import ReferralCTA from "@/components/ReferralCTA";
import AdSlot from "@/components/AdSlot";
import RefereeWhistleBadge from "@/components/RefereeWhistleBadge";
import RefereeReviewList from "@/components/RefereeReviewList";
import RefereeReviewForm from "@/components/RefereeReviewForm";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
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
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_referee_verified")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.is_referee_verified) {
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

  return (data ?? []) as RefereeReviewPublic[];
}
