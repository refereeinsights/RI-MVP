import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

function safeOrigin() {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (!raw) throw new Error("Missing NEXT_PUBLIC_APP_URL");
  return raw;
}

export async function POST() {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) return NextResponse.json({ ok: false, error: "auth_failed" }, { status: 401 });
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!user.email_confirmed_at) {
      return NextResponse.json({ ok: false, error: "email_unverified" }, { status: 403 });
    }

    const { data: profile } = await (supabaseAdmin.from("ti_users" as any) as any)
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    const stripeCustomerId = String((profile as any)?.stripe_customer_id || "").trim();
    if (!stripeCustomerId) {
      return NextResponse.json({ ok: false, error: "missing_stripe_customer" }, { status: 400 });
    }

    const stripe = getStripe();
    const origin = safeOrigin();
    const portal = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${origin}/account`,
    });

    if (!portal.url) return NextResponse.json({ ok: false, error: "missing_portal_url" }, { status: 500 });
    return NextResponse.json({ ok: true, url: portal.url });
  } catch (err) {
    const stripeErr = err as any;
    const maybeStripeType = typeof stripeErr?.type === "string" ? String(stripeErr.type) : null;
    const maybeStripeCode = typeof stripeErr?.code === "string" ? String(stripeErr.code) : null;
    const message = err instanceof Error ? err.message : String(err ?? "");

    console.error("[stripe][portal] failed", {
      stripe_type: maybeStripeType,
      stripe_code: maybeStripeCode,
      message,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "portal_failed",
        message: message ? String(message).slice(0, 300) : null,
        stripe_type: maybeStripeType,
        stripe_code: maybeStripeCode,
      },
      { status: 500 }
    );
  }
}
