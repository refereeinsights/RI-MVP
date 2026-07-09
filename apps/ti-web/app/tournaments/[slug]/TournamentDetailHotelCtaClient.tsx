"use client";

import { trackTiEvent } from "@/lib/tiAnalyticsClient";

type Props = {
  href: string;
  label: string;
  minWidth?: number;
};

export default function TournamentDetailHotelCtaClient({ href, label, minWidth }: Props) {
  return (
    <a
      className="secondaryLink hotelBookingCta"
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      style={typeof minWidth === "number" ? { minWidth } : undefined}
      onClick={() => {
        void trackTiEvent("tournament_detail_hotel_cta_clicked", {
          surface: "tournament_detail",
          source_page_type: "tournament",
          cta_type: "hotels",
          cta_location: "stay_close",
          context_type: "tournament",
        });
      }}
    >
      {label}
    </a>
  );
}
