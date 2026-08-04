"use client";

import { useEffect, useRef } from "react";
import { captureRiEvent } from "@/lib/riAnalytics";

type RiVenueHotelResultsTrackerProps = {
  venueId: string;
  tournamentId?: string | null;
  hotelCount: number;
  fallbackReason?: string | null;
  resolvedCheckIn?: string | null;
  resolvedCheckOut?: string | null;
  dateSource: "tournament" | "fallback";
};

export default function RiVenueHotelResultsTracker(props: RiVenueHotelResultsTrackerProps) {
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;

    const common = {
      venue_id: props.venueId,
      tournament_id: props.tournamentId ?? null,
      hotel_count: props.hotelCount,
      date_source: props.dateSource,
      resolved_check_in: props.resolvedCheckIn ?? null,
      resolved_check_out: props.resolvedCheckOut ?? null,
      fallback_reason: props.fallbackReason ?? null,
    };

    if (props.hotelCount > 0) {
      void captureRiEvent("ri_venue_hotel_results_loaded", {
        pageType: "venue_detail",
        properties: common,
      });
      return;
    }

    void captureRiEvent("ri_venue_hotel_no_results", {
      pageType: "venue_detail",
      properties: common,
    });
  }, [props.dateSource, props.fallbackReason, props.hotelCount, props.resolvedCheckIn, props.resolvedCheckOut, props.tournamentId, props.venueId]);

  return null;
}
