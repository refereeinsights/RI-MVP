import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type AnalyticsRequest = {
  event?: string;
  properties?: Record<string, unknown>;
};

const QUICK_CHECK_EVENTS = new Set([
  "Venue Quick Check Opened",
  "Venue Quick Check Started",
  "Venue Quick Check Dismissed",
  "Venue Quick Check Submitted",
  "Venue Quick Check Signup Prompt Shown",
  "Venue Quick Check Signup Clicked",
  "Venue Quick Check Signup Dismissed",
]);

const MAP_EVENTS = new Set([
  "map_viewed",
  "map_filter_changed",
  "map_state_clicked",
  "homepage_cta_clicked",
  "homepage_sport_chip_clicked",
  "tournament_detail_more_in_state_clicked",
]);

function asText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asTextWithLimit(value: unknown, maxLen: number) {
  const text = asText(value);
  if (!text) return null;
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function isLocalhostHost(host: string) {
  const h = host.trim().toLowerCase();
  if (!h) return false;
  if (h === "localhost" || h.startsWith("localhost:")) return true;
  if (h === "127.0.0.1" || h.startsWith("127.0.0.1:")) return true;
  if (h === "[::1]" || h.startsWith("[::1]:")) return true;
  if (h.endsWith(".local")) return true;
  return false;
}

function shouldPersistMapEvents(request: Request) {
  const host = asTextWithLimit(request.headers.get("x-forwarded-host") ?? request.headers.get("host"), 128);
  if (host && isLocalhostHost(host)) return false;

  const origin = asTextWithLimit(request.headers.get("origin"), 256);
  if (origin && (origin.includes("://localhost") || origin.includes("://127.0.0.1") || origin.includes("://[::1]"))) {
    return false;
  }

  const referer = asTextWithLimit(request.headers.get("referer"), 512);
  if (referer && (referer.includes("://localhost") || referer.includes("://127.0.0.1") || referer.includes("://[::1]"))) {
    return false;
  }

  return true;
}

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    const text = asText(item);
    if (!text) continue;
    out.push(text.slice(0, 64));
  }
  return out.length ? out : null;
}

function asObject(value: unknown) {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function POST(request: Request) {
  let payload: AnalyticsRequest | null = null;

  try {
    payload = (await request.json()) as AnalyticsRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid analytics payload." }, { status: 400 });
  }

  if (!payload?.event || typeof payload.event !== "string") {
    return NextResponse.json({ ok: false, error: "Event is required." }, { status: 400 });
  }

  const userAgent = asTextWithLimit(request.headers.get("user-agent"), 256);

  console.info(
    "[ti-analytics]",
    JSON.stringify({
      event: payload.event,
      properties: payload.properties ?? {},
      received_at: new Date().toISOString(),
    })
  );

  // Persist quick-check events for admin analytics. Keep the surface area small: only store
  // the venue quick check funnel events, with tight parsing and field limits.
  if (QUICK_CHECK_EVENTS.has(payload.event)) {
    // Avoid polluting analytics with local testing / admin poking around.
    if (!shouldPersistMapEvents(request)) {
      return NextResponse.json({ ok: true, skipped: "localhost" });
    }

    const props = payload.properties ?? {};
    const venueUuid = asText((props as any).venueUuid);
    const pageType = asText((props as any).pageType);
    const sourceTournamentUuid = asText((props as any).sourceTournamentUuid);
    const fieldsCompleted = asNumber((props as any).fieldsCompleted);
    const fieldsAnswered = asStringArray((props as any).fieldsAnswered);

    try {
      await supabaseAdmin.from("venue_quick_check_events" as any).insert({
        event_type: payload.event,
        venue_id: venueUuid,
        page_type: pageType,
        source_tournament_id: sourceTournamentUuid,
        fields_completed: fieldsCompleted,
        fields_answered: fieldsAnswered,
      });
    } catch {
      // Ignore persistence failures; analytics must never block UX.
    }
  }

  // Persist map interactions so we can review adoption and usage patterns.
  if (MAP_EVENTS.has(payload.event)) {
    const host = asTextWithLimit(request.headers.get("x-forwarded-host") ?? request.headers.get("host"), 128);
    const origin = asTextWithLimit(request.headers.get("origin"), 256);
    const referer = asTextWithLimit(request.headers.get("referer"), 512);

    // Avoid polluting analytics with local testing / admin poking around.
    if (!shouldPersistMapEvents(request)) {
      return NextResponse.json({ ok: true, skipped: "localhost" });
    }

    const propsRaw = payload.properties ?? {};
    const props = asObject(propsRaw) ?? {};
    const pageType = asTextWithLimit((props as any).page_type, 32);
    const sport = asTextWithLimit((props as any).sport, 32);
    const state = asTextWithLimit((props as any).state, 8);
    const href = asTextWithLimit((props as any).href, 512);
    const filterName = asTextWithLimit((props as any).filter_name, 32);
    const oldValue = asTextWithLimit((props as any).old_value, 64);
    const newValue = asTextWithLimit((props as any).new_value, 64);
    const cta = asTextWithLimit((props as any).cta, 64);

    const properties = {
      ...(props as any),
      ua: (props as any).ua ?? userAgent ?? null,
      host: (props as any).host ?? host ?? null,
      origin: (props as any).origin ?? origin ?? null,
      referer: (props as any).referer ?? referer ?? null,
    };

    try {
      await supabaseAdmin.from("ti_map_events" as any).insert({
        event_name: payload.event,
        properties,
        page_type: pageType,
        sport,
        state,
        href,
        filter_name: filterName,
        old_value: oldValue,
        new_value: newValue,
        cta,
      });
    } catch {
      // Ignore persistence failures; analytics must never block UX.
    }
  }

  return NextResponse.json({ ok: true });
}
