import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireTiOutreachAdmin } from "@/lib/outreachAdmin";
import { TI_SPORT_LABELS, TI_SPORTS, type TiSport } from "@/lib/tiSports";
import AutoSubmitSelect from "@/components/filters/AutoSubmitSelect";
import AutoSubmitInput from "@/components/filters/AutoSubmitInput";

type SearchParams = {
  campaign_id?: string;
  sport?: string;
  start_after?: string;
  start_before?: string;
};

type DashboardJson = {
  filters?: {
    sport?: string | null;
    campaign_id?: string | null;
    start_after?: string;
    start_before?: string;
    followup_days?: number;
  };
  totals?: {
    total_previews?: number;
    sent_count?: number;
    not_sent_count?: number;
    replied_count?: number;
    reply_rate?: number | null;
    directors_contacted_count?: number;
    total_send_attempts?: number;
    needs_followup_count?: number;
  };
  by_campaign?: Array<{
    campaign_id: string;
    sent: number;
    replied: number;
    reply_rate: number | null;
  }>;
  by_domain?: Array<{
    domain: string;
    sent: number;
    replied: number;
    reply_rate: number | null;
  }>;
  by_day?: Array<{
    day: string;
    previews_created: number;
    sent: number;
    replied: number;
    reply_rate: number | null;
  }>;
};

export const revalidate = 3600;

export default async function OutreachDashboardPage({ searchParams }: { searchParams?: SearchParams }) {
  const returnParams = new URLSearchParams();
  if (searchParams?.campaign_id) returnParams.set("campaign_id", searchParams.campaign_id);
  if (searchParams?.sport) returnParams.set("sport", searchParams.sport);
  if (searchParams?.start_after) returnParams.set("start_after", searchParams.start_after);
  if (searchParams?.start_before) returnParams.set("start_before", searchParams.start_before);
  const returnTo = `/admin/outreach-dashboard${returnParams.toString() ? `?${returnParams.toString()}` : ""}`;

  await requireTiOutreachAdmin(returnTo);

  const campaignId = (searchParams?.campaign_id || "").trim();
  const sport = normalizeSportFilterParam(searchParams?.sport) || "soccer";
  const sportFilter = sport === "all" ? null : sport;
  const startAfter = normalizeDateParam(searchParams?.start_after);
  const startBefore = normalizeDateParam(searchParams?.start_before);
  const followupDays = 7;

  const { data, error } = await (supabaseAdmin.rpc("get_outreach_dashboard_metrics" as any, {
    p_sport: sportFilter || null,
    p_campaign_id: campaignId || null,
    p_start_after: startAfter ? `${startAfter}T00:00:00Z` : null,
    p_start_before: startBefore ? `${startBefore}T00:00:00Z` : null,
    p_followup_days: followupDays,
  }) as any);

  if (error) {
    return (
      <main className="ti-shell" style={{ paddingBottom: 40 }}>
        <section className="bodyCard" style={{ display: "grid", gap: 10 }}>
          <h1 style={{ margin: 0 }}>Outreach Dashboard</h1>
          <p className="muted" style={{ margin: 0 }}>
            Metrics are temporarily unavailable: {error.message || String(error)}
          </p>
          <p className="muted" style={{ margin: 0 }}>
            If this is a new deploy, make sure the Supabase migration for `get_outreach_dashboard_metrics(...)` has been
            applied.
          </p>
          <Link href="/admin/outreach-previews" style={smallLinkStyle}>
            Back to Outreach Previews
          </Link>
        </section>
      </main>
    );
  }

  const payload = (data ?? {}) as DashboardJson;
  const totals = payload.totals ?? {};
  const byCampaign = Array.isArray(payload.by_campaign) ? payload.by_campaign : [];
  const byDomain = Array.isArray(payload.by_domain) ? payload.by_domain : [];
  const byDay = Array.isArray(payload.by_day) ? payload.by_day : [];
  const campaignOptions = Array.from(new Set(byCampaign.map((row) => row.campaign_id).filter(Boolean)));

  return (
    <main className="ti-shell" style={{ paddingBottom: 40 }}>
      <div style={{ display: "grid", gap: 16 }}>
        <section className="bodyCard" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <h1 style={{ margin: 0 }}>Outreach Dashboard</h1>
            <p className="muted" style={{ margin: 0 }}>
              Deterministic outreach analytics from `email_outreach_previews` (includes manual replies).
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <Link href="/admin/outreach-previews" style={smallLinkStyle}>
                Back to Outreach Previews
              </Link>
            </div>
          </div>

          <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Sport</span>
              <AutoSubmitSelect name="sport" defaultValue={sport} style={inputStyle}>
                <option value="all">All sports</option>
                {TI_SPORTS.map((value) => (
                  <option key={value} value={value}>
                    {TI_SPORT_LABELS[value]}
                  </option>
                ))}
              </AutoSubmitSelect>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Campaign</span>
              <AutoSubmitSelect name="campaign_id" defaultValue={campaignId} style={inputStyle}>
                <option value="">All campaigns</option>
                {campaignOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </AutoSubmitSelect>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Created after</span>
              <AutoSubmitInput type="date" name="start_after" defaultValue={startAfter} style={{ ...inputStyle, minWidth: 180 }} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Created before</span>
              <AutoSubmitInput type="date" name="start_before" defaultValue={startBefore} style={{ ...inputStyle, minWidth: 180 }} />
            </label>
          </form>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 12,
          }}
        >
          <MetricCard label="Total previews" value={formatInt(totals.total_previews)} />
          <MetricCard label="Sent" value={formatInt(totals.sent_count)} />
          <MetricCard label="Not sent" value={formatInt(totals.not_sent_count)} />
          <MetricCard label="Replied" value={formatInt(totals.replied_count)} />
          <MetricCard label="Reply rate" value={formatPercent(totals.reply_rate)} />
          <MetricCard label="Directors contacted" value={formatInt(totals.directors_contacted_count)} />
          <MetricCard label="Send attempts" value={formatInt(totals.total_send_attempts)} />
          <MetricCard label={`Needs follow-up (>${followupDays}d)`} value={formatInt(totals.needs_followup_count)} />
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: 16,
            alignItems: "start",
          }}
        >
          <TableCard
            title="By campaign"
            columns={["Campaign", "Sent", "Replied", "Reply rate"]}
            rows={byCampaign.map((row) => [row.campaign_id, formatInt(row.sent), formatInt(row.replied), formatPercent(row.reply_rate)])}
            emptyLabel="No campaigns found for these filters."
          />
          <TableCard
            title="By director domain (top 20)"
            columns={["Domain", "Sent", "Replied", "Reply rate"]}
            rows={byDomain.map((row) => [row.domain, formatInt(row.sent), formatInt(row.replied), formatPercent(row.reply_rate)])}
            emptyLabel="No domains found for these filters."
          />
          <TableCard
            title="By day (last 30)"
            columns={["Day", "Created", "Sent", "Replied", "Reply rate"]}
            rows={byDay.map((row) => [row.day, formatInt(row.previews_created), formatInt(row.sent), formatInt(row.replied), formatPercent(row.reply_rate)])}
            emptyLabel="No daily activity found for these filters."
          />
        </section>
      </div>
    </main>
  );
}

type OutreachSport = TiSport;

function normalizeSportFilterParam(value?: string) {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "all") return "all";
  if (TI_SPORTS.includes(normalized as OutreachSport)) return normalized;
  return "";
}

function normalizeDateParam(value?: string) {
  const normalized = (value || "").trim();
  if (!normalized) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const slashMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, mm, dd, yyyy] = slashMatch;
    const month = String(mm).padStart(2, "0");
    const day = String(dd).padStart(2, "0");
    return `${yyyy}-${month}-${day}`;
  }
  return "";
}

function formatInt(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

function formatPercent(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(2)}%`;
}

const inputStyle: CSSProperties = {
  minWidth: 240,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "10px 12px",
  font: "inherit",
};

const smallLinkStyle: CSSProperties = {
  color: "#1d4ed8",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 13,
};

function MetricCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      className="bodyCard"
      style={{
        display: "grid",
        gap: 6,
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#64748b",
          fontWeight: 800,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{value}</div>
    </div>
  );
}

function TableCard({
  title,
  columns,
  rows,
  emptyLabel,
}: {
  title: string;
  columns: string[];
  rows: Array<Array<ReactNode>>;
  emptyLabel: string;
}) {
  return (
    <div className="bodyCard" style={{ padding: 14, display: "grid", gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>{title}</h2>
      {rows.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {emptyLabel}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
            <thead>
              <tr>
                {columns.map((heading) => (
                  <th key={heading} style={thStyle}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  {row.map((cell, j) => (
                    <td key={j} style={tdStyle}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#64748b",
  fontWeight: 800,
  padding: "10px 10px",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid #eef2f7",
  fontSize: 13,
  verticalAlign: "top",
};
