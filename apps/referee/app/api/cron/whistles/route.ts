import { NextResponse } from "next/server";
import { recomputeAllWhistleScores } from "@/lib/whistleScores";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAuthorized(req: Request, bodyToken?: string | null) {
  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("token");
  const token = tokenFromQuery ?? bodyToken ?? null;
  return Boolean(process.env.CRON_SECRET && token === process.env.CRON_SECRET);
}

type SmokeCheckResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

const ASA_AZ_SOURCE_URL = "https://azsoccerassociation.org/sanctioned-club-tournaments/";

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function runSmokeChecks(): Promise<{
  ok: boolean;
  checks: SmokeCheckResult[];
}> {
  const checks: SmokeCheckResult[] = [];

  // 1) Supabase anon REST probe
  try {
    const host = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    if (!host || !anonKey) {
      checks.push({ name: "supabase_rest_anon", ok: false, detail: "missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY" });
    } else {
      const url = `${host}/rest/v1/owls_eye_runs?select=id,run_id,created_at,completed_at&limit=1`;
      const resp = await fetchWithTimeout(url, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      });
      const body = await resp.json().catch(() => null);
      checks.push({
        name: "supabase_rest_anon",
        ok: resp.ok && Array.isArray(body),
        detail: `status=${resp.status}`,
      });
    }
  } catch (err: any) {
    checks.push({ name: "supabase_rest_anon", ok: false, detail: err?.message ?? "unknown_error" });
  }

  // 2) Migration smoke: ensure dead-domain table is queryable
  try {
    const { error } = await supabaseAdmin
      .from("tournament_dead_domains" as any)
      .select("domain")
      .limit(1);
    checks.push({
      name: "tournament_dead_domains_table",
      ok: !error,
      detail: error?.message ?? "ok",
    });
  } catch (err: any) {
    checks.push({ name: "tournament_dead_domains_table", ok: false, detail: err?.message ?? "unknown_error" });
  }

  // 3) Google Places probe (skip if key missing)
  try {
    const placesKey = process.env.GOOGLE_PLACES_API_KEY ?? "";
    if (!placesKey) {
      checks.push({ name: "google_places_nearby", ok: true, detail: "skipped_missing_key" });
    } else {
      const resp = await fetchWithTimeout("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": placesKey,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
        },
        body: JSON.stringify({
          maxResultCount: 2,
          rankPreference: "DISTANCE",
          locationRestriction: {
            circle: {
              center: { latitude: 37.4219999, longitude: -122.0840575 },
              radius: 1500,
            },
          },
          includedTypes: ["cafe"],
        }),
      });
      const body = await resp.json().catch(() => null);
      const hasPlaces = Array.isArray(body?.places) && body.places.length > 0;
      checks.push({
        name: "google_places_nearby",
        ok: resp.ok && hasPlaces,
        detail: `status=${resp.status}`,
      });
    }
  } catch (err: any) {
    checks.push({ name: "google_places_nearby", ok: false, detail: err?.message ?? "unknown_error" });
  }

  // 4) Parser source availability smoke (lightweight, no DB writes)
  try {
    const resp = await fetchWithTimeout(ASA_AZ_SOURCE_URL, {
      headers: { "user-agent": "RI-Cron-Smoke/1.0" },
    });
    const text = await resp.text().catch(() => "");
    const hasTournamentSignal =
      /tournament/i.test(text) || /sanctioned/i.test(text) || /website/i.test(text);
    checks.push({
      name: "asa_az_source_reachable",
      ok: resp.ok && hasTournamentSignal,
      detail: `status=${resp.status}`,
    });
  } catch (err: any) {
    checks.push({ name: "asa_az_source_reachable", ok: false, detail: err?.message ?? "unknown_error" });
  }

  return {
    ok: checks.every((c) => c.ok),
    checks,
  };
}

function shouldRunSmoke(req: Request, bodySmoke?: unknown) {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("smoke");
  const raw = fromQuery ?? (typeof bodySmoke === "string" ? bodySmoke : null);
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return true;
}

function parseRecipients(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function shouldSendCronEmail(smokeOk: boolean) {
  const mode = (process.env.CRON_REPORT_EMAIL_MODE ?? "failures").trim().toLowerCase();
  if (mode === "always") return true;
  if (mode === "never" || mode === "off" || mode === "0") return false;
  return !smokeOk;
}

function jsonToHtml(value: unknown) {
  const escaped = JSON.stringify(value, null, 2)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<pre style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:8px;">${escaped}</pre>`;
}

async function sendCronReportEmail(params: {
  smokeOk: boolean;
  smoke: unknown;
  whistleResult: unknown;
  triggeredAt: string;
  path: string;
}) {
  const recipients = parseRecipients(process.env.CRON_REPORT_EMAILS);
  if (!recipients.length) return { skipped: true, reason: "missing_recipients" };
  if (!shouldSendCronEmail(params.smokeOk)) return { skipped: true, reason: "mode_filtered" };

  const statusLabel = params.smokeOk ? "PASS" : "FAIL";
  const subject = `[RI Cron] ${statusLabel} ${params.triggeredAt}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.4;">
      <h2 style="margin:0 0 8px;">RI Cron Report: ${statusLabel}</h2>
      <p style="margin:0 0 8px;"><strong>Triggered:</strong> ${params.triggeredAt}</p>
      <p style="margin:0 0 8px;"><strong>Path:</strong> ${params.path}</p>
      <h3 style="margin:16px 0 8px;">Smoke Summary</h3>
      ${jsonToHtml(params.smoke)}
      <h3 style="margin:16px 0 8px;">Whistle Result</h3>
      ${jsonToHtml(params.whistleResult)}
    </div>
  `;
  const text =
    `RI Cron Report: ${statusLabel}\n` +
    `Triggered: ${params.triggeredAt}\n` +
    `Path: ${params.path}\n\n` +
    `Smoke Summary:\n${JSON.stringify(params.smoke, null, 2)}\n\n` +
    `Whistle Result:\n${JSON.stringify(params.whistleResult, null, 2)}\n`;

  await sendEmail({
    to: recipients,
    subject,
    html,
    text,
    from:
      process.env.CRON_REPORT_FROM ??
      process.env.REVIEW_ALERT_FROM ??
      "Referee Insights <refereeinsights@gmail.com>",
  });

  return { skipped: false };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const triggeredAt = new Date().toISOString();
  const result = await recomputeAllWhistleScores();
  const runSmoke = shouldRunSmoke(request);
  const smoke = runSmoke ? await runSmokeChecks() : null;
  const ok = smoke ? smoke.ok : true;

  const path = new URL(request.url).pathname;
  const emailResult = await sendCronReportEmail({
    smokeOk: ok,
    smoke,
    whistleResult: result,
    triggeredAt,
    path,
  }).catch((err) => ({ skipped: true, reason: `send_failed:${err?.message ?? "unknown"}` }));

  return NextResponse.json({
    ok: true,
    smokeOk: ok,
    triggeredAt,
    result,
    smoke,
    email: emailResult,
  }, { status: ok ? 200 : 500 });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!isAuthorized(request, body?.token ?? null)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const triggeredAt = new Date().toISOString();
  const result = await recomputeAllWhistleScores();
  const runSmoke = shouldRunSmoke(request, body?.smoke);
  const smoke = runSmoke ? await runSmokeChecks() : null;
  const ok = smoke ? smoke.ok : true;

  const path = new URL(request.url).pathname;
  const emailResult = await sendCronReportEmail({
    smokeOk: ok,
    smoke,
    whistleResult: result,
    triggeredAt,
    path,
  }).catch((err) => ({ skipped: true, reason: `send_failed:${err?.message ?? "unknown"}` }));

  return NextResponse.json({
    ok: true,
    smokeOk: ok,
    triggeredAt,
    result,
    smoke,
    email: emailResult,
  }, { status: ok ? 200 : 500 });
}
