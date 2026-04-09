import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTiOutreachAdmin } from "@/lib/outreachAdmin";
import { sendEmailVerified } from "@/lib/email";
import {
  loadAdminDashboardEmailTiles,
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

type PublicDirectoryBySportRow = {
  sport: unknown;
  total?: unknown;
  new_yesterday?: unknown;
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
    include_tiles: boolFromForm(formData, "include_tiles"),
    include_sport_tiles: boolFromForm(formData, "include_sport_tiles"),
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

  const includeTiles = settings?.include_tiles ?? true;
  const includeSportTiles = settings?.include_sport_tiles ?? true;
  const includeOutreach = settings?.include_outreach ?? true;
  const includeRiSummary = settings?.include_ri_summary ?? true;
  const includeLowestStates = settings?.include_lowest_states ?? true;

  const [tiles, totalsBySport, riSummary, lowestStates] = await Promise.all([
    includeTiles ? loadAdminDashboardEmailTiles() : Promise.resolve(null),
    includeOutreach ? Promise.all(TI_SPORTS.map((sport) => loadOutreachTotals(sport))) : Promise.resolve([]),
    includeRiSummary ? loadRiSummaryCounts() : Promise.resolve(null),
    includeLowestStates ? loadLowestStates(5) : Promise.resolve(null),
  ]);

  const generatedAtIso = new Date().toISOString();
  const subject = `TI Admin Dashboard — ${generatedAtIso.slice(0, 10)}`;
  const html = buildPreviewHtml({
    generatedAtIso,
    baseUrl,
    tiles,
    includeTiles,
    includeSportTiles,
    totalsBySport,
    riSummary,
    lowestStates,
  });

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
  // `get_outreach_dashboard_metrics` returns a percent (0-100). Some older callers may treat it as a ratio (0-1).
  // Normalize to a percent number before formatting.
  const pct = n <= 1 ? n * 100 : n;
  return `${Math.round(pct * 10) / 10}%`;
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDelta(value: unknown) {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(n) || n === 0) return "";
  return n > 0 ? `+${formatInt(n)}` : `-${formatInt(Math.abs(n))}`;
}

function renderTile(label: string, value: string, delta?: string, tone?: "neutral" | "info" | "warn" | "success") {
  const bg =
    tone === "warn" ? "#fef3c7" : tone === "success" ? "#ecfdf3" : tone === "info" ? "#eff6ff" : "#f8fafc";
  const border =
    tone === "warn" ? "#fde68a" : tone === "success" ? "#bbf7d0" : tone === "info" ? "#bfdbfe" : "#e2e8f0";
  const color =
    tone === "warn" ? "#92400e" : tone === "success" ? "#166534" : tone === "info" ? "#1d4ed8" : "#0f172a";

  const deltaHtml = delta
    ? `<div style="margin-top:4px;font-size:12px;color:#64748b;font-weight:800;">${htmlEscape(delta)} yesterday</div>`
    : `<div style="margin-top:4px;font-size:12px;color:#94a3b8;font-weight:700;">&nbsp;</div>`;

  return `<div style="border:1px solid ${border};background:${bg};border-radius:12px;padding:10px 12px;">
    <div style="font-size:11px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;">${htmlEscape(label)}</div>
    <div style="font-size:22px;font-weight:900;color:${color};margin-top:2px;line-height:1.1;">${htmlEscape(value)}</div>
    ${deltaHtml}
  </div>`;
}

function renderUsersTile(params: { insiderTotal: number; insiderNew: number; weekendTotal: number; weekendNew: number }) {
  const bg = "#ecfdf3";
  const border = "#bbf7d0";
  const color = "#166534";

  const insiderLine = `Insider: ${formatInt(params.insiderTotal)} ${formatDelta(params.insiderNew) ? `(${formatDelta(params.insiderNew)} yesterday)` : ""}`.trim();
  const weekendLine = `Weekend Pro: ${formatInt(params.weekendTotal)} ${formatDelta(params.weekendNew) ? `(${formatDelta(params.weekendNew)} yesterday)` : ""}`.trim();

  return `<div style="border:1px solid ${border};background:${bg};border-radius:12px;padding:10px 12px;">
    <div style="font-size:11px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;">TI users</div>
    <div style="font-size:14px;font-weight:900;color:${color};margin-top:6px;line-height:1.2;">${htmlEscape(insiderLine)}</div>
    <div style="font-size:14px;font-weight:900;color:${color};margin-top:6px;line-height:1.2;">${htmlEscape(weekendLine)}</div>
  </div>`;
}

function buildPreviewHtml(params: {
  generatedAtIso: string;
  baseUrl: string;
  tiles: Awaited<ReturnType<typeof loadAdminDashboardEmailTiles>> | null;
  includeTiles: boolean;
  includeSportTiles: boolean;
  totalsBySport: TotalsRow[];
  riSummary: Awaited<ReturnType<typeof loadRiSummaryCounts>> | null;
  lowestStates: Awaited<ReturnType<typeof loadLowestStates>> | null;
}) {
  const { generatedAtIso, baseUrl, tiles, includeTiles, includeSportTiles, totalsBySport, riSummary, lowestStates } = params;
  const dashboardUrl = `${baseUrl}/admin/outreach-dashboard`;

  const dbTotal = Number((tiles as any)?.tournaments_db?.total ?? 0) || 0;
  const publishedTotal = Number((tiles as any)?.public_directory?.total ?? tiles?.canonical?.total ?? 0) || 0;
  const publishedNew = Number((tiles as any)?.public_directory?.new_yesterday ?? tiles?.canonical?.new_yesterday ?? 0) || 0;
  const missingVenuesTotal = Number(tiles?.missing_venues?.total ?? 0) || 0;
  const missingVenuesNew = Number(tiles?.missing_venues?.new_yesterday ?? 0) || 0;
  const owlsEyeTotal = Number(tiles?.owls_eye?.venues_reviewed_total ?? 0) || 0;
  const owlsEyeNew = Number(tiles?.owls_eye?.venues_reviewed_new_yesterday ?? 0) || 0;
  const venueCheckTotal = Number(tiles?.venue_check?.submissions_total ?? 0) || 0;
  const venueCheckNew = Number(tiles?.venue_check?.submissions_new_yesterday ?? 0) || 0;
  const tiInsiderTotal = Number(tiles?.ti_users?.insider_total ?? 0) || 0;
  const tiInsiderNew = Number(tiles?.ti_users?.insider_new_yesterday ?? 0) || 0;
  const tiWeekendTotal = Number(tiles?.ti_users?.weekend_pro_total ?? 0) || 0;
  const tiWeekendNew = Number(tiles?.ti_users?.weekend_pro_new_yesterday ?? 0) || 0;
  const bySport: PublicDirectoryBySportRow[] = (Array.isArray((tiles as any)?.public_directory?.by_sport)
    ? ((tiles as any)?.public_directory?.by_sport ?? [])
    : Array.isArray(tiles?.canonical?.by_sport)
    ? tiles?.canonical?.by_sport ?? []
    : []) as PublicDirectoryBySportRow[];

  const SPORT_LABELS_ANY = TI_SPORT_LABELS as unknown as Record<string, string>;
  const getSportLabel = (sport: unknown) => {
    const raw = typeof sport === "string" ? sport : "";
    const key = raw.trim().toLowerCase();
    return SPORT_LABELS_ANY[key] ?? raw ?? "Unknown";
  };

  const totalsRows = totalsBySport
    .map((row) => {
      if (!row.ok) {
        return `<tr>
          <td style="padding:8px 10px;border-top:1px solid #e5e7eb;"><strong>${htmlEscape(
            getSportLabel(row.sport)
          )}</strong></td>
          <td style="padding:8px 10px;border-top:1px solid #e5e7eb;" colspan="6"><span style="color:#b91c1c;">Error: ${htmlEscape(
            row.error ?? "unknown"
          )}</span></td>
        </tr>`;
      }
      const totals = row.totals ?? {};
      return `<tr>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;"><strong>${htmlEscape(
          getSportLabel(row.sport)
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

  const tilesHtml = includeTiles
    ? `<div style="margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;">
        ${renderTile("Total tournaments in DB", formatInt(dbTotal), "", "info")}
        ${renderTile("Published (public directory)", formatInt(publishedTotal), formatDelta(publishedNew), "info")}
        ${renderTile("Missing venues", formatInt(missingVenuesTotal), formatDelta(missingVenuesNew), "warn")}
        ${renderTile("Owl's Eye venues reviewed", formatInt(owlsEyeTotal), formatDelta(owlsEyeNew), "success")}
        ${renderTile("Venue Check submissions", formatInt(venueCheckTotal), formatDelta(venueCheckNew), "success")}
        ${renderUsersTile({ insiderTotal: tiInsiderTotal, insiderNew: tiInsiderNew, weekendTotal: tiWeekendTotal, weekendNew: tiWeekendNew })}
      </div>`
    : "";

  const sportTilesHtml =
    includeTiles && includeSportTiles && bySport.length > 0
      ? `<div style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;">
          ${TI_SPORTS.map((sport) => {
            const row = bySport.find((r: PublicDirectoryBySportRow) => String(r.sport).toLowerCase() === sport);
            return {
              sport,
              total: Number(row?.total ?? 0) || 0,
              new_yesterday: Number(row?.new_yesterday ?? 0) || 0,
            };
          })
            .sort((a, b) => b.total - a.total || a.sport.localeCompare(b.sport))
            .map((row) =>
              renderTile(
                getSportLabel(row.sport),
                formatInt(row.total),
                row.new_yesterday === 0 ? "0" : formatDelta(row.new_yesterday),
                "neutral"
              )
            )
            .join("")}
        </div>`
      : "";

  const heatmapHtml =
    includeTiles && tiles
      ? (() => {
          const tilesUrl = `${baseUrl}/api/admin-dashboard-email/heatmap?scope=public_directory&v=${encodeURIComponent(
            generatedAtIso.slice(0, 10),
          )}`;
          const mapUrl = `${baseUrl}/api/admin-dashboard-email/heatmap-us?scope=public_directory&v=${encodeURIComponent(
            generatedAtIso.slice(0, 10),
          )}`;
          const interactiveUrl = `${baseUrl}/heatmap?sport=all`;
          return `<div style="margin-top:16px;border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#ffffff;">
            <div style="font-size:12px;color:#64748b;font-weight:900;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">
              Tournament heatmap (US)
            </div>
            <img
              src="${tilesUrl}"
              alt="US Tournament Map (tiles)"
              width="640"
              style="display:block;width:100%;max-width:640px;height:auto;border-radius:12px;border:1px solid #e2e8f0;"
            />
            <div style="height:10px;"></div>
            <img
              src="${mapUrl}"
              alt="US Tournament Map (map)"
              width="640"
              style="display:block;width:100%;max-width:640px;height:auto;border-radius:12px;border:1px solid #e2e8f0;"
            />
            <div style="margin-top:10px;font-size:12px;">
              <a href="${interactiveUrl}" style="color:#1d4ed8;text-decoration:underline;">Open interactive heatmap</a>
            </div>
          </div>`;
        })()
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
        ${tilesHtml}
        ${sportTilesHtml}
        ${heatmapHtml}

        <p style="margin:14px 0 12px;color:#334155;font-size:13px;line-height:1.45;">
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

  const includeTiles = settings?.include_tiles ?? true;
  const includeSportTiles = settings?.include_sport_tiles ?? true;
  const includeOutreach = settings?.include_outreach ?? true;
  const includeRiSummary = settings?.include_ri_summary ?? true;
  const includeLowestStates = settings?.include_lowest_states ?? true;

  const [tiles, totalsBySport, riSummary, lowestStates] = await Promise.all([
    includeTiles ? loadAdminDashboardEmailTiles() : Promise.resolve(null),
    includeOutreach ? Promise.all(TI_SPORTS.map((sport) => loadOutreachTotals(sport))) : Promise.resolve([]),
    includeRiSummary ? loadRiSummaryCounts() : Promise.resolve(null),
    includeLowestStates ? loadLowestStates(5) : Promise.resolve(null),
  ]);

  const generatedAtIso = new Date().toISOString();
  const previewHtml = buildPreviewHtml({
    generatedAtIso,
    baseUrl,
    tiles,
    includeTiles,
    includeSportTiles,
    totalsBySport,
    riSummary,
    lowestStates,
  });

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

        <form action={saveSettingsAction as any} style={{ display: "grid", gap: 10 }}>
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
              <input type="checkbox" name="include_tiles" defaultChecked={includeTiles} />
              <span>Include tile summary</span>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="include_sport_tiles" defaultChecked={includeSportTiles} />
              <span>Include sport tiles</span>
            </label>
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

        <form action={sendNowAction as any} style={{ display: "grid", gap: 10 }}>
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
