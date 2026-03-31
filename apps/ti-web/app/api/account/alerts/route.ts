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

async function getAuthedUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function zipHasCentroid(zip5: string) {
  const { data, error } = await (supabaseAdmin.from("zip_centroids" as any) as any)
    .select("zip")
    .eq("zip", zip5)
    .maybeSingle();
  if (error) throw error;
  return Boolean((data as any)?.zip);
}

export async function GET() {
  const { supabase, user } = await getAuthedUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { data, error } = await (supabase.from("user_tournament_alerts" as any) as any)
    .select("id,user_id,name,zip_code,radius_miles,days_ahead,sport,cadence,is_active,last_sent_at,created_at,updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, alerts: data ?? [] });
}

export async function POST(req: Request) {
  const { supabase, user } = await getAuthedUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!user.email_confirmed_at) {
    return NextResponse.json({ ok: false, code: "EMAIL_UNVERIFIED", error: "email_unverified" }, { status: 403 });
  }

  const { tier } = await getTiTierServer(user);
  if (tier === "explorer") {
    return NextResponse.json({ ok: false, code: "INSIDER_REQUIRED", error: "insider_required" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const name = normalizeAlertName(json?.name);
  const zip5 = normalizeZip5(json?.zip_code ?? json?.zip);
  const radius = normalizePositiveInt(json?.radius_miles ?? json?.radius);
  const daysAhead = normalizePositiveInt(json?.days_ahead ?? json?.daysAhead);
  const cadence = normalizeCadence(json?.cadence);
  const sport = normalizeSport(json?.sport);

  if (!zip5) return NextResponse.json({ ok: false, code: "INVALID_ZIP", error: "invalid_zip" }, { status: 400 });
  if (!radius) return NextResponse.json({ ok: false, code: "INVALID_RADIUS", error: "invalid_radius" }, { status: 400 });
  if (!daysAhead) return NextResponse.json({ ok: false, code: "INVALID_DAYS_AHEAD", error: "invalid_days_ahead" }, { status: 400 });
  if (!cadence) return NextResponse.json({ ok: false, code: "INVALID_CADENCE", error: "invalid_cadence" }, { status: 400 });

  const caps = getTierCaps(tier);
  if (!caps.allowedCadences.includes(cadence)) {
    return NextResponse.json({ ok: false, code: "CADENCE_NOT_ALLOWED", error: "cadence_not_allowed" }, { status: 403 });
  }
  if (radius > caps.maxRadiusMiles) {
    return NextResponse.json(
      { ok: false, code: "RADIUS_TOO_LARGE", error: "radius_too_large", max: caps.maxRadiusMiles },
      { status: 403 }
    );
  }
  if (daysAhead > caps.maxDaysAhead) {
    return NextResponse.json(
      { ok: false, code: "DAYS_AHEAD_TOO_LARGE", error: "days_ahead_too_large", max: caps.maxDaysAhead },
      { status: 403 }
    );
  }

  const supported = await zipHasCentroid(zip5).catch(() => false);
  if (!supported) {
    return NextResponse.json(
      { ok: false, code: "ZIP_NOT_SUPPORTED", error: "zip_not_supported" },
      { status: 400 }
    );
  }

  const { count, error: countError } = await (supabase.from("user_tournament_alerts" as any) as any)
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_active", true);
  if (countError) return NextResponse.json({ ok: false, error: countError.message }, { status: 500 });
  if ((count ?? 0) >= caps.maxActiveAlerts) {
    return NextResponse.json(
      { ok: false, code: "ALERT_LIMIT_REACHED", error: "alert_limit_reached", max: caps.maxActiveAlerts },
      { status: 403 }
    );
  }

  const { data, error } = await (supabase.from("user_tournament_alerts" as any) as any)
    .insert({
      user_id: user.id,
      name,
      zip_code: zip5,
      radius_miles: radius,
      days_ahead: daysAhead,
      sport,
      cadence,
      is_active: true,
    })
    .select("id,user_id,name,zip_code,radius_miles,days_ahead,sport,cadence,is_active,last_sent_at,created_at,updated_at")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, alert: data });
}
