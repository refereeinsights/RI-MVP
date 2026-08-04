"use client";

import { sendTiAnalytics } from "@/lib/analytics";

type TeamHotelLandingPrimaryCtaProps = {
  authState: "signed_out" | "unverified" | "verified";
  entitlement: "explorer" | "insider" | "weekend_pro" | "unknown";
  tournamentId?: string | null;
  venueId?: string | null;
  entrySource?: string | null;
  entryPageType?: string | null;
  entryPath?: string | null;
  entryPlacement?: string | null;
  className?: string;
};

export default function TeamHotelLandingPrimaryCta(props: TeamHotelLandingPrimaryCtaProps) {
  return (
    <a
      href="#team-hotel-blocks"
      className={props.className}
      onClick={() => {
        void sendTiAnalytics("team_hotel_cta_clicked", {
          surface: "team_hotel",
          source_page_type: "team_hotel_booking",
          cta_type: "team_hotel",
          auth_state: props.authState,
          entitlement: props.entitlement,
          context_type: "team_hotel",
          entry_source: props.entrySource ?? undefined,
          entry_page_type: props.entryPageType ?? undefined,
          entry_path: props.entryPath ?? undefined,
          entry_placement: props.entryPlacement ?? undefined,
          current_page_type: "team_hotel_booking",
          current_page_path: "/team-hotel-booking",
          tournament_id: props.tournamentId ?? undefined,
          venue_id: props.venueId ?? undefined,
        });
      }}
    >
      Request Team Hotel Options
    </a>
  );
}
