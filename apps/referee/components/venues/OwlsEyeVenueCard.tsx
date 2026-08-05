"use client";

import OwlsEyeDemoScoresPanel from "@/components/OwlsEyeDemoScoresPanel";
import OwlsEyeWeekendGuideAccordion from "@/components/OwlsEyeWeekendGuideAccordion";
import type { OwlsEyeDemoScores } from "@/lib/owlsEyeScores";
import { captureRiEvent } from "@/lib/riAnalytics";
import MobileMapLink from "@/components/venues/MobileMapLink";
import type { AirportSummary, NearbyPlace } from "../../../../packages/lib/venue";

const BRAND_OWL = "Owl's Eye™";

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
  linkedTournamentCount?: number;
};

async function captureVenueEvent(eventName: string, payload: Record<string, unknown>) {
  await captureRiEvent(eventName, {
    pageType: "venue_detail",
    properties: payload,
  });
}

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
  linkedTournamentCount = 0,
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

  const analyticsBase = {
    venue_id: venue.id,
    venue_name: venue.name ?? "Venue",
    city: venue.city ?? null,
    state: venue.state ?? null,
    source_page_type: "venue_detail",
    linked_tournament_count: linkedTournamentCount,
  };

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
                  <a
                    href={venue.venue_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="secondaryLink"
                    onClick={() => void captureVenueEvent("ri_venue_site_clicked", { ...analyticsBase, target_kind: "venue_site" })}
                  >
                    Venue URL/Map
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
                className="secondaryLink"
                onClick={() => void captureVenueEvent("ri_venue_directions_clicked", { ...analyticsBase, target_kind: "venue_directions_google" })}
              >
                Google Maps
              </MobileMapLink>
              <MobileMapLink
                provider="apple"
                query={mapQuery}
                fallbackHref={mapLinks.apple}
                className="secondaryLink"
                onClick={() => void captureVenueEvent("ri_venue_directions_clicked", { ...analyticsBase, target_kind: "venue_directions_apple" })}
              >
                Apple Maps
              </MobileMapLink>
              <MobileMapLink
                provider="waze"
                query={mapQuery}
                fallbackHref={mapLinks.waze}
                className="secondaryLink"
                onClick={() => void captureVenueEvent("ri_venue_directions_clicked", { ...analyticsBase, target_kind: "venue_directions_waze" })}
              >
                Waze
              </MobileMapLink>
            </div>
          ) : null}
        </div>

        {hasOwlsEye ? (
          <div className="detailVenueNearbyPreview">
            <div className="detailVenueNearbyPreview__title">Nearby crew options ({BRAND_OWL})</div>
            <div className="detailVenueNearbyPreview__counts">
              <div>☕ {nearbyCounts.coffee} coffee nearby</div>
              <div>🍔 {nearbyCounts.food} food options nearby</div>
              <div>🏨 {nearbyCounts.hotels} hotel options nearby</div>
            </div>
            {primaryAirport ? (
              <div style={{ marginTop: -3, display: "grid", gap: 1, justifyItems: "center" }}>
                <div style={{ fontWeight: 700, lineHeight: 1.1 }}>✈️ Nearest major airport</div>
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
                    <MobileMapLink
                      provider="google"
                      query={primaryAirportQuery}
                      fallbackHref={airportMapLinks.google}
                      className="secondaryLink"
                      onClick={() => void captureVenueEvent("ri_venue_directions_clicked", { ...analyticsBase, target_kind: "airport_directions_google" })}
                    >
                      Google Maps
                    </MobileMapLink>
                    <MobileMapLink
                      provider="apple"
                      query={primaryAirportQuery}
                      fallbackHref={airportMapLinks.apple}
                      className="secondaryLink"
                      onClick={() => void captureVenueEvent("ri_venue_directions_clicked", { ...analyticsBase, target_kind: "airport_directions_apple" })}
                    >
                      Apple Maps
                    </MobileMapLink>
                    <MobileMapLink
                      provider="waze"
                      query={primaryAirportQuery}
                      fallbackHref={airportMapLinks.waze}
                      className="secondaryLink"
                      onClick={() => void captureVenueEvent("ri_venue_directions_clicked", { ...analyticsBase, target_kind: "airport_directions_waze" })}
                    >
                      Waze
                    </MobileMapLink>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="detailVenueNearbyPreview__teaser">
              Use the sections below for coffee stops, meal options, hotel searches, and one-tap directions around the fields.
            </div>
          </div>
        ) : null}

        <details className="detailVenuePremium" open>
          <summary className="detailVenuePremium__summary">Nearby hotels, coffee, and food</summary>
          <div className="detailVenuePremium__body">
            {premiumNearby ? (
              <div className="detailVenueNearbyGuide">
                <div className="detailVenueNearbyGuide__title">{BRAND_OWL} venue-area guide</div>
                {demoScores ? <OwlsEyeDemoScoresPanel scores={demoScores} /> : null}
                <OwlsEyeWeekendGuideAccordion
                  defaultAllCollapsed={defaultNearbyAllCollapsed}
                  groups={[
                    { label: "Coffee", items: premiumNearby.coffee.slice(0, 10) },
                    { label: "Food", items: premiumNearby.food.slice(0, 10) },
                    { label: "Hotels", items: premiumNearby.hotels.slice(0, 10) },
                  ]}
                  onToggle={(label, count) =>
                    void captureVenueEvent("ri_venue_nearby_section_toggled", {
                      ...analyticsBase,
                      nearby_category: label.toLowerCase(),
                      item_count: count,
                    })
                  }
                  onItemClick={(label, item) =>
                    void captureVenueEvent(label === "Hotels" ? "ri_venue_hotels_cta_clicked" : "ri_venue_nearby_place_clicked", {
                      ...analyticsBase,
                      nearby_category: label.toLowerCase(),
                      place_name: item.name,
                      sponsored: item.is_sponsor,
                      source_surface: "venue_nearby_module",
                      cta_placement: label === "Hotels" ? "venue_nearby_hotels_list" : "venue_nearby_place_list",
                      outbound_partner: label === "Hotels" ? "hotelplanner" : null,
                      outbound_destination_type: label === "Hotels" ? "hotels" : "nearby_place",
                      target_kind: label === "Hotels" ? "hotel_outbound" : "directions",
                    })
                  }
                />
                {premiumNearby.captured_at ? (
                  <div className="detailVenueNearbyPreview__teaser">Updated {new Date(premiumNearby.captured_at).toLocaleDateString()}</div>
                ) : null}
              </div>
            ) : (
              <div className="detailVenuePremiumLock">
                <p style={{ margin: 0 }}>No nearby Owl&apos;s Eye results captured yet for this venue.</p>
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
