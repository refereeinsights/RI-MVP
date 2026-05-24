"use client";

import { useEffect, useRef } from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";

type TournamentDetailViewTrackerClientProps = {
  tournamentId: string;
  slug: string;
  sport: string | null;
  state: string | null;
};

export default function TournamentDetailViewTrackerClient(props: TournamentDetailViewTrackerClientProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    void trackTiEvent("tournament_detail_page_viewed", {
      page_type: "tournament_detail",
      tournament_id: props.tournamentId,
      slug: props.slug,
      sport: props.sport,
      state: props.state,
    });
  }, [props.slug, props.sport, props.state, props.tournamentId]);

  return null;
}

