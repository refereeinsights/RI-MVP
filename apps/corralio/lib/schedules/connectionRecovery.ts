import type { ScheduleConnectionFailureReason } from "./connectionAnalytics";

const SCHEDULE_CONNECTION_RECOVERY_COPY: Partial<Record<ScheduleConnectionFailureReason, string>> = {
  invalid_url: "Copy the calendar subscription link from your team app and try again.",
  unsupported_protocol: "Use the full public http, https, or webcal subscription link.",
  private_url: "Choose the app’s public calendar subscription link rather than a device or local-network address.",
  fetch_failed: "Confirm the subscription is still active, then copy the link again.",
  not_ics: "Look for Subscribe, Export calendar, iCal, ICS, or webcal in your team app.",
  too_large: "Try a team or season calendar instead of an organization-wide calendar.",
  no_events: "Confirm the calendar contains upcoming events and that its subscription is active.",
  already_connected: "Use the connected-schedule controls below if you need to change its family assignment.",
  needs_replacement: "Use Replace calendar link on the connected schedule below.",
};

export function getScheduleConnectionRecoveryCopy(
  errorKind: ScheduleConnectionFailureReason | undefined,
): string | null {
  return errorKind ? SCHEDULE_CONNECTION_RECOVERY_COPY[errorKind] ?? null : null;
}
