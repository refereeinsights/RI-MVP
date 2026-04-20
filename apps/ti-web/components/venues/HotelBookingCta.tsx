"use client";

import { sendTiAnalytics } from "@/lib/analytics";

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
      <a
        className="secondaryLink hotelBookingCta"
        href={href}
        target="_blank"
        rel="noopener noreferrer sponsored"
        style={{ minWidth: 260 }}
        onClick={() => {
          // Client-side analytics only; never block navigation.
          void sendTiAnalytics("venue_hotels_cta_clicked", {
            venue_id: venueId,
            tournament_id: tournamentId ?? null,
            href,
          });
        }}
      >
        🏨 {label}
      </a>
    </div>
  );
}

