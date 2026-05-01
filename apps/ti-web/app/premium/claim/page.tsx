import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

function isoFromEpochSeconds(value: number | null | undefined) {
  if (!value || typeof value !== "number") return null;
  return new Date(value * 1000).toISOString();
}

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export default async function PremiumClaimPage({
  searchParams,
}: {
  searchParams?: { session_id?: string };
}) {
  const sessionId = (searchParams?.session_id ?? "").trim();
  if (!sessionId) redirect("/premium?notice=missing_session");

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/premium/claim?session_id=${encodeURIComponent(sessionId)}`)}`);

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription", "subscription.latest_invoice.payment_intent"],
  });

  if (session.mode !== "subscription") {
    redirect("/premium?notice=unsupported_session");
  }

  const checkoutEmail =
    normalizeEmail((session.customer_details as any)?.email) ||
    normalizeEmail((session as any)?.customer_email) ||
    "";
  const userEmail = normalizeEmail(user.email);

  if (!checkoutEmail || !userEmail || checkoutEmail !== userEmail) {
    return (
      <main className="page">
        <div className="shell">
          <section className="bodyCard" aria-labelledby="claim-error">
            <h1 id="claim-error" style={{ marginTop: 0 }}>
              Checkout email doesn&apos;t match this account
            </h1>
            <p className="muted" style={{ marginTop: 0 }}>
              Please log in with the same email you used at Stripe checkout so we can attach your Weekend Pro subscription.
            </p>
            <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
              <div style={{ fontSize: 13 }}>
                <strong>Checkout email:</strong> {checkoutEmail || "—"}
              </div>
              <div style={{ fontSize: 13 }}>
                <strong>Logged in as:</strong> {userEmail || "—"}
              </div>
              <Link className="secondaryLink" href="/account">
                Go to account
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : typeof (session.customer as any)?.id === "string"
        ? String((session.customer as any).id)
        : null;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : typeof (session.subscription as any)?.id === "string"
        ? String((session.subscription as any).id)
        : null;

  if (!subscriptionId) redirect("/premium?notice=missing_subscription");

  const subscription =
    typeof session.subscription === "object" && session.subscription
      ? (session.subscription as any)
      : await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["latest_invoice.payment_intent"],
        });

  const stripeZip =
    String((session.customer_details as any)?.address?.postal_code ?? "").trim() || null;

  const lastInvoiceId =
    typeof subscription.latest_invoice === "string"
      ? subscription.latest_invoice
      : typeof subscription.latest_invoice?.id === "string"
        ? String(subscription.latest_invoice.id)
        : null;

  const paymentIntentId =
    typeof subscription.latest_invoice?.payment_intent === "string"
      ? String(subscription.latest_invoice.payment_intent)
      : typeof subscription.latest_invoice?.payment_intent?.id === "string"
        ? String(subscription.latest_invoice.payment_intent.id)
        : null;

  const update: Record<string, unknown> = {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    current_period_start: isoFromEpochSeconds(subscription.current_period_start),
    current_period_end: isoFromEpochSeconds(subscription.current_period_end),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    last_invoice_id: lastInvoiceId,
    last_payment_intent_id: paymentIntentId,
    updated_at: new Date().toISOString(),
  };

  if (subscription.status === "active") {
    update.plan = "weekend_pro";
  }

  // If the user doesn't have a ZIP yet, use Stripe's billing ZIP (if present).
  if (stripeZip) {
    const { data: existingZipRow } = await (supabaseAdmin.from("ti_users" as any) as any)
      .select("zip_code")
      .eq("id", user.id)
      .maybeSingle();
    const existingZip = String((existingZipRow as any)?.zip_code ?? "").trim();
    if (!existingZip) {
      update.zip_code = stripeZip;
    }
  }

  const { error } = await (supabaseAdmin.from("ti_users" as any) as any)
    .update(update)
    .eq("id", user.id);
  if (error) {
    redirect(`/account?error=${encodeURIComponent("Unable to attach subscription. Please try again or contact support.")}`);
  }

  redirect(`/account?notice=${encodeURIComponent("Weekend Pro unlocked — welcome!")}`);
}
