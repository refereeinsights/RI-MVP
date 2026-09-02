# Corralio — Gate 3 Isolated Turnstile Secret Pairing Correction

## Purpose

Correct only the isolated Supabase CAPTCHA secret so it corresponds to the
retained isolated Cloudflare Turnstile widget. This is a bounded external
configuration correction and verification task. It does not authorize an Auth
call or any broader Gate 3 implementation.

Current status:

`TURNSTILE/SUPABASE CONTRACT BLOCKED`

The prior read-only audit established:

- the deployed Turnstile site key matches the retained isolated widget;
- the authorized hostname is correct;
- the isolated Supabase CAPTCHA provider is Cloudflare Turnstile;
- the Supabase Management API returns a redacted secret representation that
  cannot be fingerprint-compared to the retained widget secret; the earlier
  nonmatching hash therefore did not prove an actual saved-secret mismatch;
- the founder nevertheless authorized a controlled overwrite from the current
  retained widget secret so the pairing can be established directly;
- the browser submits one fresh token to `signInWithOtp()` exactly once;
- Corralio does not redeem that token separately.

## Fixed isolated targets

- Supabase project reference: `azuwuouctkyppkrugnls`
- deployed hostname: `corralio-gate3-isolated.vercel.app`
- Cloudflare target: the unique retained isolated Turnstile widget whose name
  and exact single authorized hostname were established by the prior audit

Stop if any target is missing, ambiguous, or resolves to production/staging.

## Authorization

Authorize only the isolated configuration correction required to make the
Supabase CAPTCHA secret correspond to the retained isolated Turnstile widget.

Do not invoke Supabase Auth in this task.

## Required actions

1. Reconfirm the isolated Supabase project and retained Cloudflare widget
   identities.
2. Obtain the retained widget secret through the existing secure local or
   clipboard path.
3. Before saving, use a non-secret fingerprint comparison to prove the value
   entered into Supabase matches the retained widget secret.
4. Replace the isolated Supabase project's CAPTCHA secret with that exact
   widget secret.
5. Do not display, print, log, persist in repository files, or report the
   secret. Do not include it in command arguments, screenshots, browser
   snapshots, shell history, or tool output.
6. Re-read the isolated Supabase CAPTCHA configuration and verify:
   - provider = Cloudflare Turnstile;
   - the secret is present;
   - a non-secret fingerprint comparison proves that the entered or saved
     value corresponds to the retained widget;
   - a masked or merely non-empty secret field alone is insufficient proof.
7. Return CAPTCHA to **disabled** after saving and verification. A separately
   authorized Auth-call setup must explicitly enable it again.
8. Reconfirm that the deployed site key still matches the same retained widget.
9. Reconfirm the widget's only authorized hostname is exactly
   `corralio-gate3-isolated.vercel.app`.
10. Reconfirm that no Telnyx credential exists in the isolated Vercel runtime.
11. Do not call `signInWithOtp()`.

If Supabase prevents proving the pairing without an Auth call, return the
blocked verdict rather than inferring success.

## Allowed verdicts

Return exactly one:

`TURNSTILE/SUPABASE CONTRACT VERIFIED — READY FOR ONE AUTH CALL`

or

`TURNSTILE/SUPABASE CONTRACT BLOCKED`

The ready verdict does not authorize an Auth call or configuration recreation.

## Required output

1. Verdict
2. Isolated project identity
3. Widget identity
4. Site-key/widget match: pass/fail
5. Supabase secret/widget pairing: pass/fail
6. Hostname match: pass/fail
7. CAPTCHA provider/settings: non-secret summary
8. `signInWithOtp()` calls: `0`
9. Telnyx attempts: `0`
10. Handset deliveries: `0`

## Constraints

No Auth call.

No SMS.

No OTP.

No Telnyx request.

No production configuration.

No production deployment.

No unrelated external configuration.

No secret exposure.

No push or deployment.
No commit unless separately authorized.
