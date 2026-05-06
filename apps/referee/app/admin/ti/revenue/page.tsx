import Link from "next/link";

import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const INTERNAL_EMAIL_SUBSTRINGS = ["tournamentinsights", "rdtest1970"] as const;

type PageProps = {
  searchParams?: {
    advertiser?: string;
  };
};

type AffiliateMetricRow = {
  day: string | null;
  network: string | null;
  advertiser_id: string | null;
  advertiser_name: string | null;
  status: string | null;
  currency: string | null;
  tx_count: number | null;
  gross_sales: number | null;
  commission: number | null;
};

type StripeDailyRow = {
  day: string | null;
  livemode: boolean | null;
  currency: string | null;
  invoice_count: number | null;
  gross: number | null;
  tax: number | null;
  fees: number | null;
  refunds: number | null;
  net: number | null;
};

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function buildHref(basePath: string, params: Record<string, string | null | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val === null || val === undefined || val === "") continue;
    qs.set(key, val);
  }
  const suffix = qs.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}

function sumAffiliate(rows: AffiliateMetricRow[], args: { network: "awin" | "cj"; status: "cleared" | "pending" }) {
  let txCount = 0;
  let gross = 0;
  let commission = 0;
  for (const r of rows) {
    if ((r.network ?? "") !== args.network) continue;
    if ((r.status ?? "") !== args.status) continue;
    txCount += Number(r.tx_count ?? 0) || 0;
    gross += Number(r.gross_sales ?? 0) || 0;
    commission += Number(r.commission ?? 0) || 0;
  }
  return { txCount, gross, commission };
}

function sumStripeDaily(rows: StripeDailyRow[]) {
  let invoiceCount = 0;
  let gross = 0;
  let tax = 0;
  let fees = 0;
  let refunds = 0;
  let net = 0;
  for (const r of rows) {
    invoiceCount += Number(r.invoice_count ?? 0) || 0;
    gross += Number(r.gross ?? 0) || 0;
    tax += Number(r.tax ?? 0) || 0;
    fees += Number(r.fees ?? 0) || 0;
    refunds += Number(r.refunds ?? 0) || 0;
    net += Number(r.net ?? 0) || 0;
  }
  return { invoiceCount, gross, tax, fees, refunds, net };
}

export default async function TiRevenuePage({ searchParams }: PageProps) {
  await requireAdmin();

  const advertiserFilter = (searchParams?.advertiser ?? "").trim();

  const now = new Date();
  const todayStartUtc = startOfUtcDay(now);
  const yesterdayStartUtc = new Date(todayStartUtc.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayIso = yesterdayStartUtc.toISOString().slice(0, 10); // YYYY-MM-DD

  const internalUsersRes = await supabaseAdmin
    .from("ti_users" as any)
    .select("id,email")
    .or(INTERNAL_EMAIL_SUBSTRINGS.map((s) => `email.ilike.%${s}%`).join(","));
  const internalUserIds = (internalUsersRes.error ? [] : (internalUsersRes.data ?? [])).map((r: any) => r.id).filter(Boolean);

  const notInternalUsers = (query: any) => {
    let q = query;
    for (const s of INTERNAL_EMAIL_SUBSTRINGS) q = q.not("email", "ilike", `%${s}%`);
    return q;
  };

  const notInternalWebhookUsers = (query: any) => {
    if (!internalUserIds.length) return query;
    return query.not("user_id", "in", `(${internalUserIds.join(",")})`);
  };

  const [
    weekendProActiveRes,
    weekendProPastDueRes,
    weekendProCheckoutsYesterdayRes,
    stripeYesterdayRes,
    stripeTotalRes,
    affiliateYesterdayRes,
    affiliateTotalRes,
    hotelsClicksTotalRes,
    hotelsClicksYesterdayRes,
    vrboClicksTotalRes,
    vrboClicksYesterdayRes,
    organizerClicksTotalRes,
    organizerClicksYesterdayRes,
  ] = await Promise.all([
      notInternalUsers(
        supabaseAdmin
          .from("ti_users" as any)
          .select("id", { count: "exact", head: true })
          .eq("plan", "weekend_pro")
          .eq("subscription_status", "active")
      ),
      notInternalUsers(
        supabaseAdmin
          .from("ti_users" as any)
          .select("id", { count: "exact", head: true })
          .eq("plan", "weekend_pro")
          .eq("subscription_status", "past_due")
      ),
      notInternalWebhookUsers(
        supabaseAdmin
          .from("stripe_webhook_events" as any)
          .select("id", { count: "exact", head: true })
          .eq("event_type", "checkout.session.completed")
          .eq("status", "processed")
          .gte("created_at", yesterdayStartUtc.toISOString())
          .lt("created_at", todayStartUtc.toISOString())
      ),
      supabaseAdmin
        .from("stripe_daily_metrics" as any)
        .select("day,livemode,currency,invoice_count,gross,tax,fees,refunds,net")
        .eq("day", yesterdayIso)
        .eq("currency", "USD"),
      supabaseAdmin
        .from("stripe_daily_metrics" as any)
        .select("day,livemode,currency,invoice_count,gross,tax,fees,refunds,net")
        .eq("currency", "USD"),
      (() => {
        let q = supabaseAdmin
          .from("ti_affiliate_daily_metrics" as any)
          .select("day,network,advertiser_id,advertiser_name,status,currency,tx_count,gross_sales,commission")
          .eq("day", yesterdayIso);
        if (advertiserFilter) q = q.eq("advertiser_id", advertiserFilter);
        return q;
      })(),
      (() => {
        let q = supabaseAdmin
          .from("ti_affiliate_daily_metrics" as any)
          .select("day,network,advertiser_id,advertiser_name,status,currency,tx_count,gross_sales,commission");
        if (advertiserFilter) q = q.eq("advertiser_id", advertiserFilter);
        return q;
      })(),
      supabaseAdmin
        .from("ti_outbound_clicks" as any)
        .select("id", { count: "exact", head: true })
        .eq("destination_type", "hotels"),
      supabaseAdmin
        .from("ti_outbound_clicks" as any)
        .select("id", { count: "exact", head: true })
        .eq("destination_type", "hotels")
        .gte("created_at", yesterdayStartUtc.toISOString())
        .lt("created_at", todayStartUtc.toISOString()),
      supabaseAdmin
        .from("ti_outbound_clicks" as any)
        .select("id", { count: "exact", head: true })
        .eq("destination_type", "vrbo"),
      supabaseAdmin
        .from("ti_outbound_clicks" as any)
        .select("id", { count: "exact", head: true })
        .eq("destination_type", "vrbo")
        .gte("created_at", yesterdayStartUtc.toISOString())
        .lt("created_at", todayStartUtc.toISOString()),
      supabaseAdmin
        .from("ti_outbound_clicks" as any)
        .select("id", { count: "exact", head: true })
        .eq("destination_type", "tournament_official"),
      supabaseAdmin
        .from("ti_outbound_clicks" as any)
        .select("id", { count: "exact", head: true })
        .eq("destination_type", "tournament_official")
        .gte("created_at", yesterdayStartUtc.toISOString())
        .lt("created_at", todayStartUtc.toISOString()),
    ]);

  const weekendProActive = weekendProActiveRes.error ? 0 : weekendProActiveRes.count ?? 0;
  const weekendProPastDue = weekendProPastDueRes.error ? 0 : weekendProPastDueRes.count ?? 0;
  const weekendProCheckoutsYesterday = weekendProCheckoutsYesterdayRes.error ? 0 : weekendProCheckoutsYesterdayRes.count ?? 0;

  const hotelsClicksTotal = hotelsClicksTotalRes.error ? 0 : hotelsClicksTotalRes.count ?? 0;
  const hotelsClicksYesterday = hotelsClicksYesterdayRes.error ? 0 : hotelsClicksYesterdayRes.count ?? 0;
  const vrboClicksTotal = vrboClicksTotalRes.error ? 0 : vrboClicksTotalRes.count ?? 0;
  const vrboClicksYesterday = vrboClicksYesterdayRes.error ? 0 : vrboClicksYesterdayRes.count ?? 0;
  const organizerClicksTotal = organizerClicksTotalRes.error ? 0 : organizerClicksTotalRes.count ?? 0;
  const organizerClicksYesterday = organizerClicksYesterdayRes.error ? 0 : organizerClicksYesterdayRes.count ?? 0;

  const stripeYesterdayRows: StripeDailyRow[] = stripeYesterdayRes.error ? [] : ((stripeYesterdayRes.data ?? []) as StripeDailyRow[]);
  const stripeTotalRows: StripeDailyRow[] = stripeTotalRes.error ? [] : ((stripeTotalRes.data ?? []) as StripeDailyRow[]);

  const stripeYesterdayLive = stripeYesterdayRows.filter((r) => r.livemode === true);
  const stripeYesterdayTest = stripeYesterdayRows.filter((r) => r.livemode === false);
  const stripeYesterday = (stripeYesterdayLive.length ? stripeYesterdayLive : stripeYesterdayTest) as StripeDailyRow[];

  const stripeTotalLive = stripeTotalRows.filter((r) => r.livemode === true);
  const stripeTotalTest = stripeTotalRows.filter((r) => r.livemode === false);
  const stripeTotal = (stripeTotalLive.length ? stripeTotalLive : stripeTotalTest) as StripeDailyRow[];

  const stripeYesterdaySum = sumStripeDaily(stripeYesterday);
  const stripeTotalSum = sumStripeDaily(stripeTotal);

  const affiliateYesterdayRows: AffiliateMetricRow[] = affiliateYesterdayRes.error
    ? []
    : ((affiliateYesterdayRes.data ?? []) as AffiliateMetricRow[]);
  const affiliateTotalRows: AffiliateMetricRow[] = affiliateTotalRes.error
    ? []
    : ((affiliateTotalRes.data ?? []) as AffiliateMetricRow[]);

  const awinYesterdayCleared = sumAffiliate(affiliateYesterdayRows, { network: "awin", status: "cleared" });
  const awinYesterdayPending = sumAffiliate(affiliateYesterdayRows, { network: "awin", status: "pending" });
  const cjYesterdayCleared = sumAffiliate(affiliateYesterdayRows, { network: "cj", status: "cleared" });
  const cjYesterdayPending = sumAffiliate(affiliateYesterdayRows, { network: "cj", status: "pending" });

  const awinTotalCleared = sumAffiliate(affiliateTotalRows, { network: "awin", status: "cleared" });
  const awinTotalPending = sumAffiliate(affiliateTotalRows, { network: "awin", status: "pending" });
  const cjTotalCleared = sumAffiliate(affiliateTotalRows, { network: "cj", status: "cleared" });
  const cjTotalPending = sumAffiliate(affiliateTotalRows, { network: "cj", status: "pending" });

  const distinctAdvertisers = Array.from(
    new Map<string, string>(
      affiliateTotalRows
        .map((r): [string, string] => [String(r.advertiser_id ?? "").trim(), String(r.advertiser_name ?? "").trim()])
        .filter(([id]) => id)
    ).entries()
  ).map(([id, name]) => ({ id, name }));

  distinctAdvertisers.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

  const tileStyle: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 14,
    background: "#fff",
  };

  const tileLabelStyle: React.CSSProperties = { fontSize: 12, textTransform: "uppercase", fontWeight: 800, color: "#6b7280" };
  const tileValueStyle: React.CSSProperties = { fontSize: 30, fontWeight: 950, lineHeight: 1.1, marginTop: 4 };
  const tileMetaStyle: React.CSSProperties = { marginTop: 6, fontSize: 12, color: "#6b7280", fontWeight: 800 };

  const title = "TI Revenue";
  const stripeSchemaHint =
    "No Stripe revenue rows found yet. Ensure the Supabase migration `20260504_stripe_daily_metrics.sql` is applied, and that `invoice.payment_succeeded` / `charge.refunded` webhooks are reaching TI.";
  const affiliateSchemaHint =
    "No affiliate metrics found yet. Run the RI cron `/api/cron/ti-affiliate-sync` and ensure the Supabase migration `20260503_ti_affiliate_daily_metrics.sql` is applied.";

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 10 }}>{title}</h1>
      <div style={{ marginBottom: 12 }}>
        <AdminNav />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <Link href="/admin" className="cta secondary" style={{ padding: "8px 12px" }}>
          ← Back to Admin
        </Link>
        <Link href="/admin/ti/outbound" className="cta secondary" style={{ padding: "8px 12px" }}>
          TI Outbound →
        </Link>
        <Link href="/admin/ti/static-maps" className="cta secondary" style={{ padding: "8px 12px" }}>
          TI Static maps →
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Advertiser
        </div>
        <Link
          href="/admin/ti/revenue"
          style={{
            padding: "6px 10px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: advertiserFilter ? "#f3f4f6" : "#111827",
            color: advertiserFilter ? "#111827" : "#fff",
            fontWeight: 900,
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          All
        </Link>
        {distinctAdvertisers.slice(0, 12).map((a) => {
          const selected = a.id === advertiserFilter;
          return (
            <Link
              key={`adv-${a.id}`}
              href={buildHref("/admin/ti/revenue", { advertiser: a.id })}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: selected ? "#111827" : "#f3f4f6",
                color: selected ? "#fff" : "#111827",
                fontWeight: 900,
                textDecoration: "none",
                fontSize: 13,
              }}
              title={a.id}
            >
              {a.name || a.id}
            </Link>
          );
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div style={tileStyle}>
          <div style={tileLabelStyle}>Weekend Pro active</div>
          <div style={tileValueStyle}>{weekendProActive}</div>
          {weekendProActiveRes.error ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
              Failed to load active users: {weekendProActiveRes.error.message}
            </div>
          ) : null}
        </div>

        <div style={tileStyle}>
          <div style={tileLabelStyle}>Weekend Pro past due</div>
          <div style={tileValueStyle}>{weekendProPastDue}</div>
          {weekendProPastDueRes.error ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
              Failed to load past due users: {weekendProPastDueRes.error.message}
            </div>
          ) : null}
        </div>

        <div style={tileStyle}>
          <div style={tileLabelStyle}>Weekend Pro checkouts</div>
          <div style={tileValueStyle}>{weekendProCheckoutsYesterday}</div>
          <div style={tileMetaStyle}>Yesterday (UTC)</div>
          {weekendProCheckoutsYesterdayRes.error ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
              Failed to load checkout counts: {weekendProCheckoutsYesterdayRes.error.message}
            </div>
          ) : null}
        </div>

        <div style={tileStyle}>
          <div style={tileLabelStyle}>Stripe gross</div>
          <div style={tileValueStyle}>{money(stripeYesterdaySum.gross)}</div>
          <div style={tileMetaStyle}>Yesterday (UTC) • invoices {stripeYesterdaySum.invoiceCount}</div>
          {stripeYesterdayRes.error ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
              Failed to load Stripe metrics: {stripeYesterdayRes.error.message}
            </div>
          ) : stripeYesterdayRows.length === 0 ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>{stripeSchemaHint}</div>
          ) : null}
        </div>

        <div style={tileStyle}>
          <div style={tileLabelStyle}>Stripe net</div>
          <div style={tileValueStyle}>{money(stripeYesterdaySum.net)}</div>
          <div style={tileMetaStyle}>
            Yesterday (UTC) • tax {money(stripeYesterdaySum.tax)} • fees {money(stripeYesterdaySum.fees)} • refunds {money(stripeYesterdaySum.refunds)}
          </div>
          {stripeYesterdayRes.error ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
              Failed to load Stripe metrics: {stripeYesterdayRes.error.message}
            </div>
          ) : stripeYesterdayRows.length === 0 ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>{stripeSchemaHint}</div>
          ) : null}
        </div>

        <div style={tileStyle}>
          <div style={tileLabelStyle}>Awin gross</div>
          <div style={tileValueStyle}>{money(awinYesterdayCleared.gross)}</div>
          <div style={tileMetaStyle}>
            Cleared yesterday • comm {money(awinYesterdayCleared.commission)} • {awinYesterdayCleared.txCount} tx
          </div>
          {affiliateYesterdayRes.error ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
              Failed to load affiliate metrics: {affiliateYesterdayRes.error.message}
            </div>
          ) : affiliateYesterdayRows.length === 0 ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>{affiliateSchemaHint}</div>
          ) : null}
        </div>

        <div style={tileStyle}>
          <div style={tileLabelStyle}>CJ gross</div>
          <div style={tileValueStyle}>{money(cjYesterdayCleared.gross)}</div>
          <div style={tileMetaStyle}>
            Cleared yesterday • comm {money(cjYesterdayCleared.commission)} • {cjYesterdayCleared.txCount} tx
          </div>
          {affiliateYesterdayRes.error ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
              Failed to load affiliate metrics: {affiliateYesterdayRes.error.message}
            </div>
          ) : affiliateYesterdayRows.length === 0 ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>{affiliateSchemaHint}</div>
          ) : null}
        </div>

        <div style={tileStyle}>
          <div style={tileLabelStyle}>Awin pending</div>
          <div style={tileValueStyle}>{money(awinTotalPending.gross)}</div>
          <div style={tileMetaStyle}>
            All-time pending • comm {money(awinTotalPending.commission)} • {awinTotalPending.txCount} tx
          </div>
        </div>

        <div style={tileStyle}>
          <div style={tileLabelStyle}>CJ pending</div>
          <div style={tileValueStyle}>{money(cjTotalPending.gross)}</div>
          <div style={tileMetaStyle}>
            All-time pending • comm {money(cjTotalPending.commission)} • {cjTotalPending.txCount} tx
          </div>
        </div>
      </div>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          background: "#fff",
          padding: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", fontWeight: 900, color: "#6b7280" }}>
            Outbound clicks (TI)
          </div>
          <Link href="/admin/ti/outbound" className="cta secondary" style={{ padding: "8px 12px" }}>
            View details →
          </Link>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <div style={tileStyle}>
            <div style={tileLabelStyle}>Hotels clicks (yesterday)</div>
            <div style={tileValueStyle}>{hotelsClicksYesterday.toLocaleString("en-US")}</div>
            <div style={tileMetaStyle}>Total: {hotelsClicksTotal.toLocaleString("en-US")}</div>
          </div>
          <div style={tileStyle}>
            <div style={tileLabelStyle}>Vrbo clicks (yesterday)</div>
            <div style={tileValueStyle}>{vrboClicksYesterday.toLocaleString("en-US")}</div>
            <div style={tileMetaStyle}>Total: {vrboClicksTotal.toLocaleString("en-US")}</div>
          </div>
          <div style={tileStyle}>
            <div style={tileLabelStyle}>Organizer clicks (yesterday)</div>
            <div style={tileValueStyle}>{organizerClicksYesterday.toLocaleString("en-US")}</div>
            <div style={tileMetaStyle}>Total: {organizerClicksTotal.toLocaleString("en-US")}</div>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
          These are clicks to `/go/*` destinations (not direct revenue). Use them as leading indicators for bookings and Weekend Pro interest.
        </div>
      </div>

      <details open style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, marginBottom: 12 }}>
        <summary style={{ cursor: "pointer", fontWeight: 950, fontSize: 14 }}>Stripe revenue (USD)</summary>
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 900 }}>
            Yesterday (UTC){stripeYesterdayLive.length ? " • live" : stripeYesterdayTest.length ? " • test" : ""}
          </div>
          <div style={{ fontSize: 13, color: "#374151" }}>
            Gross: {money(stripeYesterdaySum.gross)} • Tax: {money(stripeYesterdaySum.tax)} • Fees: {money(stripeYesterdaySum.fees)} • Refunds:{" "}
            {money(stripeYesterdaySum.refunds)} • Net: {money(stripeYesterdaySum.net)} • Invoices: {stripeYesterdaySum.invoiceCount}
          </div>

          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 900 }}>
            Total (all-time in table){stripeTotalLive.length ? " • live" : stripeTotalTest.length ? " • test" : ""}
          </div>
          <div style={{ fontSize: 13, color: "#374151" }}>
            Gross: {money(stripeTotalSum.gross)} • Tax: {money(stripeTotalSum.tax)} • Fees: {money(stripeTotalSum.fees)} • Refunds:{" "}
            {money(stripeTotalSum.refunds)} • Net: {money(stripeTotalSum.net)} • Invoices: {stripeTotalSum.invoiceCount}
          </div>

          {stripeYesterdayRes.error ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
              Failed to load Stripe daily rows: {stripeYesterdayRes.error.message}
            </div>
          ) : stripeTotalRes.error ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
              Failed to load Stripe total rows: {stripeTotalRes.error.message}
            </div>
          ) : stripeTotalRows.length === 0 ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>{stripeSchemaHint}</div>
          ) : null}

          <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
            Net = invoice total − Stripe fees − refunds. Taxes are tracked separately.
          </div>
        </div>
      </details>

      <details open style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, marginBottom: 12 }}>
        <summary style={{ cursor: "pointer", fontWeight: 950, fontSize: 14 }}>Totals (all-time in table)</summary>
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 900 }}>Awin</div>
          <div style={{ fontSize: 13, color: "#374151" }}>
            Cleared: {money(awinTotalCleared.gross)} gross • {money(awinTotalCleared.commission)} commission • {awinTotalCleared.txCount} tx
          </div>
          <div style={{ fontSize: 13, color: "#374151" }}>
            Pending: {money(awinTotalPending.gross)} gross • {money(awinTotalPending.commission)} commission • {awinTotalPending.txCount} tx
          </div>

          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 900 }}>CJ</div>
          <div style={{ fontSize: 13, color: "#374151" }}>
            Cleared: {money(cjTotalCleared.gross)} gross • {money(cjTotalCleared.commission)} commission • {cjTotalCleared.txCount} tx
          </div>
          <div style={{ fontSize: 13, color: "#374151" }}>
            Pending: {money(cjTotalPending.gross)} gross • {money(cjTotalPending.commission)} commission • {cjTotalPending.txCount} tx
          </div>

          {affiliateTotalRes.error ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
              Failed to load affiliate totals: {affiliateTotalRes.error.message}
            </div>
          ) : null}
        </div>
      </details>

      <details style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
        <summary style={{ cursor: "pointer", fontWeight: 950, fontSize: 14 }}>Status mapping</summary>
        <div style={{ marginTop: 10, fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
          <div>
            <b>Stripe</b>: active/past_due comes from <code>ti_users.subscription_status</code>.
          </div>
          <div style={{ marginTop: 6 }}>
            <b>Stripe revenue</b>: computed from paid invoices + related charges (fees from balance transactions; refunds from charge refunds).
          </div>
          <div style={{ marginTop: 6 }}>
            <b>Awin</b>: uses API status buckets directly (cleared = approved).
          </div>
          <div style={{ marginTop: 6 }}>
            <b>CJ</b>: this v1 rollup treats <code>action-status=cleared</code> as approved and <code>locked</code> as pending.
          </div>
        </div>
      </details>
    </div>
  );
}
