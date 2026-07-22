"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { sendTiAnalytics } from "@/lib/analytics";
import {
  acceptVenueHotelClickAttempt,
  appendVenueHotelTrackingToHref,
  completeVenueHotelClickAttempt,
  createInitialClickAttemptState,
  createInitialImpressionTrackerState,
  makeAnalyticsUuid,
  nextImpressionTrackerState,
  resolveDeviceType,
  resolveTrafficSourceFromPageUrl,
  resolveVenueHotelContext,
  type VenueHotelPlacement,
} from "@/lib/venueHotelFunnel";

const SESSION_STORAGE_KEY = "ti_venue_hotel_session_id";

function getSessionId() {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const created = makeAnalyticsUuid();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return null;
  }
}

function currentPageUrl() {
  if (typeof window === "undefined") return null;
  return `${window.location.pathname}${window.location.search}`;
}

export default function VenueHotelLink({
  href,
  venueId,
  tournamentId = null,
  ctaPlacement,
  className,
  rel,
  target = "_blank",
  children,
  style,
}: {
  href: string;
  venueId: string;
  tournamentId?: string | null;
  ctaPlacement: VenueHotelPlacement;
  className?: string;
  rel?: string;
  target?: "_blank" | "_self";
  children: ReactNode;
  style?: CSSProperties;
}) {
  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const ctaInstanceIdRef = useRef<string>(makeAnalyticsUuid());
  const impressionStateRef = useRef(createInitialImpressionTrackerState());
  const clickStateRef = useRef(createInitialClickAttemptState());
  const sessionIdRef = useRef<string | null>(null);
  const clickCooldownTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    sessionIdRef.current = getSessionId();
    return () => {
      if (clickCooldownTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(clickCooldownTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const element = anchorRef.current;
    if (!element || typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;

    let timeoutId: number | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const isVisible = Boolean(entry?.isIntersecting) && (entry?.intersectionRatio ?? 0) >= 0.5;
        const nowMs = Date.now();
        const result = nextImpressionTrackerState(impressionStateRef.current, { isVisible, nowMs });
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

          const pageUrl = currentPageUrl();
          const sessionId = sessionIdRef.current;
          const context = resolveVenueHotelContext({
            ctaPlacement,
            pageUrl,
            sessionId,
            ctaInstanceId: ctaInstanceIdRef.current,
            deviceType: resolveDeviceType(window.innerWidth),
            trafficSource: resolveTrafficSourceFromPageUrl(pageUrl),
          });
          void sendTiAnalytics("hotel_cta_impression", {
            ...context,
            venue_id: venueId,
            tournament_id: tournamentId ?? null,
            referrer: document.referrer || null,
          });
        }, 500);
      },
      {
        threshold: [0.5],
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [ctaPlacement, tournamentId, venueId]);

  return (
    <a
      ref={anchorRef}
      href={href}
      target={target}
      rel={rel}
      className={className}
      style={style}
      onClick={(event) => {
        if (event.defaultPrevented || typeof window === "undefined") return;
        const clickAttempt = acceptVenueHotelClickAttempt(clickStateRef.current, makeAnalyticsUuid);
        clickStateRef.current = clickAttempt.state;
        if (!clickAttempt.accepted) {
          event.preventDefault();
          return;
        }

        event.preventDefault();
        const pageUrl = currentPageUrl();
        const sessionId = sessionIdRef.current;
        const deviceType = resolveDeviceType(window.innerWidth);
        const trafficSource = resolveTrafficSourceFromPageUrl(pageUrl);
        const outboundRequestId = makeAnalyticsUuid();
        const interactionId = clickAttempt.interactionId;
        const trackedHref = appendVenueHotelTrackingToHref({
          href,
          sessionId,
          ctaInstanceId: ctaInstanceIdRef.current,
          ctaInteractionId: interactionId,
          ctaPlacement,
          pageUrl,
          deviceType,
          trafficSource,
          outboundRequestId,
        });
        const context = resolveVenueHotelContext({
          ctaPlacement,
          pageUrl,
          sessionId,
          ctaInstanceId: ctaInstanceIdRef.current,
          ctaInteractionId: interactionId,
          deviceType,
          trafficSource,
        });

        void sendTiAnalytics("hotel_cta_clicked", {
          ...context,
          venue_id: venueId,
          tournament_id: tournamentId ?? null,
          referrer: document.referrer || null,
          outbound_request_id: outboundRequestId,
        });
        void sendTiAnalytics("venue_hotels_cta_clicked", {
          ...context,
          venue_id: venueId,
          tournament_id: tournamentId ?? null,
          href: trackedHref,
          referrer: document.referrer || null,
        });

        const openedWindow =
          target === "_blank"
            ? window.open(trackedHref, "_blank", "noopener,noreferrer")
            : (window.location.assign(trackedHref), null);

        if (openedWindow) {
          try {
            openedWindow.opener = null;
          } catch {}
        }

        if (clickCooldownTimeoutRef.current !== null) {
          window.clearTimeout(clickCooldownTimeoutRef.current);
        }
        clickCooldownTimeoutRef.current = window.setTimeout(() => {
          clickStateRef.current = completeVenueHotelClickAttempt(clickStateRef.current);
          clickCooldownTimeoutRef.current = null;
        }, 1500);
      }}
    >
      {children}
    </a>
  );
}
