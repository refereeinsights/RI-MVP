import test from "node:test";
import assert from "node:assert/strict";

import { summarizeFirstGameActivationWindow, type FirstGameActivationAnalyticsRow } from "./firstGameActivationReporting";

function row(event_name: string, session: string | null, overrides: Record<string, unknown> = {}): FirstGameActivationAnalyticsRow {
  return {
    event_name,
    properties: {
      activation_flow: "first_game_inline_v1",
      planner_session_id: session,
      ...overrides,
    },
  };
}

test("summarizes unique first-game sessions without blending legacy traffic", () => {
  const metrics = summarizeFirstGameActivationWindow([
    row("weekend_planner_first_action_available", "ready-1"),
    row("weekend_planner_first_action_available", "ready-1"),
    row("weekend_planner_first_action_available", "ready-2"),
    row("weekend_planner_first_action_cta_viewed", "ready-1"),
    row("weekend_planner_manual_event_form_started", "ready-1"),
    row("weekend_planner_manual_event_submitted", "ready-1"),
    row("weekend_planner_temporary_event_persisted", "ready-1", { event_type: "game" }),
    row("weekend_planner_save_prompt_viewed", "ready-1"),
    {
      event_name: "weekend_planner_temporary_event_persisted",
      properties: { planner_session_id: "legacy", event_type: "game" },
    },
  ]);

  assert.equal(metrics.eligiblePromptReady, 2);
  assert.equal(metrics.promptViewed, 1);
  assert.equal(metrics.firstGamePersisted, 1);
  assert.equal(metrics.savePromptViewed, 1);
});

test("excludes non-game persistence and reports missing tagged session ids", () => {
  const metrics = summarizeFirstGameActivationWindow([
    row("weekend_planner_temporary_event_persisted", "hotel", { event_type: "hotel" }),
    row("weekend_planner_manual_event_failed", null),
    row("weekend_planner_auth_started", "auth-1"),
    row("weekend_planner_auth_completed", "auth-1"),
  ]);

  assert.equal(metrics.firstGamePersisted, 0);
  assert.equal(metrics.persistenceFailures, 0);
  assert.equal(metrics.authStarted, 1);
  assert.equal(metrics.authCompleted, 1);
  assert.equal(metrics.taggedEventsMissingSessionId, 1);
});
