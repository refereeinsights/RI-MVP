import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

type CheckoutGuestBody = {
  source?: unknown;
  source_context?: unknown;
  tournament_slug?: unknown;
  venue_slug?: unknown;
  entry_point?: unknown;
  cta_label?: unknown;
  offer?: unknown;
  purchaser_email?: unknown;
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
    let body: CheckoutGuestBody | null = null;
    try {
      body = (await request.json()) as CheckoutGuestBody;
    } catch {
      body = null;
    }

    const stripe = getStripe();

    const origin = safeOrigin();
    const offer = safeMeta(body?.offer, 64);
    const purchaserEmail = safeMeta(body?.purchaser_email, 220);

    const metadata: Record<string, string> = {
      app: "ti",
      flow: "guest_checkout",
    };

    const source = safeMeta(body?.source);
    const sourceContext = safeMeta(body?.source_context);
    const tournamentSlug = safeMeta(body?.tournament_slug);
    const venueSlug = safeMeta(body?.venue_slug);
    const entryPoint = safeMeta(body?.entry_point);
    const ctaLabel = safeMeta(body?.cta_label);
    if (source) metadata.source = source;
    if (sourceContext) metadata.source_context = sourceContext;
    if (tournamentSlug) metadata.tournament_slug = tournamentSlug;
    if (venueSlug) metadata.venue_slug = venueSlug;
    if (entryPoint) metadata.entry_point = entryPoint;
    if (ctaLabel) metadata.cta_label = ctaLabel;
    if (purchaserEmail) metadata.purchaser_email = purchaserEmail;

    const isWeekendPass = offer === "weekend_pass_30d";

    if (isWeekendPass) {
      const weekendPassPriceId = requireEnv("STRIPE_WEEKEND_PASS_PRICE_ID");
      metadata.offer = "weekend_pass_30d";
      metadata.access_days = "30";
      metadata.product_id = "prod_UaAMEgCjjfq52v";
      metadata.source = metadata.source ?? "guest_checkout";

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: weekendPassPriceId, quantity: 1 }],
        success_url: `${origin}/premium/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/premium?upgrade=cancelled`,
        automatic_tax: { enabled: true },
        billing_address_collection: "auto",
        metadata,
      });

      const url = session.url || null;
      if (!url) return NextResponse.json({ ok: false, error: "missing_session_url" }, { status: 500 });
      return NextResponse.json({ ok: true, url });
    }

    // Default annual Weekend Pro subscription flow.
    const priceId = requireEnv("STRIPE_WEEKEND_PRO_PRICE_ID");
    const couponId = requireEnv("STRIPE_WEEKEND_PRO_FOUNDING_COUPON_ID");
    metadata.product = "weekend_pro";
    metadata.entitlement = "weekend_pro";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      discounts: [{ coupon: couponId }],
      success_url: `${origin}/premium/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/premium?upgrade=cancelled`,
      automatic_tax: { enabled: true },
      billing_address_collection: "auto",
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

    console.error("[stripe][checkout-guest] failed", {
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
