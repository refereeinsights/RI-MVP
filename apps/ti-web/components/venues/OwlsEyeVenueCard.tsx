import Link from "next/link";
import { BRAND_OWL } from "@/lib/brand";
import type { OwlsEyeDemoScores } from "@/lib/owlsEyeScores";
import OwlsEyeDemoScoresPanel from "@/components/OwlsEyeDemoScoresPanel";
import OwlsEyeWeekendGuideAccordion from "@/components/OwlsEyeWeekendGuideAccordion";
import UpgradeWeekendProButton from "@/components/UpgradeWeekendProButton";
import WeekendProUpgradeModalTrigger from "@/components/premium/WeekendProUpgradeModalTrigger";
import UpgradeWeekendPassButton from "@/components/UpgradeWeekendPassButton";
import MobileMapLink from "@/components/venues/MobileMapLink";
import StartQuickVenueCheckButton from "@/components/venues/StartQuickVenueCheckButton";
import HotelBookingCta from "@/components/venues/HotelBookingCta";
import VenueWeatherPlannerCard from "@/components/venues/VenueWeatherPlannerCard";
import { buildHotelsHref, canShowBookingCta } from "@/lib/booking/venueBooking";
import { isValidLatLng, round6 } from "@/lib/staticTournamentMaps";
import { buildPlanningMapUrl } from "@/lib/planningMapUrl";
import VenuePlanningMapLinkClient from "@/components/venues/VenuePlanningMapLinkClient";
import { WEEKEND_PRO_FOUNDING_DEADLINE_COPY } from "@/lib/weekendProPricing";

export type NearbyPlace = {
  name: string;
  distance_meters: number | null;
  maps_url: string | null;
  is_sponsor: boolean;
  sponsor_click_url: string | null;
  reason_tags?: string[] | null;
  provider?: string | null;
};

export type AirportSummary = {
  id: string;
  ident: string;
  iata_code?: string | null;
  name: string;
  municipality?: string | null;
  iso_country: string;
  iso_region?: string | null;
  airport_type: string;
  scheduled_service: boolean;
  is_commercial: boolean;
  is_major: boolean;
  distance_miles: number;
};

type OwlsEyeVenueCardProps = {
  venue: {
    id: string;
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    venue_url: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  hasOwlsEye: boolean;
  canViewPremiumDetails: boolean;
  nearbyCounts: { food: number; coffee: number; hotels: number; sporting_goods: number; quick_eats?: number; hangouts?: number };
  publicHotels?: NearbyPlace[] | null;
  selectedTournamentId?: string | null;
  selectedTournamentSlug?: string | null;
  selectedTournamentStartDate?: string | null;
  selectedTournamentEndDate?: string | null;
  airportSummary?: {
    nearest_airport?: AirportSummary | null;
    nearest_major_airport?: AirportSummary | null;
  } | null;
  premiumNearby:
    | {
        food: NearbyPlace[];
        coffee: NearbyPlace[];
        hotels: NearbyPlace[];
        sporting_goods: NearbyPlace[];
        quick_eats?: NearbyPlace[];
        hangouts?: NearbyPlace[];
        captured_at: string | null;
      }
    | null;
  tier: "explorer" | "insider" | "weekend_pro";
  showAllDetails?: boolean;
  mapLinks: { google: string; apple: string; waze: string } | null;
  mapQuery: string | null;
  demoScores?: OwlsEyeDemoScores | null;
  demoScoresIsDemo?: boolean;
  defaultNearbyAllCollapsed?: boolean;
};

export default function OwlsEyeVenueCard({
  venue,
  hasOwlsEye,
  canViewPremiumDetails,
  nearbyCounts,
  publicHotels,
  selectedTournamentId,
  selectedTournamentSlug,
  selectedTournamentStartDate,
  selectedTournamentEndDate,
  airportSummary,
  premiumNearby,
  tier,
  showAllDetails = false,
  mapLinks,
  mapQuery,
  demoScores,
  demoScoresIsDemo = false,
  defaultNearbyAllCollapsed = false,
}: OwlsEyeVenueCardProps) {
  const locationLine = [venue.city, venue.state, venue.zip].filter(Boolean).join(", ");
  const hotels = (publicHotels ?? []).filter(Boolean);
  const bookingHref = buildHotelsHref({ venueId: venue.id, tournamentId: selectedTournamentId ?? null });
  const showBooking = canShowBookingCta({ zip: venue.zip });
  const hasValidCoordinates = isValidLatLng(venue.latitude, venue.longitude);
  const mapboxToken = (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "").trim();
  const zoomForVenue = (() => {
    const name = String(venue.name ?? "").toLowerCase();
    const hasCityState = Boolean(String(venue.city ?? "").trim()) && Boolean(String(venue.state ?? "").trim());
    const hasZip = Boolean(String(venue.zip ?? "").trim());

    // Start from a sane default for "where is this venue?"
    let zoom = 14;

    // Larger multi-field venues usually benefit from a slightly wider view.
    if (/(sports\s*park|sport\s*park|complex|fields?|fairgrounds|tournament|athletic|regional|campus)/i.test(name)) {
      zoom = 13;
    }

    // If we have less precise location context, keep it wider.
    if (!hasCityState || !hasZip) {
      zoom = Math.min(zoom, 13);
    }

    // Guardrails.
    return Math.min(Math.max(zoom, 12), 15);
  })();
  const staticMapUrl = (() => {
    if (!hasValidCoordinates || !mapboxToken) return null;
    const style = "mapbox/streets-v12";
    const width = 800;
    const height = 400;
    const lat = round6(venue.latitude as number);
    const lng = round6(venue.longitude as number);
    const marker = `pin-s+00AA55(${lng.toFixed(6)},${lat.toFixed(6)})`;
    // Use a fixed camera to avoid Mapbox's `auto` occasionally zooming too far in for single-point previews.
    const camera = `${lng.toFixed(6)},${lat.toFixed(6)},${zoomForVenue}`;
    return `https://api.mapbox.com/styles/v1/${style}/static/${marker}/${camera}/${width}x${height}?access_token=${encodeURIComponent(mapboxToken)}`;
  })();
  const mapPreviewHref = selectedTournamentSlug
    ? buildPlanningMapUrl({ tournamentSlug: selectedTournamentSlug, venueId: venue.id, source: "venue_details" })
    : null;
  const nearestMajorAirport = airportSummary?.nearest_major_airport ?? null;
  const nearestAirport = airportSummary?.nearest_airport ?? null;
  const primaryAirport = nearestMajorAirport ?? nearestAirport;
  const primaryAirportCode = primaryAirport ? (primaryAirport.iata_code || primaryAirport.ident || "").trim() : "";
  const primaryAirportMiles =
    primaryAirport && typeof primaryAirport.distance_miles === "number" && Number.isFinite(primaryAirport.distance_miles)
      ? `${primaryAirport.distance_miles} mi`
      : "";
  const primaryAirportFullLabel = primaryAirport
    ? `✈️ Nearest airport: ${primaryAirport.name}${primaryAirportCode ? ` (${primaryAirportCode})` : ""}${primaryAirportMiles ? ` ${primaryAirportMiles}` : ""}`
    : "";
  const primaryAirportShortLabel = primaryAirport
    ? `✈️ ${primaryAirportCode || "Airport"}${primaryAirportMiles ? ` — ${primaryAirportMiles}` : ""}`
    : "";
  const primaryAirportQuery = primaryAirport
    ? [primaryAirport.name, primaryAirport.municipality, primaryAirport.iso_region, primaryAirport.iso_country]
        .filter(Boolean)
        .join(", ")
    : null;
  const airportMapLinks = primaryAirportQuery
    ? {
        google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(primaryAirportQuery)}`,
        apple: `https://maps.apple.com/?q=${encodeURIComponent(primaryAirportQuery)}`,
        waze: `https://waze.com/ul?q=${encodeURIComponent(primaryAirportQuery)}&navigate=yes`,
      }
    : null;

  return (
    <div className={`detailCard ${hasOwlsEye ? "detailCard--withOwl" : ""}`}>
      <div className="detailCard__title">Venue</div>
      <div className="detailCard__body">
        <div className="detailVenueRow">
          <div className="detailVenueIdentity">
            <div className="detailVenueText">
              {hasOwlsEye ? (
                <img
                  className="detailVenueOwlBadgeInline"
                  src="/svg/ri/owls_eye_badge.svg"
                  alt="Owl's Eye insights available for this venue"
                />
              ) : null}
              <div className="detailVenueAddressStack">
                {venue.address ? <div className="detailVenueAddress">{venue.address}</div> : null}
                {locationLine ? <div className="detailVenueAddress">{locationLine}</div> : null}
              </div>
              <div className="detailLinksRow detailVenueUrlRow">
                {staticMapUrl ? (
                  <div
                    style={{
                      position: "relative",
                      width: "min(720px, 100%)",
                      marginTop: 10,
                      borderRadius: 14,
                      overflow: "hidden",
                      border: "1px solid rgba(0,0,0,0.10)",
                      background: "#fff",
                      height: "clamp(190px, 28vw, 260px)",
                    }}
                  >
                    <img
                      src={staticMapUrl}
                      alt={venue.name ? `Map showing the location of ${venue.name}` : "Map showing the venue location"}
                      loading="lazy"
                      decoding="async"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                    {mapPreviewHref ? (
                      <VenuePlanningMapLinkClient
                        href={mapPreviewHref}
                        ariaLabel={venue.name ? `Open planning map for ${venue.name}` : "Open planning map"}
                        className=""
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "block",
                        }}
                        // Full overlay.
                        event={{
                          name: "venue_details_plan_map_click",
                          properties: {
                            venue_id: venue.id,
                            venue_name: venue.name ?? "Venue",
                            tournament_slug: selectedTournamentSlug ?? null,
                            source: "venue_details",
                          },
                        }}
                      >
                        <span style={{ display: "block", width: "100%", height: "100%" }} />
                      </VenuePlanningMapLinkClient>
                    ) : null}
                  </div>
                ) : venue.venue_url ? (
                  <a href={venue.venue_url} target="_blank" rel="noopener noreferrer" className="secondaryLink detailLinkSmall">
                    Venue site
                  </a>
                ) : null}
              </div>
            </div>
          </div>
          {mapLinks && mapQuery ? (
            <div className="detailLinksRow">
              <MobileMapLink
                provider="google"
                query={mapQuery}
                fallbackHref={mapLinks.google}
                className="secondaryLink hotelBookingCta"
                trackEvent={{
                  name: "venue_details_directions_click",
                  properties: {
                    venue_id: venue.id,
                    venue_name: venue.name ?? "Venue",
                    tournament_slug: selectedTournamentSlug ?? null,
                  },
                }}
              >
                Get directions
              </MobileMapLink>
              <MobileMapLink provider="apple" query={mapQuery} fallbackHref={mapLinks.apple} className="secondaryLink detailLinkSmall">
                Apple Maps
              </MobileMapLink>
              <MobileMapLink provider="waze" query={mapQuery} fallbackHref={mapLinks.waze} className="secondaryLink detailLinkSmall">
                Waze
              </MobileMapLink>
              {venue.venue_url ? (
                <a href={venue.venue_url} target="_blank" rel="noopener noreferrer" className="secondaryLink detailLinkSmall">
                  Venue site
                </a>
              ) : null}
            </div>
          ) : null}
        </div>

        {showBooking && !hasOwlsEye ? (
          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            <HotelBookingCta href={bookingHref} venueId={venue.id} tournamentId={selectedTournamentId ?? null} />
            <div className="detailVenueNearbyPreview__teaser" style={{ marginTop: -4, textAlign: "center" }}>
              Book early—tournament weekends fill fast
            </div>
          </div>
        ) : null}

        {hasOwlsEye ? (
          <div className="detailVenueNearbyPreview">
            <div className="detailVenueNearbyPreview__title">Nearby Options ({BRAND_OWL})</div>
            {showBooking ? (
              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                <HotelBookingCta href={bookingHref} venueId={venue.id} tournamentId={selectedTournamentId ?? null} />
                <div className="detailVenueNearbyPreview__teaser" style={{ marginTop: -4, textAlign: "center" }}>
                  Book early—tournament weekends fill fast
                </div>
              </div>
            ) : null}
            {showAllDetails ? (
              <>
	                <div className="detailVenueNearbyPreview__counts">
	                  <div>☕ {nearbyCounts.coffee} coffee nearby</div>
	                  <div>🍔 {nearbyCounts.food} food options nearby</div>
	                  {typeof nearbyCounts.quick_eats === "number" ? <div>🥪 {nearbyCounts.quick_eats} quick eats</div> : null}
	                  {typeof nearbyCounts.hangouts === "number" ? <div>🎯 {nearbyCounts.hangouts} hangouts</div> : null}
	                  <div>🏨 {nearbyCounts.hotels} hotels nearby</div>
	                  <div>⚽ {nearbyCounts.sporting_goods} gear nearby</div>
	                </div>

                  <details className="venueMobileAccordion" style={{ marginTop: 8 }}>
                    <summary className="venueMobileAccordionSummary">
                      <span>10-Day Weather Planner</span>
                      <span className="venueMobileAccordionMeta">Tap to expand</span>
                    </summary>
                    <VenueWeatherPlannerCard
                      showHeader={false}
                      latitude={venue.latitude ?? null}
                      longitude={venue.longitude ?? null}
                      city={venue.city}
                      state={venue.state}
                      zip={venue.zip ?? null}
                      tournamentStartDate={selectedTournamentStartDate ?? null}
                      tournamentEndDate={selectedTournamentEndDate ?? null}
                    />
                  </details>

                  {hotels.length ? (
                    <details className="venueMobileAccordion" style={{ marginTop: 8 }}>
                      <summary className="venueMobileAccordionSummary">
                        <span>Hotels near this venue</span>
                        <span className="venueMobileAccordionMeta">({hotels.length}) Tap to expand</span>
                      </summary>
                      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                        <div className="premiumNearbyGroup__list">
                          {hotels.slice(0, 5).map((item, idx) => {
                            const miles =
                              typeof item.distance_meters === "number" && Number.isFinite(item.distance_meters)
                                ? `${(item.distance_meters / 1609.344).toFixed(1)} mi`
                                : "Distance unavailable";
                            const sponsorLink = item.is_sponsor && item.sponsor_click_url ? item.sponsor_click_url : null;
                            const mapsLink = !sponsorLink && canViewPremiumDetails ? item.maps_url : null;
                            const ctaHref = sponsorLink ?? mapsLink;
                            const ctaLabel = sponsorLink ? "View" : mapsLink ? "Directions" : "Directions (Premium)";
                            const rel = sponsorLink ? "noopener noreferrer sponsored" : "noopener noreferrer";
                            return (
                              <div className="premiumNearbyLink premiumNearbyLink--row" key={`hotel-${item.name}-${idx}`}>
                                <div className="premiumNearbyLink__content">
                                  <span style={item.is_sponsor ? { fontWeight: 800, color: "#f7d774" } : undefined}>
                                    {item.name}
                                  </span>
                                  <span className="premiumNearbyLink__meta">{miles}</span>
                                </div>
                                {ctaHref ? (
                                  <a className="secondaryLink premiumNearbyLink__cta" href={ctaHref} target="_blank" rel={rel}>
                                    {ctaLabel}
                                  </a>
                                ) : (
                                  <a className="secondaryLink premiumNearbyLink__cta" href="#quick-venue-check">
                                    Unlock
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </details>
                  ) : null}
                {primaryAirport ? (
                  <div style={{ marginTop: -3, display: "grid", gap: 1, justifyItems: "center" }}>
                    <div style={{ fontWeight: 700, lineHeight: 1.1 }}>✈️ Nearest Major Airport</div>
                    {nearestMajorAirport ? (
                      <div style={{ textAlign: "center" }}>
                        <div>
                          {nearestMajorAirport.name}{" "}
                          {nearestMajorAirport.iata_code || nearestMajorAirport.ident
                            ? `(${nearestMajorAirport.iata_code || nearestMajorAirport.ident}) `
                            : ""}
                          {nearestMajorAirport.distance_miles} mi
                        </div>
                      </div>
                    ) : nearestAirport ? (
                      <div style={{ textAlign: "center" }}>
                        <div>
                          {nearestAirport.name}{" "}
                          {nearestAirport.iata_code || nearestAirport.ident
                            ? `(${nearestAirport.iata_code || nearestAirport.ident}) `
                            : ""}
                          {nearestAirport.distance_miles} mi
                        </div>
                      </div>
                    ) : null}
                    {airportMapLinks && primaryAirportQuery ? (
                      <div className="detailLinksRow" style={{ gap: 4, width: "100%" }}>
                        <MobileMapLink
                          provider="google"
                          query={primaryAirportQuery}
                          fallbackHref={airportMapLinks.google}
                          className="secondaryLink"
                        >
                          Google Maps
                        </MobileMapLink>
                        <MobileMapLink
                          provider="apple"
                          query={primaryAirportQuery}
                          fallbackHref={airportMapLinks.apple}
                          className="secondaryLink"
                        >
                          Apple Maps
                        </MobileMapLink>
                        <MobileMapLink
                          provider="waze"
                          query={primaryAirportQuery}
                          fallbackHref={airportMapLinks.waze}
                          className="secondaryLink"
                        >
                          Waze
                        </MobileMapLink>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="detailVenueNearbyPreview__teaser">
                  Open nearby planning details to view full lists and one-tap directions.
                </div>
              </>
            ) : (
              <>
                {nearbyCounts.coffee > 0 ||
                nearbyCounts.food > 0 ||
                nearbyCounts.hotels > 0 ||
                nearbyCounts.sporting_goods > 0 ||
                primaryAirport ||
                hotels.length ? (
                  <>
                    {nearbyCounts.coffee > 0 ||
                    nearbyCounts.food > 0 ||
                    nearbyCounts.hotels > 0 ||
                    nearbyCounts.sporting_goods > 0 ||
	                    primaryAirport ? (
	                      <div className="detailVenueNearbyPreview__counts" style={{ marginTop: 2 }}>
	                        {nearbyCounts.coffee > 0 ? <div>☕ {nearbyCounts.coffee} coffee nearby</div> : null}
	                        {nearbyCounts.food > 0 ? <div>🍔 {nearbyCounts.food} food options nearby</div> : null}
	                        {nearbyCounts.hotels > 0 ? <div>🏨 {nearbyCounts.hotels} hotels nearby</div> : null}
	                        {nearbyCounts.sporting_goods > 0 ? <div>⚽ {nearbyCounts.sporting_goods} gear nearby</div> : null}
	                        {primaryAirport ? (
	                          <div title={primaryAirportFullLabel}>
                              <span className="venueAirportLineShort">{primaryAirportShortLabel}</span>
                              <span className="venueAirportLineLong">{primaryAirportFullLabel}</span>
	                          </div>
	                        ) : null}
	                      </div>
	                    ) : null}

                    <details className="venueMobileAccordion" style={{ marginTop: 8 }}>
                      <summary className="venueMobileAccordionSummary">
                        <span>10-Day Weather Planner</span>
                        <span className="venueMobileAccordionMeta">Tap to expand</span>
                      </summary>
                      <VenueWeatherPlannerCard
                        showHeader={false}
                        latitude={venue.latitude ?? null}
                        longitude={venue.longitude ?? null}
                        city={venue.city}
                        state={venue.state}
                        zip={venue.zip ?? null}
                        tournamentStartDate={selectedTournamentStartDate ?? null}
                        tournamentEndDate={selectedTournamentEndDate ?? null}
                      />
                    </details>

                    {hotels.length ? (
                      <details className="venueMobileAccordion" style={{ marginTop: 8 }}>
                        <summary className="venueMobileAccordionSummary">
                          <span>Hotels near this venue</span>
                          <span className="venueMobileAccordionMeta">({hotels.length}) Tap to expand</span>
                        </summary>
                        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                          <div className="premiumNearbyGroup__list">
                            {hotels.slice(0, 3).map((item, idx) => {
                              const miles =
                                typeof item.distance_meters === "number" && Number.isFinite(item.distance_meters)
                                  ? `${(item.distance_meters / 1609.344).toFixed(1)} mi`
                                  : "Distance unavailable";
                              const sponsorLink = item.is_sponsor && item.sponsor_click_url ? item.sponsor_click_url : null;
                              const mapsLink = !sponsorLink && canViewPremiumDetails ? item.maps_url : null;
                              const ctaHref = sponsorLink ?? mapsLink;
                              const ctaLabel = sponsorLink ? "View" : mapsLink ? "Directions" : "Directions (Premium)";
                              const rel = sponsorLink ? "noopener noreferrer sponsored" : "noopener noreferrer";
                              return (
                                <div className="premiumNearbyLink premiumNearbyLink--row" key={`hotel-preview-${item.name}-${idx}`}>
                                  <div className="premiumNearbyLink__content">
                                    <span style={item.is_sponsor ? { fontWeight: 800, color: "#f7d774" } : undefined}>
                                      {item.name}
                                    </span>
                                    <span className="premiumNearbyLink__meta">{miles}</span>
                                  </div>
                                  {ctaHref ? (
                                    <a className="secondaryLink premiumNearbyLink__cta" href={ctaHref} target="_blank" rel={rel}>
                                      {ctaLabel}
                                    </a>
                                  ) : (
                                    <a className="secondaryLink premiumNearbyLink__cta" href="#quick-venue-check">
                                      Unlock
                                    </a>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {!canViewPremiumDetails ? (
                            <div className="detailVenueNearbyPreview__teaser" style={{ marginTop: -2 }}>
                              Directions are Premium — unlock Weekend Pro to open maps.
                            </div>
                          ) : null}
                        </div>
                      </details>
                    ) : null}
                  </>
                ) : (
                  <div className="detailVenueNearbyPreview__teaser">
                    {tier === "explorer"
                      ? "Owl's Eye planning data is available. Create a free Insider account to view scores."
                      : "Owl's Eye planning data is available. Upgrade to Weekend Pro to view nearby lists."}
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}

        <details className="detailVenuePremium">
          <summary className="detailVenuePremium__summary">See closest hotels, food & coffee</summary>
          <div className="detailVenuePremium__body">
            {demoScores ? (
              <div style={{ marginBottom: 12 }}>
                <OwlsEyeDemoScoresPanel
                  scores={demoScores}
                  isDemo={demoScoresIsDemo}
                  tier={tier}
                  showAll={showAllDetails}
                />
              </div>
            ) : null}
            {canViewPremiumDetails ? (
              premiumNearby ? (
                <div className="detailVenueNearbyGuide">
                  <div className="detailVenueNearbyGuide__title">{BRAND_OWL} Weekend Guide</div>
                  {premiumNearby.quick_eats?.length ? (
                    <p style={{ margin: "4px 0 0", opacity: 0.92, fontSize: 13, lineHeight: 1.35 }}>
                      <strong>Quick Eats:</strong> Fast, practical food options for short breaks between games.
                    </p>
                  ) : null}
                  {premiumNearby.hangouts?.length ? (
                    <p style={{ margin: "6px 0 0", opacity: 0.92, fontSize: 13, lineHeight: 1.35 }}>
                      <strong>Family-Friendly Hangouts:</strong> Casual spots where families can relax between games.
                    </p>
                  ) : null}
                  <OwlsEyeWeekendGuideAccordion
                    defaultAllCollapsed={defaultNearbyAllCollapsed}
	                    groups={[
	                      { label: "Coffee", items: premiumNearby.coffee.slice(0, 10) },
	                      { label: "Food", items: premiumNearby.food.slice(0, 10) },
	                      ...(premiumNearby.quick_eats?.length ? [{ label: "Quick Eats", items: premiumNearby.quick_eats.slice(0, 10) }] : []),
	                      ...(premiumNearby.hangouts?.length ? [{ label: "Hangouts", items: premiumNearby.hangouts.slice(0, 10) }] : []),
	                      { label: "Hotels", items: premiumNearby.hotels.slice(0, 10) },
	                      { label: "Gear", items: premiumNearby.sporting_goods.slice(0, 10) },
	                    ]}
	                  />
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
                <p style={{ margin: 0, fontWeight: 900 }}>Stay close to where games are played.</p>
                <p style={{ margin: "6px 0 0", opacity: 0.92 }}>
                  Weekend Pro unlocks full Owl&apos;s Eye™ venue intelligence: nearby hotels, rentals, coffee, food, and mobile-friendly directions.
                </p>
                <div style={{ marginTop: 10 }}>
                  <Link href="/premium" className="primaryLink">
                    Upgrade to Weekend Pro
                  </Link>
                </div>
                <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 950, opacity: 0.95 }}>Or get 30-day premium access — $4.99</div>
                  <UpgradeWeekendPassButton
                    className="secondaryLink"
                    source_page="venue_detail_locked_section"
                    source_context="venue_detail_locked_section"
                    venue_slug={(venue as any)?.seo_slug ?? null}
                    entry_point="venue_detail_locked_section"
                    cta_label="Unlock premium access"
                    label="Unlock premium access"
                    has_affiliate_visible={false}
                  />
                  <div style={{ fontSize: 13, fontWeight: 900, opacity: 0.95 }}>{WEEKEND_PRO_FOUNDING_DEADLINE_COPY}</div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <StartQuickVenueCheckButton className="secondaryLink">Help improve this venue</StartQuickVenueCheckButton>
                </div>
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
