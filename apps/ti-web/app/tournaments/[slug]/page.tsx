import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { BRAND_OWL } from "@/lib/brand";
import { canAccessWeekendPro, getTier } from "@/lib/entitlements";
import { isTournamentSaved } from "@/lib/savedTournaments";
import { buildTITournamentTitle, assertNoDoubleBrand } from "@/lib/seo/buildTITitle";
import PremiumInterestForm from "@/components/PremiumInterestForm";
import SaveTournamentButton from "@/components/SaveTournamentButton";
import QuickVenueCheck from "@/components/venues/QuickVenueCheck";
import ClaimThisTournament from "@/components/tournaments/ClaimThisTournament";
import { canEditTournament } from "@/lib/tournamentClaim";
import { saveClaimedTournamentEdits } from "./actions";
import { formatEntityList, type SemanticListItem, type SemanticListPart } from "../../../../../shared/semantic/formatEntityList";
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
  sport: string | null;
  level: string | null;
  tournament_staff_verified?: boolean | null;
  tournament_director?: string | null;
  tournament_director_email?: string | null;
  referee_contact?: string | null;
  referee_contact_email?: string | null;
  venue: string | null;
  address: string | null;
  venue_url?: string | null;
  tournament_venues?: {
    venues?: {
      id: string;
      name: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      latitude: number | null;
      longitude: number | null;
      venue_url: string | null;
      restroom_cleanliness_avg: number | null;
      shade_score_avg: number | null;
      vendor_score_avg: number | null;
      parking_convenience_score_avg: number | null;
      review_count: number | null;
      reviews_last_updated_at: string | null;
    } | null;
  }[] | null;
};

type OwlsEyeRunRow = {
  id: string;
  run_id?: string | null;
  venue_id: string;
  status: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type LinkedVenue = {
  id: string;
  seo_slug?: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  venue_url: string | null;
  restroom_cleanliness_avg: number | null;
  shade_score_avg: number | null;
  vendor_score_avg: number | null;
  parking_convenience_score_avg: number | null;
  review_count: number | null;
  reviews_last_updated_at: string | null;
};

type TournamentPartnerRow = {
  id: string;
  venue_id: string | null;
  category: string | null;
  name: string | null;
  address: string | null;
  maps_url: string | null;
  sponsor_click_url: string | null;
  sort_order: number | null;
};

export const revalidate = 3600;

const SITE_ORIGIN = "https://www.tournamentinsights.com";
const DEMO_TOURNAMENT_SLUG = "refereeinsights-demo-tournament";

function renderSemanticParts(parts: SemanticListPart[]) {
  return parts.map((part, idx) => {
    if (part.type === "text") return <span key={`t-${idx}`}>{part.value}</span>;
    return (
      <Link key={`l-${idx}`} href={part.href} style={{ textDecoration: "underline" }}>
        {part.label}
      </Link>
    );
  });
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function buildLocationLabel(city: string | null, state: string | null) {
  const parts = [city, state].filter(Boolean);
  if (!parts.length) return "";
  return parts.join(", ");
}

function buildMapLinks(query: string) {
  const encoded = encodeURIComponent(query);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    apple: `https://maps.apple.com/?q=${encoded}`,
    waze: `https://waze.com/ul?q=${encoded}&navigate=yes`,
  };
}

function buildCanonicalUrl(slug: string) {
  return `${SITE_ORIGIN}/tournaments/${slug}`;
}

function formatPartnerCategory(value: string | null) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return "Partner";
  return normalized
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function cardVariant(sport: string | null) {
  const normalized = (sport ?? "").toLowerCase();
  if (normalized === "basketball") return "card-basketball";
  return "card-grass";
}

function getSportCardClass(sport: string | null) {
  const normalized = (sport ?? "").toLowerCase();
  const map: Record<string, string> = {
    soccer: "bg-sport-soccer",
    lacrosse: "bg-sport-lacrosse",
    volleyball: "bg-sport-volleyball",
    basketball: "bg-sport-basketball",
    hockey: "bg-sport-hockey",
    football: "bg-sport-football",
    baseball: "bg-sport-baseball",
    softball: "bg-sport-softball",
  };
  return map[normalized] ?? "bg-sport-default";
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

  // Backward compatibility for environments where updated_at is missing.
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

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  type TournamentMeta = {
    name: string | null;
    city: string | null;
    state: string | null;
    start_date: string | null;
    end_date: string | null;
    sport: string | null;
    slug: string | null;
  };
  const { data } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("name,city,state,start_date,end_date,sport,slug")
    .eq("slug", params.slug)
    .maybeSingle<TournamentMeta>();

  if (!data) {
    return {
      title: "Tournament Not Found",
      description: "We could not find that tournament listing.",
      robots: { index: false, follow: false },
    };
  }

  const locationLabel = buildLocationLabel(data.city ?? null, data.state ?? null);
  const title = buildTITournamentTitle(data.name ?? "Tournament", data.city, data.state, data.sport ?? undefined);
  assertNoDoubleBrand(title);
  const description = `Dates and location for ${data.name}${locationLabel ? ` in ${locationLabel}` : ""}. View official site and event details.`;
  const canonicalPath = `/tournaments/${data.slug ?? params.slug}`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description,
      type: "website",
      url: buildCanonicalUrl(data.slug ?? params.slug),
      siteName: "TournamentInsights",
      images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-default.png"],
    },
  };
}

export default async function TournamentDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { claim?: string; saved?: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: entitlementProfile } = user
    ? await supabase
        .from("ti_users" as any)
        .select("plan,subscription_status,current_period_end,trial_ends_at")
        .eq("id", user.id)
        .maybeSingle<{
          plan: string | null;
          subscription_status: string | null;
          current_period_end: string | null;
          trial_ends_at: string | null;
        }>()
    : {
        data: null as {
          plan: string | null;
          subscription_status: string | null;
          current_period_end: string | null;
          trial_ends_at: string | null;
        } | null,
      };
  const tier = getTier(user, entitlementProfile ?? null);
  const isPaid = canAccessWeekendPro(user, entitlementProfile ?? null);
  const viewerEmail = user?.email ?? "";
  const needsEmailVerification = Boolean(user && !user.email_confirmed_at);
  const { data, error } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select(
      "id,slug,name,city,state,zip,start_date,end_date,summary,source_url,official_website_url,sport,level,tournament_staff_verified,venue,address,tournament_venues(venues(id,seo_slug,name,address,city,state,zip,latitude,longitude,venue_url,restroom_cleanliness_avg,shade_score_avg,vendor_score_avg,parking_convenience_score_avg,review_count,reviews_last_updated_at))"
    )
    .eq("slug", params.slug)
    .maybeSingle<TournamentDetailRow>();

  if (error || !data) notFound();
  const { data: privateRowRaw } = await (supabaseAdmin.from("tournaments" as any) as any)
    .select("tournament_director,tournament_director_email,referee_contact,referee_contact_email")
    .eq("id", data.id)
    .maybeSingle();
  const privateRow = (privateRowRaw ?? null) as {
    tournament_director: string | null;
    tournament_director_email: string | null;
    referee_contact: string | null;
    referee_contact_email: string | null;
  } | null;
  const directorEmailOnFile = privateRow?.tournament_director_email ?? null;
  const directorNameOnFile = privateRow?.tournament_director ?? null;
  const refereeContactOnFile = privateRow?.referee_contact ?? null;
  const refereeContactEmailOnFile = privateRow?.referee_contact_email ?? null;
  const initialSaved = user?.id ? await isTournamentSaved(user.id, data.id) : false;

  const locationLabel = buildLocationLabel(data.city, data.state) || "Location TBA";
  const start = formatDate(data.start_date);
  const end = formatDate(data.end_date);
  const dateLabel = start && end && start !== end ? `${start} – ${end}` : start || end || "Dates TBA";
  const hasMapAddress = (data.address || data.venue) && data.city && data.state;
  const mapQuery = hasMapAddress ? [data.venue, data.address, data.city, data.state, data.zip].filter(Boolean).join(", ") : "";
  const mapLinks = mapQuery ? buildMapLinks(mapQuery) : null;
  const venueInfo = data.venue || data.address || mapQuery;
  const venueAddress = [data.address, buildLocationLabel(data.city, data.state)].filter(Boolean).join(", ");
  const sportSurfaceClass = getSportCardClass(data.sport);
  const rawTournamentVenues = Array.isArray(data.tournament_venues)
    ? data.tournament_venues
    : [];
  const linkedVenues: LinkedVenue[] = rawTournamentVenues
    .map((tv: any) => tv?.venues ?? null)
    .filter(
      (venue: any): venue is LinkedVenue =>
        Boolean(venue && typeof venue === "object" && typeof venue.id === "string")
    );
  const linkedVenueIds = linkedVenues.map((v) => v.id).filter(Boolean);
  const linkedVenueNameById = new Map(linkedVenues.map((venue) => [venue.id, venue.name ?? "Tournament venue"]));
  const resolvedSlug = (data.slug ?? params.slug ?? "").toLowerCase();
  const isDemoTournament = resolvedSlug === DEMO_TOURNAMENT_SLUG;
  const showStaffVerified = Boolean(data.tournament_staff_verified) || isDemoTournament;
  const canViewPremiumDetails = isPaid || isDemoTournament;
  const hasDirectorEmailOnFile = Boolean((directorEmailOnFile ?? "").trim());
  const canEditThisTournament = canEditTournament(viewerEmail, directorEmailOnFile);
  const showClaimNotice = searchParams?.claim === "1";
  const showSavedNotice = searchParams?.saved === "1";

  const MAX_VENUES_IN_SENTENCE = 5;
  const venueItems: SemanticListItem[] = linkedVenues
    .filter((v) => Boolean(v?.id && v?.name))
    .slice()
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    .map((v) => {
      const loc = [v.city, v.state].filter(Boolean).join(", ");
      const label = loc ? `${v.name ?? "Venue"} (${loc})` : (v.name ?? "Venue");
      return { id: v.id, label, href: `/venues/${v.seo_slug || v.id}` };
    });
  const venueList = formatEntityList(venueItems, {
    maxItems: MAX_VENUES_IN_SENTENCE,
    overflowNoun: "venues",
    overflow:
      venueItems.length > MAX_VENUES_IN_SENTENCE
        ? { kind: "known", remainingCount: venueItems.length - MAX_VENUES_IN_SENTENCE }
        : { kind: "none" },
    truncateLabelAt: 120,
  });
  const tournamentSemanticParts =
    venueItems.length === 0
      ? ([{ type: "text", value: "Venue information for this tournament is not yet confirmed." }] as SemanticListPart[])
      : venueItems.length === 1
        ? ([{ type: "text", value: "This tournament is played at " }, ...venueList.parts, { type: "text", value: "." }] as SemanticListPart[])
        : venueItems.length <= MAX_VENUES_IN_SENTENCE
          ? ([
              { type: "text", value: "Games for this tournament are played across multiple venues: " },
              ...venueList.parts,
              { type: "text", value: "." },
            ] as SemanticListPart[])
          : ([
              { type: "text", value: "Games for this tournament are played across multiple venues including " },
              ...venueList.parts,
              { type: "text", value: "." },
            ] as SemanticListPart[]);

  if (showClaimNotice && user?.id && canEditThisTournament) {
    // Best-effort funnel marker; safe to ignore failures pre-migration.
    try {
      await (supabaseAdmin.from("tournament_claim_events" as any) as any).insert({
        tournament_id: data.id,
        event_type: "Tournament Claim Authenticated",
        entered_email: viewerEmail?.trim().toLowerCase() || null,
        user_id: user.id,
        meta: { slug: data.slug ?? params.slug },
      });
    } catch {
      // ignore
    }
  }
  let nearbyCountsByVenueId = new Map<
    string,
    {
      food: number;
      coffee: number;
      hotels: number;
      sporting_goods: number;
      captured_at: string | null;
    }
  >();
  let hasOwlsEyeByVenueId = new Map<string, boolean>();
  const standardPartnerCategories = new Set(["food", "coffee", "hotel", "hotels"]);
  const { data: tournamentPartnerRowsRaw } = await supabaseAdmin
    .from("tournament_partner_nearby" as any)
    .select("id,venue_id,category,name,address,maps_url,sponsor_click_url,sort_order")
    .eq("tournament_id", data.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  const tournamentPartnerRows = ((tournamentPartnerRowsRaw as TournamentPartnerRow[] | null) ?? []).filter((row) => {
    const normalized = (row.category ?? "").toLowerCase();
    return row.name && normalized && !standardPartnerCategories.has(normalized);
  });

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

    nearbyCountsByVenueId = new Map(
      Array.from(latestRunByVenue.entries()).map(([venueId, run]) => {
        const runId = (run.run_id ?? run.id) as string;
        const counts = countsByRunId.get(runId) ?? { food: 0, coffee: 0, hotels: 0, sporting_goods: 0 };
        return [
          venueId,
          {
            ...counts,
            captured_at: run.updated_at ?? run.created_at ?? null,
          },
        ];
      })
    );
    hasOwlsEyeByVenueId = new Map(
      Array.from(nearbyCountsByVenueId.entries()).map(([venueId, counts]) => [
        venueId,
        counts.food + counts.coffee + counts.hotels + counts.sporting_goods > 0,
      ])
    );
  }

  const canonicalUrl = buildCanonicalUrl(data.slug ?? params.slug);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: data.name,
    startDate: data.start_date || undefined,
    endDate: data.end_date || undefined,
    url: canonicalUrl,
    location: {
      "@type": "Place",
      name: linkedVenues[0]?.name || data.venue || locationLabel || "Tournament venue",
      address: {
        "@type": "PostalAddress",
        addressLocality: data.city || undefined,
        addressRegion: data.state || undefined,
        postalCode: data.zip || undefined,
        addressCountry: "US",
      },
    },
    sameAs: data.official_website_url || data.source_url || undefined,
  };

  return (
    <main className="pitchWrap tournamentsWrap">
      <section className={`detailHero ${sportSurfaceClass}`}>
        <div className="detailHero__overlay">
          {showStaffVerified ? (
            <div className="detailBadgeRail">
              <img
                className="detailBadgeIcon detailBadgeIcon--verified"
                src="/svg/ri/tournament_staff_verified.svg"
                alt="Tournament staff verified"
              />
            </div>
          ) : null}
          <script
            type="application/ld+json"
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
          />
          <Link href="/tournaments" className="detailBackLink">
            ← Back to directory
          </Link>
          <h1 className="detailTitle">{data.name}</h1>
          <SaveTournamentButton
            tournamentId={data.id}
            initialSaved={initialSaved}
            isLoggedIn={Boolean(user)}
            isVerified={Boolean(user?.email_confirmed_at)}
            returnTo={`/tournaments/${data.slug ?? params.slug}`}
          />
          <div className="detailMeta">
            <strong>{(data.sport || "Tournament").toString()}</strong>
            {data.level ? ` • ${data.level}` : ""}
          </div>
          <div className="detailMeta">{dateLabel}</div>
          <div className="detailMeta">{locationLabel}</div>

          {showSavedNotice ? (
            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(16, 185, 129, 0.16)",
                color: "rgba(255,255,255,0.95)",
                fontWeight: 800,
              }}
            >
              Saved. Thanks for keeping this listing accurate.
            </div>
          ) : null}

          {canEditThisTournament ? (
            <details
              style={{
                marginTop: 12,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(0,0,0,0.25)",
                backdropFilter: "blur(10px)",
                borderRadius: 16,
                padding: 14,
              }}
              open={Boolean(showClaimNotice)}
            >
              <summary style={{ cursor: "pointer", color: "#fff", fontWeight: 900, listStyle: "auto" }}>
                Edit this tournament listing
              </summary>
	              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
	                <form
	                  action={async (formData) => {
	                    "use server";
	                    await saveClaimedTournamentEdits(formData);
	                  }}
	                  style={{ display: "grid", gap: 10 }}
	                >
	                  <input type="hidden" name="tournament_id" value={data.id} />
	                  <input type="hidden" name="slug" value={data.slug ?? params.slug} />

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.95 }}>Official website URL</span>
                      <input
                        name="official_website_url"
                        defaultValue={data.official_website_url ?? ""}
                        placeholder="https://..."
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(255,255,255,0.10)",
                        color: "#fff",
                        outline: "none",
                      }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.95 }}>Start date</span>
                      <input
                        type="date"
                        name="start_date"
                        defaultValue={data.start_date ?? ""}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(255,255,255,0.10)",
                        color: "#fff",
                        outline: "none",
                      }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.95 }}>End date</span>
                      <input
                        type="date"
                        name="end_date"
                        defaultValue={data.end_date ?? ""}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(255,255,255,0.10)",
                        color: "#fff",
                        outline: "none",
                      }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.95 }}>City</span>
                      <input
                        name="city"
                        defaultValue={data.city ?? ""}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(255,255,255,0.10)",
                        color: "#fff",
                        outline: "none",
                      }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.95 }}>State</span>
                      <input
                        name="state"
                        defaultValue={data.state ?? ""}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(255,255,255,0.10)",
                        color: "#fff",
                        outline: "none",
                      }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.95 }}>Tournament director</span>
                      <input
                        name="tournament_director"
                        defaultValue={directorNameOnFile ?? ""}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(255,255,255,0.10)",
                        color: "#fff",
                        outline: "none",
                      }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.95 }}>Referee contact</span>
                      <input
                        name="referee_contact"
                        defaultValue={refereeContactOnFile ?? ""}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(255,255,255,0.10)",
                        color: "#fff",
                        outline: "none",
                      }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.95 }}>Referee contact email</span>
                      <input
                        type="email"
                        name="referee_contact_email"
                        defaultValue={refereeContactEmailOnFile ?? ""}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(255,255,255,0.10)",
                        color: "#fff",
                        outline: "none",
                      }}
                      />
                    </label>
                  </div>

                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.78)" }}>
                    Need to change the director email on file? Use “Request review” in the claim box and we&apos;ll update it.
                  </div>

                <button
                  type="submit"
                  className="cta ti-home-cta ti-home-cta-primary"
                  style={{ padding: "10px 14px", justifySelf: "start" }}
                >
                  Save changes
                </button>
                </form>
              </div>
            </details>
          ) : (
            <div style={{ marginTop: 12 }}>
              <ClaimThisTournament
                tournamentId={data.id}
                tournamentName={data.name}
                hasDirectorEmailOnFile={hasDirectorEmailOnFile}
                viewerEmail={viewerEmail}
              />
            </div>
          )}

          {data.official_website_url && !isDemoTournament ? (
            <div className="detailLinksRow">
              <a className="secondaryLink" href={data.official_website_url} target="_blank" rel="noopener noreferrer">
                Official site
              </a>
            </div>
          ) : null}

          {linkedVenues.length > 0 ? (
            <div className="detailVenueGrid">
              {linkedVenues.map((venue) => (
                <Link
                  key={venue.id}
                  href={`/venues/${venue.seo_slug || venue.id}?tournament=${encodeURIComponent(data.slug ?? params.slug)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`detailVenueTile ${hasOwlsEyeByVenueId.get(venue.id) ? "detailVenueTile--withOwl" : ""}`}
                >
                  <span className="detailVenueTile__eyebrow">Venue</span>
                  <span className="detailVenueTile__name">{venue.name || "Venue TBA"}</span>
                  {hasOwlsEyeByVenueId.get(venue.id) ? (
                    <span className="detailVenueTile__flag">{BRAND_OWL}</span>
                  ) : (
                    <span className="detailVenueTile__flag">Open details</span>
                  )}
                </Link>
              ))}
            </div>
          ) : null}

          {linkedVenues.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <QuickVenueCheck
                venueId={linkedVenues.length === 1 ? linkedVenues[0].id : undefined}
                venueOptions={linkedVenues.map((v) => ({ id: v.id, name: v.name }))}
                pageType="tournament"
                sourceTournamentId={data.id}
              />
            </div>
          ) : venueInfo ? (
            <div className="detailCard">
              <div className="detailCard__title">Venue</div>
              <div className="detailCard__body">
                <div className="detailVenueRow">
                  <div className="detailVenueText">
                    <div className="detailVenueName">{data.venue || "Venue TBA"}</div>
                    {venueAddress ? <div className="detailVenueAddress">{venueAddress}</div> : null}
                  </div>
                  {mapLinks ? (
                    <div className="detailLinksRow detailLinksRow--inline">
                      <a className="secondaryLink" href={mapLinks.google} target="_blank" rel="noopener noreferrer">
                        Google Maps
                      </a>
                      <a className="secondaryLink" href={mapLinks.apple} target="_blank" rel="noopener noreferrer">
                        Apple Maps
                      </a>
                      <a className="secondaryLink" href={mapLinks.waze} target="_blank" rel="noopener noreferrer">
                        Waze
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {data.summary ? <p className="detailSummary">{data.summary}</p> : null}

          {tournamentPartnerRows.length ? (
            <div className="detailCard">
              <div className="detailCard__title">Tournament Partners</div>
              <div className="detailCard__body" style={{ display: "grid", gap: 12 }}>
                {tournamentPartnerRows.map((partner) => {
                  const venueName = partner.venue_id ? linkedVenueNameById.get(partner.venue_id) ?? null : null;
                  const destination = partner.sponsor_click_url || partner.maps_url || null;
                  return (
                    <div
                      key={partner.id}
                      style={{
                        display: "grid",
                        gap: 4,
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.04)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 10,
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <div style={{ display: "grid", gap: 3 }}>
                          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.74 }}>
                            {formatPartnerCategory(partner.category)}
                          </span>
                          <strong style={{ fontSize: "1.02rem" }}>{partner.name}</strong>
                        </div>
                        {destination ? (
                          <a className="secondaryLink" href={destination} target="_blank" rel="noopener noreferrer">
                            Visit Partner
                          </a>
                        ) : null}
                      </div>
                      {venueName ? (
                        <div style={{ fontSize: 13, opacity: 0.84 }}>
                          Applies to <strong>{venueName}</strong>
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, opacity: 0.84 }}>Applies across all tournament venues</div>
                      )}
                      {partner.address ? <div style={{ fontSize: 14, opacity: 0.88 }}>{partner.address}</div> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          <p className="detailLegalNote">
            Information may change. Verify critical details directly with organizers and venues.{" "}
            <Link href="/terms">Terms</Link> • <Link href="/disclaimer">Disclaimer</Link>
          </p>

          <div className="detailCard premiumDetailCard">
            <div className="detailCard__title premiumDetailCard__title">
              <span aria-hidden="true">🔒</span>
              <span>Premium Planning Details</span>
            </div>
            {!canViewPremiumDetails ? (
              <div className="detailCard__body premiumDetailCard__body">
                <p className="premiumDetailCard__copy">
                  Locked — Upgrade to view vendor, parking, restroom, seating, and travel/lodging details.
                </p>
                {needsEmailVerification ? (
                  <p className="premiumDetailCard__copy" style={{ marginTop: 6 }}>
                    Verify your email to unlock Insider access first. <Link href="/verify-email">Verify email</Link>
                  </p>
                ) : tier === "explorer" ? (
                  <p className="premiumDetailCard__copy" style={{ marginTop: 6 }}>
                    Log in for Insider access. <Link href="/login">Log in</Link> or <Link href="/signup">sign up</Link>.
                  </p>
                ) : null}
                <div className="detailLinksRow">
                  <Link className="secondaryLink" href="/pricing">
                    Upgrade
                  </Link>
                </div>
                <PremiumInterestForm initialEmail={viewerEmail} />
              </div>
            ) : (
              <div className="detailCard__body premiumDetailCard__body">
                <div className="premiumDetailRow">
                  <span className="premiumDetailLabel">Venue-level premium details</span>
                  <span>Open any venue tile above to view venue details in a new tab.</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 18, fontSize: 13, lineHeight: 1.45, opacity: 0.78 }}>
            {renderSemanticParts(tournamentSemanticParts)}
          </div>
        </div>
      </section>
    </main>
  );
}
