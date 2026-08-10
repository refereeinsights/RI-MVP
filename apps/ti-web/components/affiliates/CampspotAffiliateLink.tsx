"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import {
  type CampspotCtaPlacement,
  type CampspotSourceSurface,
} from "@/lib/affiliates/campspot";
import { readOrCreateLodgingSessionId } from "@/lib/lodgingSession";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";
import {
  createInitialImpressionTrackerState,
  makeAnalyticsUuid,
  nextImpressionTrackerState,
  resolveDeviceType,
} from "@/lib/venueHotelFunnel";

function currentPageUrl() {
  if (typeof window === "undefined") return null;
  return `${window.location.pathname}${window.location.search}`;
}

export default function CampspotAffiliateLink({
  href,
  sourceSurface,
  ctaPlacement,
  venueId,
  tournamentId = null,
  tournamentSlug = null,
  className,
  style,
  children,
}: {
  href: string;
  sourceSurface: CampspotSourceSurface;
  ctaPlacement: CampspotCtaPlacement;
  venueId: string;
  tournamentId?: string | null;
  tournamentSlug?: string | null;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const impressionStateRef = useRef(createInitialImpressionTrackerState());
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    sessionIdRef.current = readOrCreateLodgingSessionId();
  }, []);

  useEffect(() => {
    const element = anchorRef.current;
    if (!element || typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;

    let timeoutId: number | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const isVisible = Boolean(entry?.isIntersecting) && (entry?.intersectionRatio ?? 0) >= 0.5;
        const result = nextImpressionTrackerState(impressionStateRef.current, { isVisible, nowMs: Date.now() });
        impressionStateRef.current = result.state;

        if (!isVisible && timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
          return;
        }
        if (!isVisible || result.shouldTrack || timeoutId !== null) return;

        timeoutId = window.setTimeout(() => {
          timeoutId = null;
          const finalResult = nextImpressionTrackerState(impressionStateRef.current, {
            isVisible: true,
            nowMs: Date.now(),
          });
          impressionStateRef.current = finalResult.state;
          if (!finalResult.shouldTrack) return;

          void trackTiEvent("camping_cta_impression", {
            page_type: sourceSurface,
            source_surface: sourceSurface,
            cta_placement: ctaPlacement,
            session_id: sessionIdRef.current,
            tournament_id: tournamentId,
            tournament_slug: tournamentSlug,
            venue_id: venueId,
            device_type: resolveDeviceType(window.innerWidth),
          });
        }, 500);
      },
      { threshold: [0.5] },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [ctaPlacement, sourceSurface, tournamentId, tournamentSlug, venueId]);

  return (
    <a
      ref={anchorRef}
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={className}
      style={style}
      onClick={(event) => {
        if (event.defaultPrevented || typeof window === "undefined") return;
        event.preventDefault();
        const url = new URL(href, window.location.origin);
        const sessionId = sessionIdRef.current ?? readOrCreateLodgingSessionId();
        if (sessionId) url.searchParams.set("session_id", sessionId);
        url.searchParams.set("device_type", resolveDeviceType(window.innerWidth) ?? "unknown");
        url.searchParams.set("page_url", currentPageUrl() ?? "");
        url.searchParams.set("outbound_request_id", makeAnalyticsUuid());
        const openedWindow = window.open(`${url.pathname}${url.search}`, "_blank", "noopener,noreferrer");
        if (openedWindow) openedWindow.opener = null;
      }}
    >
      {children}
    </a>
  );
}
