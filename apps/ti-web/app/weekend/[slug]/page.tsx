import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildHotelsHref } from "@/lib/booking/venueBooking";
import { parseVenueParam } from "@/lib/weekendShare";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTiTierServer } from "@/lib/entitlementsServer";
import WeekendShareOpenTracker from "./WeekendShareOpenTracker";
import ShareWeekendButton from "@/components/ShareWeekendButton";
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

function formatDateRange(startIso: string | null, endIso: string | null) {
  if (!startIso && !endIso) return null;
  try {
    const start = startIso ? new Date(startIso) : null;
    const end = endIso ? new Date(endIso) : null;
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    if (start && end) return startIso === endIso ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
    return start ? fmt(start) : end ? fmt(end) : null;
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
  if (category === "food") return "Nearby food options near the venue.";
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

  const vrboHrefBase = selectedVenue?.id
    ? `/go/vrbo?venueId=${encodeURIComponent(selectedVenue.id)}&tournamentId=${encodeURIComponent(tournament.id)}&source=weekend_share`
    : null;

  const bookTravelHref = (() => {
    const qp = new URLSearchParams();
    if (tournament.city) qp.set("city", tournament.city);
    if (tournament.state) qp.set("state", tournament.state);
    const qs = qp.toString();
    return qs ? `/book-travel?${qs}` : "/book-travel";
  })();

  const selectedVenueId = selectedVenue?.id ?? null;
  // Saved-state should be "venue-match", not merely "plan exists".
  const initialSaved = planExists && Boolean(selectedVenueId) && planAnchorId === selectedVenueId;

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

  const shareSource = (String(searchParams?.source ?? "").trim().toLowerCase() === "share" ||
    String(searchParams?.utm_source ?? "").trim().toLowerCase() === "share")
    ? "share"
    : "unknown";

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
          <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}>Weekend snapshot</div>
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
          <div style={{ marginTop: 4, padding: "12px 12px", borderRadius: 14, border: "1px solid #e2e8f0", background: "#ffffff" }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}>Planning around</div>
            <div style={{ marginTop: 2, fontWeight: 850, color: "#0f172a" }}>{selectedVenue.name ?? "Venue"}</div>
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
            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {selectedVenueDirectionsQuery ? (
                <DirectionsChooserClient
                  label="Directions"
                  className="primaryLink"
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

              <Link className="secondaryLink" href={`/tournaments/${encodeURIComponent(tournament.slug)}/map`}>
                Change venue →
              </Link>

              {googleSearchHref ? (
                <a className="secondaryLink" href={googleSearchHref} target="_blank" rel="noopener noreferrer">
                  Search Google →
                </a>
              ) : null}
            </div>

            <SaveWeekendPlanClient
              initialSaved={initialSaved}
              planExists={planExists}
              tournamentId={tournament.id}
              selectedVenueId={selectedVenueId}
              canSave={canSaveWeekendPlan}
              isAuthed={isAuthed}
              isUnverified={isUnverified}
              plannerHref="/weekend-planner"
            />
          </div>
        ) : (
          <div style={{ marginTop: 4, padding: "12px 12px", borderRadius: 14, border: "1px solid #e2e8f0", background: "#ffffff" }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}>Choose a venue</div>
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
              selectedVenueId={null}
              canSave={canSaveWeekendPlan}
              isAuthed={isAuthed}
              isUnverified={isUnverified}
              plannerHref="/weekend-planner"
            />
          </div>
        )}

        <div style={{ display: "grid", gap: 10, marginTop: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Plan your stay
          </div>
          <WeekendPlanningCtasClient
            tournamentId={tournament.id}
            tournamentSlug={tournament.slug}
            venueMapHref={`/tournaments/${encodeURIComponent(tournament.slug)}/map`}
            bookTravelHref={bookTravelHref}
            hotelsHref={hotelsHref ? `${hotelsHref}&source=weekend_share` : null}
            rentalsHref={vrboHrefBase}
            plannerHubHref="/weekend-planner"
          />
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
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
          <div style={{ display: "grid", gap: 12 }}>
            <h2 style={{ margin: "10px 0 0 0", fontSize: 18 }}>Weekend Guide</h2>
            {isWeekendPro ? (
              <div style={{ color: "#475569", fontWeight: 650 }}>
                Nearby options cached by Owl’s Eye. Use these as planning ideas (not live availability).
              </div>
            ) : (
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: "10px 12px", background: "#ffffff" }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}>Nearby venue intelligence</div>
                <div style={{ marginTop: 6, color: "#475569", fontWeight: 700, fontSize: 13, lineHeight: 1.45 }}>
                  {isUnverified
                    ? "Confirm your email to unlock Insider saved planning tools. Weekend Pro unlocks deeper venue intelligence as tools roll out."
                    : isAuthed
                      ? "Weekend Pro unlocks deeper Owl’s Eye venue intelligence and advanced logistics tools as they roll out."
                      : "Sign in with a verified account to save tournaments and keep planning links in one place. Weekend Pro unlocks deeper venue intelligence as tools roll out."}
                </div>
                <div style={{ marginTop: 10, display: "grid", gap: 6, color: "#475569", fontWeight: 750, fontSize: 13 }}>
                  <div>Coffee nearby</div>
                  <div>Quick eats</div>
                  <div>Food options</div>
                  <div>Family hangouts</div>
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
                  if (!rows.length) return null;
                  return (
                    <section
                      key={cat}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 14,
                        padding: "10px 12px",
                        background: "#ffffff",
                      }}
                    >
                      <h3 style={{ margin: 0, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {cat === "quick_eats"
                          ? "Quick Eats"
                          : cat === "hangouts"
                            ? "Family-Friendly Hangouts"
                            : cat === "coffee"
                              ? "Coffee"
                              : "Food"}
                      </h3>
                      {sectionIntro(cat) ? (
                        <div style={{ marginTop: 6, color: "#475569", fontWeight: 650, fontSize: 13 }}>
                          {sectionIntro(cat)}
                        </div>
                      ) : null}
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
                                    className="secondaryLink"
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
                                  <a href={row.maps_url} target="_blank" rel="noopener noreferrer">
                                    Directions →
                                  </a>
                                </>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
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
