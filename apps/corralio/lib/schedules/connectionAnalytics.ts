import { parseSchedulePlatform, type SchedulePlatformKey } from "./platforms";

export const SCHEDULE_CONNECTION_ANALYTICS_FAILURE_LOG =
  "corralio: schedule connection measurement failed";

export const SCHEDULE_CONNECTION_INTERACTION_EVENTS = [
  "platform_selected",
  "instructions_viewed",
  "link_submission_failed",
  "feed_validation_failed",
] as const;

export const SCHEDULE_CONNECTION_FAILURE_REASONS = [
  "missing_url",
  "invalid_sport",
  "invalid_url",
  "unsupported_protocol",
  "private_url",
  "fetch_failed",
  "not_ics",
  "too_large",
  "no_events",
  "already_connected",
  "needs_replacement",
  "unauthorized",
  "persistence",
  "temporary_failure",
] as const;

export type ScheduleConnectionInteractionEvent = (typeof SCHEDULE_CONNECTION_INTERACTION_EVENTS)[number];
export type ScheduleConnectionFailureReason = (typeof SCHEDULE_CONNECTION_FAILURE_REASONS)[number];

export type ScheduleConnectionInteraction = {
  event: ScheduleConnectionInteractionEvent;
  platform: SchedulePlatformKey;
  reason?: ScheduleConnectionFailureReason | null;
};

export function sanitizeScheduleConnectionInteraction(input: unknown): ScheduleConnectionInteraction | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<ScheduleConnectionInteraction>;
  const platform = parseSchedulePlatform(candidate.platform);
  if (!platform || !SCHEDULE_CONNECTION_INTERACTION_EVENTS.includes(candidate.event as ScheduleConnectionInteractionEvent)) {
    return null;
  }
  const requiresReason = candidate.event === "link_submission_failed" || candidate.event === "feed_validation_failed";
  const reason = candidate.reason ?? null;
  if (requiresReason && !SCHEDULE_CONNECTION_FAILURE_REASONS.includes(reason as ScheduleConnectionFailureReason)) return null;
  if (!requiresReason && reason !== null) return null;
  return { event: candidate.event as ScheduleConnectionInteractionEvent, platform, reason };
}

type InteractionDependencies = {
  callRpc: (payload: ScheduleConnectionInteraction) => Promise<{ error: unknown }>;
  log: (message: string) => void;
};

function logFailure(log: (message: string) => void) {
  try {
    log(SCHEDULE_CONNECTION_ANALYTICS_FAILURE_LOG);
  } catch {
    // Measurement is best effort and can never affect schedule connection.
  }
}

export async function recordScheduleConnectionInteraction(
  deps: InteractionDependencies,
  input: unknown,
): Promise<void> {
  const payload = sanitizeScheduleConnectionInteraction(input);
  if (!payload) return;
  try {
    const { error } = await deps.callRpc(payload);
    if (error) logFailure(deps.log);
  } catch {
    logFailure(deps.log);
  }
}
