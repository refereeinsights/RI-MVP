import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { EXTERNAL_API } from "@/lib/trackExternalCall";

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

const ALLOWED_METRICS = new Set(["calls", "errors", "error_rate"]);
const ALLOWED_WINDOWS = new Set(["day", "week", "month"]);
const ALLOWED_APIS: Set<string> = new Set(Object.values(EXTERNAL_API) as unknown as string[]);

function isEmail(value: unknown) {
  const s = String(value ?? "").trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function pickOptionalText(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

export async function GET() {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("api_usage_alarms" as any)
    .select(
      "id,api,metric,window_type,threshold,notify_email,cooldown_minutes,last_alerted_at,last_alerted_window_start,enabled,notes,created_at,updated_at"
    )
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alarms: data ?? [] });
}

export async function POST(req: Request) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const id = pickOptionalText((body as any).id);
  const api = String((body as any).api ?? "").trim();
  const metric = String((body as any).metric ?? "").trim();
  const windowType = String((body as any).window_type ?? "").trim();
  const notifyEmail = String((body as any).notify_email ?? "").trim();
  const threshold = Number((body as any).threshold);
  const cooldownMinutes = Number((body as any).cooldown_minutes ?? 60);
  const enabled = Boolean((body as any).enabled ?? true);
  const notes = pickOptionalText((body as any).notes);

  if (!ALLOWED_APIS.has(api)) return NextResponse.json({ error: "Invalid api" }, { status: 400 });
  if (!ALLOWED_METRICS.has(metric)) return NextResponse.json({ error: "Invalid metric" }, { status: 400 });
  if (!ALLOWED_WINDOWS.has(windowType)) return NextResponse.json({ error: "Invalid window_type" }, { status: 400 });
  if (!Number.isFinite(threshold) || threshold < 0) return NextResponse.json({ error: "Invalid threshold" }, { status: 400 });
  if (metric === "error_rate" && threshold > 100) return NextResponse.json({ error: "Invalid threshold for error_rate" }, { status: 400 });
  if (!isEmail(notifyEmail)) return NextResponse.json({ error: "Invalid notify_email" }, { status: 400 });
  if (!Number.isFinite(cooldownMinutes) || cooldownMinutes < 0 || cooldownMinutes > 60 * 24 * 30) {
    return NextResponse.json({ error: "Invalid cooldown_minutes" }, { status: 400 });
  }

  if (id) {
    const { data, error } = await supabaseAdmin
      .from("api_usage_alarms" as any)
      .update({
        api,
        metric,
        window_type: windowType,
        threshold,
        notify_email: notifyEmail,
        cooldown_minutes: Math.floor(cooldownMinutes),
        enabled,
        notes,
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, alarm: data });
  }

  const { data, error } = await supabaseAdmin
    .from("api_usage_alarms" as any)
    .insert({
      api,
      metric,
      window_type: windowType,
      threshold,
      notify_email: notifyEmail,
      cooldown_minutes: Math.floor(cooldownMinutes),
      enabled,
      notes,
    })
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, alarm: data });
}

export async function PATCH(req: Request) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const id = pickOptionalText((body as any).id);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const updates: Record<string, any> = {};
  if ((body as any).enabled != null) updates.enabled = Boolean((body as any).enabled);
  if ((body as any).threshold != null) {
    const threshold = Number((body as any).threshold);
    if (!Number.isFinite(threshold) || threshold < 0) return NextResponse.json({ error: "Invalid threshold" }, { status: 400 });
    updates.threshold = threshold;
  }
  if ((body as any).cooldown_minutes != null) {
    const cooldownMinutes = Number((body as any).cooldown_minutes);
    if (!Number.isFinite(cooldownMinutes) || cooldownMinutes < 0 || cooldownMinutes > 60 * 24 * 30) {
      return NextResponse.json({ error: "Invalid cooldown_minutes" }, { status: 400 });
    }
    updates.cooldown_minutes = Math.floor(cooldownMinutes);
  }
  if ((body as any).notes != null) updates.notes = pickOptionalText((body as any).notes);

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No updates" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("api_usage_alarms" as any)
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, alarm: data });
}

export async function DELETE(req: Request) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = (searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabaseAdmin.from("api_usage_alarms" as any).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
