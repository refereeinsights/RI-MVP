import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildHotelsHref } from "@/lib/booking/venueBooking";
import { parseVenueParam } from "@/lib/weekendShare";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTiTierServer } from "@/lib/entitlementsServer";
import WeekendShareOpenTracker from "./WeekendShareOpenTracker";
import WeekendPlanViewTracker from "./WeekendPlanViewTracker";
import ShareWeekendButton from "@/components/ShareWeekendButton";
import PrintButton from "@/components/PrintButton";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import WeekendPlanningCtasClient from "./WeekendPlanningCtasClient";
import WeekendProUpgradeModalTrigger from "@/components/premium/WeekendProUpgradeModalTrigger";
import DirectionsChooserClient from "./DirectionsChooserClient";
import WeekendNearestAirportClient from "./WeekendNearestAirportClient";
import SaveWeekendPlanClient from "./SaveWeekendPlanClient";
import { getWeekendPlanForTournament } from "@/lib/weekendPlans";

export const runtime = "nodejs";
// Tier-aware page: avoid caching Weekend Pro content across users.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TI_GREEN_DARK = "#0F6E56";
const TI_GREEN_MID = "#1D9E75";
const TI_VENUE_BG = "#f0f7f0";
const TI_VENUE_BORDER = "#c0ddc0";
const TI_GUIDE_BG = "#faf8f5";

type TournamentRow = {
  id: string;
  slug: string | null;
  name: string;
  sport: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
};

type VenueRow = {
  id: string;
  seo_slug: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
};

type OwlsEyeRunRow = {
  id: string;
  run_id?: string | null;
  venue_id: string;
  status: string | null;
  created_at?: string | null;
};

type NearbyRow = {
  place_id: string;
  name: string;
  category: string | null;
  distance_meters: number | null;
  maps_url: string | null;
  is_sponsor?: boolean | null;
  reason_tags?: string[] | null;
};

function parseIsoDateAtLocalMidnight(iso: string | null) {
  if (!iso) return null;
  const raw = String(iso).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatDateRange(startIso: string | null, endIso: string | null) {
  if (!startIso && !endIso) return null;
  try {
    const start = parseIsoDateAtLocalMidnight(startIso);
    const end = parseIsoDateAtLocalMidnight(endIso);
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    if (start && end) return startIso === endIso ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
    return start ? fmt(start) : end ? fmt(end) : null;
  } catch {
    return null;
  }
}

function formatIsoDateShort(iso: string | null) {
  try {
    const d = parseIsoDateAtLocalMidnight(iso);
    if (!d) return null;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return null;
  }
}

function metersToMilesLabel(meters: number | null) {
  if (typeof meters !== "number" || !Number.isFinite(meters)) return null;
  const miles = meters / 1609.344;
  if (miles < 0.1) return "<0.1 mi";
  return `${miles.toFixed(1)} mi`;
}

function sectionIntro(category: string) {
  if (category === "quick_eats") return "Fast, practical food options for short breaks between games.";
  if (category === "hangouts") return "Casual spots where families can relax between games.";
  if (category === "coffee") return "Coffee options near the venue.";
  if (category === "food") return "Nearby team meal candidates near the venue.";
  return null;
}

async function fetchLatestCompleteRun(venueId: string) {
  const { data } = await supabaseAdmin
    .from("owls_eye_runs" as any)
    .select("id,run_id,venue_id,status,created_at")
    .eq("venue_id", venueId)
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<OwlsEyeRunRow>();
  return data ?? null;
}

async function fetchNearbyForRun(runId: string, categories: string[]) {
  if (!categories.length) return [];
  const { data } = await supabaseAdmin
    .from("owls_eye_nearby_food" as any)
    .select("place_id,name,category,distance_meters,maps_url,is_sponsor,reason_tags")
    .eq("run_id", runId)
    .in("category", categories)
    .order("is_sponsor", { ascending: false })
    .order("distance_meters", { ascending: true })
    .order("name", { ascending: true })
    .limit(80);
  return (data as NearbyRow[] | null) ?? [];
}

export async function generateMetadata({ params, searchParams }: { params: { slug: string }; searchParams?: { venue?: string } }) {
  const slug = String(params.slug ?? "").trim();
  if (!slug) return {};

  const { data: tournament } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("id,slug,name,city,state,start_date,end_date,sport")
    .eq("slug", slug)
    .maybeSingle<TournamentRow>();

  if (!tournament?.id) return {};

  const venueParam = parseVenueParam(searchParams?.venue ?? null);
  const venueValue = venueParam.kind === "none" ? null : venueParam.value;
  const venue = venueValue
    ? (await supabaseAdmin
        .from("venues" as any)
        .select("id,seo_slug,name,city,state")
        .or(venueParam.kind === "id" ? `id.eq.${venueValue}` : `seo_slug.eq.${venueValue}`)
        .maybeSingle())?.data ?? null
    : null;

  const title = `${tournament.name} weekend plan | TournamentInsights`;
  const venueName = venue?.name ? String(venue.name) : null;
  const description = venueName
    ? `${tournament.name} at ${venueName}: hotels, vacation rentals, and nearby food for tournament weekend.`
    : `Venues, hotels, vacation rentals, and nearby food for ${tournament.name}.`;

  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: {
      title,
      description,
    },
  };
}

export default async function WeekendPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { venue?: string; source?: string; utm_source?: string; utm_medium?: string };
}) {
  const slug = String(params.slug ?? "").trim();
  if (!slug) notFound();

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const tierInfo = await getTiTierServer(user ?? null);
  const isAuthed = Boolean(user);
  const isUnverified = Boolean(isAuthed && tierInfo.unverified);
  const isWeekendPro = tierInfo.tier === "weekend_pro";
  const canSaveWeekendPlan = Boolean(user?.id && !isUnverified && (tierInfo.tier === "insider" || tierInfo.tier === "weekend_pro"));

  const { data: tournament } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("id,slug,name,sport,city,state,start_date,end_date")
    .eq("slug", slug)
    .maybeSingle<TournamentRow>();

  if (!tournament?.id || !tournament.slug) notFound();

  const venueParam = parseVenueParam(searchParams?.venue ?? null);
  let selectedVenue: VenueRow | null = null;
  let selectedVenueSource: "url" | "plan" | "auto_primary" | "auto_first" | null = null;

  if (venueParam.kind !== "none" && venueParam.value) {
    const venueValue = venueParam.value;
    const venueResp =
      venueParam.kind === "id"
        ? await supabaseAdmin
            .from("venues" as any)
            .select("id,seo_slug,name,address,city,state,zip,latitude,longitude")
            .eq("id", venueValue)
            .maybeSingle<VenueRow>()
        : await supabaseAdmin
            .from("venues" as any)
            .select("id,seo_slug,name,address,city,state,zip,latitude,longitude")
            .eq("seo_slug", venueValue)
            .maybeSingle<VenueRow>();

    selectedVenue = (venueResp.data as VenueRow | null) ?? null;

    // Guardrail: only honor `?venue=` when it belongs to this tournament. Never guess.
    if (selectedVenue?.id) {
      const { data: link } = await supabaseAdmin
        .from("tournament_venues" as any)
        .select("venue_id")
        .eq("tournament_id", tournament.id)
        .eq("venue_id", selectedVenue.id)
        .limit(1)
        .maybeSingle();
      if (!link?.venue_id) {
        selectedVenue = null;
      }
    }

    if (selectedVenue?.id) selectedVenueSource = "url";
  }

  // Weekend plan state (must be loaded before derived computations that depend on selectedVenue).
  const existingPlanRes = canSaveWeekendPlan ? await getWeekendPlanForTournament({ userId: user!.id, tournamentId: tournament.id }) : null;
  const planExists = Boolean(existingPlanRes?.ok && existingPlanRes.plan?.id);
  const planAnchorId = (existingPlanRes?.ok ? existingPlanRes.plan?.selected_venue_id ?? null : null) ?? null;

  // If no valid `?venue=` is selected, but the plan has an anchor, use it as selectedVenue so downstream
  // computations (directions, hotels/rentals, Owl's Eye gating, etc.) work as expected.
  if (!selectedVenue?.id && planAnchorId) {
    const { data: anchorVenue } = await supabaseAdmin
      .from("venues" as any)
      .select("id,seo_slug,name,address,city,state,zip,latitude,longitude")
      .eq("id", planAnchorId)
      .maybeSingle<VenueRow>();
    selectedVenue = (anchorVenue as VenueRow | null) ?? null;
    if (selectedVenue?.id) selectedVenueSource = "plan";
  }

  // Stage 1 adoption improvement: if we still don't have a selected venue, auto-select a sensible default
  // so the planner does not render empty when venue data exists.
  if (!selectedVenue?.id) {
    const { data: defaultLink } = await supabaseAdmin
      .from("tournament_venues" as any)
      .select("venue_id,is_primary,created_at,venues(id,seo_slug,name,address,city,state,zip,latitude,longitude)")
      .eq("tournament_id", tournament.id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const defaultVenue = (defaultLink as any)?.venues as VenueRow | null | undefined;
    if (defaultVenue?.id) {
      selectedVenue = defaultVenue;
      selectedVenueSource = (defaultLink as any)?.is_primary ? "auto_primary" : "auto_first";
    }
  }

  const dateLabel = formatDateRange(tournament.start_date, tournament.end_date);
  const locationLabel = [tournament.city, tournament.state].filter(Boolean).join(", ");

  const { count: venueCount } = await supabaseAdmin
    .from("tournament_venues" as any)
    .select("venue_id", { count: "exact", head: true })
    .eq("tournament_id", tournament.id);

  const venueLabel = selectedVenue ? [selectedVenue.name, selectedVenue.city, selectedVenue.state].filter(Boolean).join(" • ") : null;
  const resolvedVenueKey = selectedVenue?.seo_slug ?? selectedVenue?.id ?? null;
  const selectedVenueAddressLine = selectedVenue
    ? [selectedVenue.address, [selectedVenue.city, selectedVenue.state, selectedVenue.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : null;
  const selectedVenueDirectionsQuery = selectedVenue
    ? [selectedVenue.name, selectedVenue.address, selectedVenue.city, selectedVenue.state, selectedVenue.zip]
        .filter(Boolean)
        .map((s) => String(s).trim())
        .filter(Boolean)
        .join(", ")
    : null;

  const hotelsHref = selectedVenue?.id
    ? buildHotelsHref({ venueId: selectedVenue.id, tournamentId: tournament.id })
    : null;
  const hotelsLabel = selectedVenue?.id ? "Find hotels near the venue" : "Find hotels near this tournament";

  const vrboHrefBase = selectedVenue?.id
    ? `/go/vrbo?venueId=${encodeURIComponent(selectedVenue.id)}&tournamentId=${encodeURIComponent(tournament.id)}&source=weekend_share`
    : null;

  const bookTravelHref = (() => {
    const qp = new URLSearchParams();
    if (tournament.city) qp.set("city", tournament.city);
    if (tournament.state) qp.set("state", tournament.state);
    if (tournament.start_date) qp.set("checkin", tournament.start_date);
    if (tournament.end_date) qp.set("checkout", tournament.end_date);
    const qs = qp.toString();
    return qs ? `/book-travel?${qs}` : "/book-travel";
  })();

  const selectedVenueId = selectedVenue?.id ?? null;
  // Saved-state should be "venue-match", not merely "plan exists".
  const initialSaved = planExists && Boolean(selectedVenueId) && planAnchorId === selectedVenueId;

  const planLodging = (() => {
    const plan = existingPlanRes?.ok ? existingPlanRes.plan : null;
    return {
      name: (plan as any)?.lodging_name ?? null,
      address: (plan as any)?.lodging_address ?? null,
      checkIn: (plan as any)?.check_in_date ?? null,
      checkOut: (plan as any)?.check_out_date ?? null,
    } as { name: string | null; address: string | null; checkIn: string | null; checkOut: string | null };
  })();
  const hasPlanLodging = Boolean(
    String(planLodging.name ?? "").trim() || String(planLodging.address ?? "").trim() || String(planLodging.checkIn ?? "").trim() || String(planLodging.checkOut ?? "").trim(),
  );

  // Weekend Guide cached places (if we have a selected venue + a complete run).
  const categories = ["coffee", "food", "quick_eats", "hangouts"];
  // Guardrail: avoid fetching full Owl's Eye / nearby lists for non-Weekend Pro viewers.
  const run = selectedVenue?.id && isWeekendPro ? await fetchLatestCompleteRun(selectedVenue.id) : null;
  const runId = run ? (run.run_id ?? run.id) : null;
  const nearby = runId ? await fetchNearbyForRun(runId as string, categories) : [];

  const placesByCategory = new Map<string, NearbyRow[]>();
  for (const row of nearby) {
    const cat = (row.category ?? "").toLowerCase();
    if (!cat) continue;
    if (!placesByCategory.has(cat)) placesByCategory.set(cat, []);
    placesByCategory.get(cat)!.push(row);
  }

  const categoriesWithRows = categories.filter((cat) => (placesByCategory.get(cat)?.length ?? 0) > 0);
  const defaultOpenCategory = categoriesWithRows.includes("quick_eats")
    ? "quick_eats"
    : categoriesWithRows.includes("food")
      ? "food"
      : categoriesWithRows.includes("coffee")
        ? "coffee"
        : categoriesWithRows[0] ?? null;

  const shareSource = (String(searchParams?.source ?? "").trim().toLowerCase() === "share" ||
    String(searchParams?.utm_source ?? "").trim().toLowerCase() === "share")
    ? "share"
    : "unknown";
  const weekendPlanSourcePage = (() => {
    const source = String(searchParams?.source ?? "").trim().toLowerCase();
    if (source === "tournament_detail") return "tournament_detail" as const;
    if (!source) return "direct" as const;
    return "unknown" as const;
  })();

  const returnTo = (() => {
    const qp = new URLSearchParams();
    if (searchParams?.venue) qp.set("venue", String(searchParams.venue));
    if (searchParams?.source) qp.set("source", String(searchParams.source));
    if (searchParams?.utm_source) qp.set("utm_source", String(searchParams.utm_source));
    if (searchParams?.utm_medium) qp.set("utm_medium", String(searchParams.utm_medium));
    const qs = qp.toString();
    return encodeURIComponent(qs ? `/weekend/${encodeURIComponent(tournament.slug)}?${qs}` : `/weekend/${encodeURIComponent(tournament.slug)}`);
  })();

  const googleSearchHref = selectedVenueDirectionsQuery
    ? `https://www.google.com/search?q=${encodeURIComponent(selectedVenueDirectionsQuery)}`
    : null;

  return (
    <main className="ti-shell" style={{ paddingBottom: 40 }}>
      <WeekendPlanViewTracker
        tournamentId={tournament.id}
        tournamentSlug={tournament.slug}
        sourcePage={weekendPlanSourcePage}
        hasExistingPlan={planExists}
      />
      <WeekendShareOpenTracker
        tournamentSlug={tournament.slug}
        venue={resolvedVenueKey}
        source={shareSource}
        utm_source={searchParams?.utm_source ?? null}
        utm_medium={searchParams?.utm_medium ?? null}
      />

      <section className="bodyCard" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>
            Your tournament weekend in one link
          </div>
          <h1 style={{ margin: 0 }}>{tournament.name}</h1>
          {dateLabel ? <div style={{ color: "#334155", fontWeight: 700 }}>{dateLabel}</div> : null}
          {tournament.sport || locationLabel ? (
            <div style={{ color: "#475569", fontWeight: 700 }}>
              {[tournament.sport, locationLabel].filter(Boolean).join(" • ")}
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 6, padding: "12px 12px", borderRadius: 14, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.07em", textTransform: "uppercase", color: "#0f172a" }}>
            Weekend snapshot
          </div>
          <div style={{ marginTop: 6, display: "grid", gap: 4, color: "#475569", fontWeight: 700, fontSize: 13 }}>
            {tournament.sport ? <div>Sport: {tournament.sport}</div> : null}
            {dateLabel ? <div>Dates: {dateLabel}</div> : null}
            {locationLabel ? <div>Location: {locationLabel}</div> : null}
            {selectedVenue ? <div>Venue: {venueLabel}</div> : <div>Venue: Choose a venue on the map for the best results</div>}
            <div>Venue map: Available</div>
            {selectedVenue ? (
              <div>
                Nearby options:{" "}
                {isWeekendPro ? (runId && nearby.length ? "Available (cached)" : "Not available yet") : "Weekend Pro preview"}
              </div>
            ) : (
              <div>Nearby options: Select a venue</div>
            )}
          </div>
        </div>

        {selectedVenue ? (
          <div style={{ marginTop: 4, padding: "12px 12px", borderRadius: 14, border: `1px solid ${TI_VENUE_BORDER}`, background: TI_VENUE_BG }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.07em", textTransform: "uppercase", color: TI_GREEN_DARK }}>
              Planning around
            </div>
            <div style={{ marginTop: 2, fontWeight: 900, color: "#0b1f14", fontSize: 16 }}>{selectedVenue.name ?? "Venue"}</div>
            {selectedVenueSource === "auto_primary" ? (
              <div style={{ marginTop: 4, color: "#334155", fontWeight: 800, fontSize: 13 }}>
                Primary venue selected. You can switch venues below.
              </div>
            ) : selectedVenueSource === "auto_first" ? (
              <div style={{ marginTop: 4, color: "#334155", fontWeight: 800, fontSize: 13 }}>
                Venue selected. You can switch venues below.
              </div>
            ) : null}
            <div style={{ marginTop: 4, color: "#334155", fontWeight: 750, fontSize: 13, lineHeight: 1.45 }}>
              {isWeekendPro
                ? "Owl’s Eye is showing nearby food, coffee, quick eats, and hangouts for this tournament weekend."
                : "Owl’s Eye preview covers nearby planning categories around this venue."}
            </div>
            <div style={{ marginTop: 4, color: "#475569", fontWeight: 700, fontSize: 13 }}>
              Use this venue as your anchor for hotels, directions, and nearby options.
            </div>
            {typeof venueCount === "number" && venueCount > 1 ? (
              <div style={{ marginTop: 6, color: "#475569", fontWeight: 700, fontSize: 13 }}>
                This tournament has multiple venues. You can change your planning venue from the map.
              </div>
            ) : null}
            {selectedVenueAddressLine ? (
              <div style={{ marginTop: 4, color: "#475569", fontWeight: 700, fontSize: 13 }}>{selectedVenueAddressLine}</div>
            ) : null}
            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {selectedVenueDirectionsQuery ? (
                <DirectionsChooserClient
                  label="Directions"
                  className="primaryLink ti-print-hide"
                  title="Directions"
                  destinationLabel={[selectedVenue.name, selectedVenue.city, selectedVenue.state].filter(Boolean).join(" • ") || "Tournament venue"}
                  query={selectedVenueDirectionsQuery}
                  coordinates={
                    typeof selectedVenue.latitude === "number" && typeof selectedVenue.longitude === "number"
                      ? { lat: selectedVenue.latitude, lng: selectedVenue.longitude }
                      : null
                  }
                  copyText={selectedVenueAddressLine}
                  analytics={{
                    event: "weekend_share_directions_clicked",
                    properties: {
                      page_type: "weekend_share",
                      tournament_id: tournament.id,
                      tournament_slug: tournament.slug,
                      venue_id: selectedVenue.id,
                      venue_name: selectedVenue.name ?? null,
                      source_page: "weekend_share",
                      cta: "directions",
                    },
                  }}
                />
              ) : null}

              <Link className="secondaryLink ti-print-hide" href={`/tournaments/${encodeURIComponent(tournament.slug)}/map`}>
                Change venue →
              </Link>

              {googleSearchHref ? (
                <a className="secondaryLink ti-print-hide" href={googleSearchHref} target="_blank" rel="noopener noreferrer">
                  Search Google →
                </a>
              ) : null}
            </div>

            <SaveWeekendPlanClient
              initialSaved={initialSaved}
              planExists={planExists}
              tournamentId={tournament.id}
              tournamentSlug={tournament.slug}
              selectedVenueId={selectedVenueId}
              canSave={canSaveWeekendPlan}
              isAuthed={isAuthed}
              isUnverified={isUnverified}
              plannerHref="/weekend-planner"
            />

            {canSaveWeekendPlan && planExists ? (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(15, 61, 46, 0.14)", display: "grid", gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.07em", textTransform: "uppercase", color: "#0b1f14" }}>
                  Lodging
                </div>
                {hasPlanLodging ? (
                  <div style={{ color: "#475569", fontWeight: 700, fontSize: 13, lineHeight: 1.45 }}>
                    {[planLodging.name, planLodging.address].filter(Boolean).join(" • ")}
                    {[planLodging.checkIn, planLodging.checkOut].filter(Boolean).length ? (
                      <span>
                        {" "}
                        •{" "}
                        {[planLodging.checkIn, planLodging.checkOut]
                          .filter(Boolean)
                          .map((d) => formatIsoDateShort(String(d)))
                          .filter(Boolean)
                          .join(" - ")}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ color: "#475569", fontWeight: 700, fontSize: 13, lineHeight: 1.45 }}>
                    Already booked or know where you’re staying? Add your hotel or rental details to keep this weekend plan organized.
                  </div>
                )}
                <div>
                  <Link className="secondaryLink" href="/weekend-planner">
                    Edit in Weekend Planner →
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ marginTop: 4, padding: "12px 12px", borderRadius: 14, border: "1px solid #e2e8f0", background: "#ffffff" }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.07em", textTransform: "uppercase", color: "#0f172a" }}>
              Choose a venue
            </div>
            <div style={{ marginTop: 4, color: "#475569", fontWeight: 700, fontSize: 13 }}>
              For the best hotel/rental search, open the venue map and select where you’ll play.
            </div>
            <div style={{ marginTop: 10 }}>
              <Link className="primaryLink" href={`/tournaments/${encodeURIComponent(tournament.slug)}/map`}>
                Open venue map →
              </Link>
            </div>

            <SaveWeekendPlanClient
              initialSaved={initialSaved}
              planExists={planExists}
              tournamentId={tournament.id}
              tournamentSlug={tournament.slug}
              selectedVenueId={null}
              canSave={canSaveWeekendPlan}
              isAuthed={isAuthed}
              isUnverified={isUnverified}
              plannerHref="/weekend-planner"
            />

            {canSaveWeekendPlan && planExists ? (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0", display: "grid", gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.07em", textTransform: "uppercase", color: "#0f172a" }}>
                  Lodging
                </div>
                {hasPlanLodging ? (
                  <div style={{ color: "#475569", fontWeight: 700, fontSize: 13, lineHeight: 1.45 }}>
                    {[planLodging.name, planLodging.address].filter(Boolean).join(" • ")}
                    {[planLodging.checkIn, planLodging.checkOut].filter(Boolean).length ? (
                      <span>
                        {" "}
                        •{" "}
                        {[planLodging.checkIn, planLodging.checkOut]
                          .filter(Boolean)
                          .map((d) => formatIsoDateShort(String(d)))
                          .filter(Boolean)
                          .join(" - ")}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ color: "#475569", fontWeight: 700, fontSize: 13, lineHeight: 1.45 }}>
                    Already booked or know where you’re staying? Add your hotel or rental details to keep this weekend plan organized.
                  </div>
                )}
                <div>
                  <Link className="secondaryLink" href="/weekend-planner">
                    Edit in Weekend Planner →
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        )}

        <div style={{ display: "grid", gap: 10, marginTop: 2 }}>
          <div
            className="ti-print-hide"
            style={{ fontSize: 11, fontWeight: 900, color: "#0f172a", letterSpacing: "0.07em", textTransform: "uppercase" }}
          >
            Plan your stay
          </div>
          <div className="ti-print-hide">
            <WeekendPlanningCtasClient
              tournamentId={tournament.id}
              tournamentSlug={tournament.slug}
              venueMapHref={`/tournaments/${encodeURIComponent(tournament.slug)}/map`}
              bookTravelHref={bookTravelHref}
              hotelsHref={hotelsHref ? `${hotelsHref}&source=weekend_share` : null}
              hotelsLabel={hotelsLabel}
              rentalsHref={vrboHrefBase}
              plannerHubHref="/weekend-planner"
            />
          </div>
          <div className="ti-print-hide">
            <AffiliateDisclosure>
              Travel links may earn TournamentInsights a commission at no extra cost to you.
            </AffiliateDisclosure>
          </div>
          <div className="ti-print-hide" style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <PrintButton label="Print weekend plan" className="secondaryLink" />
            <ShareWeekendButton
              tournamentSlug={tournament.slug}
              tournamentName={tournament.name}
              venueLabel={selectedVenue?.name ?? null}
              venue={resolvedVenueKey}
              sourcePage="weekend_page"
              buttonLabel="Share this plan"
              className="secondaryLink"
            />
            <Link className="secondaryLink" href={`/tournaments/${encodeURIComponent(tournament.slug)}`}>
              Back to tournament →
            </Link>
          </div>
        </div>

        {selectedVenue ? (
          <div style={{ display: "grid", gap: 12, marginTop: 6, padding: "12px 12px", borderRadius: 16, background: TI_GUIDE_BG, border: "1px solid rgba(15, 23, 42, 0.08)" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Weekend Guide</h2>
            {isWeekendPro ? (
              <div style={{ color: "#475569", fontWeight: 650 }}>
                Nearby options cached by Owl’s Eye. Use these as planning ideas (not live availability).
              </div>
            ) : (
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: "10px 12px", background: "#ffffff" }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}>Nearby venue intelligence</div>
                <div style={{ marginTop: 6, color: "#475569", fontWeight: 700, fontSize: 13, lineHeight: 1.45 }}>
                  {isUnverified
                    ? "Verify your email to save this weekend plan. Weekend Pro unlocks the full Owl’s Eye view for this venue."
                    : isAuthed
                      ? "Upgrade to Weekend Pro for full nearby planning picks."
                      : "Create a free Insider account to save this weekend plan. Weekend Pro unlocks the full Owl’s Eye view for this venue."}
                </div>
                <div style={{ marginTop: 10, display: "grid", gap: 6, color: "#475569", fontWeight: 750, fontSize: 13 }}>
                  <div>Coffee nearby</div>
                  <div>Quick eats</div>
                  <div>Team meals</div>
                  <div>Parent hangouts</div>
                </div>
                <div style={{ marginTop: 10 }}>
                  {isUnverified ? (
                    <span className="secondaryLink" style={{ display: "inline-block" }}>
                      Check your inbox →
                    </span>
                  ) : isAuthed ? (
                    <WeekendProUpgradeModalTrigger
                      className="secondaryLink"
                      label="Unlock venue intelligence"
                      source_page="weekend_page"
                      source_context="weekend_nearby_locked"
                      tournament_slug={tournament.slug}
                      venue_slug={selectedVenue.seo_slug ?? null}
                      entry_point="weekend_share_nearby_locked"
                      user_tier={tierInfo.tier}
                    />
                  ) : (
                    <Link className="secondaryLink" href={`/signup?returnTo=${returnTo}`}>
                      Create account →
                    </Link>
                  )}
                </div>
              </div>
            )}

	            {isWeekendPro
	              ? categories.map((cat) => {
	                  const rows = placesByCategory.get(cat) ?? [];
	                  const title =
	                    cat === "quick_eats"
	                      ? "Quick Eats"
	                      : cat === "hangouts"
	                        ? "Parent Hangouts"
	                        : cat === "coffee"
	                          ? "Coffee"
	                          : "Team Meals";
	                  const emptyState =
	                    cat === "coffee"
	                      ? "No coffee spots cached near this venue yet."
	                      : cat === "quick_eats"
	                        ? "No quick eats cached near this venue yet."
	                        : cat === "hangouts"
	                          ? "No parent hangouts cached near this venue yet."
	                          : "No team meal spots cached near this venue yet.";
	                  return (
	                    <details
	                      key={cat}
	                      className="ti-owls-details"
	                      open={Boolean(defaultOpenCategory && cat === defaultOpenCategory)}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 14,
                        padding: "10px 12px",
                        background: "#ffffff",
                      }}
                    >
                      <summary style={{ listStyle: "none", cursor: "pointer" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: "#0f172a" }}>{title}</h3>
                        </div>
                        {sectionIntro(cat) ? (
                          <div style={{ marginTop: 6, color: "#475569", fontWeight: 650, fontSize: 13 }}>
                            {sectionIntro(cat)}
                          </div>
                        ) : null}
	                      </summary>

	                      {rows.length ? (
	                        <ul style={{ margin: "10px 0 0 0", paddingLeft: 18, display: "grid", gap: 8 }}>
	                          {rows.slice(0, 12).map((row) => (
	                            <li key={row.place_id}>
	                              <div style={{ fontWeight: 850, color: "#0f172a" }}>{row.name}</div>
	                              <div style={{ marginTop: 2, fontSize: 12, color: "#475569" }}>
	                                {[metersToMilesLabel(row.distance_meters)].filter(Boolean).join(" • ")}
	                                {selectedVenueDirectionsQuery ? (
	                                  <>
	                                    {" "}
	                                    <DirectionsChooserClient
	                                      label="Directions →"
	                                      className="secondaryLink ti-print-hide"
	                                      title="Directions"
	                                      destinationLabel={row.name}
	                                      query={[row.name, selectedVenueAddressLine].filter(Boolean).join(", ")}
	                                      coordinates={null}
	                                      copyText={[row.name, selectedVenueAddressLine].filter(Boolean).join(", ")}
	                                      analytics={{
	                                        event: "weekend_share_owls_eye_directions_clicked",
	                                        properties: {
	                                          page_type: "weekend_share",
	                                          tournament_id: tournament.id,
	                                          tournament_slug: tournament.slug,
	                                          venue_id: selectedVenue.id,
	                                          venue_name: selectedVenue.name ?? null,
	                                          source_page: "weekend_share",
	                                          cta: "owls_eye_directions",
	                                          place_id: row.place_id,
	                                          place_name: row.name,
	                                        },
	                                      }}
	                                    />
	                                  </>
	                                ) : row.maps_url ? (
	                                  <>
	                                    {" "}
	                                    <a className="ti-print-hide" href={row.maps_url} target="_blank" rel="noopener noreferrer">
	                                      Directions →
	                                    </a>
	                                  </>
	                                ) : null}
	                              </div>
	                            </li>
	                          ))}
	                        </ul>
	                      ) : (
	                        <div style={{ marginTop: 10, fontSize: 13, color: "#475569", fontWeight: 650 }}>{emptyState}</div>
	                      )}
	                    </details>
	                  );
	                })
	              : null}
          </div>
        ) : null}

        {selectedVenue ? (
          <WeekendNearestAirportClient
            venue={{
              id: selectedVenue.id,
              name: selectedVenue.name ?? null,
              city: selectedVenue.city ?? null,
              state: selectedVenue.state ?? null,
              latitude: selectedVenue.latitude ?? null,
              longitude: selectedVenue.longitude ?? null,
            }}
            tournament={{
              id: tournament.id,
              slug: tournament.slug,
              name: tournament.name,
            }}
            bookTravelHref={bookTravelHref}
          />
        ) : null}
      </section>
    </main>
  );
}
