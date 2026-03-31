import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTiTierServer } from "@/lib/entitlementsServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getTierCaps,
  normalizeAlertName,
  normalizeCadence,
  normalizePositiveInt,
  normalizeSport,
  normalizeZip5,
} from "@/lib/tournamentAlerts";

type RouteParams = {
  params: {
    alertId: string;
  };
};

async function getAuthedUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function normalizeAlertId(raw: string | undefined) {
  return String(raw ?? "").trim();
}

async function zipHasCentroid(zip5: string) {
  const { data, error } = await (supabaseAdmin.from("zip_centroids" as any) as any)
    .select("zip")
    .eq("zip", zip5)
    .maybeSingle();
  if (error) throw error;
  return Boolean((data as any)?.zip);
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const alertId = normalizeAlertId(params?.alertId);
  if (!alertId) return NextResponse.json({ ok: false, error: "invalid_alert_id" }, { status: 400 });

  const { supabase, user } = await getAuthedUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!user.email_confirmed_at) {
    return NextResponse.json({ ok: false, code: "EMAIL_UNVERIFIED", error: "email_unverified" }, { status: 403 });
  }

  const { tier } = await getTiTierServer(user);
  if (tier === "explorer") {
    return NextResponse.json({ ok: false, code: "INSIDER_REQUIRED", error: "insider_required" }, { status: 403 });
  }

  const { data: existing, error: existingError } = await (supabase.from("user_tournament_alerts" as any) as any)
    .select("id,user_id,is_active,cadence")
    .eq("id", alertId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingError) return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
  const existingRow = (existing ?? null) as null | {
    id?: string;
    user_id?: string;
    is_active?: boolean;
    cadence?: string;
  };
  if (!existingRow?.id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};

  if ("name" in (json ?? {})) patch.name = normalizeAlertName(json?.name);
  if ("zip_code" in (json ?? {}) || "zip" in (json ?? {})) {
    const zip5 = normalizeZip5(json?.zip_code ?? json?.zip);
    if (!zip5) return NextResponse.json({ ok: false, code: "INVALID_ZIP", error: "invalid_zip" }, { status: 400 });
    const supported = await zipHasCentroid(zip5).catch(() => false);
    if (!supported) {
      return NextResponse.json(
        { ok: false, code: "ZIP_NOT_SUPPORTED", error: "zip_not_supported" },
        { status: 400 }
      );
    }
    patch.zip_code = zip5;
  }

  if ("radius_miles" in (json ?? {}) || "radius" in (json ?? {})) {
    const radius = normalizePositiveInt(json?.radius_miles ?? json?.radius);
    if (!radius) return NextResponse.json({ ok: false, code: "INVALID_RADIUS", error: "invalid_radius" }, { status: 400 });
    patch.radius_miles = radius;
  }

  if ("days_ahead" in (json ?? {}) || "daysAhead" in (json ?? {})) {
    const daysAhead = normalizePositiveInt(json?.days_ahead ?? json?.daysAhead);
    if (!daysAhead) {
      return NextResponse.json({ ok: false, code: "INVALID_DAYS_AHEAD", error: "invalid_days_ahead" }, { status: 400 });
    }
    patch.days_ahead = daysAhead;
  }

  if ("sport" in (json ?? {})) {
    patch.sport = normalizeSport(json?.sport);
  }

  if ("cadence" in (json ?? {})) {
    const cadence = normalizeCadence(json?.cadence);
    if (!cadence) return NextResponse.json({ ok: false, code: "INVALID_CADENCE", error: "invalid_cadence" }, { status: 400 });
    patch.cadence = cadence;
  }

  if ("is_active" in (json ?? {})) {
    patch.is_active = Boolean(json?.is_active);
  }

  const caps = getTierCaps(tier);
  const nextCadence = (patch.cadence ?? existingRow.cadence) as string;
  if (nextCadence && !caps.allowedCadences.includes(nextCadence as any)) {
    return NextResponse.json({ ok: false, code: "CADENCE_NOT_ALLOWED", error: "cadence_not_allowed" }, { status: 403 });
  }

  const nextRadius = typeof patch.radius_miles === "number" ? (patch.radius_miles as number) : null;
  if (nextRadius != null && nextRadius > caps.maxRadiusMiles) {
    return NextResponse.json(
      { ok: false, code: "RADIUS_TOO_LARGE", error: "radius_too_large", max: caps.maxRadiusMiles },
      { status: 403 }
    );
  }

  const nextDays = typeof patch.days_ahead === "number" ? (patch.days_ahead as number) : null;
  if (nextDays != null && nextDays > caps.maxDaysAhead) {
    return NextResponse.json(
      { ok: false, code: "DAYS_AHEAD_TOO_LARGE", error: "days_ahead_too_large", max: caps.maxDaysAhead },
      { status: 403 }
    );
  }

  const wantsActive = (patch.is_active ?? existingRow.is_active) as boolean;
  const wasActive = Boolean(existingRow.is_active);
  if (wantsActive && !wasActive) {
    const { count, error: countError } = await (supabase.from("user_tournament_alerts" as any) as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_active", true)
      .neq("id", alertId);
    if (countError) return NextResponse.json({ ok: false, error: countError.message }, { status: 500 });
    if ((count ?? 0) >= caps.maxActiveAlerts) {
      return NextResponse.json(
        { ok: false, code: "ALERT_LIMIT_REACHED", error: "alert_limit_reached", max: caps.maxActiveAlerts },
        { status: 403 }
      );
    }
  }

  const { data: updated, error: updateError } = await (supabase.from("user_tournament_alerts" as any) as any)
    .update(patch)
    .eq("id", alertId)
    .eq("user_id", user.id)
    .select("id,user_id,name,zip_code,radius_miles,days_ahead,sport,cadence,is_active,last_sent_at,created_at,updated_at")
    .maybeSingle();

  if (updateError) return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  return NextResponse.json({ ok: true, alert: updated });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const alertId = normalizeAlertId(params?.alertId);
  if (!alertId) return NextResponse.json({ ok: false, error: "invalid_alert_id" }, { status: 400 });

  const { supabase, user } = await getAuthedUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!user.email_confirmed_at) {
    return NextResponse.json({ ok: false, code: "EMAIL_UNVERIFIED", error: "email_unverified" }, { status: 403 });
  }

  const { error } = await (supabase.from("user_tournament_alerts" as any) as any)
    .delete()
    .eq("id", alertId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
