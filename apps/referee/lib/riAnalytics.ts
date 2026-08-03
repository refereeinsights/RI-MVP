"use client";

export const RI_SOURCE_APP = "refereeinsights";

export type RiPageType =
  | "tournament_directory"
  | "sport_hub"
  | "tournament_detail"
  | "tournament_map"
  | "venue_directory"
  | "venue_detail";

type CaptureArgs = {
  pageType: RiPageType;
  pagePath?: string | null;
  userType?: "anonymous" | "authenticated" | null;
  properties?: Record<string, unknown>;
};

export function getRiDeviceType(viewportWidth: number) {
  if (viewportWidth < 768) return "mobile";
  if (viewportWidth < 1100) return "tablet";
  return "desktop";
}

export function getRiTrafficSource(currentUrl: string, referrer: string) {
  try {
    const url = new URL(currentUrl, "https://www.refereeinsights.com");
    const utmSource = url.searchParams.get("utm_source")?.trim();
    if (utmSource) return utmSource;

    if (!referrer.trim()) return "direct";

    const referrerUrl = new URL(referrer);
    if (/google\./i.test(referrerUrl.hostname) || /bing\.com/i.test(referrerUrl.hostname)) return "organic_search";
    if (referrerUrl.hostname.endsWith("refereeinsights.com")) return "internal";
    return "referral";
  } catch {
    return "unknown";
  }
}

function getCurrentPagePath() {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}

export function buildRiBaseEventPayload(args: Omit<CaptureArgs, "properties">) {
  if (typeof window === "undefined") {
    return {
      source_app: RI_SOURCE_APP,
      page_type: args.pageType,
      page_path: args.pagePath ?? "",
      device_type: null,
      traffic_source: null,
      user_type: args.userType ?? null,
    };
  }

  return {
    source_app: RI_SOURCE_APP,
    page_type: args.pageType,
    page_path: args.pagePath ?? getCurrentPagePath(),
    device_type: getRiDeviceType(window.innerWidth),
    traffic_source: getRiTrafficSource(window.location.href, document.referrer),
    user_type: args.userType ?? null,
  };
}

export async function captureRiEvent(eventName: string, args: CaptureArgs) {
  if (typeof window === "undefined") return;

  const payload = {
    event: eventName,
    properties: {
      ...buildRiBaseEventPayload(args),
      ...(args.properties ?? {}),
    },
  };

  try {
    const shouldPreferBeacon =
      document.visibilityState === "hidden" &&
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function";

    if (shouldPreferBeacon) {
      const body = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const accepted = navigator.sendBeacon("/api/analytics", body);
      if (accepted) return;
    }

    await fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Analytics must fail open.
  }
}
