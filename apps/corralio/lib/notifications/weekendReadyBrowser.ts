import { parseIanaTimeZone } from "../householdTimezone";
import { parsePushSubscriptionInput, type PushSubscriptionInput } from "./weekendReady";

export type WeekendReadyBrowserState =
  | "unsupported"
  | "ios_install_required"
  | "denied"
  | "available";

export function resolveWeekendReadyBrowserState(input: {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotifications: boolean;
  permission: NotificationPermission | "unavailable";
  isIos: boolean;
  isStandalone: boolean;
  vapidPublicKey: string | null;
}): WeekendReadyBrowserState {
  if (
    !input.vapidPublicKey
    || !input.hasServiceWorker
    || !input.hasPushManager
    || !input.hasNotifications
  ) return "unsupported";
  if (input.isIos && !input.isStandalone) return "ios_install_required";
  if (input.permission === "denied") return "denied";
  return "available";
}

export function parseBrowserTimezoneSuggestion(value: unknown) {
  return parseIanaTimeZone(value);
}

export function decodeVapidPublicKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replaceAll("-", "+").replaceAll("_", "/");
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export function serializeBrowserPushSubscription(subscription: PushSubscription): PushSubscriptionInput | null {
  const json = subscription.toJSON();
  return parsePushSubscriptionInput({
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
  });
}
