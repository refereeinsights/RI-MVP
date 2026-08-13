import { FIRST_GAME_ACTIVATION_FLOW } from "./firstGameActivation";

export type FirstGameActivationAnalyticsRow = {
  event_name: string;
  properties: Record<string, unknown> | null;
  created_at?: string | null;
};

export type FirstGameActivationWindowMetrics = {
  eligiblePromptReady: number;
  promptViewed: number;
  firstGameStarted: number;
  firstGameSubmitted: number;
  firstGamePersisted: number;
  persistenceFailures: number;
  savePromptViewed: number;
  authStarted: number;
  authCompleted: number;
  taggedEventsMissingSessionId: number;
};

export type FirstGameActivationAggregateRow = {
  window_key: "yesterday" | "trailing_7d" | string;
  event_name: string;
  unique_sessions: number | string | null;
  missing_session_events: number | string | null;
};

export const FIRST_GAME_ACTIVATION_EVENT_NAMES = [
  "weekend_planner_first_action_available",
  "weekend_planner_first_action_cta_viewed",
  "weekend_planner_manual_event_form_started",
  "weekend_planner_manual_event_submitted",
  "weekend_planner_temporary_event_persisted",
  "weekend_planner_manual_event_failed",
  "weekend_planner_save_prompt_viewed",
  "weekend_planner_auth_started",
  "weekend_planner_auth_completed",
] as const;

const EMPTY_FIRST_GAME_ACTIVATION_METRICS: FirstGameActivationWindowMetrics = {
  eligiblePromptReady: 0,
  promptViewed: 0,
  firstGameStarted: 0,
  firstGameSubmitted: 0,
  firstGamePersisted: 0,
  persistenceFailures: 0,
  savePromptViewed: 0,
  authStarted: 0,
  authCompleted: 0,
  taggedEventsMissingSessionId: 0,
};

function aggregateNumber(value: number | string | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function mapFirstGameActivationAggregate(
  rows: FirstGameActivationAggregateRow[],
  windowKey: "yesterday" | "trailing_7d",
): FirstGameActivationWindowMetrics {
  const counts = new Map<string, number>();
  let taggedEventsMissingSessionId = 0;
  for (const row of rows) {
    if (row.window_key !== windowKey) continue;
    if (!FIRST_GAME_ACTIVATION_EVENT_NAMES.includes(row.event_name as (typeof FIRST_GAME_ACTIVATION_EVENT_NAMES)[number])) {
      continue;
    }
    counts.set(row.event_name, aggregateNumber(row.unique_sessions));
    taggedEventsMissingSessionId += aggregateNumber(row.missing_session_events);
  }

  return {
    ...EMPTY_FIRST_GAME_ACTIVATION_METRICS,
    eligiblePromptReady: counts.get("weekend_planner_first_action_available") ?? 0,
    promptViewed: counts.get("weekend_planner_first_action_cta_viewed") ?? 0,
    firstGameStarted: counts.get("weekend_planner_manual_event_form_started") ?? 0,
    firstGameSubmitted: counts.get("weekend_planner_manual_event_submitted") ?? 0,
    firstGamePersisted: counts.get("weekend_planner_temporary_event_persisted") ?? 0,
    persistenceFailures: counts.get("weekend_planner_manual_event_failed") ?? 0,
    savePromptViewed: counts.get("weekend_planner_save_prompt_viewed") ?? 0,
    authStarted: counts.get("weekend_planner_auth_started") ?? 0,
    authCompleted: counts.get("weekend_planner_auth_completed") ?? 0,
    taggedEventsMissingSessionId,
  };
}

function propertyText(row: FirstGameActivationAnalyticsRow, key: string) {
  const value = row.properties?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function summarizeFirstGameActivationWindow(
  rows: FirstGameActivationAnalyticsRow[],
): FirstGameActivationWindowMetrics {
  const sessionsByEvent = new Map<string, Set<string>>();
  let taggedEventsMissingSessionId = 0;

  for (const row of rows) {
    if (propertyText(row, "activation_flow") !== FIRST_GAME_ACTIVATION_FLOW) continue;
    if (!FIRST_GAME_ACTIVATION_EVENT_NAMES.includes(row.event_name as (typeof FIRST_GAME_ACTIVATION_EVENT_NAMES)[number])) {
      continue;
    }
    if (
      row.event_name === "weekend_planner_temporary_event_persisted" &&
      propertyText(row, "event_type") !== "game"
    ) {
      continue;
    }
    const plannerSessionId = propertyText(row, "planner_session_id");
    if (!plannerSessionId) {
      taggedEventsMissingSessionId += 1;
      continue;
    }
    const sessions = sessionsByEvent.get(row.event_name) ?? new Set<string>();
    sessions.add(plannerSessionId);
    sessionsByEvent.set(row.event_name, sessions);
  }

  const count = (eventName: string) => sessionsByEvent.get(eventName)?.size ?? 0;
  return {
    eligiblePromptReady: count("weekend_planner_first_action_available"),
    promptViewed: count("weekend_planner_first_action_cta_viewed"),
    firstGameStarted: count("weekend_planner_manual_event_form_started"),
    firstGameSubmitted: count("weekend_planner_manual_event_submitted"),
    firstGamePersisted: count("weekend_planner_temporary_event_persisted"),
    persistenceFailures: count("weekend_planner_manual_event_failed"),
    savePromptViewed: count("weekend_planner_save_prompt_viewed"),
    authStarted: count("weekend_planner_auth_started"),
    authCompleted: count("weekend_planner_auth_completed"),
    taggedEventsMissingSessionId,
  };
}
