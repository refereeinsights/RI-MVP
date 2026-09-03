import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createChannelIdentityGateway } from "./channelIdentity.server";
import {
  requestPhoneChangeWithDependencies,
  requestPhoneOtpWithDependencies,
  verifyPhoneOtpWithDependencies,
} from "./phoneAuthFlow";
import { assertSameOriginRequest, authorizeSmsOtpRequest } from "./sms/durableSafety";
import type { SmsDurableSafetyGateway } from "./sms/durableSafety";

export async function requestPhoneOtp(input: {
  request: Request;
  phone: string;
  captchaToken: string;
  expectedOrigin: string;
  hmacSecret: string | undefined;
  safety: SmsDurableSafetyGateway;
  supabaseUrl: string;
  supabaseAnonKey: string;
  fetch?: typeof fetch;
  isVercelRuntime?: boolean;
  signInWithOtp?: (input: { phone: string; captchaToken: string; shouldCreateUser: true }) => Promise<{ error: unknown }>;
}) {
  return requestPhoneOtpWithDependencies({
    phone: input.phone,
    captchaToken: input.captchaToken,
    async authorize() {
      const result = await authorizeSmsOtpRequest({
        request: input.request,
        expectedOrigin: input.expectedOrigin,
        phone: input.phone,
        hmacSecret: input.hmacSecret,
        gateway: input.safety,
        isVercelRuntime: input.isVercelRuntime,
      });
      return result.status === "authorized";
    },
    signInWithOtp: input.signInWithOtp ?? (async ({ phone: verifiedPhone, captchaToken }) => {
      const auth = createClient(input.supabaseUrl, input.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        ...(input.fetch ? { global: { fetch: input.fetch } } : {}),
      });
      return auth.auth.signInWithOtp({
        phone: verifiedPhone,
        options: { captchaToken, shouldCreateUser: true },
      });
    }),
  });
}

export async function verifyPhoneOtp(input: {
  request: Request;
  phone: string;
  token: unknown;
  expectedOrigin: string;
  authenticated: SupabaseClient;
  admin: SupabaseClient;
  hmacSecret: string | undefined;
}) {
  try { assertSameOriginRequest(input.request, input.expectedOrigin); } catch { return { status: "denied" as const }; }
  const projection = createChannelIdentityGateway(input.admin, input.hmacSecret);
  return verifyPhoneOtpWithDependencies({
    submittedPhone: input.phone,
    token: input.token,
    async verify(parameters) {
      const { data, error } = await input.authenticated.auth.verifyOtp(parameters);
      return {
        error,
        user: data.user ? {
          id: data.user.id,
          phone: data.user.phone,
          phoneConfirmedAt: data.user.phone_confirmed_at,
        } : null,
      };
    },
    async ensureHousehold() {
      const { data, error } = await input.authenticated.rpc("corralio_ensure_owner_household", {
        p_display_name: null,
        p_acquisition_provenance: null,
      });
      return !error && typeof data === "string" ? data : null;
    },
    project: (projected) => projection.projectVerifiedPhone(projected),
  });
}

export async function requestPhoneChange(input: {
  request: Request;
  phone: string;
  expectedOrigin: string;
  hmacSecret: string | undefined;
  safety: SmsDurableSafetyGateway;
  authenticated: SupabaseClient;
}) {
  return requestPhoneChangeWithDependencies({
    phone: input.phone,
    async authorize() {
      const result = await authorizeSmsOtpRequest({
        request: input.request,
        expectedOrigin: input.expectedOrigin,
        phone: input.phone,
        hmacSecret: input.hmacSecret,
        gateway: input.safety,
      });
      return result.status === "authorized";
    },
    async updatePhone(phone) {
      const { data: { user } } = await input.authenticated.auth.getUser();
      if (!user) return { error: new Error("unauthorized") };
      const { error } = await input.authenticated.auth.updateUser({ phone });
      return { error };
    },
  });
}

export async function verifyPhoneChangeOtp(input: {
  request: Request;
  phone: string;
  token: unknown;
  expectedOrigin: string;
  authenticated: SupabaseClient;
  admin: SupabaseClient;
  hmacSecret: string | undefined;
}) {
  try { assertSameOriginRequest(input.request, input.expectedOrigin); } catch { return { status: "denied" as const }; }
  const projection = createChannelIdentityGateway(input.admin, input.hmacSecret);
  return verifyPhoneOtpWithDependencies({
    submittedPhone: input.phone,
    token: input.token,
    verificationType: "phone_change",
    async verify(parameters) {
      const { data, error } = await input.authenticated.auth.verifyOtp(parameters);
      return { error, user: data.user ? {
        id: data.user.id,
        phone: data.user.phone,
        phoneConfirmedAt: data.user.phone_confirmed_at,
      } : null };
    },
    async ensureHousehold() {
      const { data, error } = await input.authenticated.rpc("corralio_ensure_owner_household", {
        p_display_name: null, p_acquisition_provenance: null,
      });
      return !error && typeof data === "string" ? data : null;
    },
    project: (projected) => projection.projectVerifiedPhone(projected),
  });
}
