"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { captureRiEvent } from "@/lib/riAnalytics";

type VenueAnalyticsBase = {
  eventName: string;
  venueId: string;
  venueName: string;
  city?: string | null;
  state?: string | null;
  sourcePageType: "venue_detail" | "venue_directory";
  sourcePage?: string | null;
  targetKind?: string | null;
  nearbyCategory?: string | null;
  linkedTournamentCount?: number | null;
  sourceSurface?: string | null;
  ctaPlacement?: string | null;
  outboundPartner?: string | null;
  outboundDestinationType?: string | null;
  tournamentId?: string | null;
  tournamentSlug?: string | null;
  sport?: string | null;
};

type InternalLinkProps = VenueAnalyticsBase &
  Omit<ComponentProps<typeof Link>, "href" | "children"> & {
    href: string;
    children: ReactNode;
  };

type ExternalLinkProps = VenueAnalyticsBase &
  Omit<ComponentProps<"a">, "href" | "children"> & {
    href: string;
    children: ReactNode;
  };

async function capture(payload: VenueAnalyticsBase) {
  await captureRiEvent(payload.eventName, {
    pageType: payload.sourcePageType,
    properties: {
      venue_id: payload.venueId,
      venue_name: payload.venueName,
      venue_city: payload.city ?? null,
      venue_state: payload.state ?? null,
      city: payload.city ?? null,
      state: payload.state ?? null,
      source_page_type: payload.sourcePageType,
      source_page: payload.sourcePage ?? payload.sourcePageType,
      target_kind: payload.targetKind ?? null,
      nearby_category: payload.nearbyCategory ?? null,
      linked_tournament_count: payload.linkedTournamentCount ?? null,
      source_surface: payload.sourceSurface ?? null,
      cta_placement: payload.ctaPlacement ?? null,
      outbound_partner: payload.outboundPartner ?? null,
      outbound_destination_type: payload.outboundDestinationType ?? null,
      tournament_id: payload.tournamentId ?? null,
      tournament_slug: payload.tournamentSlug ?? null,
      sport: payload.sport ?? null,
    },
  });
}

function handleClick(payload: VenueAnalyticsBase, onClick?: (event: MouseEvent<any>) => void) {
  return (event: MouseEvent<any>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    void capture(payload);
  };
}

export function RiVenueInternalLink({
  eventName,
  venueId,
  venueName,
  city,
  state,
  sourcePageType,
  sourcePage,
  targetKind,
  nearbyCategory,
  linkedTournamentCount,
  sourceSurface,
  ctaPlacement,
  outboundPartner,
  outboundDestinationType,
  tournamentId,
  tournamentSlug,
  sport,
  onClick,
  children,
  ...rest
}: InternalLinkProps) {
  return (
    <Link
      {...rest}
      onClick={handleClick(
        {
          eventName,
          venueId,
          venueName,
          city,
          state,
          sourcePageType,
          sourcePage,
          targetKind,
          nearbyCategory,
          linkedTournamentCount,
          sourceSurface,
          ctaPlacement,
          outboundPartner,
          outboundDestinationType,
          tournamentId,
          tournamentSlug,
          sport,
        },
        onClick
      )}
    >
      {children}
    </Link>
  );
}

export function RiVenueExternalLink({
  eventName,
  venueId,
  venueName,
  city,
  state,
  sourcePageType,
  sourcePage,
  targetKind,
  nearbyCategory,
  linkedTournamentCount,
  sourceSurface,
  ctaPlacement,
  outboundPartner,
  outboundDestinationType,
  tournamentId,
  tournamentSlug,
  sport,
  onClick,
  children,
  ...rest
}: ExternalLinkProps) {
  return (
    <a
      {...rest}
      onClick={handleClick(
        {
          eventName,
          venueId,
          venueName,
          city,
          state,
          sourcePageType,
          sourcePage,
          targetKind,
          nearbyCategory,
          linkedTournamentCount,
          sourceSurface,
          ctaPlacement,
          outboundPartner,
          outboundDestinationType,
          tournamentId,
          tournamentSlug,
          sport,
        },
        onClick
      )}
    >
      {children}
    </a>
  );
}

type RiVenueDetailAnalyticsProps = {
  venueId: string;
  venueName: string;
  city?: string | null;
  state?: string | null;
  linkedTournamentCount: number;
  nearbyHotelCount: number;
  nearbyCoffeeCount: number;
  nearbyFoodCount: number;
  hasOwlsEye: boolean;
};

export default function RiVenueDetailAnalytics({
  venueId,
  venueName,
  city,
  state,
  linkedTournamentCount,
  nearbyHotelCount,
  nearbyCoffeeCount,
  nearbyFoodCount,
  hasOwlsEye,
}: RiVenueDetailAnalyticsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastKeyRef = useRef<string | null>(null);

  const payload = useMemo(
    () => ({
      venue_id: venueId,
      venue_name: venueName,
      city: city ?? null,
      state: state ?? null,
      path: pathname ?? "",
      query: searchParams?.toString() ?? "",
      linked_tournament_count: linkedTournamentCount,
      nearby_hotel_count: nearbyHotelCount,
      nearby_coffee_count: nearbyCoffeeCount,
      nearby_food_count: nearbyFoodCount,
      has_owls_eye: hasOwlsEye,
      source_page_type: "venue_detail",
    }),
    [city, hasOwlsEye, linkedTournamentCount, nearbyCoffeeCount, nearbyFoodCount, nearbyHotelCount, pathname, searchParams, state, venueId, venueName]
  );

  useEffect(() => {
    const key = JSON.stringify(payload);
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    let cancelled = false;

    async function run() {
      if (cancelled) return;
      await captureRiEvent("ri_venue_detail_viewed", {
        pageType: "venue_detail",
        pagePath: payload.path,
        properties: payload,
      });
      await captureRiEvent("ri_venue_hotels_module_viewed", {
        pageType: "venue_detail",
        pagePath: payload.path,
        properties: payload,
      });
      await captureRiEvent("ri_venue_nearby_module_viewed", {
        pageType: "venue_detail",
        pagePath: payload.path,
        properties: payload,
      });
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [payload]);

  return null;
}

type RiVenueDirectoryAnalyticsProps = {
  resultCount: number;
};

export function RiVenueDirectoryAnalytics({ resultCount }: RiVenueDirectoryAnalyticsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastKeyRef = useRef<string | null>(null);

  const payload = useMemo(
    () => ({
      path: pathname ?? "",
      query: searchParams?.toString() ?? "",
      result_count: resultCount,
      has_search_query: Boolean(searchParams?.get("q")),
      has_month_filter: Boolean(searchParams?.get("month")),
      has_state_filter: Boolean(searchParams?.getAll("state").filter(Boolean).length),
      has_sport_filter: Boolean(searchParams?.getAll("sports").filter(Boolean).length),
      include_past: (searchParams?.get("includePast") ?? "").toLowerCase() === "true",
      source_page_type: "venue_directory",
    }),
    [pathname, resultCount, searchParams]
  );

  useEffect(() => {
    const key = JSON.stringify(payload);
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    let cancelled = false;

    async function run() {
      if (cancelled) return;
      await captureRiEvent("ri_venue_directory_viewed", {
        pageType: "venue_directory",
        pagePath: payload.path,
        properties: payload,
      });
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [payload]);

  return null;
}
