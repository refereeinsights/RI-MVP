"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type Provider = "google" | "apple" | "waze";

type Props = {
  provider: Provider;
  query: string;
  fallbackHref: string;
  className?: string;
  children: ReactNode;
  trackEvent?:
    | {
        name: "venue_details_directions_click";
        properties: { venue_id: string; venue_name: string; tournament_slug?: string | null };
      }
    | {
        name: "directions_click";
        properties: {
          page_type: "venue_map";
          tournament_id: string;
          tournament_slug: string;
          venue_id: string;
          venue_name: string | null;
          source: "venue_card" | "selected_venue_panel" | "venue_marker";
          provider: "apple" | "google" | "waze" | "copy";
          hasCoordinates: boolean;
          hasOwlEyeData: boolean;
        };
      };
};

function isMobileUserAgent() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod|android/i.test(navigator.userAgent);
}

function isIosUserAgent() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function buildAppHref(provider: Provider, query: string) {
  const encoded = encodeURIComponent(query);
  if (provider === "apple") return `maps://?q=${encoded}`;
  if (provider === "google") {
    return isIosUserAgent() ? `comgooglemaps://?q=${encoded}` : `geo:0,0?q=${encoded}`;
  }
  return `waze://?q=${encoded}&navigate=yes`;
}

function launchWithFallback(appHref: string, fallbackHref: string) {
  let didHide = false;
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") didHide = true;
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    if (!didHide) window.location.assign(fallbackHref);
  }, 900);
  window.location.assign(appHref);
}

export default function MobileMapLink({ provider, query, fallbackHref, className, children, trackEvent }: Props) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(isMobileUserAgent());
  }, []);

  const appHref = useMemo(() => buildAppHref(provider, query), [provider, query]);

  return (
    <a
      href={fallbackHref}
      target={isMobile ? undefined : "_blank"}
      rel="noopener noreferrer"
      className={className}
      onClick={(event) => {
        if (trackEvent) {
          // Keep directions tracking best-effort and non-blocking.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          import("@/lib/tiAnalyticsClient").then(({ trackTiEvent }) => {
            void trackTiEvent(trackEvent.name as any, trackEvent.properties as any);
          });
        }
        if (!isMobile) return;
        event.preventDefault();
        launchWithFallback(appHref, fallbackHref);
      }}
    >
      {children}
    </a>
  );
}
