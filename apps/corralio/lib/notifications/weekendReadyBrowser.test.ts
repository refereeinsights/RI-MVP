import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBrowserTimezoneSuggestion,
  resolveWeekendReadyBrowserState,
  serializeBrowserPushSubscription,
} from "./weekendReadyBrowser";

const supported = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotifications: true,
  permission: "default" as const,
  isIos: false,
  isStandalone: false,
  vapidPublicKey: "FixturePublicKey",
};

test("resolves unsupported, iOS install, denied, and available browser states", () => {
  assert.equal(resolveWeekendReadyBrowserState({ ...supported, hasPushManager: false }), "unsupported");
  assert.equal(resolveWeekendReadyBrowserState({ ...supported, vapidPublicKey: null }), "unsupported");
  assert.equal(resolveWeekendReadyBrowserState({ ...supported, isIos: true }), "ios_install_required");
  assert.equal(resolveWeekendReadyBrowserState({ ...supported, permission: "denied" }), "denied");
  assert.equal(resolveWeekendReadyBrowserState(supported), "available");
});

test("treats browser timezone as a validated suggestion only", () => {
  assert.equal(parseBrowserTimezoneSuggestion("America/Los_Angeles"), "America/Los_Angeles");
  assert.equal(parseBrowserTimezoneSuggestion("GMT+2"), null);
});

test("serializes only the browser's bounded protocol subscription", () => {
  const subscription = {
    endpoint: "https://push.example.test/fixture",
    toJSON: () => ({ keys: { p256dh: "FixtureP256dh", auth: "FixtureAuth" } }),
  } as unknown as PushSubscription;
  assert.deepEqual(serializeBrowserPushSubscription(subscription), {
    endpoint: "https://push.example.test/fixture",
    p256dh: "FixtureP256dh",
    auth: "FixtureAuth",
  });
});
