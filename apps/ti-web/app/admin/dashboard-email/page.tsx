import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTiOutreachAdmin } from "@/lib/outreachAdmin";
import { sendEmailVerified } from "@/lib/email";
import {
  getEffectiveRecipients,
  loadLowestStates,
  loadRiSummaryCounts,
  loadTiAdminDashboardEmailSettings,
  parseRecipients,
  resolveTiBaseUrl,
  upsertTiAdminDashboardEmailSettings,
} from "@/lib/adminDashboardEmail";
import { TI_SPORT_LABELS, TI_SPORTS } from "@/lib/tiSports";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TotalsRow = {
  sport: string;
  ok: boolean;
  error: string | null;
  totals: any;
};

async function loadOutreachTotals(sport: string): Promise<TotalsRow> {
  const { data, error } = await (supabaseAdmin.rpc("get_outreach_dashboard_metrics" as any, {
    p_sport: sport || null,
    p_campaign_id: null,
    p_start_after: null,
    p_start_before: null,
    p_followup_days: 7,
  }) as any);

  if (error) return { sport, ok: false, error: error.message || String(error), totals: null };
  return { sport, ok: true, error: null, totals: (data ?? {})?.totals ?? {} };
}

function boolFromForm(form: FormData, name: string) {
  return form.get(name) === "on";
}

async function saveSettingsAction(formData: FormData) {
  "use server";
  await requireTiOutreachAdmin("/admin/dashboard-email");

  const recipientsRaw = String(formData.get("recipients") ?? "");
  const recipients = parseRecipients(recipientsRaw);
  await upsertTiAdminDashboardEmailSettings({
    recipients,
    include_outreach: boolFromForm(formData, "include_outreach"),
    include_ri_summary: boolFromForm(formData, "include_ri_summary"),
    include_lowest_states: boolFromForm(formData, "include_lowest_states"),
  });

  redirect("/admin/dashboard-email?notice=saved");
}

async function sendNowAction(formData: FormData) {
  "use server";
  await requireTiOutreachAdmin("/admin/dashboard-email");

  const recipientsRaw = String(formData.get("send_to") ?? "");
  const to = parseRecipients(recipientsRaw);
  if (to.length === 0) {
    redirect("/admin/dashboard-email?notice=missing_recipients");
  }

  const baseUrl = resolveTiBaseUrl();
  const settings = await loadTiAdminDashboardEmailSettings();

  const includeOutreach = settings?.include_outreach ?? true;
  const includeRiSummary = settings?.include_ri_summary ?? true;
  const includeLowestStates = settings?.include_lowest_states ?? true;

  const [totalsBySport, riSummary, lowestStates] = await Promise.all([
    includeOutreach ? Promise.all(TI_SPORTS.map((sport) => loadOutreachTotals(sport))) : Promise.resolve([]),
    includeRiSummary ? loadRiSummaryCounts() : Promise.resolve(null),
    includeLowestStates ? loadLowestStates(5) : Promise.resolve(null),
  ]);

  const generatedAtIso = new Date().toISOString();
  const subject = `TI Admin Dashboard — ${generatedAtIso.slice(0, 10)}`;
  const html = buildPreviewHtml({ generatedAtIso, baseUrl, totalsBySport, riSummary, lowestStates });

  await sendEmailVerified({
    kind: "transactional",
    to,
    subject,
    html,
    allowLocalhostLinks: true,
  });

  redirect(`/admin/dashboard-email?notice=sent&sent_to=${encodeURIComponent(to.join(","))}`);
}

function formatInt(value: unknown) {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function formatPercent(value: unknown) {
  const n = typeof value === "number" ? value : Number(value ?? NaN);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n * 1000) / 10}%`;
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPreviewHtml(params: {
  generatedAtIso: string;
  baseUrl: string;
  totalsBySport: TotalsRow[];
  riSummary: Awaited<ReturnType<typeof loadRiSummaryCounts>> | null;
  lowestStates: Awaited<ReturnType<typeof loadLowestStates>> | null;
}) {
  const { generatedAtIso, baseUrl, totalsBySport, riSummary, lowestStates } = params;
  const dashboardUrl = `${baseUrl}/admin/outreach-dashboard`;

  const totalsRows = totalsBySport
    .map((row) => {
      if (!row.ok) {
        return `<tr>
          <td style="padding:8px 10px;border-top:1px solid #e5e7eb;"><strong>${htmlEscape(
            TI_SPORT_LABELS[row.sport as any] ?? row.sport
          )}</strong></td>
          <td style="padding:8px 10px;border-top:1px solid #e5e7eb;" colspan="6"><span style="color:#b91c1c;">Error: ${htmlEscape(
            row.error ?? "unknown"
          )}</span></td>
        </tr>`;
      }
      const totals = row.totals ?? {};
      return `<tr>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;"><strong>${htmlEscape(
          TI_SPORT_LABELS[row.sport as any] ?? row.sport
        )}</strong></td>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;">${formatInt(totals.total_previews)}</td>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;">${formatInt(totals.sent_count)}</td>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;">${formatInt(totals.replied_count)}</td>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;">${formatPercent(totals.reply_rate)}</td>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;">${formatInt(
          totals.directors_contacted_count
        )}</td>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;">${formatInt(totals.needs_followup_count)}</td>
      </tr>`;
    })
    .join("\n");

  const riSummaryHtml = riSummary
    ? `<div style="margin-top:18px;padding-top:16px;border-top:1px solid #e5e7eb;">
        <h2 style="margin:0 0 8px 0;font-size:15px;">RI Data Health (published canonical)</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
          ${[
            ["Published", formatInt(riSummary.published_canonical)],
            ["Draft", formatInt(riSummary.draft)],
            ["Missing venues", formatInt(riSummary.missing_venues)],
            ["Missing URLs", formatInt(riSummary.missing_urls)],
            ["Missing dates", formatInt(riSummary.missing_dates)],
            ["Missing director email", formatInt(riSummary.missing_director_email)],
          ]
            .map(
              ([label, value]) =>
                `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:10px;background:#f8fafc;">
                  <div style="font-size:11px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;">${htmlEscape(
                    label
                  )}</div>
                  <div style="font-size:18px;font-weight:900;color:#0f172a;margin-top:2px;">${htmlEscape(value)}</div>
                </div>`
            )
            .join("")}
        </div>
      </div>`
    : "";

  const lowestStatesHtml =
    Array.isArray(lowestStates) && lowestStates.length > 0
      ? `<div style="margin-top:14px;">
          <h3 style="margin:0 0 8px 0;font-size:13px;color:#0f172a;">Lowest 5 states (published canonical)</h3>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="text-align:left;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">State</th>
                <th style="text-align:right;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Tournaments</th>
              </tr>
            </thead>
            <tbody>
              ${lowestStates
                .map(
                  (row) => `<tr>
                    <td style="padding:8px 10px;border-top:1px solid #e5e7eb;">${htmlEscape(row.state)}</td>
                    <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;">${htmlEscape(formatInt(row.count))}</td>
                  </tr>`
                )
                .join("\n")}
            </tbody>
          </table>
        </div>`
      : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
    <div style="max-width:780px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:18px 18px 14px;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline;">
          <h1 style="margin:0;font-size:18px;line-height:1.2;">TI Admin Dashboard (Daily)</h1>
          <div style="color:#64748b;font-size:12px;">Generated: ${htmlEscape(generatedAtIso)}</div>
        </div>
        <p style="margin:10px 0 14px;color:#334155;font-size:13px;line-height:1.45;">
          Outreach summary by sport (previews, sends, replies, follow-up queue).
        </p>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="text-align:left;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Sport</th>
                <th style="text-align:right;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Previews</th>
                <th style="text-align:right;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Sent</th>
                <th style="text-align:right;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Replied</th>
                <th style="text-align:right;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Reply rate</th>
                <th style="text-align:right;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Directors</th>
                <th style="text-align:right;padding:8px 10px;border:1px solid #e5e7eb;border-left:none;border-right:none;">Needs follow-up</th>
              </tr>
            </thead>
            <tbody>${totalsRows}</tbody>
          </table>
        </div>
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
          <a href="${htmlEscape(dashboardUrl)}"
             style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;padding:10px 12px;border-radius:10px;font-weight:600;font-size:13px;">
            Open Outreach Dashboard
          </a>
          <a href="${htmlEscape(baseUrl + "/admin/outreach-previews")}"
             style="display:inline-block;background:#f1f5f9;color:#0f172a;text-decoration:none;padding:10px 12px;border-radius:10px;font-weight:600;font-size:13px;border:1px solid #e5e7eb;">
            Open Outreach Previews
          </a>
        </div>
        ${riSummaryHtml}
        ${lowestStatesHtml}
      </div>
    </div>
  </body>
</html>`;
}

export default async function AdminDashboardEmailPage({ searchParams }: { searchParams?: { notice?: string; sent_to?: string } }) {
  await requireTiOutreachAdmin("/admin/dashboard-email");

  const settings = await loadTiAdminDashboardEmailSettings();
  const recipients = getEffectiveRecipients(settings);
  const baseUrl = resolveTiBaseUrl();

  const includeOutreach = settings?.include_outreach ?? true;
  const includeRiSummary = settings?.include_ri_summary ?? true;
  const includeLowestStates = settings?.include_lowest_states ?? true;

  const [totalsBySport, riSummary, lowestStates] = await Promise.all([
    includeOutreach ? Promise.all(TI_SPORTS.map((sport) => loadOutreachTotals(sport))) : Promise.resolve([]),
    includeRiSummary ? loadRiSummaryCounts() : Promise.resolve(null),
    includeLowestStates ? loadLowestStates(5) : Promise.resolve(null),
  ]);

  const generatedAtIso = new Date().toISOString();
  const previewHtml = buildPreviewHtml({ generatedAtIso, baseUrl, totalsBySport, riSummary, lowestStates });

  return (
    <main className="ti-shell" style={{ paddingBottom: 40 }}>
      <section className="bodyCard" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
          <h1 style={{ margin: 0 }}>Admin Dashboard Email</h1>
          <div style={{ fontSize: 12, color: "#64748b" }}>Preview generated: {generatedAtIso}</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/admin/outreach-dashboard" style={{ fontSize: 13 }}>
            Open Outreach Dashboard
          </Link>
          <Link href="/admin/outreach-previews" style={{ fontSize: 13 }}>
            Open Outreach Previews
          </Link>
        </div>

        {searchParams?.notice ? (
          <div style={{ border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: 10, padding: "10px 12px" }}>
            <strong>Notice:</strong> {searchParams.notice}
            {searchParams.sent_to ? <div style={{ marginTop: 6, fontSize: 12 }}>Sent to: {searchParams.sent_to}</div> : null}
          </div>
        ) : null}

        <form action={saveSettingsAction} style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Settings</h2>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Recipients</span>
            <textarea
              name="recipients"
              defaultValue={recipients.join(", ")}
              rows={3}
              style={{ width: "100%", padding: 10, border: "1px solid #cbd5e1", borderRadius: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              placeholder="you@domain.com, other@domain.com"
            />
            <span style={{ fontSize: 12, color: "#64748b" }}>
              Saved to Supabase table `ti_admin_dashboard_email_settings` (key: `default`). Falls back to env `TI_ADMIN_DASHBOARD_EMAILS` if empty.
            </span>
          </label>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="include_outreach" defaultChecked={includeOutreach} />
              <span>Include outreach totals</span>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="include_ri_summary" defaultChecked={includeRiSummary} />
              <span>Include RI data health summary</span>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="include_lowest_states" defaultChecked={includeLowestStates} />
              <span>Include lowest states table</span>
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" className="cta secondary">
              Save settings
            </button>
          </div>
        </form>

        <form action={sendNowAction} style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: "4px 0 0 0", fontSize: 16 }}>Send Now</h2>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Send to (override)</span>
            <input
              name="send_to"
              defaultValue={recipients.join(", ")}
              style={{ width: "100%", padding: 10, border: "1px solid #cbd5e1", borderRadius: 10 }}
              placeholder="you@domain.com, other@domain.com"
            />
            <span style={{ fontSize: 12, color: "#64748b" }}>Uses current settings sections. Sends via Resend (transactional).</span>
          </label>
          <button type="submit" className="cta">
            Send email now
          </button>
        </form>

        <h2 style={{ margin: "4px 0 0 0", fontSize: 16 }}>Today’s Email Preview</h2>
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
          <iframe title="preview" style={{ width: "100%", height: 760, border: 0 }} srcDoc={previewHtml} />
        </div>
      </section>
    </main>
  );
}

