import "server-only";

import type { SmsProviderAdapter } from "./durableSafety";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("SMS provider configuration is unavailable");
  return value;
}

export function createTelnyxSmsProvider(fetchImplementation: typeof fetch = fetch): SmsProviderAdapter {
  const apiKey = required("TELNYX_API_KEY");
  const sender = required("TELNYX_PHONE_NUMBER");
  const messagingProfileId = required("TELNYX_MESSAGING_PROFILE_ID");
  return {
    async send(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetchImplementation("https://api.telnyx.com/v2/messages", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: sender,
            to: input.destination,
            text: input.message,
            messaging_profile_id: messagingProfileId,
          }),
          signal: controller.signal,
        });
        return { outcome: response.ok ? "accepted" as const : "rejected" as const };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
