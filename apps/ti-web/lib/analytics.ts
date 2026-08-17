"use client";

import {
  buildAnalyticsDedupeKey,
  createAnalyticsBatcher,
  isRepeatableViewEvent,
} from "../../../packages/lib/analytics-batch";

type AnalyticsProperties = Record<string, unknown>;

type AnalyticsPayload = {
  event: string;
  properties: AnalyticsProperties;
};

type SendTiAnalyticsOptions = {
  preferBeacon?: boolean;
};

const analyticsBatcher = createAnalyticsBatcher();
const IMMEDIATE_TI_EVENTS = new Set([
  "weekend_planner_activation_achieved",
  "weekend_planner_first_meaningful_action",
  "weekend_planner_temporary_event_persisted",
  "weekend_planner_auth_completed",
  "weekend_planner_anonymous_claim_succeeded",
  "team_hotel_request_submitted",
  "team_hotel_request_succeeded",
  "book_travel_shared",
  "Tournament Saved",
  "Saved Tournament Notify Enabled",
]);

export async function sendTiAnalytics(
  event: string,
  properties: AnalyticsProperties,
  options: SendTiAnalyticsOptions = {}
) {
  const payload: AnalyticsPayload = { event, properties };
  const preferBeacon =
    Boolean(options.preferBeacon) ||
    (typeof document !== "undefined" && document.visibilityState === "hidden");
  const dedupeKey = isRepeatableViewEvent(event)
    ? buildAnalyticsDedupeKey("ti", event, properties)
    : null;

  await analyticsBatcher.send(payload, {
    immediate: IMMEDIATE_TI_EVENTS.has(event),
    preferBeacon,
    dedupeKey,
  });
}
