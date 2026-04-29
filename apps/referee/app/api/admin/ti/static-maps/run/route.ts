import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 55_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  await requireAdmin();

  const body = await req.json().catch(() => ({}));
  const slug = String(body?.slug ?? "").trim();
  const tournamentId = String(body?.tournamentId ?? "").trim();
  const force = Boolean(body?.force);
  const batchLimitRaw = String(body?.batchLimit ?? "").trim();

  const tiBaseUrl = (process.env.TI_WEB_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const tiCronSecret = (process.env.TI_CRON_SECRET ?? "").trim();
  if (!tiBaseUrl) {
    return NextResponse.json({ ok: false, error: "missing TI_WEB_BASE_URL" }, { status: 500 });
  }
  if (!tiCronSecret) {
    return NextResponse.json({ ok: false, error: "missing TI_CRON_SECRET" }, { status: 500 });
  }

  const tiUrl = new URL(`${tiBaseUrl}/api/cron/static-map-generator`);
  tiUrl.searchParams.set("token", tiCronSecret);
  if (slug) tiUrl.searchParams.set("slug", slug);
  if (tournamentId) tiUrl.searchParams.set("tournamentId", tournamentId);
  if (force) tiUrl.searchParams.set("force", "1");
  if (batchLimitRaw) tiUrl.searchParams.set("batchLimit", batchLimitRaw);

  try {
    const startedAt = Date.now();
    const resp = await fetchWithTimeout(
      tiUrl.toString(),
      {
        headers: {
          "x-cron-secret": tiCronSecret,
          "user-agent": "RI-Admin-StaticMaps/1.0",
        },
        cache: "no-store",
      },
      55_000
    );
    const text = await resp.text();
    const elapsedMs = Date.now() - startedAt;

    const bodyJson = (() => {
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    })();

    // Do not echo secrets back in the response.
    const redactedUrl = (() => {
      const u = new URL(tiUrl.toString());
      u.searchParams.set("token", "[REDACTED]");
      return u.toString();
    })();

    return NextResponse.json(
      {
        ok: resp.ok,
        ti_status: resp.status,
        ms: elapsedMs,
        ti_url: redactedUrl,
        body: bodyJson,
      },
      { status: resp.ok ? 200 : 502 }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "proxy_failed" },
      { status: 502 }
    );
  }
}
