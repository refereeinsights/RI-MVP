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

function asText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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

  return NextResponse.json({ ok: true });
}
