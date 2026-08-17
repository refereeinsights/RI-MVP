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

## Vercel

Create a separate Vercel project from this repository and set its root directory to `apps/corralio`. No environment variables are currently required. Domain attachment and DNS changes remain manual steps after a successful deployment.
