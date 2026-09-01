import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SmsDurableSafetyGateway, SmsSafetyDecision } from "./durableSafety";

const DECISIONS = new Set<SmsSafetyDecision>([
  "authorized", "duplicate", "missing_permit", "expired_permit", "rate_limited", "cooldown",
  "global_cap", "destination_cap", "invalid_mode", "policy_disabled", "not_allowlisted",
  "segment_limit", "blocked",
]);

function readDecision(data: unknown): SmsSafetyDecision {
  const row = Array.isArray(data) ? data[0] : data;
  const decision = row && typeof row === "object" ? (row as { decision?: unknown }).decision : null;
  if (typeof decision !== "string" || !DECISIONS.has(decision as SmsSafetyDecision)) {
    throw new Error("SMS durable authorization returned an invalid result");
  }
  return decision as SmsSafetyDecision;
}

export function createSmsDurableSafetyGateway(admin: SupabaseClient): SmsDurableSafetyGateway {
  return {
    async authorizeOtpRequest(input) {
      const { data, error } = await admin.rpc("corralio_authorize_sms_otp_request_v1", {
        p_destination_hmac: input.destinationHmac,
        p_ip_hmac: input.ipHmac,
      });
      if (error) throw new Error("SMS request authorization is unavailable");
      return readDecision(data);
    },
    async authorizeHookAttempt(input) {
      const { data, error } = await admin.rpc("corralio_authorize_sms_hook_attempt_v1", {
        p_webhook_id: input.webhookId,
        p_destination_hmac: input.destinationHmac,
        p_segments: input.segments,
      });
      if (error) throw new Error("SMS hook authorization is unavailable");
      return readDecision(data);
    },
  };
}
