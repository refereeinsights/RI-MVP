"use client";

import { trackTiEvent } from "@/lib/tiAnalyticsClient";
import { readOrCreateLodgingSessionId } from "@/lib/lodgingSession";
import { readOrRememberHotelDistributionSource } from "@/lib/hotelMeasurement";

type Props = {
  href: string;
  label: string;
  minWidth?: number;
};

export default function TournamentDetailHotelCtaClient({ href, label, minWidth }: Props) {
  const isInternal = href.startsWith("/tournaments/") && href.includes("/hotels");
  return (
    <a
      className="secondaryLink hotelBookingCta"
      href={href}
      target={isInternal ? undefined : "_blank"}
      rel={isInternal ? undefined : "noopener noreferrer sponsored"}
      style={typeof minWidth === "number" ? { minWidth } : undefined}
      onClick={() => {
        void trackTiEvent("tournament_detail_hotel_cta_clicked", {
          surface: "tournament_detail",
          source_page_type: "tournament",
          cta_type: "hotels",
          cta_location: "stay_close",
          context_type: "tournament",
          session_id: readOrCreateLodgingSessionId(),
          distribution_source: readOrRememberHotelDistributionSource(),
        });
      }}
    >
      {label}
    </a>
  );
}
