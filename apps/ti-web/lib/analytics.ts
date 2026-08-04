"use client";

type AnalyticsProperties = Record<string, unknown>;

type AnalyticsPayload = {
  event: string;
  properties: AnalyticsProperties;
};

type SendTiAnalyticsOptions = {
  preferBeacon?: boolean;
};

export async function sendTiAnalytics(
  event: string,
  properties: AnalyticsProperties,
  options: SendTiAnalyticsOptions = {}
) {
  const payload: AnalyticsPayload = { event, properties };

  try {
    const supportsBeacon = typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function";
    const shouldPreferBeacon =
      supportsBeacon &&
      (options.preferBeacon ||
        (typeof document !== "undefined" && document.visibilityState === "hidden"));

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
    // Analytics should never block the primary UX.
  }
}
