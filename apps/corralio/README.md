# Corralio

Minimal Next.js application shell for Corralio. It intentionally contains no product features, data access, authentication, analytics, service worker, or environment-variable requirements.

## Local development

From the monorepo root:

```bash
npm run dev --workspace corralio-app
```

Open `http://localhost:3002`.

## Validation

```bash
npm run lint --workspace corralio-app
npx tsc -p apps/corralio/tsconfig.json --noEmit
npm run build --workspace corralio-app
```

## SMS opt-in activation

The public `/sms` route is deliberately fail-closed. It shows the phone number and consent disclosure only when:

```bash
CORRALIO_SMS_OPT_IN_ENABLED=true
```

Do not enable that value until the separately gated Telnyx inbound webhook, durable consent/STOP handling, send gating, provider controls, and production readiness checks are operational. The legal routes remain public regardless of this flag.

## Pending intake encryption

Credential-bearing calendar URLs that must survive across pending intake messages use the server-only pending-secret boundary. It requires:

```bash
CORRALIO_PENDING_SECRET_ACTIVE_KEY_VERSION=v1
CORRALIO_PENDING_SECRET_ENCRYPTION_KEY_V1=<base64-encoded 32-byte key>
CORRALIO_PENDING_SECRET_FINGERPRINT_KEY=<different base64-encoded 32-byte key>
```

Generate independent cryptographically random keys outside the repository. Never use the SMS channel HMAC secret as encryption material. The active version must have a matching `CORRALIO_PENDING_SECRET_ENCRYPTION_KEY_<VERSION>` variable; every configured encryption key and the fingerprint key must decode from strict padded Base64 to exactly 32 bytes. Missing, malformed, unknown, or reused key material fails closed.

For rotation, add the next versioned encryption key, retain old versioned keys for decryption, and then change `CORRALIO_PENDING_SECRET_ACTIVE_KEY_VERSION`. New encryptions use the active version; existing envelopes select their old key from their explicit key ID. No automatic bulk re-encryption occurs. Remove an old key only after no retained ciphertext references it.

The pending-intake consumer must validate the submitted calendar URL, encrypt the exact value, derive its separate keyed fingerprint, and persist only the serialized envelope plus fingerprint. Decryption is allowed only in trusted server code while resolving or fetching the pending intake. Encrypted material must be deleted when the intake resolves, expires, or is cancelled.

## Vercel

Use Corralio's existing separate Vercel project with its root directory set to `apps/corralio`. Domain attachment, DNS changes, and environment changes remain manual steps. Keep `CORRALIO_SMS_OPT_IN_ENABLED` unset until the documented SMS production-readiness gate is complete.
