import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import webPush from "web-push";

import { getCorralioSiteOrigin } from "@/lib/siteOrigin.server";
import {
  runWeekendReadyBatch,
  type WeekendReadyBatchStore,
  type WeekendReadyDeliveryClaim,
  type WeekendReadyProviderOutcome,
} from "./weekendReady";

function requiredPushEnvironment(name: "CORRALIO_VAPID_PUBLIC_KEY" | "CORRALIO_VAPID_PRIVATE_KEY") {
  const value = process.env[name]?.trim();
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`Missing or invalid ${name}`);
  }
  return value;
}

export function getWeekendReadyPublicKey() {
  const value = process.env.CORRALIO_VAPID_PUBLIC_KEY?.trim();
  return value && /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

function asDeliveryClaim(value: unknown): WeekendReadyDeliveryClaim | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.delivery_id !== "string"
    || typeof row.claim_token !== "string"
    || typeof row.attempt_count !== "number"
    || typeof row.endpoint !== "string"
    || typeof row.p256dh !== "string"
    || typeof row.auth_secret !== "string"
  ) return null;
  return {
    deliveryId: row.delivery_id,
    claimToken: row.claim_token,
    attemptCount: row.attempt_count,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth_secret,
  };
}

export function createWeekendReadySupabaseStore(
  adminClient: SupabaseClient,
  now: () => Date = () => new Date(),
): WeekendReadyBatchStore {
  return {
    async claimDeliveries(limit) {
      const { data, error } = await adminClient.rpc("corralio_claim_weekend_ready_deliveries_v1", {
        p_now: now().toISOString(),
        p_limit: limit,
      });
      if (error || !Array.isArray(data)) throw new Error("Weekend Ready claim failed");
      const claims = data.map(asDeliveryClaim);
      if (claims.some((claim) => claim === null)) throw new Error("Weekend Ready claim shape failed");
      return claims as WeekendReadyDeliveryClaim[];
    },
    async finishDelivery({ deliveryId, claimToken, outcome }) {
      const { data, error } = await adminClient.rpc("corralio_finish_weekend_ready_delivery_v1", {
        p_delivery_id: deliveryId,
        p_claim_token: claimToken,
        p_outcome: outcome.kind,
        p_error_code: "errorCode" in outcome ? outcome.errorCode : null,
      });
      if (error || data !== true) throw new Error("Weekend Ready finish failed");
    },
  };
}

type ProviderHttpError = Error & { statusCode?: number };

export function createWeekendReadyWebPushSender() {
  const siteOrigin = getCorralioSiteOrigin();
  const publicKey = requiredPushEnvironment("CORRALIO_VAPID_PUBLIC_KEY");
  const privateKey = requiredPushEnvironment("CORRALIO_VAPID_PRIVATE_KEY");
  webPush.setVapidDetails(siteOrigin, publicKey, privateKey);

  return async (
    subscription: { endpoint: string; p256dh: string; auth: string },
    payload: { title: string; body: string; url: string },
  ) => {
    try {
      const response = await webPush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(payload),
        { TTL: 86_400, urgency: "normal", topic: "corralio-weekend-ready" },
      );
      return { status: response.statusCode };
    } catch (error) {
      const status = (error as ProviderHttpError)?.statusCode;
      if (typeof status === "number") return { status };
      throw new Error("Web Push request failed");
    }
  };
}

export async function runWeekendReadyWorker(adminClient: SupabaseClient) {
  return runWeekendReadyBatch({
    store: createWeekendReadySupabaseStore(adminClient),
    sender: createWeekendReadyWebPushSender(),
    siteOrigin: getCorralioSiteOrigin(),
  });
}

export type { WeekendReadyProviderOutcome };
