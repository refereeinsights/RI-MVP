import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { BRAND_OWL } from "@/lib/brand";
import { canAccessWeekendPro, getTier } from "@/lib/entitlements";
import { getVenueCardClassFromSports } from "../sportSurface";
import "../../tournaments/tournaments.css";

type LinkedTournament = {
  id: string;
  slug: string | null;
  name: string | null;
  sport: string | null;
  start_date: string | null;
  end_date: string | null;
};

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  venue_url: string | null;
  sport: string | null;
  tournament_venues?: {
    tournaments?: LinkedTournament | null;
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

type NearbyPlaceRow = {
  run_id: string;
  category: string | null;
  name: string;
  distance_meters: number | null;
  maps_url: string | null;
  is_sponsor: boolean | null;
  sponsor_click_url?: string | null;
};

type NearbyPlace = {
  name: string;
  distance_meters: number | null;
  maps_url: string | null;
  is_sponsor: boolean;
  sponsor_click_url: string | null;
};

function canonicalSport(sport: string | null | undefined) {
  const key = (sport ?? "").trim().toLowerCase();
  return key || "unknown";
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function buildMapLinks(query: string) {
  const encoded = encodeURIComponent(query);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    apple: `https://maps.apple.com/?q=${encoded}`,
    waze: `https://waze.com/ul?q=${encoded}&navigate=yes`,
  };
}

function metersToMilesLabel(meters: number | null | undefined) {
  if (typeof meters !== "number" || !Number.isFinite(meters)) return null;
  const miles = meters / 1609.344;
  return `${miles.toFixed(1)} mi`;
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

export const revalidate = 300;

export default async function VenueDetailsPage({ params }: { params: { venueId: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: entitlementProfile } = user
    ? await supabase
        .from("ti_users" as any)
        .select("plan,subscription_status")
        .eq("id", user.id)
        .maybeSingle<{ plan: string | null; subscription_status: string | null }>()
    : { data: null as { plan: string | null; subscription_status: string | null } | null };
  const tier = getTier(user, entitlementProfile ?? null);
  const canViewPremiumDetails = canAccessWeekendPro(user, entitlementProfile ?? null);

  const { data, error } = await supabaseAdmin
    .from("venues" as any)
    .select(
      "id,name,address,city,state,zip,notes,venue_url,sport,tournament_venues(tournaments(id,slug,name,sport,start_date,end_date))"
    )
    .eq("id", params.venueId)
    .maybeSingle<VenueRow>();

  if (error || !data?.id) {
    notFound();
  }

  const linkedTournaments = (data.tournament_venues ?? [])
    .map((tv) => tv?.tournaments)
    .filter((t): t is LinkedTournament => Boolean(t?.id));

  const today = new Date().toISOString().slice(0, 10);
  const upcomingTournaments = linkedTournaments
    .filter((t) => {
      const startOk = Boolean(t.start_date && t.start_date >= today);
      const endOk = Boolean(t.end_date && t.end_date >= today);
      return startOk || endOk;
    })
    .sort((a, b) => (a.start_date ?? "9999-12-31").localeCompare(b.start_date ?? "9999-12-31"));

  const sportsFromTournaments = Array.from(
    new Set(
      linkedTournaments
        .map((t) => canonicalSport(t.sport))
        .filter((sport) => sport !== "unknown")
    )
  );
  if (sportsFromTournaments.length === 0) {
    const fallback = canonicalSport(data.sport);
    if (fallback !== "unknown") sportsFromTournaments.push(fallback);
  }

  const sportSurfaceClass = getVenueCardClassFromSports(sportsFromTournaments);
  const locationLabel = [data.city, data.state].filter(Boolean).join(", ");
  const addressLabel = [data.address, data.city, data.state, data.zip].filter(Boolean).join(", ");
  const mapLinks = addressLabel ? buildMapLinks(addressLabel) : null;

  const runRows = await fetchLatestOwlsEyeRuns([data.id]);
  const latestRun = runRows.find((row) => row.venue_id === data.id) ?? null;
  const latestRunId = latestRun ? (latestRun.run_id ?? latestRun.id) : null;

  let nearbyCounts = { food: 0, coffee: 0, hotels: 0 };
  let premiumNearby: { food: NearbyPlace[]; coffee: NearbyPlace[]; hotels: NearbyPlace[]; captured_at: string | null } | null = null;

  if (latestRunId) {
    if (canViewPremiumDetails) {
      const { data: nearbyRows } = await supabaseAdmin
        .from("owls_eye_nearby_food" as any)
        .select("run_id,category,name,distance_meters,maps_url,is_sponsor,sponsor_click_url")
        .eq("run_id", latestRunId)
        .order("is_sponsor", { ascending: false })
        .order("distance_meters", { ascending: true })
        .order("name", { ascending: true });

      const toPlace = (row: NearbyPlaceRow): NearbyPlace => ({
        name: row.name,
        distance_meters: row.distance_meters,
        maps_url: row.maps_url,
        is_sponsor: Boolean(row.is_sponsor),
        sponsor_click_url: row.sponsor_click_url ?? null,
      });

      const rows = (nearbyRows as NearbyPlaceRow[] | null) ?? [];
      const food = rows.filter((row) => (row.category ?? "food") === "food").map(toPlace);
      const coffee = rows.filter((row) => row.category === "coffee").map(toPlace);
      const hotels = rows
        .filter((row) => {
          const category = (row.category ?? "").toLowerCase();
          return category === "hotel" || category === "hotels";
        })
        .map(toPlace);

      nearbyCounts = { food: food.length, coffee: coffee.length, hotels: hotels.length };
      premiumNearby = {
        food,
        coffee,
        hotels,
        captured_at: latestRun?.updated_at ?? latestRun?.created_at ?? null,
      };
    } else {
      const { data: nearbyRows } = await supabaseAdmin
        .from("owls_eye_nearby_food" as any)
        .select("category")
        .eq("run_id", latestRunId);

      for (const row of ((nearbyRows as Array<{ category: string | null }> | null) ?? [])) {
        const normalizedCategory = (row.category ?? "food").toLowerCase();
        if (normalizedCategory === "coffee") nearbyCounts.coffee += 1;
        else if (normalizedCategory === "hotel" || normalizedCategory === "hotels") nearbyCounts.hotels += 1;
        else nearbyCounts.food += 1;
      }
    }
  }

  const hasOwlsEye = nearbyCounts.food + nearbyCounts.coffee + nearbyCounts.hotels > 0;

  return (
    <main className="pitchWrap tournamentsWrap">
      <section className={`detailHero ${sportSurfaceClass}`}>
        <div className="detailHero__overlay">
          <article className="detailPanel">
            <div style={{ display: "grid", gap: 10 }}>
              <h1 style={{ margin: 0 }}>{data.name || "Venue"}</h1>
              <p className="meta" style={{ margin: 0 }}>
                <strong>Venue</strong>
                {locationLabel ? ` • ${locationLabel}` : ""}
              </p>
              <p className="dates" style={{ margin: 0 }}>
                {addressLabel || "Address TBA"}
              </p>

              <div className="cardFooter" style={{ justifyContent: "center" }}>
                <Link href="/venues" className="secondaryLink">
                  Back to venues
                </Link>
                {data.venue_url ? (
                  <a href={data.venue_url} target="_blank" rel="noopener noreferrer" className="secondaryLink">
                    Venue site
                  </a>
                ) : null}
                {mapLinks ? (
                  <a href={mapLinks.apple} target="_blank" rel="noopener noreferrer" className="primaryLink">
                    View map
                  </a>
                ) : null}
              </div>

              <div className={`detailCard ${hasOwlsEye ? "detailCard--withOwl" : ""}`}>
                <div className="detailCard__title">Venue</div>
                <div className="detailCard__body">
                  {hasOwlsEye ? (
                    <img
                      className="detailVenueOwlBadgeFloat"
                      src="/svg/ri/owls_eye_badge.svg"
                      alt="Owl's Eye insights available for this venue"
                    />
                  ) : null}
                  <div className="detailVenueRow">
                    <div className="detailVenueIdentity">
                      <div className="detailVenueText">
                        <div className="detailVenueName">{data.name || "Venue TBA"}</div>
                        {data.address ? <div className="detailVenueAddress">{data.address}</div> : null}
                        {[data.city, data.state, data.zip].filter(Boolean).join(", ") ? (
                          <div className="detailVenueAddress">{[data.city, data.state, data.zip].filter(Boolean).join(", ")}</div>
                        ) : null}
                        <div className="detailLinksRow detailVenueUrlRow">
                          {data.venue_url ? (
                            <a href={data.venue_url} target="_blank" rel="noopener noreferrer" className="secondaryLink">
                              Venue URL/Map
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {mapLinks ? (
                      <div className="detailLinksRow">
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

                  {hasOwlsEye ? (
                    <div className="detailVenueNearbyPreview">
                      <div className="detailVenueNearbyPreview__title">Nearby Options ({BRAND_OWL})</div>
                      <div className="detailVenueNearbyPreview__counts">
                        <div>☕ {nearbyCounts.coffee} coffee nearby</div>
                        <div>🍔 {nearbyCounts.food} food options nearby</div>
                        <div>🏨 {nearbyCounts.hotels} hotels nearby</div>
                      </div>
                      <div className="detailVenueNearbyPreview__teaser">
                        {canViewPremiumDetails
                          ? "Open Premium planning details to view full list and one-tap directions."
                          : "See Premium Planning Details below to unlock full list and one-tap directions."}
                      </div>
                    </div>
                  ) : null}

                  <details className="detailVenuePremium">
                    <summary className="detailVenuePremium__summary">Premium planning details</summary>
                    <div className="detailVenuePremium__body">
                      {canViewPremiumDetails ? (
                        premiumNearby ? (
                          <div className="detailVenueNearbyGuide">
                            <div className="detailVenueNearbyGuide__title">{BRAND_OWL} Weekend Guide</div>
                            {[
                              { label: "Coffee", items: premiumNearby.coffee.slice(0, 10) },
                              { label: "Food", items: premiumNearby.food.slice(0, 10) },
                              { label: "Hotels", items: premiumNearby.hotels.slice(0, 10) },
                            ].map((group) =>
                              group.items.length ? (
                                <div className="premiumNearbyGroup" key={`${data.id}-${group.label}-guide`}>
                                  <div className="premiumNearbyGroup__title">{group.label}</div>
                                  <div className="premiumNearbyGroup__list">
                                    {group.items.map((item, idx) => {
                                      const primaryLink =
                                        item.is_sponsor && item.sponsor_click_url ? item.sponsor_click_url : item.maps_url;
                                      return (
                                        <div className="premiumNearbyLink premiumNearbyLink--row" key={`${group.label}-${item.name}-${idx}`}>
                                          <div className="premiumNearbyLink__content">
                                            <span>{item.name}</span>
                                            <span className="premiumNearbyLink__meta">
                                              {metersToMilesLabel(item.distance_meters) || "Distance unavailable"}
                                              {item.is_sponsor && item.sponsor_click_url ? " • Sponsored" : ""}
                                            </span>
                                          </div>
                                          {primaryLink ? (
                                            <a
                                              className="secondaryLink premiumNearbyLink__cta"
                                              href={primaryLink}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                            >
                                              Directions
                                            </a>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null
                            )}
                            {premiumNearby.captured_at ? (
                              <div className="detailVenueNearbyPreview__teaser">
                                Updated {new Date(premiumNearby.captured_at).toLocaleDateString()}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="detailVenuePremiumLock">
                            <p style={{ margin: 0 }}>No nearby results captured yet for this venue.</p>
                          </div>
                        )
                      ) : (
                        <div className="detailVenuePremiumLock">
                          <p style={{ margin: 0 }}>
                            Upgrade to unlock full {BRAND_OWL} planning details and one-tap directions.
                          </p>
                          {tier === "explorer" ? (
                            <p style={{ margin: 0 }}>
                              <Link href="/login">Log in</Link> or <Link href="/signup">sign up</Link>.
                            </p>
                          ) : null}
                          <Link className="secondaryLink" href="/pricing">
                            Upgrade
                          </Link>
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              </div>

              {upcomingTournaments.length > 0 ? (
                <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>Upcoming tournaments at this venue</p>
                  <div style={{ display: "grid", gap: 6 }}>
                    {upcomingTournaments.map((t) => {
                      if (!t.slug || !t.name) return null;
                      const start = formatDate(t.start_date);
                      const end = formatDate(t.end_date);
                      const dateLabel =
                        start && end && start !== end ? `${start} - ${end}` : start || end || "Dates TBA";
                      return (
                        <Link
                          key={t.id}
                          href={`/tournaments/${t.slug}`}
                          className="secondaryLink"
                          style={{ justifyContent: "space-between", width: "100%" }}
                        >
                          <span>{t.name}</span>
                          <span style={{ fontSize: 12, opacity: 0.85 }}>{dateLabel}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, opacity: 0.9 }}>No upcoming tournaments currently linked to this venue.</p>
              )}

              {data.notes ? (
                <div style={{ marginTop: 6 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>Notes</p>
                  <p style={{ margin: "4px 0 0", opacity: 0.95 }}>{data.notes}</p>
                </div>
              ) : null}
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
