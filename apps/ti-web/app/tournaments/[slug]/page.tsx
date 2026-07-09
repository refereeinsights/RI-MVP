import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { BRAND_OWL } from "@/lib/brand";
import { canAccessWeekendPro, getTier } from "@/lib/entitlements";
import { isTournamentSaved } from "@/lib/savedTournaments";
import { buildTITournamentTitle, assertNoDoubleBrand } from "@/lib/seo/buildTITitle";
import PremiumInterestForm from "@/components/PremiumInterestForm";
import SaveTournamentButton from "@/components/SaveTournamentButton";
import QuickVenueCheck from "@/components/venues/QuickVenueCheck";
import StartQuickVenueCheckButton from "@/components/venues/StartQuickVenueCheckButton";
import TournamentWeatherPlannerAccordion from "@/components/tournaments/TournamentWeatherPlannerAccordion";
import ClaimThisTournament from "@/components/tournaments/ClaimThisTournament";
import TournamentMapCta from "@/components/tournaments/TournamentMapCta";
import UpgradeWeekendProButton from "@/components/UpgradeWeekendProButton";
import TournamentMapTeaser from "@/components/tournaments/TournamentMapTeaser";
import TournamentDetailStickyMapCta from "@/components/tournaments/TournamentDetailStickyMapCta";
import TournamentPlanningCtasClient from "./TournamentPlanningCtasClient";
import SoccerWorldCupFanGearCard from "@/components/partners/SoccerWorldCupFanGearCard";
import FanaticsGearModule from "@/components/partners/FanaticsGearModule";
import { getFanaticsLinkAndDisclosure } from "@/lib/partners";
import { WEEKEND_PRO_FOUNDING_DISCLAIMER, WEEKEND_PRO_FOUNDING_PRICE_LINE } from "@/lib/weekendProPricing";
import MoreTournamentsInStateLinks from "../_components/MoreTournamentsInStateLinks";
import TournamentDetailViewTrackerClient from "./TournamentDetailViewTrackerClient";
import { canEditTournament } from "@/lib/tournamentClaim";
import { saveClaimedTournamentEdits } from "./actions";
import { formatEntityList, type SemanticListItem, type SemanticListPart } from "../../../../../shared/semantic/formatEntityList";
import { buildHotelsHref, canShowBookingCta, isValidZip5 } from "@/lib/booking/venueBooking";
import { buildTournamentHotelsHref, buildTournamentVrboHref } from "@/lib/affiliates/tournamentTravelLinks";
import { mapStateCodeToName, mapStateCodeToSlug, normalizeSportSlug, sportDisplayName } from "@/lib/seoHub";
import "../tournaments.css";

type TournamentDetailCoreRow = {
  id: string;
  slug: string | null;
  name: string;
  city: string | null;
  state: string | null;
  zip?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  start_date: string | null;
  end_date: string | null;
  summary: string | null;
  source_url: string | null;
  official_website_url?: string | null;
  sport: string | null;
  level: string | null;
  tournament_staff_verified?: boolean | null;
  venue: string | null;
  address: string | null;
  static_map_path?: string | null;
  static_map_status?: string | null;
  static_map_updated_at?: string | null;
};

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
const AVAILABLE_TOURNAMENT_SPORT_HUBS = new Set(["soccer", "baseball", "softball", "lacrosse", "basketball", "hockey", "ayso"]);
const DC_METRO_STATES = new Set(["DC", "VA", "MD"]);
const NEW_ENGLAND_STATES = new Set(["CT", "RI", "ME", "NH"]);
const CALIFORNIA_STATES = new Set(["CA"]);

function getMetroMarketLabel(state: string | null): string | null {
  const code = (state ?? "").trim().toUpperCase();
  if (!code) return null;
  if (DC_METRO_STATES.has(code)) return "Part of the DC Metro market";
  if (NEW_ENGLAND_STATES.has(code)) return "Part of the New England market";
  if (CALIFORNIA_STATES.has(code)) return "Part of the California regional market";
  return null;
}

function buildDirectoryHref({
  state,
  sport,
  month,
}: {
  state: string;
  sport: string | null;
  month?: string | null;
}) {
  const params = new URLSearchParams();
  const st = (state ?? "").trim().toUpperCase();
  if (st) params.append("state", st);
  const sp = (sport ?? "").trim().toLowerCase();
  if (sp) params.append("sports", sp);
  if (month) params.set("month", month);
  // Keep this explicit so the link is self-explanatory when shared.
  params.set("includePast", "false");
  return `/tournaments?${params.toString()}`;
}

function nextMonths(count: number) {
  const out: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    out.push({ value, label });
  }
  return out;
}

type ViewerContext = {
  userId: string | null;
  viewerEmail: string;
  tier: string;
  isPaid: boolean;
  needsEmailVerification: boolean;
  isLoggedIn: boolean;
  isVerified: boolean;
  initialSaved: boolean;
  directorEmailOnFile: string | null;
  directorNameOnFile: string | null;
  refereeContactOnFile: string | null;
  refereeContactEmailOnFile: string | null;
};

async function loadViewerContext(tournamentId: string): Promise<ViewerContext> {
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
    : { data: null as any };

  const tier = getTier(user, entitlementProfile ?? null) as unknown as string;
  const isPaid = canAccessWeekendPro(user, entitlementProfile ?? null);
  const viewerEmail = user?.email ?? "";
  const needsEmailVerification = Boolean(user && !user.email_confirmed_at);

  const { data: privateRowRaw } = await (supabaseAdmin.from("tournaments" as any) as any)
    .select("tournament_director,tournament_director_email,referee_contact,referee_contact_email")
    .eq("id", tournamentId)
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
  const initialSaved = user?.id ? await isTournamentSaved(user.id, tournamentId) : false;

  return {
    userId: user?.id ?? null,
    viewerEmail,
    tier,
    isPaid,
    needsEmailVerification,
    isLoggedIn: Boolean(user),
    isVerified: Boolean(user?.email_confirmed_at),
    initialSaved,
    directorEmailOnFile,
    directorNameOnFile,
    refereeContactOnFile,
    refereeContactEmailOnFile,
  };
}

async function TournamentUserActions({
  tournament,
  paramsSlug,
  searchParams,
  viewerContext,
  primaryVenueIdForPlan,
}: {
  tournament: TournamentDetailCoreRow;
  paramsSlug: string;
  searchParams?: { claim?: string; saved?: string };
  viewerContext: Promise<ViewerContext>;
  primaryVenueIdForPlan: string | null;
}) {
  const viewer = await viewerContext;
  const resolvedSlug = (tournament.slug ?? paramsSlug ?? "").toLowerCase();
  const isDemoTournament = resolvedSlug === DEMO_TOURNAMENT_SLUG;
  const showClaimNotice = searchParams?.claim === "1";
  const showSavedNotice = searchParams?.saved === "1";
  const hasDirectorEmailOnFile = Boolean((viewer.directorEmailOnFile ?? "").trim());
  const canEditThisTournament = canEditTournament(viewer.viewerEmail, viewer.directorEmailOnFile);

  if (showClaimNotice && viewer.userId && canEditThisTournament) {
    try {
      await (supabaseAdmin.from("tournament_claim_events" as any) as any).insert({
        tournament_id: tournament.id,
        event_type: "Tournament Claim Authenticated",
        entered_email: viewer.viewerEmail?.trim().toLowerCase() || null,
        user_id: viewer.userId,
        meta: { slug: tournament.slug ?? paramsSlug },
      });
    } catch {
      // ignore
    }
  }

  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" as any }}>
        <SaveTournamentButton
          tournamentId={tournament.id}
          initialSaved={viewer.initialSaved}
          isLoggedIn={viewer.isLoggedIn}
          isVerified={viewer.isVerified}
          returnTo={`/tournaments/${tournament.slug ?? paramsSlug}`}
        />
      </div>

      <TournamentPlanningCtasClient
        tournamentId={tournament.id}
        tournamentSlug={tournament.slug ?? paramsSlug}
        primaryVenueId={primaryVenueIdForPlan}
        city={tournament.city ?? null}
        state={tournament.state ?? null}
        startDate={tournament.start_date ?? null}
        endDate={tournament.end_date ?? null}
        authState={viewer.isLoggedIn ? (viewer.isVerified ? "verified" : "unverified") : "signed_out"}
        entitlement={
          viewer.tier === "explorer" || viewer.tier === "insider" || viewer.tier === "weekend_pro"
            ? viewer.tier
            : "unknown"
        }
      />

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
          Tournament saved. You can track updates and access it quickly from your account.
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
	              action={saveClaimedTournamentEdits as any}
	              style={{ display: "grid", gap: 10 }}
	            >
	              <input type="hidden" name="tournament_id" value={tournament.id} />
	              <input type="hidden" name="slug" value={tournament.slug ?? paramsSlug} />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.95 }}>Official website URL</span>
                  <input
                    name="official_website_url"
                    defaultValue={tournament.official_website_url ?? ""}
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
                    defaultValue={tournament.start_date ?? ""}
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
                    defaultValue={tournament.end_date ?? ""}
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
                    defaultValue={tournament.city ?? ""}
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
                    defaultValue={tournament.state ?? ""}
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
                    defaultValue={viewer.directorNameOnFile ?? ""}
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
                  <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.95 }}>Tournament director email</span>
                  <input
                    type="email"
                    name="tournament_director_email"
                    defaultValue={viewer.directorEmailOnFile ?? ""}
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
                    defaultValue={viewer.refereeContactOnFile ?? ""}
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
                    defaultValue={viewer.refereeContactEmailOnFile ?? ""}
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
      ) : null}

      {/* Noise cleanup: remove redundant CTA clusters; Map Teaser is the primary next step after the header. */}
    </>
  );
}

async function TournamentHeroTrustLine({
  viewerContext,
  showStaffVerified,
}: {
  viewerContext: Promise<ViewerContext>;
  showStaffVerified: boolean;
}) {
  const viewer = await viewerContext;
  if (viewer.isLoggedIn) return null;
  const line = showStaffVerified ? "Verified listing · TournamentInsights" : "Listing on TournamentInsights";
  return <div className="detailMeta" style={{ fontSize: 13, opacity: 0.84 }}>{line}</div>;
}

async function TournamentVenueDetails({
  tournament,
  paramsSlug,
  locationLabel,
  mapLinks,
  venueInfo,
  venueAddress,
  viewerContext,
}: {
  tournament: TournamentDetailCoreRow;
  paramsSlug: string;
  locationLabel: string;
  mapLinks: ReturnType<typeof buildMapLinks> | null;
  venueInfo: string | null;
  venueAddress: string;
  viewerContext: Promise<ViewerContext>;
}) {
  const viewer = await viewerContext;
  const resolvedSlug = (tournament.slug ?? paramsSlug ?? "").toLowerCase();
  const isDemoTournament = resolvedSlug === DEMO_TOURNAMENT_SLUG;
  const showLoggedOut = !viewer.isLoggedIn;
  const hasDirectorEmailOnFile = Boolean((viewer.directorEmailOnFile ?? "").trim());
  const canEditThisTournament = canEditTournament(viewer.viewerEmail, viewer.directorEmailOnFile);
  const canViewPremiumDetails = viewer.isPaid || isDemoTournament;

  const { data: venueLinksRaw } = await supabaseAdmin
    .from("tournament_venues" as any)
    .select(
      "venue_id,is_primary,created_at,venues(id,seo_slug,name,address,city,state,zip,latitude,longitude)"
    )
    .eq("tournament_id", tournament.id)
    .eq("is_inferred", false)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  const venueLinkRows: Array<{ venue: LinkedVenue; isPrimary: boolean; createdAt: string | null; idx: number }> = (
    (venueLinksRaw as any[]) ?? []
  )
    .map((row: any, idx: number) => ({
      venue: row?.venues ?? null,
      isPrimary: Boolean(row?.is_primary),
      createdAt: typeof row?.created_at === "string" ? row.created_at : null,
      idx,
    }))
    .filter((row: any): row is { venue: LinkedVenue; isPrimary: boolean; createdAt: string | null; idx: number } =>
      Boolean(row?.venue && typeof row.venue.id === "string")
    );

  const linkedVenues: LinkedVenue[] = venueLinkRows.map((row) => row.venue);

  const linkedVenueIds = linkedVenues.map((v) => v.id).filter(Boolean);
  const linkedVenueNameById = new Map(linkedVenues.map((venue) => [venue.id, venue.name ?? "Tournament venue"]));

  const standardPartnerCategories = new Set(["food", "coffee", "hotel", "hotels"]);
  const { data: tournamentPartnerRowsRaw } = await supabaseAdmin
    .from("tournament_partner_nearby" as any)
    .select("id,venue_id,category,name,address,maps_url,sponsor_click_url,sort_order")
    .eq("tournament_id", tournament.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(60);

  const tournamentPartnerRows = ((tournamentPartnerRowsRaw as TournamentPartnerRow[] | null) ?? []).filter((row) => {
    const normalized = (row.category ?? "").toLowerCase();
    return row.name && normalized && !standardPartnerCategories.has(normalized);
  });

  let hasOwlsEyeByVenueId = new Map<string, boolean>();
  let owlsEyeCountsByVenueId = new Map<
    string,
    { food: number; coffee: number; hotels: number; sporting_goods: number; quick_eats: number; hangouts: number }
  >();

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

    const countsByRunId = new Map<
      string,
      { food: number; coffee: number; hotels: number; sporting_goods: number; quick_eats: number; hangouts: number }
    >();
    for (const row of ((nearbyRows as Array<{ run_id: string; category: string | null }> | null) ?? [])) {
      const runId = row.run_id;
      if (!runId) continue;
      const normalizedCategory = (row.category ?? "food").toLowerCase();
      const current = countsByRunId.get(runId) ?? { food: 0, coffee: 0, hotels: 0, sporting_goods: 0, quick_eats: 0, hangouts: 0 };
      if (normalizedCategory === "coffee") current.coffee += 1;
      else if (normalizedCategory === "hotel" || normalizedCategory === "hotels") current.hotels += 1;
      else if (normalizedCategory === "quick_eats") current.quick_eats += 1;
      else if (normalizedCategory === "hangouts") current.hangouts += 1;
      else if (normalizedCategory === "sporting_goods" || normalizedCategory === "big_box_fallback") current.sporting_goods += 1;
      else current.food += 1;
      countsByRunId.set(runId, current);
    }

    owlsEyeCountsByVenueId = new Map(
      Array.from(latestRunByVenue.entries()).map(([venueId, run]) => {
        const runId = (run.run_id ?? run.id) as string;
        return [venueId, countsByRunId.get(runId) ?? { food: 0, coffee: 0, hotels: 0, sporting_goods: 0, quick_eats: 0, hangouts: 0 }] as const;
      })
    );

    hasOwlsEyeByVenueId = new Map(
      Array.from(latestRunByVenue.entries()).map(([venueId, run]) => {
        const runId = (run.run_id ?? run.id) as string;
        const counts = countsByRunId.get(runId) ?? { food: 0, coffee: 0, hotels: 0, sporting_goods: 0, quick_eats: 0, hangouts: 0 };
        return [venueId, counts.food + counts.coffee + counts.hotels + counts.quick_eats + counts.hangouts + counts.sporting_goods > 0] as const;
      })
    );
  }

  const displayVenueRows = venueLinkRows
    .map((row) => {
      const counts = owlsEyeCountsByVenueId.get(row.venue.id) ?? null;
      const hasOwl = hasOwlsEyeByVenueId.get(row.venue.id) ?? false;
      const hasCoords = typeof row.venue.latitude === "number" && typeof row.venue.longitude === "number";
      const hasZip = isValidZip5(row.venue.zip);
      const hasSeoSlug = Boolean(String(row.venue.seo_slug ?? "").trim());

      const score =
        (row.isPrimary ? 1000 : 0) +
        (hasOwl ? 100 : 0) +
        (hasCoords ? 10 : 0) +
        (hasZip ? 5 : 0) +
        (hasSeoSlug ? 1 : 0);

      return {
        ...row,
        counts,
        hasOwl,
        hasCoords,
        hasZip,
        hasSeoSlug,
        score,
      };
    })
    .sort((a, b) => (b.score - a.score) || (a.idx - b.idx));

  const bestWeatherVenueRow =
    displayVenueRows.find((v) => v.isPrimary && v.hasCoords) ??
    displayVenueRows.find((v) => v.hasCoords) ??
    displayVenueRows.find((v) => v.hasZip || (v.venue.city && v.venue.state)) ??
    null;

  const bestOwlVenueRow = displayVenueRows.find((v) => v.hasOwl) ?? null;
  const bookingVenueRow = displayVenueRows.find((v) => canShowBookingCta({ zip: v.venue.zip })) ?? null;
  const hotelClickVenueId =
    bookingVenueRow?.venue.id ?? bestWeatherVenueRow?.venue.id ?? displayVenueRows[0]?.venue.id ?? null;
  const hotelClickVenue = hotelClickVenueId ? displayVenueRows.find((r) => r.venue.id === hotelClickVenueId)?.venue ?? null : null;

  const fallbackCity = tournament.city ?? null;
  const fallbackState = tournament.state ?? null;
  const fallbackZip = typeof tournament.zip === "string" ? tournament.zip : null;

  const bestWeatherLocation = {
    latitude:
      bestWeatherVenueRow?.venue.latitude ??
      (typeof tournament.latitude === "number" ? tournament.latitude : null) ??
      null,
    longitude:
      bestWeatherVenueRow?.venue.longitude ??
      (typeof tournament.longitude === "number" ? tournament.longitude : null) ??
      null,
    city: bestWeatherVenueRow?.venue.city ?? fallbackCity,
    state: bestWeatherVenueRow?.venue.state ?? fallbackState,
    zip:
      (bestWeatherVenueRow?.venue.zip && isValidZip5(bestWeatherVenueRow.venue.zip) ? bestWeatherVenueRow.venue.zip : null) ??
      fallbackZip,
  };

  const mostCommonVenueLocation = (() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const row of displayVenueRows) {
      const city = String(row.venue.city ?? "").trim();
      const state = String(row.venue.state ?? "").trim().toUpperCase();
      if (!city || !/^[A-Z]{2}$/.test(state)) continue;
      const key = `${city.toLowerCase()}|${state}`;
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { label: `${city}, ${state}`, count: 1 });
    }
    const sorted = Array.from(counts.values()).sort((a, b) => b.count - a.count);
    return sorted[0]?.label ?? null;
  })();

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
        ? ([
            { type: "text", value: "This tournament is played at " },
            ...venueList.parts,
            { type: "text", value: "." },
          ] as SemanticListPart[])
        : venueItems.length > MAX_VENUES_IN_SENTENCE
          ? ([
              { type: "text", value: "Games for this tournament are played across multiple venues including " },
              ...venueList.parts,
              { type: "text", value: "." },
            ] as SemanticListPart[])
          : ([
              { type: "text", value: "Games for this tournament are played across multiple venues: " },
              ...venueList.parts,
              { type: "text", value: "." },
          ] as SemanticListPart[]);

  const venueCount = displayVenueRows.length;
  const isSingleVenue = venueCount === 1;
  const mapPrimaryLabel = "View venue map";
  const whereYoullPlayLine =
    venueCount === 1
      ? "This tournament is scheduled at 1 venue."
      : venueCount > 1
        ? `This tournament uses ${venueCount} venues across the area.`
        : "Venue details coming soon.";

  const showVenueWarning = venueCount >= 10;

  const mapPreviewHref = `/tournaments/${encodeURIComponent(tournament.slug ?? paramsSlug)}/map`;

  const primaryVenue = displayVenueRows[0]?.venue ?? null;
  const primaryVenueName = (primaryVenue?.name ?? "").trim() || null;
  const primaryVenueLocationLabel = [primaryVenue?.city, primaryVenue?.state].filter(Boolean).join(", ") || null;
  const bestNearbyCounts = bestOwlVenueRow?.counts
    ? {
        coffee: bestOwlVenueRow.counts.coffee,
        food: bestOwlVenueRow.counts.food,
        hotels: bestOwlVenueRow.counts.hotels,
        quick_eats: bestOwlVenueRow.counts.quick_eats,
        hangouts: bestOwlVenueRow.counts.hangouts,
        sporting_goods: bestOwlVenueRow.counts.sporting_goods,
      }
    : null;

  const formatOwlCountsLine = (counts: {
    coffee: number;
    food: number;
    hotels: number;
    quick_eats: number;
    hangouts: number;
    sporting_goods: number;
  }) => {
    const parts: Array<string | null> = [
      `☕ ${counts.coffee}`,
      `🍔 ${counts.food}`,
      counts.hotels ? `🏨 ${counts.hotels}` : null,
      counts.quick_eats ? `🌮 ${counts.quick_eats}` : null,
      counts.hangouts ? `🎳 ${counts.hangouts}` : null,
      counts.sporting_goods ? `⚽ ${counts.sporting_goods}` : null,
    ];
    return parts.filter(Boolean).join(" • ");
  };

  const planFoodCoffeeLine = (() => {
    if (!bestOwlVenueRow) return null;
    const counts = bestOwlVenueRow.counts;
    if (!counts) return "Nearby options available";
    const total = counts.food + counts.coffee + counts.hotels + counts.quick_eats + counts.hangouts + counts.sporting_goods;
    if (!total) return "Nearby options available";
    const parts: Array<string | null> = [
      `☕ ${counts.coffee}`,
      `🍔 ${counts.food}`,
      counts.hotels ? `🏨 ${counts.hotels}` : null,
      counts.quick_eats ? `🌮 ${counts.quick_eats}` : null,
      counts.hangouts ? `🎳 ${counts.hangouts}` : null,
      counts.sporting_goods ? `⚽ ${counts.sporting_goods}` : null,
    ];
    return parts.filter(Boolean).join(" • ");
  })();

  const planHotelsLine = (() => {
    if (!bestOwlVenueRow) return null;
    const counts = bestOwlVenueRow.counts;
    if (!counts) return "Nearby options available";
    if (!counts.hotels) return "Nearby options available";
    return `🏨 ${counts.hotels} hotels nearby`;
  })();

  const tournamentHotelsSearchString = (() => {
    const city = String(bestWeatherLocation.city ?? "").trim();
    const state = String(bestWeatherLocation.state ?? "").trim().toUpperCase();
    const zip = String(bestWeatherLocation.zip ?? "").trim();
    const zipOk = isValidZip5(zip);
    const stateOk = /^[A-Z]{2}$/.test(state);
    if (city && stateOk && zipOk) return `${city}, ${state} ${zip}`;
    if (city && stateOk) return `${city}, ${state}`;
    if (zipOk) return zip;
    return null;
  })();

  const tournamentHotelsHref =
    hotelClickVenueId && tournamentHotelsSearchString
      ? buildHotelsHrefWithSearch({
          venueId: hotelClickVenueId,
          tournamentId: tournament.id,
          ss: tournamentHotelsSearchString,
          source: "tournament_detail",
          provider: "hotelplanner",
          latitude: hotelClickVenue?.latitude ?? null,
          longitude: hotelClickVenue?.longitude ?? null,
        })
      : null;

  const headerHotelsHref = tournamentHotelsHref
	    ? tournamentHotelsHref
	    : buildTournamentHotelsHref({
	        source: "tournament_detail",
	        tournamentId: tournament.id,
	        city: tournament.city ?? null,
	        state: tournament.state ?? null,
	      });
	  const headerRentalsHref =
	    hotelClickVenueId != null
	      ? `/go/vrbo?venueId=${encodeURIComponent(hotelClickVenueId)}&tournamentId=${encodeURIComponent(tournament.id)}&source=tournament_detail`
	      : buildTournamentVrboHref({
	          source: "tournament_detail",
	          tournamentId: tournament.id,
	          city: tournament.city ?? null,
	          state: tournament.state ?? null,
	        });

	  const stayHotelsLabel =
	    venueCount === 1
	      ? primaryVenueName
	        ? `🏨 Find hotels near ${primaryVenueName}`
	        : "🏨 Find hotels near this venue"
	      : "🏨 Find hotels near tournament venues";
  const stayRentalsLabel =
	    venueCount === 1
	      ? primaryVenueName
	        ? `🏡 Search rentals near ${primaryVenueName}`
	        : "🏡 Search rentals near this venue"
      : "🏡 Search rentals near tournament venues";

  const hasOwlInTournament = displayVenueRows.some((r) => r.hasOwl);
  const showLoggedOutUpsell = showLoggedOut && !canViewPremiumDetails;
  const loggedOutUpsellVariant = hasOwlInTournament ? "owl_eye" : "fallback";

  function renderWeekendProUpsell(variant: "owl_eye" | "fallback") {
    return (
      <div className="detailCard premiumDetailCard" style={{ marginTop: 14 }}>
        <div className="detailCard__title premiumDetailCard__title">
          <span aria-hidden="true">{canViewPremiumDetails ? "✅" : "🔒"}</span>
          <span>{canViewPremiumDetails ? "Weekend Pro" : "Upgrade to Weekend Pro"}</span>
        </div>
        {!canViewPremiumDetails ? (
          <div className="detailCard__body premiumDetailCard__body">
            {showLoggedOut ? (
              <div style={{ marginTop: 4, display: "grid", gap: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 900, opacity: 0.95 }}>{WEEKEND_PRO_FOUNDING_PRICE_LINE}</div>
                <div style={{ fontSize: 12, opacity: 0.78 }}>{WEEKEND_PRO_FOUNDING_DISCLAIMER}</div>
              </div>
            ) : null}
            <p className="premiumDetailCard__copy">
              {variant === "owl_eye"
                ? "Unlock Owl’s Eye™ venue intelligence: nearby hotels, rentals, coffee, food, and directions around where games are played."
                : "Unlock premium planning tools for tournament weekends, including venue-focused travel planning shortcuts and deeper local context."}
            </p>
            {viewer.needsEmailVerification ? (
              <p className="premiumDetailCard__copy" style={{ marginTop: 6 }}>
                Verify your email to activate your account. <Link href="/verify-email">Verify email</Link>
              </p>
            ) : null}
            <div className="detailLinksRow" style={{ justifyContent: "center" }}>
              <UpgradeWeekendProButton
                className="secondaryLink hotelBookingCta"
                buttonStyle={{ width: "min(520px, 100%)" }}
                source_page="tournament_detail"
                source_context={variant === "owl_eye" ? "tournament_upsell:owl_eye" : "tournament_upsell:fallback"}
                tournament_slug={tournament.slug}
                cta_label="Upgrade to Weekend Pro"
              />
            </div>
          </div>
        ) : (
          <div className="detailCard__body premiumDetailCard__body">
            <div className="premiumDetailRow">
              <span className="premiumDetailLabel">Weekend Pro active</span>
              <span>
                {variant === "owl_eye"
                  ? "Open any venue tile above to view Owl’s Eye planning details."
                  : "Open the venue map and venue tiles to use your premium planning tools."}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  const fanGearCard = await (async () => {
    const sport = String(tournament.sport ?? "").toLowerCase().trim();
    if (sport !== "soccer") return null;

    const res = await getFanaticsLinkAndDisclosure({
      sport: "soccer",
      pageType: "tournament_detail",
      placement: "soccer_tournament_world_cup_fan_gear",
    });
    if (!res.link?.id) return null;

    const qp = new URLSearchParams();
    qp.set("campaign", "world_cup_2026");
    qp.set("placement", "soccer_tournament_world_cup_fan_gear");
    qp.set("page_type", "tournament_detail");
    qp.set("tournament_id", tournament.id);
    const href = `/go/partner/${encodeURIComponent(res.link.id)}?${qp.toString()}`;

    return (
      <div style={{ width: "min(720px, 100%)", marginLeft: "auto", marginRight: "auto" }}>
        <SoccerWorldCupFanGearCard href={href} disclosureText={res.disclosureText} />
      </div>
    );
  })();

  const genericFanaticsModule = await (async () => {
    if (fanGearCard) return null; // World Cup card wins (no duplicates)

    const sportRaw = String(tournament.sport ?? "").toLowerCase().trim();
    if (sportRaw === "soccer") return null; // avoid a second soccer module in this pass

    const normalize = (value: string) => {
      if (value.includes("baseball") || value.includes("softball")) return "baseball_softball";
      if (value.includes("basketball")) return "basketball";
      if (value.includes("hockey")) return "hockey";
      if (value.includes("lacrosse")) return "lacrosse";
      return "all_sports";
    };
    const sportKey = normalize(sportRaw);

    const copy: Record<string, { title: string; description: string }> = {
      basketball: { title: "Shop basketball gear", description: "Find fan gear for the season." },
      hockey: { title: "Shop hockey gear", description: "Get ready for rink weekends." },
      lacrosse: { title: "Shop lacrosse gear", description: "Shop gear for lacrosse weekends." },
      baseball_softball: { title: "Shop baseball & softball gear", description: "Gear up for tournament weekend." },
      all_sports: { title: "Shop tournament gear", description: "Find fan gear for your tournament weekend." },
    };
    const picked = copy[sportKey] ?? copy.all_sports;

    const venueId = linkedVenues.length === 1 ? linkedVenues[0].id : linkedVenues[0]?.id ?? undefined;

    const moduleEl = await FanaticsGearModule({
      sport: sportRaw || undefined,
      placement: "gear_module",
      pageType: "tournament_page",
      title: picked.title,
      description: picked.description,
      tournamentId: tournament.id,
      venueId,
    });

    if (!moduleEl) return null;

    return (
      <div style={{ width: "min(720px, 100%)", marginLeft: "auto", marginRight: "auto" }}>
        {moduleEl}
      </div>
    );
  })();

  return (
    <>
      <TournamentDetailStickyMapCta mapHref={mapPreviewHref} mapLabel={mapPrimaryLabel} hotelsHref={null} />

      {showLoggedOutUpsell ? (
        <div style={{ width: "min(720px, 100%)", marginTop: 12, marginLeft: "auto", marginRight: "auto" }}>
          {renderWeekendProUpsell(loggedOutUpsellVariant)}
        </div>
      ) : null}

	      <div style={{ width: "min(720px, 100%)", marginTop: 12, marginLeft: "auto", marginRight: "auto" }}>
	        <TournamentMapTeaser
	          mapHref={mapPreviewHref}
	          hotelsHref={headerHotelsHref}
	          rentalsHref={headerRentalsHref}
	          venueCount={venueCount}
	          primaryVenueName={primaryVenueName}
	          city={tournament.city ?? null}
	          state={tournament.state ?? null}
	        />
	      </div>

      {linkedVenues.length > 0 ? (
        <div
          id="quick-venue-check"
          style={{
            marginTop: 12,
            scrollMarginTop: 90,
            width: "min(720px, 100%)",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          <QuickVenueCheck
            venueId={linkedVenues.length === 1 ? linkedVenues[0].id : undefined}
            venueOptions={linkedVenues.map((v) => ({ id: v.id, name: v.name }))}
            pageType="tournament"
            sourceTournamentId={tournament.id}
            sport={tournament.sport}
          />
        </div>
      ) : null}

      <div
        id="weather-planner"
        style={{ width: "min(720px, 100%)", scrollMarginTop: 90, marginLeft: "auto", marginRight: "auto" }}
      >
        <TournamentWeatherPlannerAccordion
          latitude={bestWeatherLocation.latitude}
          longitude={bestWeatherLocation.longitude}
          city={bestWeatherLocation.city}
          state={bestWeatherLocation.state}
          zip={bestWeatherLocation.zip}
          tournamentStartDate={tournament.start_date}
          tournamentEndDate={tournament.end_date}
        />
      </div>

      {fanGearCard}
      {genericFanaticsModule}

      {/* Noise cleanup: removed orphan “Still planning your stay?” + “Where you’ll play” blocks. */}

      {(() => {
        const officialUrl = String(tournament.official_website_url ?? "").trim();
        const isValidOfficialUrl = /^https?:\/\//i.test(officialUrl);
        const showOrganizerCard = !isDemoTournament && (isValidOfficialUrl || !canEditThisTournament);
        if (!showOrganizerCard) return null;

        return (
          <div style={{ width: "min(720px, 100%)", marginTop: 16, marginLeft: "auto", marginRight: "auto" }}>
            <div style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontWeight: 950 }}>Need organizer details?</div>
              <div style={{ marginTop: 4, fontSize: 13, opacity: 0.9 }}>
                Plan here first, then confirm registration, rules, and schedules with the organizer.
              </div>
              {isValidOfficialUrl ? (
                <div className="detailLinksRow" style={{ marginTop: 10 }}>
                  <a className="secondaryLink" href={`/go/tournament/${resolvedSlug}`} target="_blank" rel="noopener noreferrer">
                    More details from organizer →
                  </a>
                </div>
              ) : null}
              {!canEditThisTournament ? (
                <div style={{ marginTop: 10 }}>
                  <ClaimThisTournament
                    variant="inline"
                    tournamentId={tournament.id}
                    tournamentName={tournament.name}
                    hasDirectorEmailOnFile={hasDirectorEmailOnFile}
                    viewerEmail={viewer.viewerEmail}
                  />
                </div>
              ) : null}
            </div>
          </div>
        );
      })()}

      {displayVenueRows.length > 0 ? (
        <>
          <div
            id="venues"
            className={`detailVenueGrid${displayVenueRows.length === 1 ? " detailVenueGrid--single" : ""}`}
            style={{ marginLeft: "auto", marginRight: "auto", scrollMarginTop: 90 }}
          >
            {displayVenueRows.slice(0, 6).map((row) => {
              const venue = row.venue;
              const location = [venue.city, venue.state].filter(Boolean).join(", ") || "Location TBA";
              const counts = row.counts;
              const countsLine =
                row.hasOwl && counts
                  ? formatOwlCountsLine(counts)
                  : null;

              return (
                <div
                  key={venue.id}
                  className={`detailVenueTile ${row.hasOwl ? "detailVenueTile--withOwl" : ""}`}
                  style={{ textDecoration: "none" }}
                >
                  <Link
                    href={`/venues/${venue.seo_slug || venue.id}?tournament=${encodeURIComponent(tournament.slug ?? paramsSlug)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "grid", gap: 4, color: "inherit", textDecoration: "none" }}
                  >
                    <span className="detailVenueTile__eyebrow">Venue</span>
                    <span className="detailVenueTile__name">{venue.name || "Venue TBA"}</span>
                    <span style={{ fontSize: 12, opacity: 0.85 }}>{location}</span>
                    {countsLine ? <span style={{ fontSize: 12, opacity: 0.82 }}>{countsLine}</span> : null}
                    <span className="detailVenueTile__flag">{row.hasOwl ? `${BRAND_OWL} View venue` : "View venue"}</span>
                  </Link>
                        <div className="detailLinksRow" style={{ marginTop: 8, justifyContent: "center", gap: 10 }}>
                          <a
                            className="secondaryLink"
                            href={buildHotelsHref({
                              venueId: venue.id,
                              tournamentId: tournament.id,
                              source: "tournament_detail",
                              provider: "hotelplanner",
                              latitude: venue.latitude,
                              longitude: venue.longitude,
                            })}
                            target="_blank"
                            rel="noopener noreferrer sponsored"
                          >
                            Hotels near this venue
                          </a>
                    <a
                      className="secondaryLink"
                      href={`/go/vrbo?venueId=${encodeURIComponent(venue.id)}&tournamentId=${encodeURIComponent(tournament.id)}&source=tournament_detail`}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                    >
                      Rentals near this venue
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {displayVenueRows.length > 6 ? (
            <details
              className="detailVenueCollapse"
              style={{ width: "min(720px, 100%)", marginLeft: "auto", marginRight: "auto" }}
            >
              <summary>{`Show all ${displayVenueRows.length} venues`}</summary>
	                <div className="detailVenueCollapse__body">
	                <div className="detailVenueGrid">
	                  {displayVenueRows.slice(6).map((row) => {
	                    const venue = row.venue;
	                    const location = [venue.city, venue.state].filter(Boolean).join(", ") || "Location TBA";
	                    const counts = row.counts;
	                    const countsLine =
	                      row.hasOwl && counts
	                        ? formatOwlCountsLine(counts)
	                        : null;
	
	                    return (
	                      <div
	                        key={venue.id}
	                        className={`detailVenueTile ${row.hasOwl ? "detailVenueTile--withOwl" : ""}`}
	                        style={{ textDecoration: "none" }}
	                      >
	                        <Link
	                          href={`/venues/${venue.seo_slug || venue.id}?tournament=${encodeURIComponent(tournament.slug ?? paramsSlug)}`}
	                          target="_blank"
	                          rel="noopener noreferrer"
	                          style={{ display: "grid", gap: 4, color: "inherit", textDecoration: "none" }}
	                        >
	                          <span className="detailVenueTile__eyebrow">Venue</span>
	                          <span className="detailVenueTile__name">{venue.name || "Venue TBA"}</span>
	                          <span style={{ fontSize: 12, opacity: 0.85 }}>{location}</span>
	                          {countsLine ? <span style={{ fontSize: 12, opacity: 0.82 }}>{countsLine}</span> : null}
	                          <span className="detailVenueTile__flag">{row.hasOwl ? `${BRAND_OWL} View venue` : "View venue"}</span>
	                        </Link>
                          <div className="detailLinksRow" style={{ marginTop: 8, justifyContent: "center", gap: 10 }}>
                            <a
                              className="secondaryLink"
                              href={buildHotelsHref({
                                venueId: venue.id,
                                tournamentId: tournament.id,
                                source: "tournament_detail",
                                provider: "hotelplanner",
                                latitude: venue.latitude,
                                longitude: venue.longitude,
                              })}
                              target="_blank"
                              rel="noopener noreferrer sponsored"
                            >
                              Hotels near this venue
	                          </a>
	                          <a
	                            className="secondaryLink"
	                            href={`/go/vrbo?venueId=${encodeURIComponent(venue.id)}&tournamentId=${encodeURIComponent(tournament.id)}&source=tournament_detail`}
	                            target="_blank"
	                            rel="noopener noreferrer sponsored"
	                          >
	                            Rentals near this venue
	                          </a>
	                        </div>
	                      </div>
	                    );
	                  })}
	                </div>
	              </div>
	            </details>
          ) : null}

          {viewer.isLoggedIn && hasOwlInTournament ? (
            <div style={{ width: "min(720px, 100%)", marginLeft: "auto", marginRight: "auto" }}>
              {renderWeekendProUpsell("owl_eye")}
            </div>
          ) : null}
        </>
      ) : null}

	      {linkedVenues.length === 0 && venueInfo ? (
	        <div className="detailCard" style={{ marginLeft: "auto", marginRight: "auto" }}>
	          <div className="detailCard__title">Venue</div>
	          <div className="detailCard__body">
	            <div className="detailVenueRow">
              <div className="detailVenueText">
                <div className="detailVenueName">{tournament.venue || "Venue TBA"}</div>
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

      <div
        id="where-to-stay"
        style={{
          width: "min(720px, 100%)",
          marginTop: 16,
          scrollMarginTop: 90,
          marginLeft: "auto",
          marginRight: "auto",
        }}
	      >
	        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 950 }}>Stay close to where games are played</h2>
	        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>Most teams stay within 10–15 minutes of their fields.</div>
	        {tournamentHotelsHref && hotelClickVenueId ? (
          <div style={{ marginTop: 10 }}>
            <div className="detailLinksRow" style={{ justifyContent: "center", gap: 12, flexWrap: "wrap" as any }}>
              <a
                className="secondaryLink hotelBookingCta"
                href={tournamentHotelsHref}
                target="_blank"
	                rel="noopener noreferrer sponsored"
	                style={{ minWidth: 260 }}
	              >
	                {stayHotelsLabel}
	              </a>
	              <a
	                className="secondaryLink hotelBookingCta"
	                href={`/go/vrbo?venueId=${encodeURIComponent(hotelClickVenueId)}&tournamentId=${encodeURIComponent(tournament.id)}`}
	                target="_blank"
	                rel="noopener noreferrer sponsored"
	                style={{ minWidth: 260 }}
	              >
	                {stayRentalsLabel}
	              </a>
	            </div>
	          </div>
	        ) : (
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>Hotel options unavailable right now.</div>
        )}
      </div>

      {viewer.isLoggedIn && !hasOwlInTournament ? (
        <div style={{ width: "min(720px, 100%)", marginLeft: "auto", marginRight: "auto" }}>
          {renderWeekendProUpsell("fallback")}
        </div>
      ) : null}

      {tournament.summary ? <p className="detailSummary">{tournament.summary}</p> : null}

      {(() => {
        const stateCode = (tournament.state ?? "").trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(stateCode)) return null;

        const tournamentSlug = String(tournament.slug ?? "").trim() || "unknown";
        const monthLinks = nextMonths(4);
        const upcomingHref = buildDirectoryHref({ state: stateCode, sport: tournament.sport, month: null });
        const titleSport = (tournament.sport ?? "").trim()
          ? `${String(tournament.sport).toLowerCase()} `
          : "";

        return (
          <MoreTournamentsInStateLinks
            tournamentSlug={tournamentSlug}
            stateCode={stateCode}
            sport={String(tournament.sport ?? "")}
            title={`More ${titleSport}tournaments in ${stateCode}`}
            upcomingHref={upcomingHref}
            monthLinks={monthLinks.map((m) => ({
              value: m.value,
              label: m.label,
              href: buildDirectoryHref({ state: stateCode, sport: tournament.sport, month: m.value }),
            }))}
          />
        );
      })()}

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
        Information may change. Verify critical details directly with organizers and venues. <Link href="/terms">Terms</Link> •{" "}
        <Link href="/disclaimer">Disclaimer</Link>
      </p>

      <div style={{ marginTop: 18, fontSize: 13, lineHeight: 1.45, opacity: 0.78 }}>
        {renderSemanticParts(tournamentSemanticParts)}
      </div>

      {showLoggedOut ? (
        <>
          <div className="ti-logged-out-sticky-signup__spacer" aria-hidden="true" />
          <div className="ti-logged-out-sticky-signup" role="region" aria-label="Sign up to save this tournament">
            <div className="ti-logged-out-sticky-signup__copy">Save this tournament + get venue intel</div>
            <Link
              className="ti-logged-out-sticky-signup__cta"
              href={`/signup?returnTo=${encodeURIComponent(`/tournaments/${paramsSlug}`)}`}
            >
              Sign up
            </Link>
          </div>
        </>
      ) : null}
    </>
  );
}

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

function buildHotelsHrefWithSearch(args: {
  venueId: string;
  tournamentId?: string | null;
  ss?: string | null;
  source?: string | null;
  provider?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
}): string {
  const { venueId, tournamentId, ss, source, provider, latitude, longitude } = args;
  const qp = new URLSearchParams({ venueId });
  if (tournamentId) qp.set("tournamentId", tournamentId);
  if (source?.trim()) qp.set("source", source.trim());
  if (provider?.trim()) qp.set("provider", provider.trim());
  const parsedLat = Number(String(latitude ?? "").trim());
  const parsedLng = Number(String(longitude ?? "").trim());
  if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
    qp.set("lat", String(parsedLat));
    qp.set("lng", String(parsedLng));
  }
  const searchDestination = String(ss ?? "").trim();
  if (searchDestination) qp.set("ss", searchDestination);
  return `/go/hotels?${qp.toString()}`;
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
  const dateLabel = formatDate(data.start_date) && formatDate(data.end_date) && formatDate(data.start_date) !== formatDate(data.end_date)
    ? `${formatDate(data.start_date)} – ${formatDate(data.end_date)}`
    : formatDate(data.start_date) || formatDate(data.end_date) || "";
  const whenWhere = [
    dateLabel ? `Dates: ${dateLabel}` : null,
    locationLabel ? `Location: ${locationLabel}` : null,
  ].filter(Boolean).join(" • ");
  const description = `${whenWhere || "Tournament dates and location"} for ${data.name}. Planning links for venues, maps, and travel options when available.`;
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
  const { data, error } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select(
      "id,slug,name,city,state,zip,latitude,longitude,start_date,end_date,summary,source_url,official_website_url,sport,level,tournament_staff_verified,venue,address,static_map_path,static_map_status,static_map_updated_at"
    )
    .eq("slug", params.slug)
    .maybeSingle<TournamentDetailCoreRow>();

  if (error || !data) notFound();
  const viewerContext = loadViewerContext(data.id);
  const TournamentUserActionsComponent = TournamentUserActions as any;
  const TournamentVenueDetailsComponent = TournamentVenueDetails as any;
  const TournamentHeroTrustLineComponent = TournamentHeroTrustLine as any;

  const venueMeta = await (async () => {
    try {
      const { data: rows } = await supabaseAdmin
        .from("tournament_venues" as any)
        .select("venue_id,venues(city,state)")
        .eq("tournament_id", data.id)
        .eq("is_inferred", false);
      const venueRows = ((rows as any[]) ?? []).filter((r) => r?.venue_id);
      const venueCount = venueRows.length;
      const locSet = new Set<string>();
      for (const r of venueRows) {
        const city = String(r?.venues?.city ?? "").trim();
        const state = String(r?.venues?.state ?? "").trim().toUpperCase();
        if (!city || !/^[A-Z]{2}$/.test(state)) continue;
        locSet.add(`${city.toLowerCase()}|${state}`);
      }
      const locationLabel = locSet.size <= 1 ? "Single Location" : "Multiple Locations";
      return { venueCount, locationLabel };
    } catch {
      return { venueCount: 0, locationLabel: null as string | null };
    }
  })();

  const primaryVenueIdForPlan = await (async () => {
    try {
      const { data: link } = await supabaseAdmin
        .from("tournament_venues" as any)
        .select("venue_id,is_primary,created_at")
        .eq("tournament_id", data.id)
        .eq("is_inferred", false)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const venueId = String((link as any)?.venue_id ?? "").trim();
      return venueId || null;
    } catch {
      return null;
    }
  })();

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
  const resolvedSlug = (data.slug ?? params.slug ?? "").toLowerCase();
  const isDemoTournament = resolvedSlug === DEMO_TOURNAMENT_SLUG;
  const showStaffVerified = Boolean(data.tournament_staff_verified) || isDemoTournament;
	  const metroLabel = getMetroMarketLabel(data.state ?? null);
	  const headerIsSingleVenue = venueMeta.venueCount === 1;
	  const headerMapLabel = "View venue map";
	  const headerMapHref = `/tournaments/${encodeURIComponent(data.slug ?? params.slug)}/map`;
	  const headerHotelsHref = buildTournamentHotelsHref({
	    source: "tournament_detail",
	    tournamentId: data.id,
	    city: data.city ?? null,
	    state: data.state ?? null,
	  });
  const headerRentalsHref = buildTournamentVrboHref({
	    source: "tournament_detail",
	    tournamentId: data.id,
	    city: data.city ?? null,
	    state: data.state ?? null,
	  });

  const canonicalUrl = buildCanonicalUrl(data.slug ?? params.slug);
  const sportHubSlugCandidate = normalizeSportSlug(String(data.sport ?? ""));
  const sportHubSlug =
    sportHubSlugCandidate && AVAILABLE_TOURNAMENT_SPORT_HUBS.has(sportHubSlugCandidate) ? sportHubSlugCandidate : null;
  const stateHubSlug = mapStateCodeToSlug(String(data.state ?? ""));
  const stateHubName = mapStateCodeToName(String(data.state ?? ""));
  const sportHubHref = sportHubSlug ? `/tournaments/${sportHubSlug}` : null;
  const stateHubHref = sportHubSlug && stateHubSlug ? `/${sportHubSlug}/${stateHubSlug}` : null;
  const sportHubLabel = sportHubSlug ? sportDisplayName(sportHubSlug) : null;
  const breadcrumbItems = [
    { name: "Home", item: "https://www.tournamentinsights.com/" },
    { name: "Tournaments", item: "https://www.tournamentinsights.com/tournaments" },
    ...(sportHubHref
      ? [
          {
            name: `${sportHubLabel ?? "Sport"} Tournaments`,
            item: `https://www.tournamentinsights.com${sportHubHref}`,
          },
        ]
      : []),
    ...(stateHubHref
      ? [
          {
            name: `${stateHubName ?? String(data.state ?? "").trim()} ${sportHubLabel ?? "Sport"} Tournaments`,
            item: `https://www.tournamentinsights.com${stateHubHref}`,
          },
        ]
      : []),
    { name: data.name, item: canonicalUrl },
  ].map((entry, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: entry.name,
    item: entry.item,
  }));
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: data.name,
    startDate: data.start_date || undefined,
    endDate: data.end_date || undefined,
    url: canonicalUrl,
    location: {
      "@type": "Place",
      name: data.venue || locationLabel || "Tournament venue",
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
  const breadcrumbStructuredData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems,
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
          <script
            type="application/ld+json"
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbStructuredData) }}
          />
          <Link href="/tournaments" className="detailBackLink">
            ← Back to directory
          </Link>
          <TournamentDetailViewTrackerClient tournamentId={data.id} slug={params.slug} sport={data.sport} state={data.state} />
          <h1 className="detailTitle">{data.name}</h1>
          <div className="detailMeta">
            <strong>{(data.sport || "Tournament").toString()}</strong>
            {data.level ? ` • ${data.level}` : ""}
          </div>
          <div className="detailMeta">{dateLabel}</div>
          <div className="detailMeta">{locationLabel}</div>
          {sportHubHref || stateHubHref ? (
            <div className="detailLinksRow" style={{ marginTop: 12, justifyContent: "flex-start", gap: 10 }}>
              {sportHubHref ? <Link href={sportHubHref}>More {sportHubLabel ?? "sport"} tournaments</Link> : null}
              {stateHubHref ? (
                <Link href={stateHubHref}>
                  {(stateHubName ?? String(data.state ?? "").trim()) || "State"} {sportHubLabel ?? "sport"} hub
                </Link>
              ) : null}
            </div>
          ) : null}
          <Suspense fallback={null}>
            <TournamentHeroTrustLineComponent viewerContext={viewerContext} showStaffVerified={showStaffVerified} />
          </Suspense>
	          {venueMeta.venueCount > 0 ? (
	            <div className="detailMeta">
	              {venueMeta.venueCount} venue{venueMeta.venueCount === 1 ? "" : "s"}
	              {venueMeta.locationLabel ? ` • ${venueMeta.locationLabel}` : ""}
	            </div>
	          ) : null}
	          {metroLabel ? <div className="detailMeta">{metroLabel}</div> : null}

		          <Suspense fallback={<div style={{ height: 44 }} />}>
		            <TournamentUserActionsComponent
		              tournament={data}
		              paramsSlug={params.slug}
	              searchParams={searchParams}
	              viewerContext={viewerContext}
                primaryVenueIdForPlan={primaryVenueIdForPlan}
	            />
	          </Suspense>

	          <Suspense fallback={<div style={{ marginTop: 12, opacity: 0.78, fontSize: 13 }}>Loading tournament details…</div>}>
	            <TournamentVenueDetailsComponent
	              tournament={data}
	              paramsSlug={params.slug}
	              locationLabel={locationLabel}
	              mapLinks={mapLinks}
	              venueInfo={venueInfo}
	              venueAddress={venueAddress}
	              viewerContext={viewerContext}
	            />
	          </Suspense>
        </div>
      </section>
    </main>
  );
}
