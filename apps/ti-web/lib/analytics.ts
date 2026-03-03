"use client";

type AnalyticsProperties = Record<string, unknown>;

type AnalyticsPayload = {
  event: string;
  properties: AnalyticsProperties;
};

export async function sendTiAnalytics(event: string, properties: AnalyticsProperties) {
  const payload: AnalyticsPayload = { event, properties };

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const body = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon("/api/analytics", body);
      return;
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
