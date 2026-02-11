import Link from "next/link";
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import ReferralCTA from "@/components/ReferralCTA";
import AdSlot from "@/components/AdSlot";
import RefereeReviewList, { WhistleScale } from "@/components/RefereeReviewList";
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
  referee_contact?: string | null;
  tournament_director?: string | null;
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

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.refereeinsights.com").replace(/\/+$/, "");

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

function toWhistleScore(aiScore: number | null) {
  if (!Number.isFinite(aiScore ?? NaN)) return null;
  return Math.max(1, Math.min(5, (aiScore ?? 0) / 20));
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

function buildLocationLabel(city: string | null, state: string | null) {
  const parts = [city, state].filter(Boolean);
  if (!parts.length) return "";
  return `(${parts.join(", ")})`;
}

function buildCanonicalUrl(slug: string) {
  return `${SITE_ORIGIN}/tournaments/${slug}`;
}

function normalizeSportSlug(sport: string) {
  return sport.trim().toLowerCase().replace(/\s+/g, "-");
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  type TournamentMeta = {
    name: string | null;
    city: string | null;
    state: string | null;
    start_date: string | null;
    slug: string | null;
  };
  const { data, error } = await supabaseAdmin
    .from("tournaments" as any)
    .select("name,city,state,start_date,slug")
    .eq("slug", params.slug)
    .maybeSingle<TournamentMeta>();
  if (error || !data) {
    return {
      title: "Tournament listing | RefereeInsights",
      description:
        "Public beta tournament listing. Tournament details sourced from public listings. Referee insights coming soon.",
      alternates: {
        canonical: buildCanonicalUrl(params.slug),
      },
    };
  }
  const year = data.start_date ? new Date(`${data.start_date}T00:00:00`).getFullYear() : null;
  const locationLabel = buildLocationLabel(data.city ?? null, data.state ?? null);
  const titlePrefix = year ? `${year} ` : "";
  const title = `${titlePrefix}${data.name}${locationLabel ? ` ${locationLabel}` : ""} | RefereeInsights`;
  const description = `Public beta listing for ${data.name}${
    locationLabel ? ` ${locationLabel}` : ""
  }. Tournament details sourced from public listings. Referee insights coming soon.`;
  const canonical = buildCanonicalUrl(data.slug ?? params.slug);
  return {
    title,
    description,
    alternates: {
      canonical,
    },
  };
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
      "id,slug,name,city,state,zip,start_date,end_date,summary,source_url,official_website_url,referee_contact,tournament_director,level,venue,address,sport"
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
  const { data: venueLinks } = await supabaseAdmin
    .from("tournament_venues" as any)
    .select("venue_id,venues(id,name,address,city,state,zip)")
    .eq("tournament_id", data.id);
  const linkedVenues = (venueLinks ?? [])
    .map((row: any) => row.venues)
    .filter(Boolean) as Array<{
    id: string;
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  }>;

  const whistleScore = await loadWhistleScore(supabase, relatedTournamentIds);
  const reviewsRaw = await loadPublicReviews(supabase, relatedTournamentIds);
  const reviews = reviewsRaw.map((review) => ({
    ...review,
    sport: data.sport ?? null,
  }));
  const { count: pendingContactsCount } = await supabaseAdmin
    .from("tournament_contacts" as any)
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", data.id)
    .eq("status", "pending");
  const detailPath = `/tournaments/${data.slug ?? params.slug}`;
  const addInsightHref = `/tournaments/list?intent=insight&entity_type=tournament&tournament_slug=${encodeURIComponent(
    data.slug ?? ""
  )}&tournament_id=${encodeURIComponent(data.id)}&source_url=${encodeURIComponent(detailPath)}`;
  const canonicalUrl = buildCanonicalUrl(data.slug ?? params.slug);
  const eventLd: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: data.name,
    url: canonicalUrl,
  };
  const sportSlug = data.sport ? normalizeSportSlug(data.sport) : null;
  if (data.start_date) eventLd.startDate = data.start_date;
  if (data.end_date) eventLd.endDate = data.end_date;
  const hasLocation = data.venue || data.address || data.city || data.state || data.zip;
  if (hasLocation) {
    const address: Record<string, string> = {};
    if (data.address) address.streetAddress = data.address;
    if (data.city) address.addressLocality = data.city;
    if (data.state) address.addressRegion = data.state;
    if (data.zip) address.postalCode = data.zip;
    if (data.state) address.addressCountry = "US";
    eventLd.location = {
      "@type": "Place",
      ...(data.venue ? { name: data.venue } : {}),
      ...(Object.keys(address).length
        ? {
            address: {
              "@type": "PostalAddress",
              ...address,
            },
          }
        : {}),
    };
  }

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventLd) }}
      />
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

          {data.sport && sportSlug ? (
            <p className="detailMeta">
              Browse:{" "}
              <Link href={`/tournaments/hubs/${sportSlug}`}>
                {data.sport} tournaments
              </Link>
              {data.state ? (
                <>
                  {" "}
                  •{" "}
                  <Link href={`/tournaments/hubs/${sportSlug}/${data.state.toLowerCase()}`}>
                    {data.sport} in {data.state}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}

          {(data.venue || data.address) && (
            <p className="detailMeta">
              {data.venue ? `${data.venue}` : ""}
              {data.venue && data.address ? " • " : ""}
              {data.address ? `${data.address}` : ""}
            </p>
          )}
          {linkedVenues.length > 1 && (
            <div className="detailMeta" style={{ marginTop: 6 }}>
              <strong>Venues:</strong>
              <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                {linkedVenues.map((v) => (
                  <li key={v.id} style={{ marginBottom: 4 }}>
                    {[v.name, v.address, v.city, v.state, v.zip]
                      .filter(Boolean)
                      .join(" • ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!data.venue && !data.address && linkedVenues.length === 1 && (
            <p className="detailMeta">
              {[linkedVenues[0].name, linkedVenues[0].address, linkedVenues[0].city, linkedVenues[0].state, linkedVenues[0].zip]
                .filter(Boolean)
                .join(" • ")}
            </p>
          )}

          <div
            style={{
              marginTop: 8,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.08)",
              background: "rgba(255,255,255,0.85)",
              fontSize: 13,
              color: "#0b172a",
              maxWidth: 520,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Tournament contacts</div>
            {user ? (
              <div style={{ display: "grid", gap: 4 }}>
                <div>Director: {data.tournament_director ?? "—"}</div>
                <div>Referee contact: {data.referee_contact ?? "—"}</div>
              </div>
            ) : data.tournament_director || data.referee_contact ? (
              <div>
                Contact info is available for verified users.{" "}
                <Link href="/account/login" style={{ fontWeight: 700 }}>
                  Sign in
                </Link>{" "}
                to view.
              </div>
            ) : (
              <div>
                No verified contact info yet.{" "}
                <Link href="/tournaments/list?intent=contact" style={{ fontWeight: 700 }}>
                  Sign in to add.
                </Link>
              </div>
            )}
            {pendingContactsCount ? (
              <div style={{ marginTop: 6, fontSize: 12, color: "#0f172a" }}>
                Pending review: {pendingContactsCount}
              </div>
            ) : null}
          </div>

          <p className="detailBody">
            {data.summary ||
              "Tournament details sourced from public listings. More referee insights coming soon."}
          </p>

          <p className="detailBody" style={{ marginTop: 10 }}>
            This listing is part of RefereeInsights public beta. We’re building a
            referee-first directory so officials can quickly understand tournament
            logistics and working conditions before accepting assignments. Insights and
            decision signals will appear here as they’re collected and verified over time.
          </p>

          <div
            style={{
              marginTop: 10,
              marginBottom: 14,
              background: "rgba(255,255,255,0.9)",
              border: "1px solid #d9e3f0",
              borderRadius: 14,
              padding: "10px 12px",
              boxShadow: "0 3px 10px rgba(0,0,0,0.18)",
              maxWidth: 900,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4, color: "#0b172a" }}>
              ⏳ Insights still being collected
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.45, color: "#22324a" }}>
              If you’re working this event, you can help by reporting issues or requesting
              verified updates. More signals will appear as the directory fills in.
            </div>
          </div>

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
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                {toWhistleScore(whistleScore?.ai_score ?? null) ? (
                  <>
                    <WhistleScale score={toWhistleScore(whistleScore?.ai_score ?? null) ?? 1} size="large" />
                    <div
                      style={{
                        fontSize: "0.7rem",
                        marginTop: 4,
                        color: "rgba(255,255,255,0.95)",
                        textAlign: "center",
                        textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                        fontWeight: 600,
                      }}
                    >
                      {`${formatWhistleAverage(whistleScore?.ai_score ?? null) ?? "—"} - ${whistleScore?.review_count ?? 0} verified review${(whistleScore?.review_count ?? 0) === 1 ? "" : "s"}`}
                    </div>
                  </>
                ) : null}
              </div>
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
