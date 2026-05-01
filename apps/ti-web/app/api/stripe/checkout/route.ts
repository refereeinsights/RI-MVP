import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

type CheckoutBody = {
  source?: unknown;
  tournament_slug?: unknown;
  venue_slug?: unknown;
  entry_point?: unknown;
};

function requireEnv(name: string) {
  const value = (process.env[name] || "").trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function safeMeta(value: unknown, maxLen = 200) {
  const str = String(value ?? "").trim();
  if (!str) return null;
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

function safeOrigin() {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (!raw) throw new Error("Missing NEXT_PUBLIC_APP_URL");
  return raw;
}

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) return NextResponse.json({ ok: false, error: "auth_failed" }, { status: 401 });
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    let body: CheckoutBody | null = null;
    try {
      body = (await request.json()) as CheckoutBody;
    } catch {
      body = null;
    }

    const stripe = getStripe();

    const priceId = requireEnv("STRIPE_WEEKEND_PRO_PRICE_ID");
    const couponId = requireEnv("STRIPE_WEEKEND_PRO_FOUNDING_COUPON_ID");
    const origin = safeOrigin();

    const { data: existingRaw } = await (supabaseAdmin.from("ti_users" as any) as any)
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    const existing = (existingRaw as { stripe_customer_id?: string | null } | null) ?? null;

    const metadata: Record<string, string> = {
      app: "ti",
      product: "weekend_pro",
      entitlement: "weekend_pro",
    };

    const source = safeMeta(body?.source);
    const tournamentSlug = safeMeta(body?.tournament_slug);
    const venueSlug = safeMeta(body?.venue_slug);
    const entryPoint = safeMeta(body?.entry_point);
    if (source) metadata.source = source;
    if (tournamentSlug) metadata.tournament_slug = tournamentSlug;
    if (venueSlug) metadata.venue_slug = venueSlug;
    if (entryPoint) metadata.entry_point = entryPoint;

    const customerParams = existing?.stripe_customer_id
      ? { customer: existing.stripe_customer_id, customer_update: { address: "auto", name: "auto" } as const }
      : user.email
        ? { customer_email: user.email }
        : {};

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      discounts: [{ coupon: couponId }],
      client_reference_id: user.id,
      success_url: `${origin}/account?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/account?upgrade=cancelled`,
      automatic_tax: { enabled: true },
      billing_address_collection: "auto",
      ...customerParams,
      metadata,
      expand: ["subscription", "subscription.latest_invoice.payment_intent"],
    });

    const url = session.url || null;
    if (!url) return NextResponse.json({ ok: false, error: "missing_session_url" }, { status: 500 });
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    const stripeErr = err as any;
    const maybeStripeType = typeof stripeErr?.type === "string" ? String(stripeErr.type) : null;
    const maybeStripeCode = typeof stripeErr?.code === "string" ? String(stripeErr.code) : null;
    const message = err instanceof Error ? err.message : String(err ?? "");

    console.error("[stripe][checkout] failed", {
      stripe_type: maybeStripeType,
      stripe_code: maybeStripeCode,
      message,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "checkout_failed",
        message: message ? String(message).slice(0, 300) : null,
        stripe_type: maybeStripeType,
        stripe_code: maybeStripeCode,
      },
      { status: 500 }
    );
  }
}
