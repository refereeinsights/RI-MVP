import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmailAlert } from "@/lib/email";
import { EXTERNAL_API } from "@/lib/trackExternalCall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type AlarmRow = {
  id: string;
  api: string;
  metric: "calls" | "errors" | "error_rate";
  window_type: "day" | "week" | "month";
  threshold: number;
  notify_email: string;
  cooldown_minutes: number;
  last_alerted_at: string | null;
  last_alerted_window_start: string | null;
  enabled: boolean;
  notes: string | null;
};

async function ensureAdminRequest() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") return null;
  return data.user;
}

function isCronAuthorized(req: Request) {
  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("token");
  if (!tokenFromQuery) return false;
  const secret = process.env.CRON_SECRET ?? "";
  return Boolean(secret) && tokenFromQuery === secret;
}

function startOfUtcDay(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

function startOfUtcWeekMonday(now: Date) {
  const d = startOfUtcDay(now);
  const dow = (d.getUTCDay() + 6) % 7; // Monday=0
  return new Date(d.getTime() - dow * 86400_000);
}

function startOfUtcMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function windowStart(now: Date, windowType: AlarmRow["window_type"]) {
  if (windowType === "day") return startOfUtcDay(now);
  if (windowType === "week") return startOfUtcWeekMonday(now);
  return startOfUtcMonth(now);
}

function pct(n: number, d: number) {
  if (d <= 0) return 0;
  return (n / d) * 100;
}

function safeApiValuesSet() {
  return new Set<string>(Object.values(EXTERNAL_API) as unknown as string[]);
}

function buildAdminLink(api: string, windowType: string) {
  // Keep relative; admin can open on the same domain.
  const qs = new URLSearchParams();
  qs.set("api", api);
  qs.set("range", windowType === "month" ? "mtd" : windowType);
  return `/admin/api-usage?${qs.toString()}`;
}

function plainEmailBody(params: {
  api: string;
  metric: string;
  window_type: string;
  window_start: string;
  window_end: string;
  value: number;
  threshold: number;
  calls_total: number;
  errors_total: number;
  cooldown_minutes: number;
  fired_at: string;
  link: string;
}) {
  return [
    `API: ${params.api}`,
    `Metric: ${params.metric}`,
    `Window: ${params.window_type}`,
    `Window start (UTC): ${params.window_start}`,
    `Window end (UTC): ${params.window_end}`,
    `Value: ${params.value}`,
    `Threshold: ${params.threshold}`,
    `Calls total: ${params.calls_total}`,
    `Errors total: ${params.errors_total}`,
    `Cooldown minutes: ${params.cooldown_minutes}`,
    `Fired at (UTC): ${params.fired_at}`,
    `Admin: ${params.link}`,
    "",
  ].join("\n");
}

export async function POST(req: Request) {
  const isCron = isCronAuthorized(req);
  const adminUser = isCron ? null : await ensureAdminRequest();
  if (!isCron && !adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const alarmId = String((body as any)?.alarm_id ?? "").trim() || null;
  const force = Boolean((body as any)?.force ?? false);

  if (force && !adminUser) {
    return NextResponse.json({ error: "force requires admin session" }, { status: 403 });
  }

  const { data: alarmsRaw, error } = await supabaseAdmin
    .from("api_usage_alarms" as any)
    .select("id,api,metric,window_type,threshold,notify_email,cooldown_minutes,last_alerted_at,last_alerted_window_start,enabled,notes")
    .eq("enabled", true)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const alarms: AlarmRow[] = (alarmsRaw ?? []) as any;
  const filtered = alarmId ? alarms.filter((a) => a.id === alarmId) : alarms;
  if (alarmId && filtered.length === 0) return NextResponse.json({ error: "alarm not found" }, { status: 404 });

  const allowedApis = safeApiValuesSet();
  const now = new Date();

  const results: Array<Record<string, any>> = [];
  let fired = 0;
  let skippedCooldown = 0;

  for (const alarm of filtered) {
    const api = String(alarm.api ?? "").trim();
    if (!allowedApis.has(api)) {
      results.push({ id: alarm.id, ok: false, api, error: "invalid_api_value" });
      continue;
    }

    const wStart = windowStart(now, alarm.window_type);
    const wEnd = now;

    const { data: rpcRows, error: rpcErr } = await (supabaseAdmin as any).rpc("api_usage_summary", {
      from_ts: wStart.toISOString(),
      to_ts: wEnd.toISOString(),
    });

    if (rpcErr) {
      results.push({ id: alarm.id, ok: false, api, error: rpcErr.message });
      continue;
    }

    let callsTotal = 0;
    let errorsTotal = 0;
    for (const row of rpcRows ?? []) {
      if (String(row.api ?? "") !== api) continue;
      callsTotal += Number(row.calls ?? 0);
      errorsTotal += Number(row.errors ?? 0);
    }

    const metricValue =
      alarm.metric === "calls"
        ? callsTotal
        : alarm.metric === "errors"
          ? errorsTotal
          : pct(errorsTotal, callsTotal);

    const meetsThreshold = metricValue >= Number(alarm.threshold ?? 0);
    const lastAlertedAtMs = alarm.last_alerted_at ? new Date(alarm.last_alerted_at).getTime() : null;
    const lastWindowStartMs = alarm.last_alerted_window_start
      ? new Date(alarm.last_alerted_window_start).getTime()
      : null;
    const currentWindowStartMs = wStart.getTime();
    const windowRolled = lastWindowStartMs == null ? true : lastWindowStartMs !== currentWindowStartMs;
    const cooldownMs = Math.max(0, Math.floor(Number(alarm.cooldown_minutes ?? 60))) * 60_000;
    const cooldownPassed = lastAlertedAtMs == null ? true : now.getTime() - lastAlertedAtMs >= cooldownMs;

    const canAlert = force ? true : windowRolled || cooldownPassed;

    if (!meetsThreshold) {
      results.push({
        id: alarm.id,
        ok: true,
        fired: false,
        reason: "below_threshold",
        api,
        metric: alarm.metric,
        window_type: alarm.window_type,
        value: metricValue,
        threshold: alarm.threshold,
        calls_total: callsTotal,
        errors_total: errorsTotal,
      });
      continue;
    }

    if (!canAlert) {
      skippedCooldown += 1;
      results.push({
        id: alarm.id,
        ok: true,
        fired: false,
        reason: "cooldown",
        api,
        metric: alarm.metric,
        window_type: alarm.window_type,
        value: metricValue,
        threshold: alarm.threshold,
        calls_total: callsTotal,
        errors_total: errorsTotal,
      });
      continue;
    }

    const subject = `[TI Admin] API alarm: ${api} ${alarm.metric} ${alarm.window_type} (${metricValue} >= ${alarm.threshold})`;
    const link = buildAdminLink(api, alarm.window_type);
    const firedAtIso = now.toISOString();
    const text = plainEmailBody({
      api,
      metric: alarm.metric,
      window_type: alarm.window_type,
      window_start: wStart.toISOString(),
      window_end: wEnd.toISOString(),
      value: metricValue,
      threshold: Number(alarm.threshold),
      calls_total: callsTotal,
      errors_total: errorsTotal,
      cooldown_minutes: Math.floor(Number(alarm.cooldown_minutes ?? 60)),
      fired_at: firedAtIso,
      link,
    });

    const html = `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; white-space: pre-wrap;">${text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</pre>`;

    const emailRes = await sendEmailAlert({
      to: alarm.notify_email,
      subject,
      html,
      text,
    });

    fired += 1;

    await supabaseAdmin
      .from("api_usage_alarms" as any)
      .update({
        last_alerted_at: firedAtIso,
        last_alerted_window_start: wStart.toISOString(),
      })
      .eq("id", alarm.id);

    results.push({
      id: alarm.id,
      ok: true,
      fired: true,
      api,
      metric: alarm.metric,
      window_type: alarm.window_type,
      value: metricValue,
      threshold: alarm.threshold,
      calls_total: callsTotal,
      errors_total: errorsTotal,
      email: emailRes,
      link,
    });
  }

  return NextResponse.json({
    ok: true,
    checked: filtered.length,
    fired,
    skipped_cooldown: skippedCooldown,
    results,
  });
}
