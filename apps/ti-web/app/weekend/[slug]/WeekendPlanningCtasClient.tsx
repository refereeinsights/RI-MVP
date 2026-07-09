"use client";

import Link from "next/link";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";

export default function WeekendPlanningCtasClient(props: {
  tournamentId: string;
  tournamentSlug: string;
  venueMapHref: string;
  bookTravelHref: string;
  hotelsHref: string | null;
  hotelsLabel?: string | null;
  rentalsHref: string | null;
  plannerHubHref: string;
}) {
  const slug = String(props.tournamentSlug ?? "").trim();
  if (!slug) return null;

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {props.hotelsHref ? (
        <a
          className="primaryLink"
          href={props.hotelsHref}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={() => {
            void trackTiEvent("weekend_share_travel_clicked", {
              page_type: "weekend_share",
              tournament_id: props.tournamentId,
              tournament_slug: slug,
              source_page: "weekend_share",
              cta: "travel_search",
              href: props.hotelsHref!,
              travel_kind: "hotels",
            });
          }}
        >
          {String(props.hotelsLabel ?? "").trim() || "Find hotels"}
        </a>
      ) : null}

      {props.rentalsHref ? (
        <a
          className="secondaryLink"
          href={props.rentalsHref}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={() => {
            void trackTiEvent("weekend_share_travel_clicked", {
              page_type: "weekend_share",
              tournament_id: props.tournamentId,
              tournament_slug: slug,
              source_page: "weekend_share",
              cta: "travel_search",
              href: props.rentalsHref!,
              travel_kind: "rentals",
            });
          }}
        >
          Find rentals
        </a>
      ) : null}

      <Link
        className="secondaryLink"
        href={props.venueMapHref}
        onClick={() => {
          void trackTiEvent("weekend_share_venue_map_clicked", {
            page_type: "weekend_share",
            tournament_id: props.tournamentId,
            tournament_slug: slug,
            source_page: "weekend_share",
            cta: "venue_map",
            href: props.venueMapHref,
          });
        }}
      >
        Open venue map →
      </Link>

      <Link
        className="secondaryLink"
        href={props.bookTravelHref}
        onClick={() => {
          void trackTiEvent("weekend_share_travel_clicked", {
            page_type: "weekend_share",
            tournament_id: props.tournamentId,
            tournament_slug: slug,
            source_page: "weekend_share",
            cta: "travel_search",
            href: props.bookTravelHref,
            travel_kind: "book_travel",
          });
        }}
      >
        Travel search →
      </Link>

      <Link
        className="secondaryLink"
        href={props.plannerHubHref}
        onClick={() => {
          void trackTiEvent("weekend_share_planner_hub_clicked", {
            page_type: "weekend_share",
            tournament_id: props.tournamentId,
            tournament_slug: slug,
            source_page: "weekend_share",
            cta: "planner_hub",
            href: props.plannerHubHref,
          });
        }}
      >
        Weekend Planner →
      </Link>
    </div>
  );
}
