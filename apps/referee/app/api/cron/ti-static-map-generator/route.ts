import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAuthorized(req: Request) {
  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("token");
  const tokenFromHeader = req.headers.get("x-cron-secret");
  const token = (tokenFromQuery ?? tokenFromHeader ?? "").trim();
  return Boolean(process.env.CRON_SECRET && token && token === process.env.CRON_SECRET);
}

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 55_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const tiBaseUrl = (process.env.TI_WEB_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const tiCronSecret = (process.env.TI_CRON_SECRET ?? "").trim();
  if (!tiBaseUrl) {
    return NextResponse.json({ ok: false, error: "missing TI_WEB_BASE_URL" }, { status: 500 });
  }
  if (!tiCronSecret) {
    return NextResponse.json({ ok: false, error: "missing TI_CRON_SECRET" }, { status: 500 });
  }

  // Allow manual targeting by passing through known query params from the RI cron URL.
  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") ?? "").trim();
  const tournamentId = (url.searchParams.get("tournamentId") ?? "").trim();
  const force = (url.searchParams.get("force") ?? "").trim();

  const tiUrl = new URL(`${tiBaseUrl}/api/cron/static-map-generator`);
  // TI route authorizes with x-cron-secret OR token= query; send both for safety.
  tiUrl.searchParams.set("token", tiCronSecret);
  if (slug) tiUrl.searchParams.set("slug", slug);
  if (tournamentId) tiUrl.searchParams.set("tournamentId", tournamentId);
  if (force) tiUrl.searchParams.set("force", force);

  try {
    const startedAt = Date.now();
    const resp = await fetchWithTimeout(
      tiUrl.toString(),
      {
        headers: {
          "x-cron-secret": tiCronSecret,
          "user-agent": "RI-Cron-Proxy/1.0",
        },
        cache: "no-store",
      },
      55_000
    );
    const text = await resp.text();
    const elapsedMs = Date.now() - startedAt;

    const body = (() => {
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    })();

    return NextResponse.json(
      {
        ok: resp.ok,
        proxied: true,
        ti_url: tiUrl.toString(),
        ti_status: resp.status,
        ms: elapsedMs,
        body,
      },
      { status: resp.ok ? 200 : 502 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        proxied: true,
        error: err instanceof Error ? err.message : "proxy_failed",
      },
      { status: 502 }
    );
  }
}

