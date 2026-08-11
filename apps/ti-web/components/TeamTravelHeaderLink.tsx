"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { sendTiAnalytics } from "@/lib/analytics";
import {
  createTeamHotelCtaInteractionId,
  getAnonymousVisitorId,
  getTeamHotelAcquisitionContext,
  getTeamHotelSessionId,
  rememberPendingTeamHotelEntry,
  rememberLastTeamHotelCtaInteractionId,
} from "@/lib/teamHotelClientTracking";

type TeamTravelHeaderLinkProps = {
  authState: "signed_out" | "unverified" | "verified";
};

export default function TeamTravelHeaderLink(props: TeamTravelHeaderLinkProps) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const viewedKeyRef = useRef<string | null>(null);
  const sourcePath = `${pathname}${searchParams?.toString() ? `?${searchParams}` : ""}`;

  useEffect(() => {
    getTeamHotelAcquisitionContext();
    const viewedKey = `team-travel-header:${sourcePath}`;
    if (viewedKeyRef.current === viewedKey) return;
    viewedKeyRef.current = viewedKey;
    void sendTiAnalytics("team_hotel_header_cta_viewed", {
      surface: "global_header",
      source_page_type: "other",
      cta_type: "team_hotel",
      auth_state: props.authState,
      session_id: getTeamHotelSessionId(),
      anonymous_visitor_id: getAnonymousVisitorId(),
      source_path: sourcePath,
      current_page_type: "other",
      current_page_path: sourcePath,
      cta_label: "Team Hotels",
    });
  }, [props.authState, sourcePath]);

  return (
    <Link
      href="/team-hotel-booking"
      onClick={() => {
        const ctaInteractionId = createTeamHotelCtaInteractionId();
        rememberLastTeamHotelCtaInteractionId(ctaInteractionId);
        rememberPendingTeamHotelEntry({
          key: `header:${Date.now().toString(36)}:${ctaInteractionId}`,
          sourceSurface: "global_header",
          sourcePath,
          ctaInteractionId,
        });
        void sendTiAnalytics("team_hotel_header_cta_clicked", {
          surface: "global_header",
          source_page_type: "other",
          cta_type: "team_hotel",
          auth_state: props.authState,
          session_id: getTeamHotelSessionId(),
          anonymous_visitor_id: getAnonymousVisitorId(),
          source_path: sourcePath,
          current_page_type: "other",
          current_page_path: sourcePath,
          cta_label: "Team Hotels",
          cta_interaction_id: ctaInteractionId,
        }, { preferBeacon: true });
      }}
    >
      Team Hotels
    </Link>
  );
}
