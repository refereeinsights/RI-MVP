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
import ClaimThisTournament from "@/components/tournaments/ClaimThisTournament";
import { canEditTournament } from "@/lib/tournamentClaim";
import { saveClaimedTournamentEdits } from "./actions";
import { formatEntityList, type SemanticListItem, type SemanticListPart } from "../../../../../shared/semantic/formatEntityList";
import "../tournaments.css";

type TournamentDetailCoreRow = {
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
  venue: string | null;
  address: string | null;
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
}: {
  tournament: TournamentDetailCoreRow;
  paramsSlug: string;
  searchParams?: { claim?: string; saved?: string };
  viewerContext: Promise<ViewerContext>;
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
      <SaveTournamentButton
        tournamentId={tournament.id}
        initialSaved={viewer.initialSaved}
        isLoggedIn={viewer.isLoggedIn}
        isVerified={viewer.isVerified}
        returnTo={`/tournaments/${tournament.slug ?? paramsSlug}`}
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
      ) : (
        <div style={{ marginTop: 12 }}>
          <ClaimThisTournament
            tournamentId={tournament.id}
            tournamentName={tournament.name}
            hasDirectorEmailOnFile={hasDirectorEmailOnFile}
            viewerEmail={viewer.viewerEmail}
          />
        </div>
      )}

      {tournament.official_website_url && !isDemoTournament ? (
        <div className="detailLinksRow">
          <a className="secondaryLink" href={tournament.official_website_url} target="_blank" rel="noopener noreferrer">
            Official site
          </a>
        </div>
      ) : null}
    </>
  );
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
  const canViewPremiumDetails = viewer.isPaid || isDemoTournament;

  const { data: venueLinksRaw } = await supabaseAdmin
    .from("tournament_venues" as any)
    .select(
      "venue_id,is_primary,created_at,venues(id,seo_slug,name,city,state)"
    )
    .eq("tournament_id", tournament.id)
    .eq("is_inferred", false)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  const linkedVenues: LinkedVenue[] = ((venueLinksRaw as any[]) ?? [])
    .map((row: any) => row?.venues ?? null)
    .filter((v: any): v is LinkedVenue => Boolean(v && typeof v.id === "string"));

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

    hasOwlsEyeByVenueId = new Map(
      Array.from(latestRunByVenue.entries()).map(([venueId, run]) => {
        const runId = (run.run_id ?? run.id) as string;
        const counts = countsByRunId.get(runId) ?? { food: 0, coffee: 0, hotels: 0, sporting_goods: 0 };
        return [venueId, counts.food + counts.coffee + counts.hotels + counts.sporting_goods > 0] as const;
      })
    );
  }

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

  return (
    <>
      {linkedVenues.length > 0 ? (
        <div className={`detailVenueGrid${linkedVenues.length === 1 ? " detailVenueGrid--single" : ""}`}>
          {linkedVenues.map((venue) => (
            <Link
              key={venue.id}
              href={`/venues/${venue.seo_slug || venue.id}?tournament=${encodeURIComponent(tournament.slug ?? paramsSlug)}`}
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
            sourceTournamentId={tournament.id}
            sport={tournament.sport}
          />
        </div>
      ) : venueInfo ? (
        <div className="detailCard">
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

      {tournament.summary ? <p className="detailSummary">{tournament.summary}</p> : null}

      {(() => {
        const stateCode = (tournament.state ?? "").trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(stateCode)) return null;

        const monthLinks = nextMonths(4);
        const upcomingHref = buildDirectoryHref({ state: stateCode, sport: tournament.sport, month: null });
        const titleSport = (tournament.sport ?? "").trim()
          ? `${String(tournament.sport).toLowerCase()} `
          : "";

        return (
          <div className="detailCard">
            <div className="detailCard__title">More {titleSport}tournaments in {stateCode}</div>
            <div className="detailCard__body">
              <div className="detailLinksRow">
                <Link className="secondaryLink" href={upcomingHref}>
                  View upcoming
                </Link>
              </div>
              <div className="detailLinksRow">
                {monthLinks.map((m) => (
                  <Link
                    key={m.value}
                    className="secondaryLink detailLinkSmall"
                    href={buildDirectoryHref({ state: stateCode, sport: tournament.sport, month: m.value })}
                  >
                    {m.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
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
            {viewer.needsEmailVerification ? (
              <p className="premiumDetailCard__copy" style={{ marginTop: 6 }}>
                Verify your email to unlock Insider access first. <Link href="/verify-email">Verify email</Link>
              </p>
            ) : viewer.tier === "explorer" ? (
              <p className="premiumDetailCard__copy" style={{ marginTop: 6 }}>
                Log in for Insider access. <Link href="/login">Log in</Link> or <Link href="/signup">sign up</Link>.
              </p>
            ) : null}
            <div className="detailLinksRow">
              <Link className="secondaryLink" href="/pricing">
                Upgrade
              </Link>
            </div>
            <PremiumInterestForm initialEmail={viewer.viewerEmail} />
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
  const { data, error } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("id,slug,name,city,state,zip,start_date,end_date,summary,source_url,official_website_url,sport,level,tournament_staff_verified,venue,address")
    .eq("slug", params.slug)
    .maybeSingle<TournamentDetailCoreRow>();

  if (error || !data) notFound();
  const viewerContext = loadViewerContext(data.id);
  const TournamentUserActionsComponent = TournamentUserActions as any;
  const TournamentVenueDetailsComponent = TournamentVenueDetails as any;

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
          <div className="detailMeta">
            <strong>{(data.sport || "Tournament").toString()}</strong>
            {data.level ? ` • ${data.level}` : ""}
          </div>
          <div className="detailMeta">{dateLabel}</div>
          <div className="detailMeta">{locationLabel}</div>
          {metroLabel ? <div className="detailMeta">{metroLabel}</div> : null}

          <div
            style={{
              marginTop: 10,
              display: "grid",
              gap: 4,
              justifyItems: "center",
              textAlign: "center",
              maxWidth: 520,
            }}
          >
            <div style={{ fontWeight: 900, letterSpacing: "-0.01em" }}>Track this tournament</div>
            <div style={{ fontSize: 13, opacity: 0.92 }}>Get email updates and quick access.</div>
          </div>

	          <Suspense fallback={<div style={{ height: 44 }} />}>
	            <TournamentUserActionsComponent
	              tournament={data}
	              paramsSlug={params.slug}
	              searchParams={searchParams}
	              viewerContext={viewerContext}
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
