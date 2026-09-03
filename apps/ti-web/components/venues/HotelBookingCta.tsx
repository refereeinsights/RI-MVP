"use client";

import VenueHotelLink from "@/components/venues/VenueHotelLink";
import { VENUE_HOTEL_PLACEMENTS } from "@/lib/venueHotelFunnel";

export default function HotelBookingCta({
  href,
  venueId,
  tournamentId,
  label = "Check hotel availability",
  align = "center",
  target = "_blank",
  rel,
}: {
  href: string;
  venueId: string;
  tournamentId?: string | null;
  label?: string;
  align?: "center" | "start";
  target?: "_blank" | "_self";
  rel?: string;
}) {
  const resolvedRel = rel ?? (target === "_blank" ? "noopener noreferrer sponsored" : undefined);

  return (
    <div className="detailLinksRow" style={{ justifyContent: align === "start" ? "flex-start" : "center" }}>
      <VenueHotelLink
        className="secondaryLink hotelBookingCta"
        href={href}
        ctaPlacement={VENUE_HOTEL_PLACEMENTS.venueDetailsBookingCta}
        venueId={venueId}
        tournamentId={tournamentId ?? null}
        target={target}
        rel={resolvedRel}
        style={{ minWidth: 260 }}
      >
        🏨 {label}
      </VenueHotelLink>
    </div>
  );
}
