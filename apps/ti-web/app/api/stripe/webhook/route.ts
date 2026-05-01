import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";

type WebhookRow = {
  id: string;
  stripe_event_id: string;
  status: "processed" | "skipped" | "error";
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isoFromEpochSeconds(value: number | null | undefined) {
  if (!value || typeof value !== "number") return null;
  return new Date(value * 1000).toISOString();
}

function safeErrMessage(err: unknown, maxLen = 220) {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const clean = message.trim().replace(/\s+/g, " ");
  return clean.length > maxLen ? clean.slice(0, maxLen) : clean;
}

function pickIdsFromEvent(event: Stripe.Event) {
  const type = event.type;
  const obj: any = event.data?.object as any;
  const customerId = typeof obj?.customer === "string" ? obj.customer : typeof obj?.customer?.id === "string" ? obj.customer.id : null;
  const subscriptionId =
    typeof obj?.subscription === "string"
      ? obj.subscription
      : typeof obj?.id === "string" && type.startsWith("customer.subscription.")
        ? obj.id
        : null;
  const userId =
    type === "checkout.session.completed" && typeof obj?.client_reference_id === "string" && isUuid(obj.client_reference_id)
      ? obj.client_reference_id
      : null;
  return { customerId, subscriptionId, userId };
}

async function getWebhookRowByEventId(stripeEventId: string) {
  const { data } = await (supabaseAdmin.from("stripe_webhook_events" as any) as any)
    .select("id,stripe_event_id,status")
    .eq("stripe_event_id", stripeEventId)
    .maybeSingle();
  return (data as WebhookRow | null) ?? null;
}

async function insertWebhookRow(event: Stripe.Event) {
  const { customerId, subscriptionId, userId } = pickIdsFromEvent(event);
  const payload = {
    object: (event.data?.object as any)?.object ?? null,
    customer_id: customerId,
    subscription_id: subscriptionId,
  };

  const { data, error } = await (supabaseAdmin.from("stripe_webhook_events" as any) as any)
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      livemode: Boolean((event as any).livemode),
      user_id: userId,
      customer_id: customerId,
      subscription_id: subscriptionId,
      status: "error",
      error_message: null,
      payload,
    })
    .select("id,stripe_event_id,status")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("failed_to_insert_webhook_row");
  return data as WebhookRow;
}

async function setWebhookStatus(rowId: string, status: WebhookRow["status"], errorMessage: string | null) {
  await (supabaseAdmin.from("stripe_webhook_events" as any) as any)
    .update({
      status,
      error_message: errorMessage ? safeErrMessage(errorMessage) : null,
    })
    .eq("id", rowId);
}

async function lookupTiUserBySubscriptionOrCustomer(params: { subscriptionId?: string | null; customerId?: string | null }) {
  const subscriptionId = (params.subscriptionId || "").trim();
  const customerId = (params.customerId || "").trim();

  if (subscriptionId) {
    const { data } = await (supabaseAdmin.from("ti_users" as any) as any)
      .select("id,trial_ends_at,subscription_status")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();
    const row = (data as { id?: string; trial_ends_at?: string | null; subscription_status?: string | null } | null) ?? null;
    if (row?.id) return row as { id: string; trial_ends_at: string | null; subscription_status: string | null };
  }

  if (customerId) {
    const { data } = await (supabaseAdmin.from("ti_users" as any) as any)
      .select("id,trial_ends_at,subscription_status")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    const row = (data as { id?: string; trial_ends_at?: string | null; subscription_status?: string | null } | null) ?? null;
    if (row?.id) return row as { id: string; trial_ends_at: string | null; subscription_status: string | null };
  }

  return null;
}

async function updateTiUser(userId: string, payload: Record<string, unknown>) {
  const nowIso = new Date().toISOString();

  const { data: existing } = await (supabaseAdmin.from("ti_users" as any) as any)
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!existing?.id) {
    // Some flows may not have created a ti_users row yet. Insert a minimal safe row so
    // Stripe webhooks can attach subscription references without violating NOT NULL cols.
    const { error: insertError } = await (supabaseAdmin.from("ti_users" as any) as any).insert({
      id: userId,
      email: (payload.email as string | null | undefined) ?? null,
      status: "active",
      signup_source: "website",
      plan: "insider",
      subscription_status: "none",
      cancel_at_period_end: false,
      sports_interests: [],
      marketing_opt_in: false,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      updated_at: nowIso,
    });
    if (insertError) throw insertError;
  }

  const base: Record<string, unknown> = { updated_at: nowIso, ...payload };
  const { error } = await (supabaseAdmin.from("ti_users" as any) as any).update(base).eq("id", userId);
  if (error) throw error;
}

async function retrieveSubscriptionExpanded(stripe: Stripe, subscriptionId: string) {
  return await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["latest_invoice.payment_intent"],
  });
}

async function retrieveInvoiceExpanded(stripe: Stripe, invoiceId: string) {
  return await stripe.invoices.retrieve(invoiceId, {
    expand: ["payment_intent"],
  });
}

function isFuture(value: string | null | undefined) {
  if (!value) return false;
  const ts = new Date(value).getTime();
  return !Number.isNaN(ts) && ts > Date.now();
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const sig = request.headers.get("stripe-signature") || "";
  if (!sig) return NextResponse.json({ ok: false, error: "missing_signature" }, { status: 400 });

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, getStripeWebhookSecret());
  } catch (err) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
  }

  // Idempotency: skip already processed/skipped events; allow retry for prior errors.
  let row = await getWebhookRowByEventId(event.id);
  if (row && (row.status === "processed" || row.status === "skipped")) {
    return NextResponse.json({ ok: true });
  }
  if (!row) {
    try {
      row = await insertWebhookRow(event);
    } catch (err) {
      // If we can't write the audit row, this is transient (DB issues) → 500 so Stripe retries.
      return NextResponse.json({ ok: false, error: "audit_insert_failed" }, { status: 500 });
    }
  }

  const rowId = row.id;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") {
          await setWebhookStatus(rowId, "skipped", "unsupported checkout session mode");
          return NextResponse.json({ ok: true });
        }

        const userId = typeof session.client_reference_id === "string" ? session.client_reference_id.trim() : "";
        if (!userId || !isUuid(userId)) {
          await setWebhookStatus(rowId, "skipped", "missing client_reference_id");
          return NextResponse.json({ ok: true });
        }

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : typeof (session.subscription as any)?.id === "string"
              ? String((session.subscription as any).id)
              : "";
        if (!subscriptionId) {
          await setWebhookStatus(rowId, "skipped", "missing subscription on checkout session");
          return NextResponse.json({ ok: true });
        }

        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : typeof (session.customer as any)?.id === "string"
              ? String((session.customer as any).id)
              : null;

        const subscription =
          typeof session.subscription === "object" && session.subscription
            ? (session.subscription as any as Stripe.Subscription)
            : await retrieveSubscriptionExpanded(stripe, subscriptionId);

        const lastInvoiceId =
          typeof subscription.latest_invoice === "string"
            ? subscription.latest_invoice
            : typeof (subscription.latest_invoice as any)?.id === "string"
              ? String((subscription.latest_invoice as any).id)
              : null;

        const paymentIntentId =
          typeof (subscription.latest_invoice as any)?.payment_intent === "string"
            ? String((subscription.latest_invoice as any).payment_intent)
            : typeof (subscription.latest_invoice as any)?.payment_intent?.id === "string"
              ? String((subscription.latest_invoice as any).payment_intent.id)
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
        };

        if (subscription.status === "active") {
          update.plan = "weekend_pro";
        }

        // Best-effort store email if present; do not rely on it for identity.
        const email =
          (session.customer_details?.email || session.customer_email || "").trim() || null;
        if (email) update.email = email;

        await updateTiUser(userId, update);
        await setWebhookStatus(rowId, "processed", null);
        return NextResponse.json({ ok: true });
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : null;

        const userRow = await lookupTiUserBySubscriptionOrCustomer({ subscriptionId, customerId });
        if (!userRow?.id) {
          await setWebhookStatus(rowId, "skipped", "no ti_user for subscription/customer");
          return NextResponse.json({ ok: true });
        }

        const lastInvoiceId =
          typeof subscription.latest_invoice === "string"
            ? subscription.latest_invoice
            : typeof (subscription.latest_invoice as any)?.id === "string"
              ? String((subscription.latest_invoice as any).id)
              : null;

        let paymentIntentId =
          typeof (subscription.latest_invoice as any)?.payment_intent === "string"
            ? String((subscription.latest_invoice as any).payment_intent)
            : typeof (subscription.latest_invoice as any)?.payment_intent?.id === "string"
              ? String((subscription.latest_invoice as any).payment_intent.id)
              : null;

        if (!paymentIntentId && lastInvoiceId) {
          try {
            const invoice = await retrieveInvoiceExpanded(stripe, lastInvoiceId);
            paymentIntentId =
              typeof invoice.payment_intent === "string"
                ? invoice.payment_intent
                : typeof (invoice.payment_intent as any)?.id === "string"
                  ? String((invoice.payment_intent as any).id)
                  : null;
          } catch {
            // ignore invoice expansion failures; still store invoice id
          }
        }

        const update: Record<string, unknown> = {
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
          subscription_status: subscription.status,
          current_period_start: isoFromEpochSeconds(subscription.current_period_start),
          current_period_end: isoFromEpochSeconds(subscription.current_period_end),
          cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
          last_invoice_id: lastInvoiceId,
          last_payment_intent_id: paymentIntentId,
        };

        if (subscription.status === "active") {
          update.plan = "weekend_pro";
        }

        await updateTiUser(userRow.id, update);
        await setWebhookStatus(rowId, "processed", null);
        return NextResponse.json({ ok: true });
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : null;

        const userRow = await lookupTiUserBySubscriptionOrCustomer({ subscriptionId, customerId });
        if (!userRow?.id) {
          await setWebhookStatus(rowId, "skipped", "no ti_user for subscription/customer");
          return NextResponse.json({ ok: true });
        }

        const update: Record<string, unknown> = {
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
          subscription_status: "canceled",
          cancel_at_period_end: false,
          current_period_start: isoFromEpochSeconds(subscription.current_period_start),
          current_period_end: isoFromEpochSeconds(subscription.current_period_end),
        };

        if (!isFuture(userRow.trial_ends_at)) {
          update.plan = "insider";
        }

        await updateTiUser(userRow.id, update);
        await setWebhookStatus(rowId, "processed", null);
        return NextResponse.json({ ok: true });
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : null;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : null;

        const userRow = await lookupTiUserBySubscriptionOrCustomer({ subscriptionId, customerId });
        if (!userRow?.id) {
          await setWebhookStatus(rowId, "skipped", "no ti_user for invoice subscription/customer");
          return NextResponse.json({ ok: true });
        }

        const currentStatus = (userRow.subscription_status ?? "").trim().toLowerCase();
        const nextStatus = currentStatus === "canceled" ? currentStatus : "past_due";

        const paymentIntentId =
          typeof invoice.payment_intent === "string"
            ? invoice.payment_intent
            : typeof (invoice.payment_intent as any)?.id === "string"
              ? String((invoice.payment_intent as any).id)
              : null;

        await updateTiUser(userRow.id, {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_status: nextStatus,
          last_invoice_id: invoice.id,
          last_payment_intent_id: paymentIntentId,
        });

        await setWebhookStatus(rowId, "processed", null);
        return NextResponse.json({ ok: true });
      }

      default: {
        await setWebhookStatus(rowId, "skipped", "unsupported event type");
        return NextResponse.json({ ok: true });
      }
    }
  } catch (err) {
    await setWebhookStatus(rowId, "error", safeErrMessage(err));
    return NextResponse.json({ ok: false, error: "processing_failed" }, { status: 500 });
  }
}
