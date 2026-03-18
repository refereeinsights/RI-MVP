import OwlsEyeDemoScoresPanel from "@/components/OwlsEyeDemoScoresPanel";
import OwlsEyeWeekendGuideAccordion from "@/components/OwlsEyeWeekendGuideAccordion";
import type { OwlsEyeDemoScores } from "@/lib/owlsEyeScores";
import MobileMapLink from "@/components/venues/MobileMapLink";

const BRAND_OWL = "Owl's Eye™";

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
  };
  hasOwlsEye: boolean;
  nearbyCounts: { food: number; coffee: number; hotels: number; sporting_goods: number };
  airportSummary?: {
    nearest_airport?: AirportSummary | null;
    nearest_major_airport?: AirportSummary | null;
  } | null;
  premiumNearby:
    | { food: NearbyPlace[]; coffee: NearbyPlace[]; hotels: NearbyPlace[]; sporting_goods: NearbyPlace[]; captured_at: string | null }
    | null;
  mapLinks: { google: string; apple: string; waze: string } | null;
  mapQuery: string | null;
  demoScores?: OwlsEyeDemoScores | null;
  defaultNearbyAllCollapsed?: boolean;
};

export default function OwlsEyeVenueCard({
  venue,
  hasOwlsEye,
  nearbyCounts,
  airportSummary,
  premiumNearby,
  mapLinks,
  mapQuery,
  demoScores,
  defaultNearbyAllCollapsed = false,
}: OwlsEyeVenueCardProps) {
  const locationLine = [venue.city, venue.state, venue.zip].filter(Boolean).join(", ");
  const nearestMajorAirport = airportSummary?.nearest_major_airport ?? null;
  const nearestAirport = airportSummary?.nearest_airport ?? null;
  const primaryAirport = nearestMajorAirport ?? nearestAirport;
  const primaryAirportQuery = primaryAirport
    ? [primaryAirport.name, primaryAirport.municipality, primaryAirport.iso_region, primaryAirport.iso_country].filter(Boolean).join(", ")
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

        {hasOwlsEye ? (
          <div className="detailVenueNearbyPreview">
            <div className="detailVenueNearbyPreview__title">Nearby Options ({BRAND_OWL})</div>
            <div className="detailVenueNearbyPreview__counts">
              <div>☕ {nearbyCounts.coffee} coffee nearby</div>
              <div>🍔 {nearbyCounts.food} food options nearby</div>
              <div>🏨 {nearbyCounts.hotels} hotels nearby</div>
              <div>🧢 {nearbyCounts.sporting_goods} gear nearby</div>
            </div>
            {primaryAirport ? (
              <div style={{ marginTop: -3, display: "grid", gap: 1, justifyItems: "center" }}>
                <div style={{ fontWeight: 700, lineHeight: 1.1 }}>✈️ Nearest Major Airport</div>
                <div style={{ textAlign: "center" }}>
                  <div>
                    {primaryAirport.name}{" "}
                    {primaryAirport.iata_code || primaryAirport.ident ? `(${primaryAirport.iata_code || primaryAirport.ident}) ` : ""}
                    {primaryAirport.distance_miles} mi
                  </div>
                </div>
                {airportMapLinks && primaryAirportQuery ? (
                  <div
                    className="detailLinksRow"
                    style={{ justifyContent: "center", gap: 4, flexWrap: "nowrap", transform: "scale(0.72)", transformOrigin: "center top", width: "100%" }}
                  >
                    <MobileMapLink provider="google" query={primaryAirportQuery} fallbackHref={airportMapLinks.google} className="secondaryLink">
                      Google Maps
                    </MobileMapLink>
                    <MobileMapLink provider="apple" query={primaryAirportQuery} fallbackHref={airportMapLinks.apple} className="secondaryLink">
                      Apple Maps
                    </MobileMapLink>
                    <MobileMapLink provider="waze" query={primaryAirportQuery} fallbackHref={airportMapLinks.waze} className="secondaryLink">
                      Waze
                    </MobileMapLink>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="detailVenueNearbyPreview__teaser">Open Premium planning details to view full list and one-tap directions.</div>
          </div>
        ) : null}

        <details className="detailVenuePremium" open>
          <summary className="detailVenuePremium__summary">Premium planning details</summary>
          <div className="detailVenuePremium__body">
            {premiumNearby ? (
              <div className="detailVenueNearbyGuide">
                <div className="detailVenueNearbyGuide__title">{BRAND_OWL} Weekend Guide</div>
                {demoScores ? <OwlsEyeDemoScoresPanel scores={demoScores} /> : null}
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
                  <div className="detailVenueNearbyPreview__teaser">Updated {new Date(premiumNearby.captured_at).toLocaleDateString()}</div>
                ) : null}
              </div>
            ) : (
              <div className="detailVenuePremiumLock">
                <p style={{ margin: 0 }}>No nearby results captured yet for this venue.</p>
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
