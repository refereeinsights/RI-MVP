import Link from "next/link";
import { BRAND_OWL } from "@/lib/brand";
import type { OwlsEyeDemoScores } from "@/lib/owlsEyeScores";
import OwlsEyeDemoScoresPanel from "@/components/OwlsEyeDemoScoresPanel";
import OwlsEyeWeekendGuideAccordion from "@/components/OwlsEyeWeekendGuideAccordion";
import MobileMapLink from "@/components/venues/MobileMapLink";

export type NearbyPlace = {
  name: string;
  distance_meters: number | null;
  maps_url: string | null;
  is_sponsor: boolean;
  sponsor_click_url: string | null;
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
  canViewPremiumDetails: boolean;
  nearbyCounts: { food: number; coffee: number; hotels: number };
  premiumNearby: { food: NearbyPlace[]; coffee: NearbyPlace[]; hotels: NearbyPlace[]; captured_at: string | null } | null;
  tier: "explorer" | "insider" | "weekend_pro";
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
  premiumNearby,
  tier,
  mapLinks,
  mapQuery,
  demoScores,
  demoScoresIsDemo = false,
  defaultNearbyAllCollapsed = false,
}: OwlsEyeVenueCardProps) {
  const locationLine = [venue.city, venue.state, venue.zip].filter(Boolean).join(", ");

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
                  {demoScores ? <OwlsEyeDemoScoresPanel scores={demoScores} isDemo={demoScoresIsDemo} /> : null}
                  <OwlsEyeWeekendGuideAccordion
                    defaultAllCollapsed={defaultNearbyAllCollapsed}
                    groups={[
                      { label: "Coffee", items: premiumNearby.coffee.slice(0, 10) },
                      { label: "Food", items: premiumNearby.food.slice(0, 10) },
                      { label: "Hotels", items: premiumNearby.hotels.slice(0, 10) },
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
  );
}
