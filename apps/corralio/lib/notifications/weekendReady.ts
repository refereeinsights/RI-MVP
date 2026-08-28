import { parseCorralioSiteOrigin } from "../siteOrigin";

export const WEEKEND_READY_TITLE = "Your weekend is ready";
export const WEEKEND_READY_BODY = "Open Corralio to see your family plan.";
export const WEEKEND_READY_MAX_DELIVERY_ATTEMPTS = 2;
export const WEEKEND_READY_MAX_BATCH_SIZE = 50;
export const WEEKEND_READY_MAX_CONCURRENCY = 5;

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type WeekendReadyDeliveryClaim = PushSubscriptionInput & {
  deliveryId: string;
  claimToken: string;
  attemptCount: number;
};

export type WeekendReadyProviderOutcome =
  | { kind: "accepted" }
  | { kind: "transient_failure"; errorCode: "rate_limited" | "provider_error" }
  | { kind: "permanent_failure"; errorCode: "invalid_request" }
  | { kind: "dead_endpoint"; errorCode: "dead_endpoint" };

export type WeekendReadyBatchStore = {
  claimDeliveries(limit: number): Promise<WeekendReadyDeliveryClaim[]>;
  finishDelivery(input: {
    deliveryId: string;
    claimToken: string;
    outcome: WeekendReadyProviderOutcome;
  }): Promise<void>;
};

export type WeekendReadySender = (
  subscription: PushSubscriptionInput,
  payload: ReturnType<typeof buildWeekendReadyPayload>,
) => Promise<{ status: number }>;

function isBase64Url(value: string, maximumLength: number) {
  return value.length >= 1
    && value.length <= maximumLength
    && /^[A-Za-z0-9_-]+$/.test(value);
}

export function parsePushSubscriptionInput(value: unknown): PushSubscriptionInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<PushSubscriptionInput>;
  if (typeof input.endpoint !== "string" || input.endpoint.length > 4096) return null;
  let endpoint: URL;
  try {
    endpoint = new URL(input.endpoint);
  } catch {
    return null;
  }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) return null;
  if (typeof input.p256dh !== "string" || !isBase64Url(input.p256dh, 512)) return null;
  if (typeof input.auth !== "string" || !isBase64Url(input.auth, 256)) return null;
  return { endpoint: endpoint.toString(), p256dh: input.p256dh, auth: input.auth };
}

export function buildWeekendReadyPayload(rawOrigin: string) {
  const origin = parseCorralioSiteOrigin(rawOrigin);
  const url = new URL("/", origin);
  url.searchParams.set("src", "weekend_ready_push");
  return {
    title: WEEKEND_READY_TITLE,
    body: WEEKEND_READY_BODY,
    url: url.toString(),
  } as const;
}

export function classifyWeekendReadyProviderStatus(status: number): WeekendReadyProviderOutcome {
  if (status >= 200 && status < 300) return { kind: "accepted" };
  if (status === 404 || status === 410) {
    return { kind: "dead_endpoint", errorCode: "dead_endpoint" };
  }
  if (status === 408 || status === 429 || status >= 500) {
    return {
      kind: "transient_failure",
      errorCode: status === 429 ? "rate_limited" : "provider_error",
    };
  }
  return { kind: "permanent_failure", errorCode: "invalid_request" };
}

export async function runWeekendReadyBatch(input: {
  store: WeekendReadyBatchStore;
  sender: WeekendReadySender;
  siteOrigin: string;
  limit?: number;
}) {
  const limit = Math.min(
    Math.max(Math.trunc(input.limit ?? WEEKEND_READY_MAX_BATCH_SIZE), 1),
    WEEKEND_READY_MAX_BATCH_SIZE,
  );
  const claims = await input.store.claimDeliveries(limit);
  const payload = buildWeekendReadyPayload(input.siteOrigin);
  const result = {
    claimed: claims.length,
    accepted: 0,
    transientFailures: 0,
    permanentFailures: 0,
    deadEndpoints: 0,
    finalizationFailures: 0,
  };

  for (let offset = 0; offset < claims.length; offset += WEEKEND_READY_MAX_CONCURRENCY) {
    const chunk = claims.slice(offset, offset + WEEKEND_READY_MAX_CONCURRENCY);
    const outcomes = await Promise.all(chunk.map(async (claim) => {
      let outcome: WeekendReadyProviderOutcome;
      try {
        const providerResult = await input.sender(
          { endpoint: claim.endpoint, p256dh: claim.p256dh, auth: claim.auth },
          payload,
        );
        outcome = classifyWeekendReadyProviderStatus(providerResult.status);
      } catch {
        outcome = { kind: "transient_failure", errorCode: "provider_error" };
      }
      try {
        await input.store.finishDelivery({
          deliveryId: claim.deliveryId,
          claimToken: claim.claimToken,
          outcome,
        });
        return { outcome, finalized: true } as const;
      } catch {
        return { outcome, finalized: false } as const;
      }
    }));
    for (const { outcome, finalized } of outcomes) {
      if (!finalized) result.finalizationFailures += 1;
      if (outcome.kind === "accepted") result.accepted += 1;
      else if (outcome.kind === "transient_failure") result.transientFailures += 1;
      else if (outcome.kind === "dead_endpoint") result.deadEndpoints += 1;
      else result.permanentFailures += 1;
    }
  }

  return result;
}
