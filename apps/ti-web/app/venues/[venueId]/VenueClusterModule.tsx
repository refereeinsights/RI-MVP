"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";

type VenueClusterCandidateView = {
  venueId: string;
  venueName: string;
  venueHref: string;
  city: string | null;
  state: string | null;
  tier: "same_tournament" | "same_city_active";
  reason: string;
  upcomingTournamentCount: number;
  nearestUpcomingTournamentLabel: string | null;
};

type Props = {
  heading: string;
  intro: string;
  sourceVenueId: string;
  sourceVenueSlug: string | null;
  sourceCity: string | null;
  sourceState: string | null;
  candidates: VenueClusterCandidateView[];
  classNames: {
    section: string;
    header: string;
    heading: string;
    intro: string;
    list: string;
    card: string;
    cardBody: string;
    cardTop: string;
    venueName: string;
    venueMeta: string;
    tierBadge: string;
    reason: string;
    tournamentCount: string;
    nearest: string;
    link: string;
  };
};

function resolveDeviceType() {
  if (typeof window === "undefined") return null;
  return window.innerWidth <= 768 ? "mobile" : "desktop";
}

function currentPagePath() {
  if (typeof window === "undefined") return null;
  return `${window.location.pathname}${window.location.search}`;
}

export default function VenueClusterModule({
  heading,
  intro,
  sourceVenueId,
  sourceVenueSlug,
  sourceCity,
  sourceState,
  candidates,
  classNames,
}: Props) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const viewedRef = useRef(false);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element || typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;

    let timeoutId: number | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const isVisible = Boolean(entry?.isIntersecting) && (entry?.intersectionRatio ?? 0) >= 0.5;
        if (!isVisible) {
          if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
          }
          return;
        }
        if (viewedRef.current || timeoutId !== null) return;
        timeoutId = window.setTimeout(() => {
          timeoutId = null;
          if (viewedRef.current) return;
          viewedRef.current = true;
          trackTiEvent("venue_cluster_viewed", {
            page_type: "venue_detail",
            source_venue_id: sourceVenueId,
            source_venue_slug: sourceVenueSlug,
            source_city: sourceCity,
            source_state: sourceState,
            candidate_count: candidates.length,
            relationship_tiers: candidates.map((candidate) => candidate.tier),
            destination_venue_ids: candidates.map((candidate) => candidate.venueId),
            destination_upcoming_tournament_counts: candidates.map((candidate) => candidate.upcomingTournamentCount),
            current_page_path: currentPagePath(),
            device_type: resolveDeviceType(),
          });
        }, 500);
      },
      { threshold: [0.5] }
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [candidates, sourceCity, sourceState, sourceVenueId, sourceVenueSlug]);

  return (
    <section ref={sectionRef} className={classNames.section} aria-labelledby="venue-cluster-heading">
      <div className={classNames.header}>
        <h2 id="venue-cluster-heading" className={classNames.heading}>
          {heading}
        </h2>
        <p className={classNames.intro}>{intro}</p>
      </div>
      <div className={classNames.list}>
        {candidates.map((candidate) => {
          const tournamentCountLabel =
            candidate.upcomingTournamentCount === 1
              ? "1 upcoming tournament"
              : `${String(candidate.upcomingTournamentCount)} upcoming tournaments`;
          return (
            <article key={candidate.venueId} className={classNames.card}>
              <div className={classNames.cardBody}>
                <div className={classNames.cardTop}>
                  <div>
                    <p className={classNames.venueName}>{candidate.venueName}</p>
                    <p className={classNames.venueMeta}>{[candidate.city, candidate.state].filter(Boolean).join(", ")}</p>
                  </div>
                  <span className={classNames.tierBadge}>
                    {candidate.tier === "same_tournament" ? "Same tournament" : "Same city"}
                  </span>
                </div>
                <p className={classNames.reason}>{candidate.reason}</p>
                <p className={classNames.tournamentCount}>{tournamentCountLabel}</p>
                {candidate.nearestUpcomingTournamentLabel ? (
                  <p className={classNames.nearest}>{candidate.nearestUpcomingTournamentLabel}</p>
                ) : null}
              </div>
              <Link
                href={candidate.venueHref}
                className={classNames.link}
                onClick={() => {
                  trackTiEvent("venue_cluster_venue_clicked", {
                    page_type: "venue_detail",
                    source_venue_id: sourceVenueId,
                    source_venue_slug: sourceVenueSlug,
                    source_city: sourceCity,
                    source_state: sourceState,
                    destination_venue_id: candidate.venueId,
                    destination_venue_name: candidate.venueName,
                    destination_city: candidate.city,
                    destination_state: candidate.state,
                    destination_upcoming_tournament_count: candidate.upcomingTournamentCount,
                    relationship_tier: candidate.tier,
                    relationship_reason: candidate.reason,
                    href: candidate.venueHref,
                    current_page_path: currentPagePath(),
                    device_type: resolveDeviceType(),
                  });
                }}
              >
                View venue →
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
