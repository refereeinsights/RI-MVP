"use client";

import { sendTiAnalytics } from "@/lib/analytics";
import type { TiAnalyticsEventName, TiAnalyticsEventPropertiesByName } from "@/lib/tiAnalyticsEvents";

export function trackTiEvent<E extends TiAnalyticsEventName>(
  event: E,
  properties: TiAnalyticsEventPropertiesByName[E]
) {
  return sendTiAnalytics(event, properties as Record<string, unknown>);
}

