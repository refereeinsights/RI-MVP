"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentProps, MouseEvent, ReactNode } from "react";

type VenueAnalyticsBase = {
  eventName: string;
  venueId: string;
  venueName: string;
  city?: string | null;
  state?: string | null;
  sourcePageType: "venue_detail" | "venue_directory";
  targetKind?: string | null;
  nearbyCategory?: string | null;
  linkedTournamentCount?: number | null;
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
  if (typeof window === "undefined" || process.env.NODE_ENV !== "production") return;
  const posthog = (await import("posthog-js")).default;
  posthog.capture(payload.eventName, {
    venue_id: payload.venueId,
    venue_name: payload.venueName,
    city: payload.city ?? null,
    state: payload.state ?? null,
    source_page_type: payload.sourcePageType,
    target_kind: payload.targetKind ?? null,
    nearby_category: payload.nearbyCategory ?? null,
    linked_tournament_count: payload.linkedTournamentCount ?? null,
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
  targetKind,
  nearbyCategory,
  linkedTournamentCount,
  onClick,
  children,
  ...rest
}: InternalLinkProps) {
  return (
    <Link
      {...rest}
      onClick={handleClick(
        { eventName, venueId, venueName, city, state, sourcePageType, targetKind, nearbyCategory, linkedTournamentCount },
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
  targetKind,
  nearbyCategory,
  linkedTournamentCount,
  onClick,
  children,
  ...rest
}: ExternalLinkProps) {
  return (
    <a
      {...rest}
      onClick={handleClick(
        { eventName, venueId, venueName, city, state, sourcePageType, targetKind, nearbyCategory, linkedTournamentCount },
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
    if (typeof window === "undefined" || process.env.NODE_ENV !== "production") return;
    const key = JSON.stringify(payload);
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    let cancelled = false;

    async function run() {
      const posthog = (await import("posthog-js")).default;
      if (cancelled) return;
      posthog.capture("ri_venue_detail_viewed", payload);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [payload]);

  return null;
}
