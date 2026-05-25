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

async function lookupTiUserByEmail(emailRaw: string) {
  const email = (emailRaw || "").trim().toLowerCase();
  if (!email) return null;
  const { data } = await (supabaseAdmin.from("ti_users" as any) as any)
    .select("id,trial_ends_at,current_period_end,subscription_status,plan")
    .eq("email", email)
    .maybeSingle();
  const row =
    (data as
      | { id?: string; trial_ends_at?: string | null; current_period_end?: string | null; subscription_status?: string | null; plan?: string | null }
      | null) ?? null;
  return row?.id ? (row as { id: string; trial_ends_at: string | null; current_period_end: string | null; subscription_status: string | null; plan: string | null }) : null;
}

async function lookupTiUserById(userId: string) {
  const id = (userId || "").trim();
  if (!id) return null;
  const { data } = await (supabaseAdmin.from("ti_users" as any) as any)
    .select("id,trial_ends_at,current_period_end,subscription_status,plan")
    .eq("id", id)
    .maybeSingle();
  const row =
    (data as
      | { id?: string; trial_ends_at?: string | null; current_period_end?: string | null; subscription_status?: string | null; plan?: string | null }
      | null) ?? null;
  return row?.id ? (row as { id: string; trial_ends_at: string | null; current_period_end: string | null; subscription_status: string | null; plan: string | null }) : null;
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

async function recordEntitlementGrant(row: {
  user_id: string;
  offer: string;
  access_days: number;
  expires_at: string;
  source: string | null;
  livemode: boolean;
  amount_cents: number | null;
  currency: string | null;
  stripe_event_id: string | null;
  stripe_customer_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  metadata?: any;
}) {
  try {
    await (supabaseAdmin.from("ti_entitlement_grants" as any) as any).upsert(
      {
        user_id: row.user_id,
        offer: row.offer,
        access_days: row.access_days,
        expires_at: row.expires_at,
        source: row.source,
        livemode: row.livemode,
        amount_cents: row.amount_cents,
        currency: row.currency,
        stripe_event_id: row.stripe_event_id,
        stripe_customer_id: row.stripe_customer_id,
        stripe_checkout_session_id: row.stripe_checkout_session_id,
        stripe_payment_intent_id: row.stripe_payment_intent_id,
        metadata: row.metadata ?? {},
      },
      { onConflict: "stripe_event_id" } as any
    );
  } catch {
    // Best-effort; never block webhook fulfillment on ledger writes.
  }
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

function centsToDollars(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value / 100;
}

function dayFromIso(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)).toISOString().slice(0, 10);
}

async function recomputeStripeDailyMetrics(params: { dayIso: string; livemode: boolean; currency: string }) {
  const start = new Date(`${params.dayIso}T00:00:00Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const { data, error } = await (supabaseAdmin.from("stripe_invoice_metrics" as any) as any)
    .select("invoice_id,invoice_total,invoice_tax,stripe_fee,refunded_amount,net,currency,livemode,paid_at")
    .eq("livemode", params.livemode)
    .eq("currency", params.currency)
    .gte("paid_at", start.toISOString())
    .lt("paid_at", end.toISOString());

  if (error) throw error;
  const rows = (data ?? []) as any[];

  let invoiceCount = 0;
  let gross = 0;
  let tax = 0;
  let fees = 0;
  let refunds = 0;
  let net = 0;
  for (const r of rows) {
    invoiceCount += 1;
    gross += Number(r.invoice_total ?? 0) || 0;
    tax += Number(r.invoice_tax ?? 0) || 0;
    fees += Number(r.stripe_fee ?? 0) || 0;
    refunds += Number(r.refunded_amount ?? 0) || 0;
    net += Number(r.net ?? 0) || 0;
  }

  const { error: upsertErr } = await (supabaseAdmin.from("stripe_daily_metrics" as any) as any).upsert(
    {
      day: params.dayIso,
      livemode: params.livemode,
      currency: params.currency,
      invoice_count: invoiceCount,
      gross,
      tax,
      fees,
      refunds,
      net,
    },
    { onConflict: "day,livemode,currency" } as any
  );
  if (upsertErr) throw upsertErr;
}

async function upsertStripeInvoiceMetrics(row: {
  livemode: boolean;
  invoice_id: string;
  customer_id: string | null;
  subscription_id: string | null;
  charge_id: string | null;
  balance_transaction_id: string | null;
  user_id: string | null;
  currency: string;
  paid_at: string | null;
  invoice_total: number;
  invoice_tax: number;
  stripe_fee: number;
  refunded_amount: number;
  net: number;
  payload?: any;
}) {
  const payload = {
    livemode: row.livemode,
    invoice_id: row.invoice_id,
    customer_id: row.customer_id,
    subscription_id: row.subscription_id,
    charge_id: row.charge_id,
    balance_transaction_id: row.balance_transaction_id,
    user_id: row.user_id,
    currency: row.currency,
    paid_at: row.paid_at,
    invoice_total: row.invoice_total,
    invoice_tax: row.invoice_tax,
    stripe_fee: row.stripe_fee,
    refunded_amount: row.refunded_amount,
    net: row.net,
    payload: row.payload ?? null,
  };

  const { error } = await (supabaseAdmin.from("stripe_invoice_metrics" as any) as any).upsert(payload as any, {
    onConflict: "invoice_id",
  } as any);
  if (error) throw error;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeEmailFromSession(session: Stripe.Checkout.Session) {
  return (asString(session.customer_details?.email) || asString((session as any).customer_email) || "").trim().toLowerCase() || null;
}

function parseIso(value: string | null | undefined) {
  if (!value) return null;
  const ts = new Date(value);
  return Number.isNaN(ts.getTime()) ? null : ts;
}

function addDaysUtc(base: Date, days: number) {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
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
        const offer = asString((session.metadata as any)?.offer);
        const productId = asString((session.metadata as any)?.product_id);
        const isWeekendPass = offer === "weekend_pass_30d" || productId === "prod_UaAMEgCjjfq52v";

        // Weekend pass fulfillment must run before the subscription-only mode gate.
        if (isWeekendPass) {
          if (session.mode !== "payment") {
            await setWebhookStatus(rowId, "skipped", "weekend_pass: unsupported session mode");
            return NextResponse.json({ ok: true });
          }
          if (typeof session.payment_status === "string" && session.payment_status !== "paid") {
            await setWebhookStatus(rowId, "skipped", "weekend_pass: unpaid session");
            return NextResponse.json({ ok: true });
          }

          const userIdRaw = typeof session.client_reference_id === "string" ? session.client_reference_id.trim() : "";
          let resolved = userIdRaw && isUuid(userIdRaw) ? await lookupTiUserById(userIdRaw) : null;
          if (!resolved?.id) {
            const email =
              safeEmailFromSession(session) ||
              asString((session.metadata as any)?.purchaser_email).toLowerCase() ||
              null;
            if (email) resolved = await lookupTiUserByEmail(email);
          }

          if (!resolved?.id) {
            await setWebhookStatus(rowId, "skipped", "weekend_pass: no user resolved");
            console.error("[stripe][weekend_pass] unfulfilled: no user resolved", {
              event_id: event.id,
              customer_id: typeof session.customer === "string" ? session.customer : null,
              session_id: session.id,
              email: safeEmailFromSession(session) || asString((session.metadata as any)?.purchaser_email) || null,
            });
            return NextResponse.json({ ok: true });
          }

          const now = new Date();
          const existingTrial = parseIso(resolved.trial_ends_at);
          const existingPeriodEnd = parseIso(resolved.current_period_end);
          const base = new Date(Math.max(now.getTime(), existingTrial?.getTime() ?? 0, existingPeriodEnd?.getTime() ?? 0));
          const newEnd = addDaysUtc(base, 30);

          const customerId =
            typeof session.customer === "string"
              ? session.customer
              : typeof (session.customer as any)?.id === "string"
                ? String((session.customer as any).id)
                : null;
          const paymentIntentId = typeof (session as any).payment_intent === "string" ? String((session as any).payment_intent) : null;

          await updateTiUser(resolved.id, {
            stripe_customer_id: customerId,
            // Do not set stripe_subscription_id for weekend pass.
            subscription_status: "trialing",
            plan: "weekend_pro",
            trial_ends_at: newEnd.toISOString(),
            current_period_end: newEnd.toISOString(),
            cancel_at_period_end: false,
            last_payment_intent_id: paymentIntentId,
          });

          await recordEntitlementGrant({
            user_id: resolved.id,
            offer: "weekend_pass_30d",
            access_days: 30,
            expires_at: newEnd.toISOString(),
            source: (session.metadata as any)?.source ? String((session.metadata as any).source) : null,
            livemode: Boolean((event as any).livemode),
            amount_cents: typeof (session as any).amount_total === "number" ? (session as any).amount_total : null,
            currency: typeof (session as any).currency === "string" ? String((session as any).currency) : null,
            stripe_event_id: event.id,
            stripe_customer_id: customerId,
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: paymentIntentId,
            metadata: { offer, product_id: productId },
          });

          await setWebhookStatus(rowId, "processed", null);
          return NextResponse.json({ ok: true });
        }

        // Existing subscription-mode gate for non-pass sessions.
        if (session.mode !== "subscription") {
          await setWebhookStatus(rowId, "skipped", "unsupported checkout session mode");
          return NextResponse.json({ ok: true });
        }

        const userIdFromRef = typeof session.client_reference_id === "string" ? session.client_reference_id.trim() : "";
        let resolvedUserId: string | null = userIdFromRef && isUuid(userIdFromRef) ? userIdFromRef : null;
        if (!resolvedUserId) {
          const email = safeEmailFromSession(session);
          const byEmail = email ? await lookupTiUserByEmail(email) : null;
          resolvedUserId = byEmail?.id ?? null;
          if (!resolvedUserId) {
            await setWebhookStatus(rowId, "skipped", "subscription: missing client_reference_id and no matching user for email");
            return NextResponse.json({ ok: true });
          }
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

        await updateTiUser(resolvedUserId, update);
        await setWebhookStatus(rowId, "processed", null);
        return NextResponse.json({ ok: true });
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const livemode = Boolean((event as any).livemode);
        const invoiceId = invoice.id;
        const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : null;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
        const chargeId = typeof invoice.charge === "string" ? invoice.charge : null;
        const currency = String(invoice.currency || "usd").toUpperCase();

        const userRow = await lookupTiUserBySubscriptionOrCustomer({ subscriptionId, customerId });
        const userId = userRow?.id ?? null;

        const paidAtIso =
          typeof (invoice.status_transitions as any)?.paid_at === "number"
            ? isoFromEpochSeconds((invoice.status_transitions as any).paid_at)
            : invoice.status === "paid"
              ? new Date().toISOString()
              : null;

        const invoiceTotal = centsToDollars(invoice.total ?? 0);
        const invoiceTax = centsToDollars(invoice.tax ?? 0);

        let stripeFee = 0;
        let balanceTxId: string | null = null;
        let refundedAmount = 0;

        if (chargeId) {
          const charge = await stripe.charges.retrieve(chargeId, { expand: ["balance_transaction"] });
          refundedAmount = centsToDollars((charge as any).amount_refunded ?? 0);
          const bt: any = (charge as any).balance_transaction ?? null;
          balanceTxId = typeof bt === "string" ? bt : typeof bt?.id === "string" ? bt.id : null;
          stripeFee = centsToDollars(typeof bt?.fee === "number" ? bt.fee : 0);
        }

        const net = invoiceTotal - stripeFee - refundedAmount;

        await upsertStripeInvoiceMetrics({
          livemode,
          invoice_id: invoiceId,
          customer_id: customerId,
          subscription_id: subscriptionId,
          charge_id: chargeId,
          balance_transaction_id: balanceTxId,
          user_id: userId,
          currency,
          paid_at: paidAtIso,
          invoice_total: invoiceTotal,
          invoice_tax: invoiceTax,
          stripe_fee: stripeFee,
          refunded_amount: refundedAmount,
          net,
          payload: { invoice_id: invoiceId, charge_id: chargeId },
        });

        const dayIso = dayFromIso(paidAtIso);
        if (dayIso) {
          await recomputeStripeDailyMetrics({ dayIso, livemode, currency });
        }

        await setWebhookStatus(rowId, "processed", null);
        return NextResponse.json({ ok: true });
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const livemode = Boolean((event as any).livemode);
        const chargeId = charge.id;
        const refundedAmount = centsToDollars((charge as any).amount_refunded ?? 0);

        // Lookup invoice row by charge_id.
        const { data: existing } = await (supabaseAdmin.from("stripe_invoice_metrics" as any) as any)
          .select("invoice_id,paid_at,currency,livemode,invoice_total,stripe_fee")
          .eq("charge_id", chargeId)
          .maybeSingle();

        if (!existing?.invoice_id) {
          await setWebhookStatus(rowId, "skipped", "no invoice_metrics for refunded charge");
          return NextResponse.json({ ok: true });
        }

        const invoiceId = String(existing.invoice_id);
        const currency = String(existing.currency || "USD").toUpperCase();
        const invoiceTotal = Number(existing.invoice_total ?? 0) || 0;
        const stripeFee = Number(existing.stripe_fee ?? 0) || 0;
        const paidAtIso = typeof existing.paid_at === "string" ? existing.paid_at : null;

        const net = invoiceTotal - stripeFee - refundedAmount;

        await (supabaseAdmin.from("stripe_invoice_metrics" as any) as any)
          .update({ refunded_amount: refundedAmount, net })
          .eq("invoice_id", invoiceId);

        const dayIso = dayFromIso(paidAtIso);
        if (dayIso) {
          await recomputeStripeDailyMetrics({ dayIso, livemode, currency });
        }

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

        // Always retrieve the subscription so period timestamps are reliably present
        // (some webhook deliveries omit fields we need, which can overwrite good values with null).
        const fresh = await retrieveSubscriptionExpanded(stripe, subscriptionId);

        const lastInvoiceId =
          typeof fresh.latest_invoice === "string"
            ? fresh.latest_invoice
            : typeof (fresh.latest_invoice as any)?.id === "string"
              ? String((fresh.latest_invoice as any).id)
              : null;

        let paymentIntentId =
          typeof (fresh.latest_invoice as any)?.payment_intent === "string"
            ? String((fresh.latest_invoice as any).payment_intent)
            : typeof (fresh.latest_invoice as any)?.payment_intent?.id === "string"
              ? String((fresh.latest_invoice as any).payment_intent.id)
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

        const currentPeriodStart = isoFromEpochSeconds(fresh.current_period_start);
        const currentPeriodEnd = isoFromEpochSeconds(fresh.current_period_end);

        const update: Record<string, unknown> = {
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
          subscription_status: fresh.status,
          cancel_at_period_end: Boolean(fresh.cancel_at_period_end),
          last_invoice_id: lastInvoiceId,
          last_payment_intent_id: paymentIntentId,
        };

        if (currentPeriodStart) update.current_period_start = currentPeriodStart;
        if (currentPeriodEnd) update.current_period_end = currentPeriodEnd;

        if (fresh.status === "active") {
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
