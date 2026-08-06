"use client";

import type { NearbyPlace, SharedVenueNearbyCounts, SharedVenueNearbyGroups } from "../../../../packages/lib/venue";
import { RiVenueExternalLink } from "@/components/analytics/RiVenueAnalytics";
import { captureRiEvent } from "@/lib/riAnalytics";

type RiVenueNearbySectionProps = {
  venue: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
  };
  linkedTournamentCount: number;
  nearbyCounts: SharedVenueNearbyCounts;
  nearbyGroups: SharedVenueNearbyGroups;
};

type NearbyGroupConfig = {
  key: "coffee" | "food" | "sporting_goods";
  label: string;
  items: NearbyPlace[];
};

function formatDistance(distanceMeters: number | null) {
  if (typeof distanceMeters !== "number" || !Number.isFinite(distanceMeters)) return "Distance unavailable";
  return `${(distanceMeters / 1609.344).toFixed(1)} mi`;
}

export default function RiVenueNearbySection({
  venue,
  linkedTournamentCount,
  nearbyCounts,
  nearbyGroups,
}: RiVenueNearbySectionProps) {
  const groups = [
    { key: "coffee", label: "Coffee", items: nearbyGroups.coffee.slice(0, 10) },
    { key: "food", label: "Food", items: nearbyGroups.food.slice(0, 10) },
    { key: "sporting_goods", label: "Gear & supplies", items: nearbyGroups.sportingGoods.slice(0, 10) },
  ] satisfies NearbyGroupConfig[];
  const visibleGroups = groups.filter((group) => group.items.length > 0);

  if (visibleGroups.length === 0) return null;

  const summaryParts = [
    nearbyCounts.coffee > 0 ? `${nearbyCounts.coffee} coffee` : null,
    nearbyCounts.food > 0 ? `${nearbyCounts.food} food` : null,
    nearbyCounts.sportingGoods > 0 ? `${nearbyCounts.sportingGoods} gear` : null,
  ].filter(Boolean);

  return (
    <div className="detailCard" style={{ width: "min(720px, 100%)", display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontWeight: 900, fontSize: 18, color: "rgba(248, 250, 252, 0.98)" }}>Nearby for Officials</div>
        <div style={{ color: "rgba(226, 232, 240, 0.9)", fontSize: 14, lineHeight: 1.5 }}>
          {summaryParts.length > 0 ? `${summaryParts.join(" • ")} around this venue.` : "Coffee and meal options around this venue."}
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {visibleGroups.map((group) => (
          <details
            key={group.key}
            className="premiumNearbyGroup"
            onToggle={(event) => {
              const expanded = (event.currentTarget as HTMLDetailsElement).open;
              void captureRiEvent("ri_venue_nearby_section_toggled", {
                pageType: "venue_detail",
                properties: {
                  venue_id: venue.id,
                  venue_name: venue.name,
                  venue_city: venue.city ?? null,
                  venue_state: venue.state ?? null,
                  city: venue.city ?? null,
                  state: venue.state ?? null,
                  source_page_type: "venue_detail",
                  nearby_category: group.key,
                  item_count: group.items.length,
                  linked_tournament_count: linkedTournamentCount,
                  expanded,
                },
              });
            }}
          >
            <summary className="detailVenuePremium__summary">
              {group.label} ({group.items.length})
            </summary>
            <div className="premiumNearbyGroup__list">
              {group.items.map((item, idx) => {
                const href = item.is_sponsor && item.sponsor_click_url ? item.sponsor_click_url : item.maps_url;
                if (!href) return null;

                return (
                  <div className="premiumNearbyLink premiumNearbyLink--row" key={`${group.key}-${item.name}-${idx}`}>
                    <div className="premiumNearbyLink__content">
                      <span>{item.name}</span>
                      <span className="premiumNearbyLink__meta">
                        {formatDistance(item.distance_meters)}
                        {item.is_sponsor && item.sponsor_click_url ? " • Sponsored" : ""}
                      </span>
                    </div>
                    <RiVenueExternalLink
                      className="secondaryLink premiumNearbyLink__cta"
                      href={href}
                      target="_blank"
                      rel={item.is_sponsor && item.sponsor_click_url ? "noopener noreferrer sponsored" : "noopener noreferrer"}
                      eventName="ri_venue_nearby_place_clicked"
                      sourcePageType="venue_detail"
                      venueId={venue.id}
                      venueName={venue.name}
                      city={venue.city}
                      state={venue.state}
                      targetKind="directions"
                      nearbyCategory={group.key}
                      linkedTournamentCount={linkedTournamentCount}
                      sourceSurface="venue_nearby_module"
                      ctaPlacement="ri_venue_nearby_list"
                      outboundDestinationType="nearby_place"
                      extraProperties={{
                        place_name: item.name,
                        sponsored: item.is_sponsor,
                      }}
                    >
                      Open map
                    </RiVenueExternalLink>
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
