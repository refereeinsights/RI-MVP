import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { deriveChannelAddressHmac, normalizeVerifiedPhone } from "./phoneAuth";

export type ChannelOwner = { userId: string; householdId: string };

export function createChannelIdentityGateway(admin: SupabaseClient, hmacSecret: string | undefined) {
  return {
    async projectVerifiedPhone(input: ChannelOwner & { verifiedPhone: string }) {
      const addressHmac = deriveChannelAddressHmac(
        hmacSecret,
        "phone",
        normalizeVerifiedPhone(input.verifiedPhone),
      );
      const { error } = await admin.rpc("corralio_upsert_channel_identity_v1", {
        p_user_id: input.userId,
        p_household_id: input.householdId,
        p_channel: "phone",
        p_address_hmac: addressHmac,
      });
      if (error) throw new Error("Channel identity projection failed");
    },

    async resolveVerifiedPhone(phone: string): Promise<ChannelOwner | null> {
      const addressHmac = deriveChannelAddressHmac(
        hmacSecret,
        "phone",
        normalizeVerifiedPhone(phone),
      );
      const { data, error } = await admin.rpc("corralio_resolve_channel_identity_v1", {
        p_channel: "phone",
        p_address_hmac: addressHmac,
      });
      if (error) throw new Error("Channel identity resolution failed");
      const row = Array.isArray(data) ? data[0] : data;
      return row && typeof row.user_id === "string" && typeof row.household_id === "string"
        ? { userId: row.user_id, householdId: row.household_id }
        : null;
    },
  };
}
