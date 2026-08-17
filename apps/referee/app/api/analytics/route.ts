import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { RI_PERSISTED_EVENT_SET } from "@/lib/riAnalyticsEvents";
import { normalizeAnalyticsRequestBody } from "../../../../../packages/lib/analytics-batch";

export const runtime = "nodejs";

const DEV_PERSIST_FLAG = "NEXT_PUBLIC_ENABLE_LOCAL_ANALYTICS";

function asText(value: unknown, maxLen = 240) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function asJsonObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function isLocalHost(host: string | null) {
  const value = (host ?? "").trim().toLowerCase();
  if (!value) return false;
  if (value === "localhost" || value.startsWith("localhost:")) return true;
  if (value === "127.0.0.1" || value.startsWith("127.0.0.1:")) return true;
  if (value === "0.0.0.0" || value.startsWith("0.0.0.0:")) return true;
  if (value === "[::1]" || value.startsWith("[::1]:")) return true;
  return value.endsWith(".local");
}

function getHostFromUrl(raw: string | null) {
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

function shouldPersist(request: Request, properties: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return true;
  if (String(process.env[DEV_PERSIST_FLAG] ?? "").trim() === "true") return true;

  const requestHost = request.headers.get("host");
  const originHost = getHostFromUrl(request.headers.get("origin"));
  const refererHost = getHostFromUrl(request.headers.get("referer"));
  const hrefHost = getHostFromUrl(asText(properties.page_path) || asText(properties.href, 1000));

  return ![requestHost, originHost, refererHost, hrefHost].some((host) => isLocalHost(host));
}

function normalizeProperties(properties: Record<string, unknown>) {
  const pagePath = asText(properties.page_path, 1000);
  const sourcePage = asText(properties.source_page, 120);
  const normalized = {
    event_name: asText(properties.event_name, 120),
    source_app: asText(properties.source_app, 80),
    page_type: asText(properties.page_type, 80),
    page_path: pagePath,
    source_page_type: asText(properties.source_page_type, 80),
    source_page: sourcePage,
    map_list_state: asText(properties.map_list_state, 80),
    sport: asText(properties.sport, 80),
    state: asText(properties.state, 80),
    city: asText(properties.city, 120),
    month: asText(properties.month, 32),
    tournament_id: asText(properties.tournament_id, 80),
    tournament_slug: asText(properties.tournament_slug, 200),
    venue_id: asText(properties.venue_id, 80),
    traffic_source: asText(properties.traffic_source, 80),
    device_type: asText(properties.device_type, 80),
    user_type: asText(properties.user_type, 80),
    href: asText(properties.href, 1000),
  };

  return normalized;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }
  const events = normalizeAnalyticsRequestBody(body);
  if (!events) return NextResponse.json({ ok: false, error: "Invalid analytics payload." }, { status: 400 });

  const allowlisted = events.filter(({ event }) => RI_PERSISTED_EVENT_SET.has(event));
  const rows = allowlisted
    .filter(({ properties }) => shouldPersist(request, properties))
    .map(({ event, properties }) => {
      const normalized = normalizeProperties(asJsonObject(properties));
      return {
        event_name: event,
        properties,
        source_app: normalized.source_app,
        page_type: normalized.page_type,
        page_path: normalized.page_path,
        source_page_type: normalized.source_page_type,
        source_page: normalized.source_page,
        map_list_state: normalized.map_list_state,
        sport: normalized.sport,
        state: normalized.state,
        city: normalized.city,
        month: normalized.month,
        tournament_id: normalized.tournament_id,
        tournament_slug: normalized.tournament_slug,
        venue_id: normalized.venue_id,
        traffic_source: normalized.traffic_source,
        device_type: normalized.device_type,
        user_type: normalized.user_type,
        href: normalized.href,
      };
    });

  if (!rows.length) {
    const skipped = allowlisted.length ? "non_production_or_local" : "event_not_allowlisted";
    console.info(JSON.stringify({
      level: "info",
      message: "RI analytics batch skipped",
      route: "/api/analytics",
      requestId: request.headers.get("x-vercel-id"),
      receivedEvents: events.length,
      allowlistedEvents: allowlisted.length,
      skipped,
      durationMs: Date.now() - startedAt,
    }));
    return NextResponse.json({ ok: true, persisted: false, skipped });
  }

  try {
    const { error } = await (supabaseAdmin.from("ri_analytics_events" as any) as any).insert(rows);
    if (error) {
      console.error(JSON.stringify({
        level: "error",
        message: "RI analytics batch insert failed",
        route: "/api/analytics",
        requestId: request.headers.get("x-vercel-id"),
        eventCount: rows.length,
        errorCode: typeof error.code === "string" ? error.code : "unknown",
        durationMs: Date.now() - startedAt,
      }));
      return NextResponse.json({ ok: true, persisted: false, skipped: "insert_failed" });
    }
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "RI analytics batch insert threw",
      route: "/api/analytics",
      requestId: request.headers.get("x-vercel-id"),
      eventCount: rows.length,
      error: error instanceof Error ? error.message : "unknown",
      durationMs: Date.now() - startedAt,
    }));
    return NextResponse.json({ ok: true, persisted: false, skipped: "insert_exception" });
  }

  console.info(JSON.stringify({
    level: "info",
    message: "RI analytics batch persisted",
    route: "/api/analytics",
    requestId: request.headers.get("x-vercel-id"),
    receivedEvents: events.length,
    persistedEvents: rows.length,
    durationMs: Date.now() - startedAt,
  }));
  return NextResponse.json({ ok: true, persisted: true, persistedEvents: rows.length });
}
