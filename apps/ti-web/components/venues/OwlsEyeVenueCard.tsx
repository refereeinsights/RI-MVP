import Link from "next/link";
import { BRAND_OWL } from "@/lib/brand";
import type { OwlsEyeDemoScores } from "@/lib/owlsEyeScores";
import OwlsEyeDemoScoresPanel from "@/components/OwlsEyeDemoScoresPanel";
import OwlsEyeWeekendGuideAccordion from "@/components/OwlsEyeWeekendGuideAccordion";
import MobileMapLink from "@/components/venues/MobileMapLink";
import StartQuickVenueCheckButton from "@/components/venues/StartQuickVenueCheckButton";
import HotelBookingCta from "@/components/venues/HotelBookingCta";
import VenueWeatherPlannerCard from "@/components/venues/VenueWeatherPlannerCard";
import { buildHotelsHref, canShowBookingCta } from "@/lib/booking/venueBooking";

export type NearbyPlace = {
  name: string;
  distance_meters: number | null;
  maps_url: string | null;
  is_sponsor: boolean;
  sponsor_click_url: string | null;
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
  nearbyCounts: { food: number; coffee: number; hotels: number; sporting_goods: number };
  publicHotels?: NearbyPlace[] | null;
  selectedTournamentId?: string | null;
  selectedTournamentStartDate?: string | null;
  selectedTournamentEndDate?: string | null;
  airportSummary?: {
    nearest_airport?: AirportSummary | null;
    nearest_major_airport?: AirportSummary | null;
  } | null;
  premiumNearby:
    | { food: NearbyPlace[]; coffee: NearbyPlace[]; hotels: NearbyPlace[]; sporting_goods: NearbyPlace[]; captured_at: string | null }
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
  const nearestMajorAirport = airportSummary?.nearest_major_airport ?? null;
  const nearestAirport = airportSummary?.nearest_airport ?? null;
  const primaryAirport = nearestMajorAirport ?? nearestAirport;
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
                {venue.venue_url ? (
                  <a href={venue.venue_url} target="_blank" rel="noopener noreferrer" className="secondaryLink">
                    Venue URL/Map
                  </a>
                ) : null}
              </div>
            </div>
          </div>
          {mapLinks && mapQuery ? (
            <div className="detailLinksRow">
              <MobileMapLink provider="google" query={mapQuery} fallbackHref={mapLinks.google} className="secondaryLink">
                Google Maps
              </MobileMapLink>
              <MobileMapLink provider="apple" query={mapQuery} fallbackHref={mapLinks.apple} className="secondaryLink">
                Apple Maps
              </MobileMapLink>
              <MobileMapLink provider="waze" query={mapQuery} fallbackHref={mapLinks.waze} className="secondaryLink">
                Waze
              </MobileMapLink>
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
	                  <div>🏨 {nearbyCounts.hotels} hotels nearby</div>
	                  <div>⚽ {nearbyCounts.sporting_goods} gear nearby</div>
	                </div>
                  <VenueWeatherPlannerCard
                    latitude={venue.latitude ?? null}
                    longitude={venue.longitude ?? null}
                    city={venue.city}
                    state={venue.state}
                    tournamentStartDate={selectedTournamentStartDate ?? null}
                    tournamentEndDate={selectedTournamentEndDate ?? null}
                  />
                  {hotels.length ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 800 }}>Hotels near this venue</div>
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
                                <a
                                  className="secondaryLink premiumNearbyLink__cta"
                                  href={ctaHref}
                                  target="_blank"
                                  rel={rel}
                                >
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
                  Open Premium planning details to view full list and one-tap directions.
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
                          <div>
                            ✈️ Nearest airport: {primaryAirport.name}{" "}
                            {primaryAirport.iata_code || primaryAirport.ident
                              ? `(${primaryAirport.iata_code || primaryAirport.ident})`
                              : ""}{" "}
                            {typeof primaryAirport.distance_miles === "number" ? `${primaryAirport.distance_miles} mi` : ""}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <VenueWeatherPlannerCard
                      latitude={venue.latitude ?? null}
                      longitude={venue.longitude ?? null}
                      city={venue.city}
                      state={venue.state}
                      tournamentStartDate={selectedTournamentStartDate ?? null}
                      tournamentEndDate={selectedTournamentEndDate ?? null}
                    />

                    {hotels.length ? (
                      <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
                        <div style={{ fontWeight: 800 }}>Hotels near this venue</div>
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
                                  <a
                                    className="secondaryLink premiumNearbyLink__cta"
                                    href={ctaHref}
                                    target="_blank"
                                    rel={rel}
                                  >
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
          <summary className="detailVenuePremium__summary">Premium planning details</summary>
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
                  <OwlsEyeWeekendGuideAccordion
                    defaultAllCollapsed={defaultNearbyAllCollapsed}
	                    groups={[
	                      { label: "Coffee", items: premiumNearby.coffee.slice(0, 10) },
	                      { label: "Food", items: premiumNearby.food.slice(0, 10) },
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
                <p style={{ margin: 0 }}>
                  Unlock Weekend Pro for free — submit a quick venue check (about 10 seconds).
                </p>
                {tier === "explorer" ? (
                  <p style={{ margin: 0 }}>
                    Already have an account? <Link href="/login">Sign in</Link>. New here? <Link href="/signup">Create a free account</Link>.
                  </p>
                ) : null}
                <StartQuickVenueCheckButton className="secondaryLink">Start quick venue check</StartQuickVenueCheckButton>
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
