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

## Vercel

Use Corralio's existing separate Vercel project with its root directory set to `apps/corralio`. Domain attachment, DNS changes, and environment changes remain manual steps. Keep `CORRALIO_SMS_OPT_IN_ENABLED` unset until the documented SMS production-readiness gate is complete.
