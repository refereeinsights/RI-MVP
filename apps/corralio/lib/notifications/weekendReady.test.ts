import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeekendReadyPayload,
  classifyWeekendReadyProviderStatus,
  parsePushSubscriptionInput,
  runWeekendReadyBatch,
  type WeekendReadyBatchStore,
  type WeekendReadyDeliveryClaim,
} from "./weekendReady";

const validSubscription = {
  endpoint: "https://push.example.test/subscription/one",
  p256dh: "Abc_123",
  auth: "Def-456",
};

test("validates only bounded HTTPS Web Push subscription material", () => {
  assert.deepEqual(parsePushSubscriptionInput(validSubscription), validSubscription);
  assert.equal(parsePushSubscriptionInput({ ...validSubscription, endpoint: "http://push.example.test/one" }), null);
  assert.equal(parsePushSubscriptionInput({ ...validSubscription, endpoint: "https://user:pass@push.example.test/one" }), null);
  assert.equal(parsePushSubscriptionInput({ ...validSubscription, auth: "not base64!" }), null);
});

test("constructs the fixed privacy-safe payload from a trusted configured origin", () => {
  assert.deepEqual(buildWeekendReadyPayload("https://corralio.example"), {
    title: "Your weekend is ready",
    body: "Open Corralio to see your family plan.",
    url: "https://corralio.example/?src=weekend_ready_push",
  });
  assert.throws(() => buildWeekendReadyPayload("https://corralio.example/attacker"));
  assert.throws(() => buildWeekendReadyPayload("https://user:pass@corralio.example"));
});

test("classifies provider acceptance, bounded retry, permanent failure, and dead endpoints", () => {
  assert.deepEqual(classifyWeekendReadyProviderStatus(201), { kind: "accepted" });
  assert.deepEqual(classifyWeekendReadyProviderStatus(429), { kind: "transient_failure", errorCode: "rate_limited" });
  assert.deepEqual(classifyWeekendReadyProviderStatus(503), { kind: "transient_failure", errorCode: "provider_error" });
  assert.deepEqual(classifyWeekendReadyProviderStatus(400), { kind: "permanent_failure", errorCode: "invalid_request" });
  assert.deepEqual(classifyWeekendReadyProviderStatus(410), { kind: "dead_endpoint", errorCode: "dead_endpoint" });
});

test("isolates individual delivery failures and never exposes subscription material in the result", async () => {
  const claims: WeekendReadyDeliveryClaim[] = [
    { ...validSubscription, deliveryId: "delivery-1", claimToken: "claim-1", attemptCount: 1 },
    { ...validSubscription, endpoint: "https://push.example.test/subscription/two", deliveryId: "delivery-2", claimToken: "claim-2", attemptCount: 1 },
    { ...validSubscription, endpoint: "https://push.example.test/subscription/three", deliveryId: "delivery-3", claimToken: "claim-3", attemptCount: 1 },
  ];
  const finished: Parameters<WeekendReadyBatchStore["finishDelivery"]>[0][] = [];
  const store: WeekendReadyBatchStore = {
    claimDeliveries: async (limit) => claims.slice(0, limit),
    finishDelivery: async (input) => { finished.push(input); },
  };
  const result = await runWeekendReadyBatch({
    store,
    siteOrigin: "https://corralio.example",
    sender: async (subscription) => {
      if (subscription.endpoint.endsWith("/one")) return { status: 201 };
      if (subscription.endpoint.endsWith("/two")) throw new Error("private provider detail");
      return { status: 410 };
    },
  });

  assert.deepEqual(result, {
    claimed: 3,
    accepted: 1,
    transientFailures: 1,
    permanentFailures: 0,
    deadEndpoints: 1,
  });
  assert.deepEqual(finished.map((row) => row.outcome.kind), ["accepted", "transient_failure", "dead_endpoint"]);
  assert.doesNotMatch(JSON.stringify(result), /push\.example|p256dh|auth|subscription/i);
});
