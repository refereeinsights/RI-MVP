import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const PROMO_KEY = "qvc_weekend_pro_12mo_v1";

function parseDate(value: string | null) {
  if (!value) return null;
  const ts = new Date(value);
  return Number.isNaN(ts.getTime()) ? null : ts;
}

function maxDate(...dates: Array<Date | null>) {
  let best: Date | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (!best || d.getTime() > best.getTime()) best = d;
  }
  return best;
}

function plusOneYear(base: Date) {
  const d = new Date(base.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!user.email_confirmed_at) {
    return NextResponse.json({ ok: false, error: "Email verification required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  let quickCheckId = typeof body?.quick_check_id === "string" ? body.quick_check_id.trim() : "";
  const browserHash = typeof body?.browser_hash === "string" ? body.browser_hash.trim().slice(0, 128) : "";

  if (!quickCheckId) {
    const { data: pending } = await supabaseAdmin
      .from("ti_users" as any)
      .select("qvc_pending_quick_check_id")
      .eq("id", user.id)
      .maybeSingle<{ qvc_pending_quick_check_id: string | null }>();
    quickCheckId = (pending?.qvc_pending_quick_check_id ?? "").trim();
  }

  if (!quickCheckId) {
    return NextResponse.json({ ok: false, error: "quick_check_id required." }, { status: 400 });
  }

  const { data: quickCheck } = await supabaseAdmin
    .from("venue_quick_checks" as any)
    .select("id,venue_id,browser_hash,user_id,created_at")
    .eq("id", quickCheckId)
    .maybeSingle<{
      id: string;
      venue_id: string;
      browser_hash: string | null;
      user_id: string | null;
      created_at: string | null;
    }>();

  if (!quickCheck?.id) {
    return NextResponse.json({ ok: false, error: "Quick check not found." }, { status: 404 });
  }

  if (quickCheck.user_id && quickCheck.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Quick check already claimed." }, { status: 409 });
  }

  const expectedHash = (quickCheck.browser_hash ?? "").trim();
  if (expectedHash && browserHash && expectedHash !== browserHash) {
    return NextResponse.json({ ok: false, error: "Browser mismatch." }, { status: 403 });
  }

  if (!quickCheck.user_id) {
    await supabaseAdmin
      .from("venue_quick_checks" as any)
      .update({ user_id: user.id })
      .eq("id", quickCheck.id)
      .is("user_id", null);
  }

  // Persist a durable "pending reward" marker when the profile row exists already.
  // (If it doesn't, we'll still create/update the row after grant below.)
  const { data: hasProfile } = await supabaseAdmin
    .from("ti_users" as any)
    .select("id")
    .eq("id", user.id)
    .maybeSingle<{ id: string }>();
  if (hasProfile?.id) {
    await supabaseAdmin
      .from("ti_users" as any)
      .update({
        qvc_pending_quick_check_id: quickCheck.id,
        qvc_pending_browser_hash: browserHash || null,
        qvc_pending_set_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
  }

  const promoInsert = await supabaseAdmin
    .from("ti_promo_grants" as any)
    .insert({
      user_id: user.id,
      promo_key: PROMO_KEY,
      source: "venue_quick_check",
      source_quick_check_id: quickCheck.id,
    })
    .select("id")
    .maybeSingle();

  if (promoInsert.error) {
    const code = String((promoInsert.error as any)?.code ?? "");
    if (code === "23505") {
      // Unique constraint hit => promo already granted; clear pending marker.
      await supabaseAdmin
        .from("ti_users" as any)
        .update({
          qvc_pending_quick_check_id: null,
          qvc_pending_browser_hash: null,
          qvc_pending_set_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      return NextResponse.json({ ok: true, granted: false });
    }

    // If the promo ledger migration hasn't been applied yet (or other server error),
    // keep the pending marker so the user can retry later.
    return NextResponse.json(
      {
        ok: false,
        error:
          code === "42P01"
            ? "Reward system is not ready yet (missing promo ledger). Please try again shortly."
            : `Unable to claim reward: ${promoInsert.error.message}`,
      },
      { status: 500 }
    );
  }

  if (!promoInsert.data?.id) {
    // Defensive: no insert id, treat as already applied and clear pending marker.
    await supabaseAdmin
      .from("ti_users" as any)
      .update({
        qvc_pending_quick_check_id: null,
        qvc_pending_browser_hash: null,
        qvc_pending_set_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    return NextResponse.json({ ok: true, granted: false });
  }

  const { data: profile } = await supabaseAdmin
    .from("ti_users" as any)
    .select("plan,subscription_status,current_period_end,trial_ends_at")
    .eq("id", user.id)
    .maybeSingle<{
      plan: string | null;
      subscription_status: string | null;
      current_period_end: string | null;
      trial_ends_at: string | null;
    }>();

  const now = new Date();
  const currentPeriodEnd = parseDate(profile?.current_period_end ?? null);
  const trialEndsAt = parseDate(profile?.trial_ends_at ?? null);
  const base = maxDate(now, currentPeriodEnd, trialEndsAt) ?? now;
  const newEnd = plusOneYear(base);

  const currentStatus = (profile?.subscription_status ?? "").trim().toLowerCase();
  const isActive = currentStatus === "active";
  const nextStatus = isActive ? "active" : "trialing";

  const updatePayload = {
    id: user.id,
    email: (user.email ?? "").trim().toLowerCase() || null,
    plan: "weekend_pro",
    subscription_status: nextStatus,
    current_period_end: newEnd.toISOString(),
    trial_ends_at: newEnd.toISOString(),
    last_seen_at: now.toISOString(),
    updated_at: now.toISOString(),
    first_seen_at: now.toISOString(),
    qvc_pending_quick_check_id: null,
    qvc_pending_browser_hash: null,
    qvc_pending_set_at: null,
  };

  await supabaseAdmin.from("ti_users" as any).upsert(updatePayload, { onConflict: "id" });

  return NextResponse.json({ ok: true, granted: true, trial_ends_at: newEnd.toISOString() });
}
