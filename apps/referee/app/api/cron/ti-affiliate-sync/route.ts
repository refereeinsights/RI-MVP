import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAuthorized(req: Request) {
  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("token");
  const tokenFromHeader = req.headers.get("x-cron-secret");
  const token = (tokenFromQuery ?? tokenFromHeader ?? "").trim();
  return Boolean(process.env.CRON_SECRET && token && token === process.env.CRON_SECRET);
}

function requireEnv(name: string) {
  const value = (process.env[name] || "").trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function toIsoNoMs(d: Date) {
  // Awin APIs accept ISO-8601 without milliseconds; keep it conservative.
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function asMoney(value: unknown) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function fetchJson(input: string, init: RequestInit = {}, timeoutMs = 55_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(input, { ...init, signal: controller.signal, cache: "no-store" });
    const text = await resp.text();
    const json = (() => {
      try {
        return text ? JSON.parse(text) : null;
      } catch {
        return null;
      }
    })();
    return { resp, text, json };
  } finally {
    clearTimeout(timeout);
  }
}

type DailyMetricUpsert = {
  day: string; // YYYY-MM-DD
  network: "awin" | "cj";
  advertiser_id: string;
  advertiser_name?: string | null;
  status: "cleared" | "pending" | "declined" | "unknown";
  currency?: string;
  tx_count: number;
  gross_sales: number;
  commission: number;
};

async function upsertMetrics(rows: DailyMetricUpsert[]) {
  if (!rows.length) return;
  const payload = rows.map((r) => ({
    day: r.day,
    network: r.network,
    advertiser_id: r.advertiser_id,
    advertiser_name: r.advertiser_name ?? null,
    status: r.status,
    currency: (r.currency || "USD").toUpperCase(),
    tx_count: r.tx_count,
    gross_sales: r.gross_sales,
    commission: r.commission,
  }));

  const { error } = await supabaseAdmin
    .from("ti_affiliate_daily_metrics" as any)
    .upsert(payload as any, { onConflict: "day,network,advertiser_id,status,currency" } as any);
  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
}

async function syncAwin(params: { day: Date; dayIso: string }) {
  const token = requireEnv("AIWIN_ACCESS_TOKEN");
  const publisherId = (process.env.TI_AWIN_PUBLISHER_ID || "2854179").trim();

  // 1) Programs (advertisers) we are joined to.
  const programmesUrl = new URL(`https://api.awin.com/publishers/${encodeURIComponent(publisherId)}/programmes`);
  programmesUrl.searchParams.set("relationship", "joined");

  const programmes = await fetchJson(programmesUrl.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const advertisers = Array.isArray(programmes.json) ? (programmes.json as any[]) : [];
  const advertiserNameById = new Map<string, string>();
  for (const a of advertisers) {
    const id = String(a?.id ?? a?.advertiserId ?? "").trim();
    if (!id) continue;
    const name = String(a?.name ?? a?.advertiserName ?? "").trim();
    if (name) advertiserNameById.set(id, name);
  }

  // 2) Transactions for the day, grouped by advertiser + status.
  const dayStart = startOfUtcDay(params.day);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1000);
  const startDate = toIsoNoMs(dayStart);
  const endDate = toIsoNoMs(dayEnd);

  async function fetchTransactions(status: "approved" | "pending" | "declined") {
    const txUrl = new URL(`https://api.awin.com/publishers/${encodeURIComponent(publisherId)}/transactions/`);
    txUrl.searchParams.set("startDate", startDate);
    txUrl.searchParams.set("endDate", endDate);
    txUrl.searchParams.set("timezone", "UTC");
    txUrl.searchParams.set("status", status);
    // Note: Awin supports paging; for v1 we fetch the first page which is sufficient for Booking.com scale.

    const tx = await fetchJson(txUrl.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!tx.resp.ok) {
      const msg = tx.json?.message || tx.text || `awin_transactions_${tx.resp.status}`;
      throw new Error(`Awin transactions failed (${status}): ${String(msg).slice(0, 200)}`);
    }

    return Array.isArray(tx.json) ? (tx.json as any[]) : [];
  }

  const [approved, pending, declined] = await Promise.all([
    fetchTransactions("approved"),
    fetchTransactions("pending"),
    fetchTransactions("declined").catch(() => []),
  ]);

  const dayKey = params.dayIso;
  const buckets: Record<string, DailyMetricUpsert> = {};
  const add = (status: DailyMetricUpsert["status"], row: any) => {
    const advertiserId = String(row?.advertiserId ?? row?.advertiser_id ?? row?.advertiser ?? "").trim() || "unknown";
    const currency = String(row?.saleAmount?.currency ?? row?.currency ?? "USD").trim() || "USD";
    const gross = asMoney(row?.saleAmount?.amount ?? row?.saleAmount ?? row?.sale_amount);
    const commission = asMoney(row?.commissionAmount?.amount ?? row?.commissionAmount ?? row?.commission_amount);

    const k = `${advertiserId}:${status}:${currency}`;
    if (!buckets[k]) {
      buckets[k] = {
        day: dayKey,
        network: "awin",
        advertiser_id: advertiserId,
        advertiser_name: advertiserNameById.get(advertiserId) ?? null,
        status,
        currency,
        tx_count: 0,
        gross_sales: 0,
        commission: 0,
      };
    }
    buckets[k]!.tx_count += 1;
    buckets[k]!.gross_sales += gross;
    buckets[k]!.commission += commission;
  };

  for (const row of approved) add("cleared", row);
  for (const row of pending) add("pending", row);
  for (const row of declined) add("declined", row);

  await upsertMetrics(Object.values(buckets));
}

async function syncCj(params: { dayIso: string }) {
  const token = requireEnv("CJ_ACCESS_TOKEN");
  const publisherCid = (process.env.TI_CJ_PUBLISHER_CID || "7934896").trim();

  // CJ commission detail v3 API commonly uses these query params. We treat "cleared" as approved.
  // Endpoint docs: commission-detail.api.cj.com
  const base = new URL("https://commission-detail.api.cj.com/v3/commissions");
  base.searchParams.set("publisher-cid", publisherCid);
  base.searchParams.set("date-type", "event");
  base.searchParams.set("start-date", params.dayIso);
  base.searchParams.set("end-date", params.dayIso);
  base.searchParams.set("records-per-page", "1000");

  async function fetchStatus(actionStatus: string) {
    const url = new URL(base.toString());
    url.searchParams.set("action-status", actionStatus);
    const res = await fetchJson(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!res.resp.ok) {
      const msg = res.json?.message || res.text || `cj_commissions_${res.resp.status}`;
      throw new Error(`CJ commissions failed (${actionStatus}): ${String(msg).slice(0, 200)}`);
    }
    // The v3 API returns a wrapper object; tolerate arrays too.
    const rows = Array.isArray(res.json)
      ? (res.json as any[])
      : Array.isArray(res.json?.commissions)
        ? (res.json.commissions as any[])
        : Array.isArray(res.json?.data)
          ? (res.json.data as any[])
          : [];
    return rows;
  }

  const [clearedRows, lockedRows] = await Promise.all([
    fetchStatus("cleared"),
    fetchStatus("locked").catch(() => []),
  ]);

  const buckets: Record<string, DailyMetricUpsert> = {};
  const add = (status: DailyMetricUpsert["status"], row: any) => {
    const advertiserId =
      String(row?.advertiserId ?? row?.advertiser_id ?? row?.cid ?? row?.advertiserCid ?? "").trim() || "unknown";
    const advertiserName = String(row?.advertiserName ?? row?.advertiser_name ?? row?.advertiser ?? "").trim() || null;
    const currency = String(row?.currency ?? "USD").trim() || "USD";
    const gross = asMoney(row?.saleAmount ?? row?.sale_amount ?? row?.saleAmountUsd ?? row?.sale_amount_usd);
    const commission = asMoney(row?.commissionAmount ?? row?.commission_amount ?? row?.commissionAmountUsd ?? row?.commission_amount_usd);

    const k = `${advertiserId}:${status}:${currency}`;
    if (!buckets[k]) {
      buckets[k] = {
        day: params.dayIso,
        network: "cj",
        advertiser_id: advertiserId,
        advertiser_name: advertiserName,
        status,
        currency,
        tx_count: 0,
        gross_sales: 0,
        commission: 0,
      };
    }
    buckets[k]!.tx_count += 1;
    buckets[k]!.gross_sales += gross;
    buckets[k]!.commission += commission;
  };

  for (const row of clearedRows) add("cleared", row);
  for (const row of lockedRows) add("pending", row);

  await upsertMetrics(Object.values(buckets));
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayStartUtc = startOfUtcDay(now);
  const yesterdayStartUtc = new Date(todayStartUtc.getTime() - 24 * 60 * 60 * 1000);
  const dayIso = yesterdayStartUtc.toISOString().slice(0, 10); // YYYY-MM-DD

  const startedAt = Date.now();

  try {
    await Promise.all([
      syncAwin({ day: yesterdayStartUtc, dayIso }),
      syncCj({ dayIso }),
    ]);

    return NextResponse.json({
      ok: true,
      day: dayIso,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("[ti-affiliate-sync] failed", err);
    return NextResponse.json(
      { ok: false, day: dayIso, error: err instanceof Error ? err.message : "sync_failed" },
      { status: 502 }
    );
  }
}

