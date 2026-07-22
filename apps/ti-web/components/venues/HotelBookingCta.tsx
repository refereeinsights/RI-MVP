"use client";

import VenueHotelLink from "@/components/venues/VenueHotelLink";
import { VENUE_HOTEL_PLACEMENTS } from "@/lib/venueHotelFunnel";

export default function HotelBookingCta({
  href,
  venueId,
  tournamentId,
  label = "Check hotel availability",
}: {
  href: string;
  venueId: string;
  tournamentId?: string | null;
  label?: string;
}) {
  return (
    <div className="detailLinksRow" style={{ justifyContent: "center" }}>
      <VenueHotelLink
        className="secondaryLink hotelBookingCta"
        href={href}
        ctaPlacement={VENUE_HOTEL_PLACEMENTS.venueDetailsBookingCta}
        venueId={venueId}
        tournamentId={tournamentId ?? null}
        target="_blank"
        rel="noopener noreferrer sponsored"
        style={{ minWidth: 260 }}
      >
        🏨 {label}
      </VenueHotelLink>
    </div>
  );
}
