# Corralio CPO Audit — Phase A+B Execution Gates

**Date:** 2026-08-31

**Mode:** Audit-first execution checkpoint

**Result:** `CORRALIO PHASE A+B BLOCKED AT TEST-ENVIRONMENT VENDOR SPIKE`

This record reports the attempted execution of `docs/prompts/corralio-phase-a-b-phone-auth-schedule-intake-prompt.md`. It does not authorize production configuration, SMS, migration application, push, or deployment.

## Dependency truth

Slice 3.6B Phase 1 is complete at `34d83cf4`. Phase A+B must reuse its authoritative required-arrival contract without extending it:

`ics_explicit → source_preference → team_preference → corralio_default`

The existing nullable source preference and `corralio_update_schedule_source_arrival_v1` remain the only authorized source-preference storage/write boundary. No arrival work is blocked.

## Gates 1–2 — repository and provider-contract audit

Repository findings:

- Corralio currently has email-only application authentication; no phone-auth UI or phone callback exists.
- Household creation remains provider-neutral and keyed to `auth.uid()` through `corralio_ensure_owner_household()`.
- The shared ICS ingestion and assignment boundaries exist and remain the reuse targets.
- No Telnyx dependency, phone/SMS adapter, channel-identity projection, webhook-idempotency store, or pending-intake store exists.
- No origin implementation belongs in this work; Phase 3A remains authoritative.

Current official provider documentation confirms:

- Supabase supports `signInWithOtp({ phone })`, manual `verifyOtp({ type: "sms" })`, authenticated phone changes through `updateUser()` plus `phone_change`, and a custom Send SMS Hook.
- Supabase recommends CAPTCHA and adjusted rate limits for phone login; neither alone establishes Corralio's required spend boundary.
- Telnyx messaging webhooks carry `telnyx-signature-ed25519` and `telnyx-timestamp`; verification covers `{timestamp}|{raw_json_payload}`. Telnyx also provides messaging-profile opt-out controls, but the Corralio profile/campaign state is not configured or evidenced.
- Resend signs inbound webhook events. The initial `email.received` event supplies message metadata; content and headers require a separate received-email API read. Repository/account evidence does not yet prove an authenticated SPF/DKIM/DMARC-aligned sender signal suitable for Corralio authorization. The email leg therefore remains independently blocked.

Primary sources reviewed:

- https://supabase.com/docs/guides/auth/phone-login
- https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook
- https://developers.telnyx.com/docs/messaging/messages/receiving-webhooks
- https://developers.telnyx.com/docs/messaging/messages/advanced-opt-in-out
- https://resend.com/docs/dashboard/receiving/introduction

## Gate 3 — blocked live test-environment spike

The required bounded live spike cannot be executed safely from current configuration:

- No `TELNYX_API_KEY`, sender/from number, messaging profile, or Telnyx public key exists locally or in the Corralio Vercel project's listed environments.
- No CAPTCHA site/secret configuration exists for Corralio.
- No dedicated channel-identity HMAC key exists.
- No local Supabase test-project configuration exists.
- No hard Telnyx spend/segment cap or disposable test-phone contract is recorded.
- A2P/10DLC registration/campaign status is unproven.
- No Resend inbound webhook signing secret is configured for Corralio; exact sender-authentication evidence is unproven.

The canonical prompt says gates are sequential and forbids proceeding without the live capped spike. Accordingly, no Stage 1 application/schema implementation began and no provider call was attempted.

## Smallest unblock

A human must provide an isolated test contract containing:

1. Telnyx test API credential, sender/from number, messaging-profile identifier, and webhook public key.
2. A hard test spend/segment cap declared before the first call.
3. One authorized disposable test phone number and cleanup expectations.
4. Test Supabase phone Auth plus Send SMS Hook configuration.
5. CAPTCHA test configuration and declared resend/attempt/rate limits.
6. A dedicated channel-identity HMAC secret.
7. Recorded A2P/10DLC status; production SMS remains separately prohibited regardless of test success.

After those exist, rerun Gate 3. Only a passing capped spike authorizes Stage 1 repository implementation and preparation of unapplied migrations/verifiers. The Resend leg may remain blocked without delaying successful SMS-first work.

## Preserved boundaries

- No `linkIdentity()` behavior was assumed.
- No second user, account merge, or custom credential store was designed.
- Supabase Auth remains authoritative for raw verified credentials.
- No arrival schema/resolver/write-boundary change was made.
- No home/origin work was moved out of Phase 3A.
- No database, Auth project, Vercel environment, DNS, Telnyx, Resend, or production setting was changed.
- No SMS was sent; no push or deployment occurred.
