# Tournament Insights (`apps/ti-web`)

Next.js app for Tournament Insights (TI): consumer tournament discovery + tier-gated features (e.g. venue reviews).

## Local dev

From repo root:

```bash
PORT=3001 npm run dev --workspace ti-web
```

Default (recommended) dev server: `http://127.0.0.1:3001`.

## Smoke tests

The Playwright suite assumes TI is reachable at `PLAYWRIGHT_BASE_URL` (defaults to `http://127.0.0.1:3001`).
See `docs/qa/public-beta-smoke-test.md`.
