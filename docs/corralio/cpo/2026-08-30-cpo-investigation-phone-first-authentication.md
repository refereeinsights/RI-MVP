# CPO Investigation — Phone-First Authentication for Corralio

**2026-08-30 · Chief Product Officer**

**Status: founder decision, CPO implementation-design investigation.** The founder has explicitly decided the product requirement — email must not be required for account creation, authentication, household access, or the full web experience — and asked CPO to determine the smallest safe, cheap way to build it, not to re-litigate whether to do it. This document is that investigation: an audit of the current auth architecture, a recommended migration path, and the specific technical questions the founder listed (OTP vs. magic-link, session persistence, phone changes/recovery, duplicate identities, account linking, abuse/rate limiting, effect on existing users). It is a design ready to become a Codex build prompt once scoped against the broader SMS-channel sequencing (Section 9) — no code is written or changed here, and this doesn't jump the 3.6B critical path.

**Headline finding, and it's good news: this is a smaller change than it might sound like.** Corralio's household-creation logic is already keyed purely on `auth.uid()`, with no email-specific step anywhere in the path from "authenticated user" to "has a household." A phone-verified Supabase identity would flow through the exact same mechanism with zero changes to household/RLS logic. The real work is entirely in the auth layer — how someone gets an `auth.uid()` in the first place — not in anything downstream of it.

---

## 1. Current architecture, audited

Confirmed directly from the repository this session:

- **Auth today is entirely email-based.** `SUPPORTED_OTP_TYPES = new Set(["email", "magiclink", "recovery"])` (`apps/corralio/lib/authCallback.ts:3`) excludes phone. `SignInForm.tsx` calls `supabase.auth.signInWithOtp` (email) and `supabase.auth.signInWithPassword`. Recovery (`app/api/auth/recovery/route.ts`) uses `resetPasswordForEmail`. No phone-auth code exists anywhere in `apps/corralio`.
- **Household creation has no email dependency at all — this is the key finding.** There is no dedicated "signup" flow that creates a household. Instead, a Postgres `security definer` RPC, `corralio_ensure_owner_household()`, reads `auth.uid()` and lazily creates a household + owner membership row the first time any authenticated action needs one (`supabase/migrations/20260818_corralio_household_rls_foundation.sql:478-524`). It's invoked from the shared server-action helper `getOwnerContext()` (`apps/corralio/app/actions.ts:46-58`) and from the schedule store (`lib/schedules/supabaseStore.ts:31`). **This function has never known or cared what auth provider produced the `auth.uid()` it's given.** A phone-authenticated Supabase session calls exactly the same RPC and gets exactly the same result.
- **Schema:** `corralio_households(id, display_name, created_at, updated_at)` and `corralio_household_members(household_id → households.id, user_id → auth.users.id, role, status)`, with a partial unique index enforcing one active owner-household per user (`...household_rls_foundation.sql:13-40`). No `phone` column exists anywhere in this schema or in `auth.users` usage in the app today — Supabase's own `auth.users` table has a native `phone` column (separate from `email`) once phone auth is enabled, which this repo simply isn't using yet.
- **No rate limiting exists at the application layer for any auth flow.** The recovery route relies entirely on Supabase Auth's own built-in send-rate limits and an enumeration-safe generic response (`app/api/auth/recovery/route.ts`). There's nothing to extend for phone OTP — Supabase's built-in limits (Section 7) are what this leans on today for email too.
- **No SMS-provider configuration exists anywhere in the monorepo** — no Twilio, MessageBird, Vonage, or Telnyx references, confirmed via a full grep across every `.env*`, `package.json`, and `vercel.json`.
- **No existing signed-token utility inside `apps/corralio`.** Two patterns exist in the separate `ti-web` app that a custom token mechanism could model, if one turns out to be needed (Section 3): an unsigned opaque ID (`ti-web/lib/hotelPlannerAttribution.ts`) and an HMAC-signed, hash-stored share token (`ti-web/lib/planner/guestShares.ts`). Neither is shared code today — reuse would mean porting the pattern, not calling shared code.

## 2. Recommended smallest-safe migration

**Enable Supabase's native phone-OTP auth, delivered through Telnyx via Supabase's "Send SMS Hook," rather than building a parallel auth system.** This directly satisfies the founder's instruction not to create a parallel SMS identity system if the existing layer can safely become phone-capable — it can, cheaply:

- Supabase Auth has built-in phone sign-in (`signInWithOtp({ phone })` → `verifyOtp({ phone, token, type: "sms" })`) that produces a normal Supabase session — same `auth.uid()`, same session/refresh-token mechanics, same RLS behavior as email auth today. This is a configuration and a small amount of client/route code, not a new auth system.
- **Supabase's natively-integrated SMS providers are Twilio, MessageBird, Vonage, and TextLocal — Telnyx is not on that list.** This matters given the vendor-neutral position taken in the two prior channel/economics reviews (explicitly told not to assume Twilio, and Telnyx used as the pricing baseline). The resolution: Supabase's **Send SMS Hook** replaces Supabase's built-in SMS sending entirely — Supabase generates and validates the OTP, but hands your code the phone number and the generated code, and *your* code is responsible for actually sending it, via any vendor. **This means the auth-provider decision and the SMS-vendor decision are fully decoupled: Corralio can keep Telnyx as its SMS vendor and still use Supabase's native phone-auth flow**, by implementing that hook to call Telnyx instead of adopting Twilio just because it's Supabase's default integration. This resolves what would otherwise be a real tension between this decision and the pricing review's Telnyx baseline.
- **Net new work, concretely:** enable phone auth in the Supabase project config, implement the Send SMS Hook (a Postgres function or equivalent, per Supabase's documented pattern) that calls Telnyx's send-message API with the hook-provided OTP, and add a phone-entry + code-entry UI alongside the existing `SignInForm.tsx` email path. Nothing in the household/RLS layer changes at all.

## 3. OTP vs. magic-link — recommend one underlying mechanism, two presentations

Supabase's native phone auth is OTP-code-based only; there is no built-in SMS equivalent of an email magic link. Building a genuine parallel "signed link" system (its own token generation, storage, and verification route, modeled on the `ti-web` guest-share HMAC pattern) is a real, separate piece of engineering and a second thing to secure and audit — exactly the "parallel system" the founder said to avoid unless there's a compelling reason.

**Recommended design avoids that: embed the OTP code itself in the SMS link's query parameters, and have the landing page auto-submit it via the same `verifyOtp()` call a manually-typed code would use.** Concretely, the text reads "Reply YES to verify" or contains a link like `corralio.com/auth/confirm?phone=...&token=123456`; the landing page, on load, silently calls `verifyOtp({ phone, token, type: "sms" })` with the embedded values. If it succeeds (same device, link tapped promptly), the parent lands authenticated with no typing at all — the magic-link UX the founder wants. If the link is opened on a different device, expired, or already used, the page falls back to the ordinary manual-entry OTP form. **This is one underlying verification mechanism (Supabase's phone OTP), not two auth systems** — the "magic link" is a UX convenience wrapped around the same OTP, not a second credential type. This should be verified as sound against Supabase's OTP-reuse/expiry semantics during the spike (a code embedded in a URL is more exposed than one a person retypes — e.g., link-scanning security software or a shared inbox could pre-fetch and burn the link before the parent taps it; this is a known category of risk with embedded-token magic links generally and needs an explicit, tested mitigation, such as a very short expiry and one-time-use enforcement, before shipping).

## 4. Session persistence

No change from today's behavior. Once a Supabase session exists — regardless of whether it originated from email or phone auth — session/refresh-token handling, expiry, and renewal are all provider-agnostic in Supabase's client SDKs. This is not a new design problem.

## 5. Phone-number changes and recovery — a real residual risk, not just a UX flow

Two distinct cases:

**A parent voluntarily changes their number.** Handle via Supabase's identity-update path (`updateUser({ phone })` or the identity-linking flow, re-verified with a fresh OTP to the new number) — a normal, low-risk flow, structurally similar to how email changes are already handled for existing users.

**Number recycling — a real, industry-wide weakness of phone-based auth that deserves explicit acknowledgment, not a false sense that this is solved.** US carriers reclaim and reissue phone numbers after a dormancy period. If a family's number is later reassigned to someone else, and Supabase's phone auth matches an OTP request to whichever `auth.users` row already has that phone number on file, **the new owner of that phone number could authenticate as the original family's existing identity** — this is not a Corralio-specific bug, it's an inherent property of any "possession of a phone number" credential, and it's the same reason NIST guidance has long flagged SMS as a weaker recovery factor than it looks. Household authorization staying separate from authentication (Section 6) doesn't fully protect against this, because the recycled-number attacker would gain the *same* authenticated identity the original family had, not merely a plausible-looking new one. **Recommend treating this as an accepted, documented residual risk** (the same risk every SMS-first competitor, including HeySammi, carries) rather than something to solve perfectly before shipping — mitigations worth scoping later (not now) include prompting re-verification after a long dormancy period, or a lightweight "is this still your number" check triggered by unusual access patterns — but do not let this review's honesty about the risk be read as a reason not to proceed; it's a reason to write the risk down in `CORRALIO_SECURITY_PRIVACY.md` (Section 10 below) so it's a known, accepted tradeoff rather than a silent gap.

## 6. Duplicate identities and account linking

**Verified phone still does not equal household authorization — this principle is unchanged, not weakened, by making phone a valid authentication method.** Authentication answers "who is this," household membership (the existing `corralio_household_members` table and its RLS policies) answers "what can they access" — nothing about adding phone auth touches that separation; it plugs into the same `auth.uid()`-keyed household RPC every existing auth method already uses.

**Duplicate identity prevention is inherent, not something to build separately:** a phone number can only be verified into one `auth.users` row's phone field at a time, enforced by Supabase itself, the same way a phone number can only be verified into one household's channel-identity slot in the earlier priority-channels investigation's design — verification is the dedup mechanism.

**Linking email and phone to the same identity, for an SMS-originated user who later wants email too:** Supabase Auth's identity-linking capability (`linkIdentity()`) supports attaching an additional auth method to an existing authenticated user. This is the right mechanism for "email remains optional, complementary" — an SMS-originated household can later add an email identity to the *same* `auth.users` row (and therefore the same household), rather than creating a second account that has to be merged. This should be confirmed in the spike against the specific email+phone linking semantics (Supabase's identity-linking documentation covers OAuth-provider linking most thoroughly; phone+email linking behavior should be tested directly, not assumed from the general feature description).

## 7. Abuse and rate limiting

Supabase's built-in defaults — one OTP request per 60 seconds per phone number, 1-hour expiry — are the same class of protection the existing email-recovery flow already leans on entirely (no app-level throttle exists in this codebase for any auth flow today, confirmed in Section 1). Supabase's own guidance recommends adding CAPTCHA (hCaptcha or Cloudflare Turnstile, both natively supported by Supabase Auth) before production, specifically to control SMS cost from abuse — directly relevant given the per-segment cost discipline established in the monetization review. Recommend enabling CAPTCHA on the phone-OTP send endpoint from day one, not as a later hardening pass, since unlike email an abused phone-OTP endpoint has an immediate, real dollar cost per abuse attempt (each triggered send is a billed Telnyx segment).

## 8. Effect on existing email-authenticated users

**None.** Adding phone as an additional auth method is purely additive — existing households authenticated by email keep working exactly as they do today, since nothing about their `auth.uid()`, household row, or RLS policy changes. No migration of existing users is required or implied by this work.

## 9. The send-first flow, re-validated against this architecture

The founder's proposed flow now maps cleanly onto existing infrastructure with no new household/RLS concepts:

1. Parent texts a calendar URL to Corralio's number.
2. Corralio replies asking for a reply (or a tapped link, per Section 3) to verify the number.
3. On verification, Supabase completes phone auth → a real `auth.uid()` exists.
4. The **existing** `corralio_ensure_owner_household()` RPC runs exactly as it does for any first-time authenticated user today — no new household-creation logic needed.
5. The schedule from step 1 imports against that now-real household (via the existing ingestion pipeline, per the priority-channels investigation).
6. Corralio texts back real content (event count, next event, leave-by) with a link built on the Section 3 mechanism.
7. Tapping the link either silently authenticates (same device, prompt tap) or prompts a quick manual code entry — either way, landing on an **already-populated, already-authenticated** household view.

No anonymous/unclaimed intermediate state is needed at any point — the household exists, authenticated, from the moment the phone number is verified. This is a meaningfully cleaner design than the "unclaimed record, claimed later" model scoped in the original email/SMS-first onboarding review, because phone verification *is* the authentication step, not a preliminary to it.

## 10. Privacy/security implications — extends `CORRALIO_SECURITY_PRIVACY.md`, doesn't replace it

- **"Verified phone proves reachability, not household authorization" is now Corralio's actual authentication boundary, not just a design principle from a prior review.** Recommend this be written into the security doc's Authentication boundary section directly (Section 12 below).
- **Phone-number recycling (Section 5) is a real, accepted residual risk that should be named explicitly in the security doc, not left implicit.** This isn't a defect in this design; it's an honest limitation of any phone-based authentication factor, and Corralio should document it as a known, accepted tradeoff.
- **The Send SMS Hook's implementation is a new secret-handling surface** (it will hold Telnyx credentials and see every OTP code generated) — it should be held to the same "secrets never in analytics/logs, server-side only" standard the security doc already states for other tokens.
- **CAPTCHA on the OTP-send endpoint doubles as a privacy control, not just an abuse control** — without it, an attacker could use the send endpoint to probe whether a given phone number has an existing Corralio identity (a minor enumeration risk, same class the existing email-recovery route already defends against with its generic-response pattern — the phone flow should adopt the same discipline).

## 11. Vendor note

This closes a real open loop between three documents this session: the priority-channels investigation and the monetization review both evaluated Telnyx as a serious SMS vendor candidate without knowing whether Corralio's eventual auth provider would force a different choice. It doesn't — **the Send SMS Hook means the SMS-vendor spike (already recommended, not yet run) can proceed independent of the auth decision**, and Telnyx remains a live candidate for both transactional/notification SMS and the OTP-delivery leg of authentication, through the same vendor relationship rather than two.

## 12. Recommendation

| Item | Classification | Why |
|---|---|---|
| Phone-first authentication as the product requirement | **Founder decision — recorded, not re-evaluated here** | Per this document's framing |
| Enabling Supabase native phone auth + Send SMS Hook (vs. building a parallel system) | **DO NOW to design, ready for a build prompt** | Smallest-safe path; household/RLS layer needs zero changes (Section 1) |
| Embedded-OTP "magic link" UX wrapping the same `verifyOtp` mechanism | **DO NOW to design; verify link-prefetch/expiry risk in the spike before shipping** | Avoids a second, parallel token system (Section 3) |
| CAPTCHA on phone-OTP send | **DO NOW, day-one requirement, not a hardening pass** | Real per-abuse dollar cost, unlike email (Section 7) |
| Email-identity linking for SMS-originated households | **TEST NEXT** | Right mechanism identified (`linkIdentity`); exact phone+email semantics need spike verification (Section 6) |
| Phone-number-recycling mitigation beyond documentation | **DEFER** | Accept and document the risk now (Section 5); don't over-build a mitigation before there's any usage evidence of it mattering |
| Migrating existing email-authenticated users to anything | **Not needed — no action** | Purely additive change (Section 8) |

**Sequencing:** this slots into Phase A (verified channel identity) of the already-filed priority-channels investigation — it doesn't compete with 3.6B, and it should be scoped together with that phase's build prompt rather than as a separate one, since they're the same underlying capability.

---

## Sources

- [Supabase — Phone Login guide](https://supabase.com/docs/guides/auth/phone-login)
- [Supabase — Phone Logins feature page](https://supabase.com/features/phone-logins)
- [Supabase — Send SMS Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook)
- Corralio repository (this session): `apps/corralio/lib/authCallback.ts`, `apps/corralio/app/components/SignInForm.tsx`, `apps/corralio/app/api/auth/recovery/route.ts`, `apps/corralio/app/actions.ts`, `apps/corralio/lib/schedules/supabaseStore.ts`, `supabase/migrations/20260818_corralio_household_rls_foundation.sql`, `supabase/migrations/20260824_corralio_slice42a_acquisition_provenance.sql`, `apps/ti-web/lib/hotelPlannerAttribution.ts`, `apps/ti-web/lib/planner/guestShares.ts`
