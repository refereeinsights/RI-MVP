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
import { getVenueHref } from "@/lib/venues/getVenueHref";
import { buildTournamentTitle } from "@/lib/seo/buildTitle";
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
  tournament_staff_verified?: boolean | null;
};
type TournamentPrivateDetailRow = {
  referee_pay: string | null;
  referee_contact: string | null;
  referee_contact_email: string | null;
  referee_contact_phone: string | null;
  tournament_director: string | null;
  tournament_director_email: string | null;
  tournament_director_phone: string | null;
  ref_cash_tournament: boolean | null;
};
type EngagementRow = {
  tournament_id: string;
  clicks_7d: number | null;
  clicks_30d: number | null;
  clicks_90d: number | null;
  unique_users_30d: number | null;
};

type OwlsEyeRunRow = {
  id: string;
  run_id?: string | null;
  venue_id: string;
  status: string | null;
  updated_at?: string | null;
  created_at?: string | null;
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
  if (normalized === "lacrosse") return <img className="sportSvgIcon" src="/brand/lacrosse_icon.svg" alt="" />;
  if (normalized === "hockey") return <img className="sportSvgIcon" src="/svg/sports/hockey_puck_icon.svg" alt="" />;
  switch (normalized) {
    case "soccer":
      return "⚽";
    case "football":
      return "🏈";
    case "baseball":
      return "⚾";
    case "softball":
      return "🥎";
    case "basketball":
      return "🏀";
    default:
      return "🏅";
  }
}

function detailPanelVariant(sport: string | null) {
  return `detailPanel ${getSportCardClass(sport)}`;
}

function detailHeroVariant(sport: string | null) {
  return `detailHero ${getSportCardClass(sport)}`;
}

function formatWhistleAverage(score: number | null) {
  if (score === null || Number.isNaN(score)) return null;
  const whistles = Math.round((score / 20) * 10) / 10; // convert percentage to 1-5 scale
  if (!Number.isFinite(whistles)) return null;
  return whistles % 1 === 0 ? whistles.toFixed(0) : whistles.toFixed(1);
}

function formatCategoryAverage(score: number | null) {
  if (score === null || Number.isNaN(score)) return null;
  return score % 1 === 0 ? score.toFixed(0) : score.toFixed(1);
}

function average(values: number[]) {
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 10) / 10;
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

async function fetchLatestOwlsEyeRuns(venueIds: string[]) {
  if (!venueIds.length) return [] as OwlsEyeRunRow[];

  const primary = await supabaseAdmin
    .from("owls_eye_runs" as any)
    .select("id,run_id,venue_id,status,updated_at,created_at")
    .in("venue_id", venueIds)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  const primaryErrCode = (primary as any)?.error?.code;
  if (!primary.error) {
    return (primary.data as OwlsEyeRunRow[] | null) ?? [];
  }

  if (primaryErrCode === "42703" || primaryErrCode === "PGRST204") {
    const fallback = await supabaseAdmin
      .from("owls_eye_runs" as any)
      .select("id,run_id,venue_id,status,created_at")
      .in("venue_id", venueIds)
      .order("created_at", { ascending: false });
    return (fallback.data as OwlsEyeRunRow[] | null) ?? [];
  }

  return [];
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
    sport: string | null;
  };
  const { data, error } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("name,city,state,start_date,slug")
    .eq("slug", params.slug)
    .maybeSingle<TournamentMeta>();
  if (error || !data) {
    return {
      title: "Tournament listing | TournamentInsights",
      description:
        "Public beta tournament listing. Tournament details sourced from public listings. Referee insights coming soon.",
      alternates: {
        canonical: buildCanonicalUrl(params.slug),
      },
    };
  }
  const title = buildTournamentTitle(
    data.name ?? "Tournament",
    data.city ?? null,
    data.state ?? null,
    (data.sport ?? "").trim() || "Tournament"
  );
  const description = `Public listing for ${data.name ?? "tournament"}${buildLocationLabel(data.city ?? null, data.state ?? null)}.`;
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

  const { data, error } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select(
      "id,slug,name,city,state,zip,start_date,end_date,summary,source_url,official_website_url,referee_contact,tournament_director,level,venue,address,sport,tournament_staff_verified"
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

  const seriesMap = await loadSeriesTournamentIds(supabaseAdmin, [{ id: data.id, slug: data.slug }]);
  const seriesEntry = seriesMap.get(data.id);
  const relatedTournamentIds = seriesEntry?.tournamentIds ?? [data.id];

  const listingUrl = buildCanonicalUrl(data.slug ?? params.slug);
  const officialUrl = data.official_website_url || data.source_url || "";
  const inviteMailtoHref =
    `mailto:?subject=${encodeURIComponent(`RefereeInsights: ${data.name}`)}` +
    `&body=${encodeURIComponent(
      `Tournament listing:\\n${listingUrl}` +
        (officialUrl ? `\\n\\nOfficial site:\\n${officialUrl}` : "") +
        `\\n\\nShare a referee report after working this tournament so crews can decide before accepting games.`
    )}`;
  const { data: venueLinks } = await supabaseAdmin
    .from("tournament_venues" as any)
    .select("venue_id,venues(id,seo_slug,name,address,city,state,zip)")
    .eq("tournament_id", data.id);
  const linkedVenues = (venueLinks ?? [])
    .map((row: any) => row.venues)
    .filter(Boolean) as Array<{
    id: string;
    seo_slug?: string | null;
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  }>;
  const linkedVenueIds = linkedVenues.map((venue) => venue.id).filter(Boolean);
  const runRows = await fetchLatestOwlsEyeRuns(linkedVenueIds);
  const latestRunByVenue = new Map<string, OwlsEyeRunRow>();
  for (const row of runRows) {
    if (!row?.venue_id) continue;
    if (latestRunByVenue.has(row.venue_id)) continue;
    latestRunByVenue.set(row.venue_id, row);
  }
  const runIds = Array.from(latestRunByVenue.values())
    .map((row) => row.run_id ?? row.id)
    .filter((value): value is string => Boolean(value));
  let hasOwlsEyeByVenueId = new Map<string, boolean>();
  if (runIds.length) {
    const { data: nearbyRows } = await supabaseAdmin
      .from("owls_eye_nearby_food" as any)
      .select("run_id,category")
      .in("run_id", runIds);

    const countsByRunId = new Map<string, { food: number; coffee: number; hotels: number; sporting_goods: number }>();
    for (const row of ((nearbyRows as Array<{ run_id: string; category: string | null }> | null) ?? [])) {
      const runId = row.run_id;
      if (!runId) continue;
      const normalizedCategory = (row.category ?? "food").toLowerCase();
      const current = countsByRunId.get(runId) ?? { food: 0, coffee: 0, hotels: 0, sporting_goods: 0 };
      if (normalizedCategory === "coffee") current.coffee += 1;
      else if (normalizedCategory === "hotel" || normalizedCategory === "hotels") current.hotels += 1;
      else if (normalizedCategory === "sporting_goods" || normalizedCategory === "big_box_fallback") current.sporting_goods += 1;
      else current.food += 1;
      countsByRunId.set(runId, current);
    }

    hasOwlsEyeByVenueId = new Map(
      Array.from(latestRunByVenue.entries()).map(([venueId, run]) => {
        const runId = (run.run_id ?? run.id) as string;
        const counts = countsByRunId.get(runId) ?? { food: 0, coffee: 0, hotels: 0, sporting_goods: 0 };
        return [venueId, counts.food + counts.coffee + counts.hotels + counts.sporting_goods > 0];
      })
    );
  }

  const whistleScore = await loadWhistleScore(supabaseAdmin, relatedTournamentIds);
  const reviewsRaw = await loadPublicReviews(supabaseAdmin, relatedTournamentIds);
  const reviews = reviewsRaw.map((review) => ({
    ...review,
    sport: data.sport ?? null,
  }));
  const categoryAverages = {
    logistics: average(reviews.map((r) => r.logistics_score).filter((v) => Number.isFinite(v))),
    facilities: average(reviews.map((r) => r.facilities_score).filter((v) => Number.isFinite(v))),
    pay: average(reviews.map((r) => r.pay_score).filter((v) => Number.isFinite(v))),
    support: average(reviews.map((r) => r.support_score).filter((v) => Number.isFinite(v))),
  };
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
  let privateDetails: TournamentPrivateDetailRow | null = null;

  if (user) {
    const { data: privateData } = await supabaseAdmin
      .from("tournaments" as any)
      .select(
        "referee_pay,referee_contact,referee_contact_email,referee_contact_phone,tournament_director,tournament_director_email,tournament_director_phone,ref_cash_tournament"
      )
      .eq("id", data.id)
      .maybeSingle<TournamentPrivateDetailRow>();
    privateDetails = privateData ?? null;

    const isVerified = await userIsVerifiedReferee(supabase, user.id);
    if (isVerified) {
      canSubmitReview = true;
      disabledMessage = null;
    } else {
      disabledMessage = "Only verified referees can submit reviews.";
    }
  }

  const privateDetailRows: Array<{ label: string; value: string }> = [];
  const pushDetailRow = (label: string, raw: string | null | undefined) => {
    const value = (raw ?? "").trim();
    if (!value) return;
    privateDetailRows.push({ label, value });
  };
  pushDetailRow("Director", privateDetails?.tournament_director ?? data.tournament_director ?? null);
  pushDetailRow("Director email", privateDetails?.tournament_director_email ?? null);
  pushDetailRow("Director phone", privateDetails?.tournament_director_phone ?? null);
  pushDetailRow("Referee contact", privateDetails?.referee_contact ?? data.referee_contact ?? null);
  pushDetailRow("Referee contact email", privateDetails?.referee_contact_email ?? null);
  pushDetailRow("Referee contact phone", privateDetails?.referee_contact_phone ?? null);
  pushDetailRow("Referee pay", privateDetails?.referee_pay ?? null);
  if (privateDetails?.ref_cash_tournament === true) {
    privateDetailRows.push({ label: "Cash tournament", value: "Yes" });
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

        <div className={detailHeroVariant(data.sport)}>
          {data.tournament_staff_verified ? (
            <div className="detailBadgeRail" aria-label="Tournament badges">
              <img
                className="detailBadgeIcon detailBadgeIcon--verified"
                src="/svg/ri/tournament_staff_verified.svg"
                alt="Tournament staff verified"
              />
            </div>
          ) : null}

          <div className="detailHero__overlay">
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

            <div className="detailLinksRow">
              {(data.official_website_url || data.source_url) ? (
                <a className="secondaryLink" href={`/go/tournament/${data.id}`} target="_blank" rel="noopener noreferrer">
                  Visit official site
                </a>
              ) : null}
              <Link className="secondaryLink" href="/tournaments">
                Back to tournaments
              </Link>
              <Link className="secondaryLink" href={addInsightHref}>
                Add referee insight
              </Link>
            </div>
          </div>
        </div>

        <div className={`detailContent ${getSportCardClass(data.sport)}`}>
          {linkedVenues.length > 0 ? (
            <section className="detailCard detailCard--wide" aria-label="Venues">
              <h2 className="detailSectionTitle">Venues</h2>
              <div className="detailVenueGrid">
                {linkedVenues.map((venue) => (
                  <Link
                    key={venue.id}
                    href={getVenueHref(venue)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`detailVenueTile ${hasOwlsEyeByVenueId.get(venue.id) ? "detailVenueTile--withOwl" : ""}`}
                  >
                    <span className="detailVenueTile__eyebrow">Venue</span>
                    <span className="detailVenueTile__name">{venue.name || "Venue TBA"}</span>
                    {hasOwlsEyeByVenueId.get(venue.id) ? (
                      <span className="detailVenueTile__flag">Owl&apos;s Eye™</span>
                    ) : (
                      <span className="detailVenueTile__flag">Open details</span>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="detailCard detailContacts" aria-label="Tournament contacts">
            <h2 className="detailSectionTitle">Tournament contacts</h2>
            {user ? (
              privateDetailRows.length ? (
                <div className="detailContacts__rows">
                  {privateDetailRows.map((row) => (
                    <div key={row.label} className="detailContacts__row">
                      <span className="detailContacts__label">{row.label}:</span>{" "}
                      <span className="detailContacts__value">{row.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="detailContacts__muted">No verified contact info yet.</div>
              )
            ) : data.tournament_director || data.referee_contact ? (
              <div className="detailContacts__muted">
                Contact info is available for verified users.{" "}
                <Link href="/account/login" className="detailInlineLink">
                  Sign in
                </Link>{" "}
                to view.
              </div>
            ) : (
              <div className="detailContacts__muted">
                No verified contact info yet.{" "}
                <Link href="/tournaments/list?intent=contact" className="detailInlineLink">
                  Sign in to add.
                </Link>
              </div>
            )}
            {pendingContactsCount ? (
              <div className="detailContacts__pending">Pending review: {pendingContactsCount}</div>
            ) : null}
          </section>

          <section className="detailCard" aria-label="About this tournament">
            <h2 className="detailSectionTitle">About</h2>
            <p className="detailSummary">
              {data.summary ||
                "Tournament details sourced from public listings. More referee insights coming soon."}
            </p>

            <p className="detailBody">
              This listing is part of RefereeInsights public beta. We’re building a
              referee-first directory so officials can quickly understand tournament
              logistics and working conditions before accepting assignments. Insights and
              decision signals will appear here as they’re collected and verified over time.
            </p>

            <DecisionSignals />

            <div className="detailActionGrid" aria-label="Help the crew">
              <details className="detailDisclosure">
                <summary className="detailDisclosure__summary">
                  Invite another referee
                  <span className="detailDisclosure__chev" aria-hidden="true" />
                </summary>
                <div className="detailDisclosure__panel">
                  Send this listing to a referee so they can add insight after working the tournament.
                  <div className="detailDisclosure__actions">
                    <a className="detailActionBtn" href={inviteMailtoHref}>
                      Email invite
                    </a>
                    <a className="detailActionBtn detailActionBtn--ghost" href={listingUrl} target="_blank" rel="noopener noreferrer">
                      Open listing
                    </a>
                  </div>
                </div>
              </details>
            </div>
          </section>

          <div className="refereeInsights detailCard detailCard--wide">
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

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.55)",
                  background: "rgba(15,23,42,0.42)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#ffffff",
                  textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                }}
              >
                Reviews: {whistleScore?.review_count ?? 0}
              </span>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.55)",
                  background: "rgba(15,23,42,0.42)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#ffffff",
                  textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                }}
              >
                Logistics: {formatCategoryAverage(categoryAverages.logistics) ?? "—"}
              </span>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.55)",
                  background: "rgba(15,23,42,0.42)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#ffffff",
                  textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                }}
              >
                Facilities: {formatCategoryAverage(categoryAverages.facilities) ?? "—"}
              </span>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.55)",
                  background: "rgba(15,23,42,0.42)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#ffffff",
                  textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                }}
              >
                Pay: {formatCategoryAverage(categoryAverages.pay) ?? "—"}
              </span>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.55)",
                  background: "rgba(15,23,42,0.42)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#ffffff",
                  textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                }}
              >
                Support: {formatCategoryAverage(categoryAverages.support) ?? "—"}
              </span>
            </div>

            <div className="refereeInsights__layout">
              <div className="refereeInsights__column">
                <h3 style={{ color: "#ffffff", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>Recent referee reviews</h3>
                {user ? (
                  <RefereeReviewList reviews={reviews} showReviewerHandle={false} />
                ) : (
                  <div className="refereeInsights__signInGate">
                    Recent review details are available to signed-in users.{" "}
                    <Link href="/account/login" style={{ fontWeight: 700 }}>
                      Sign in
                    </Link>{" "}
                    to view.
                  </div>
                )}
              </div>
            </div>

            <details className="reviewDisclosure" id="share-experience">
              <summary className="reviewDisclosure__summary">
                Share your experience
                <span className="reviewDisclosure__chev" aria-hidden="true" />
              </summary>
              <div className="reviewDisclosure__panel">
                <div className="reviewDisclosure__hint">
                  <strong>Don’t see your tournament?</strong> Add it first so refs can submit insight:{" "}
                  <a href="/tournaments/list?intent=insight">add a tournament</a>.
                </div>
                <RefereeReviewForm
                  tournamentId={data.id}
                  tournamentName={data.name}
                  canSubmit={canSubmitReview}
                  disabledMessage={disabledMessage}
                />
              </div>
            </details>
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
