"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { sendTiAnalytics } from "@/lib/analytics";
import {
  consumePendingTeamHotelEntry,
  currentPathWithSearch,
  getAnonymousVisitorId,
  getTeamHotelSessionId,
  markTeamHotelLandingViewed,
} from "@/lib/teamHotelClientTracking";

type TeamHotelRouteTrackerProps = {
  authState: "signed_out" | "unverified" | "verified";
  entitlement: "explorer" | "insider" | "weekend_pro" | "unknown";
  userId?: string | null;
};

function readText(value: string | null) {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

export default function TeamHotelRouteTracker(props: TeamHotelRouteTrackerProps) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";

  useEffect(() => {
    if (pathname !== "/team-hotel-booking") return;
    const fullPath = `${pathname}${search ? `?${search}` : ""}`;
    const pendingEntry = consumePendingTeamHotelEntry();
    const viewKey = pendingEntry?.key ?? fullPath;
    if (!markTeamHotelLandingViewed(viewKey)) return;

    void sendTiAnalytics("team_hotel_landing_viewed", {
      surface: "team_hotel_booking_landing",
      source_page_type: "team_hotel_booking",
      auth_state: props.authState,
      entitlement: props.entitlement,
      context_type: "team_hotel",
      session_id: getTeamHotelSessionId(),
      anonymous_visitor_id: getAnonymousVisitorId(),
      user_id: props.userId ?? undefined,
      source_surface: pendingEntry?.sourceSurface ?? undefined,
      source_path: pendingEntry?.sourcePath ?? currentPathWithSearch() ?? fullPath,
      cta_interaction_id: pendingEntry?.ctaInteractionId ?? undefined,
      entry_source: readText(searchParams?.get("entry_source") ?? null),
      entry_page_type: readText(searchParams?.get("entry_page_type") ?? null),
      entry_path: readText(searchParams?.get("entry_path") ?? null),
      entry_placement: readText(searchParams?.get("entry_placement") ?? null),
      current_page_type: "team_hotel_booking",
      current_page_path: "/team-hotel-booking",
      tournament_id: readText(searchParams?.get("tournament_id") ?? null),
      tournament_slug: readText(searchParams?.get("tournament_slug") ?? null),
      venue_id: readText(searchParams?.get("venue_id") ?? null),
      sport: readText(searchParams?.get("sport") ?? null),
      event_start_date: readText(searchParams?.get("checkin") ?? null),
      event_end_date: readText(searchParams?.get("checkout") ?? null),
    });
  }, [pathname, props.authState, props.entitlement, props.userId, search, searchParams]);

  return null;
}
