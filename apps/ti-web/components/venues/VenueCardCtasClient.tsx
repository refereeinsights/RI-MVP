"use client";

import Link from "next/link";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";

type Props = {
  venueId: string;
  venueName: string;
  viewVenueHref: string;
  planTripHref: string | null;
  tournamentSlug: string | null;
  city: string | null;
  state: string | null;
  directionsHref: string | null;
};

export default function VenueCardCtasClient({
  venueId,
  venueName,
  viewVenueHref,
  planTripHref,
  tournamentSlug,
  city,
  state,
  directionsHref,
}: Props) {
  const showPlanTrip = Boolean(planTripHref);

  return (
    <>
      {showPlanTrip ? (
        <Link
          href={planTripHref as string}
          className="primaryLink"
          onClick={() => {
            void trackTiEvent("venue_directory_plan_map_click", {
              venue_id: venueId,
              venue_name: venueName,
              tournament_slug: tournamentSlug as string,
              city: city ?? undefined,
              state: state ?? undefined,
              source: "venue_directory",
            });
          }}
        >
          Plan trip
        </Link>
      ) : (
        <Link
          href={viewVenueHref}
          className="primaryLink"
          onClick={() => {
            void trackTiEvent("venue_directory_view_venue_click", {
              venue_id: venueId,
              venue_name: venueName,
              tournament_slug: tournamentSlug ?? null,
            });
          }}
        >
          View venue
        </Link>
      )}

      {showPlanTrip ? (
        <Link
          href={viewVenueHref}
          className="secondaryLink"
          onClick={() => {
            void trackTiEvent("venue_directory_view_venue_click", {
              venue_id: venueId,
              venue_name: venueName,
              tournament_slug: tournamentSlug ?? null,
            });
          }}
        >
          View venue
        </Link>
      ) : null}

      {directionsHref ? (
        <a
          href={directionsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="secondaryLink"
          onClick={() => {
            // No directory directions event yet; track explicitly only if required later.
          }}
        >
          Get directions
        </a>
      ) : null}
    </>
  );
}
