import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmailVerified } from "@/lib/email";
import { TI_SPORT_LABELS, TI_SPORTS } from "@/lib/tiSports";
import {
  loadAdminDashboardEmailTiles,
  getEffectiveRecipients,
  loadLowestStates,
  loadRiSummaryCounts,
  loadTiAdminDashboardEmailSettings,
  resolveTiBaseUrl,
} from "@/lib/adminDashboardEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const LOCK_KEY = "ti_admin_dashboard_email_v1";

function isAuthorized(req: Request) {
  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("token");
  const tokenFromHeader = req.headers.get("x-cron-secret");
  const token = (tokenFromQuery ?? tokenFromHeader ?? "").trim();
  return Boolean(process.env.CRON_SECRET && token && token === process.env.CRON_SECRET);
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

const SPORT_LABELS_ANY = TI_SPORT_LABELS as unknown as Record<string, string>;
function getSportLabel(sport: unknown) {
  const raw = typeof sport === "string" ? sport : "";
  const key = raw.trim().toLowerCase();
  return SPORT_LABELS_ANY[key] ?? raw ?? "Unknown";
}

type DashboardJson = {
  totals?: {
    total_previews?: number;
    sent_count?: number;
    replied_count?: number;
    reply_rate?: number | null;
    directors_contacted_count?: number;
    total_send_attempts?: number;
    needs_followup_count?: number;
  };
};

async function loadOutreachTotals(sport: string) {
  const { data, error } = await (supabaseAdmin.rpc("get_outreach_dashboard_metrics" as any, {
    p_sport: sport || null,
    p_campaign_id: null,
    p_start_after: null,
    p_start_before: null,
    p_followup_days: 7,
  }) as any);

  if (error) {
    return { sport, ok: false as const, error: error.message || String(error), totals: null as any };
  }

  const payload = (data ?? {}) as DashboardJson;
  return { sport, ok: true as const, error: null, totals: payload.totals ?? {} };
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

function renderUsersTile(params: {
  insiderTotal: number;
  insiderNew: number;
  weekendTotal: number;
  weekendNew: number;
}) {
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

function buildEmailHtml(params: {
  generatedAtIso: string;
  totalsBySport: Array<ReturnType<typeof loadOutreachTotals> extends Promise<infer T> ? T : never>;
  baseUrl: string;
  includeRiSummary: boolean;
  riSummary?: Awaited<ReturnType<typeof loadRiSummaryCounts>> | null;
  includeLowestStates: boolean;
  lowestStates?: Awaited<ReturnType<typeof loadLowestStates>> | null;
  includeTiles: boolean;
  includeSportTiles: boolean;
  tiles?: Awaited<ReturnType<typeof loadAdminDashboardEmailTiles>> | null;
}) {
  const {
    generatedAtIso,
    totalsBySport,
    baseUrl,
    includeRiSummary,
    riSummary,
    includeLowestStates,
    lowestStates,
    includeTiles,
    includeSportTiles,
    tiles,
  } = params;
  const dashboardUrl = `${baseUrl}/admin/outreach-dashboard`;

  const canonicalTotal = Number(tiles?.canonical?.total ?? 0) || 0;
  const canonicalNew = Number(tiles?.canonical?.new_yesterday ?? 0) || 0;
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

  const bySport = Array.isArray(tiles?.canonical?.by_sport) ? tiles?.canonical?.by_sport ?? [] : [];

  const sportTilesHtml =
    includeSportTiles
      ? (() => {
          const rows = TI_SPORTS.map((sport) => {
            const hit = bySport.find((r) => String(r.sport).toLowerCase() === sport);
            return {
              sport,
              total: Number(hit?.total ?? 0) || 0,
              new_yesterday: Number(hit?.new_yesterday ?? 0) || 0,
            };
          }).sort((a, b) => b.total - a.total || a.sport.localeCompare(b.sport));

          if (rows.length === 0) return "";

          return `<div style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;">
            ${rows
              .map((row) =>
                renderTile(getSportLabel(row.sport), formatInt(row.total), formatDelta(row.new_yesterday), "neutral")
              )
              .join("")}
          </div>`;
        })()
      : "";

  const tilesHtml =
    includeTiles && tiles
      ? `<div style="margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;">
          ${renderTile("Canonical tournaments", formatInt(canonicalTotal), formatDelta(canonicalNew), "info")}
          ${renderTile("Missing venues", formatInt(missingVenuesTotal), formatDelta(missingVenuesNew), "warn")}
          ${renderTile("Owl's Eye venues reviewed", formatInt(owlsEyeTotal), formatDelta(owlsEyeNew), "success")}
          ${renderTile("Venue Check submissions", formatInt(venueCheckTotal), formatDelta(venueCheckNew), "success")}
          ${renderUsersTile({ insiderTotal: tiInsiderTotal, insiderNew: tiInsiderNew, weekendTotal: tiWeekendTotal, weekendNew: tiWeekendNew })}
        </div>
        ${sportTilesHtml}`
      : "";

  const rows = totalsBySport
    .map((row) => {
      if (!row.ok) {
        return `<tr>
          <td style="padding:8px 10px;border-top:1px solid #e5e7eb;"><strong>${htmlEscape(
            getSportLabel(row.sport)
          )}</strong></td>
          <td style="padding:8px 10px;border-top:1px solid #e5e7eb;" colspan="6">
            <span style="color:#b91c1c;">Error: ${htmlEscape(row.error ?? "unknown")}</span>
          </td>
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

  const riSummaryHtml =
    includeRiSummary && riSummary
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
    includeLowestStates && Array.isArray(lowestStates) && lowestStates.length > 0
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

        ${tilesHtml}

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
            <tbody>
              ${rows}
            </tbody>
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
      <div style="color:#64748b;font-size:11px;margin-top:12px;padding:0 6px;">
        Internal admin email. If you don’t want these, remove your address from <code>TI_ADMIN_DASHBOARD_EMAILS</code>.
      </div>
    </div>
  </body>
</html>`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const settings = await loadTiAdminDashboardEmailSettings();
  const recipients = getEffectiveRecipients(settings);
  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no_recipients" });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1";

  const { data: lock, error: lockError } = await (supabaseAdmin as any).rpc("acquire_cron_job_lock", {
    p_key: LOCK_KEY,
    p_ttl_seconds: 10 * 60,
  });
  if (lockError) {
    return NextResponse.json({ ok: false, error: lockError.message }, { status: 500 });
  }
  if (!lock) {
    return NextResponse.json({ ok: true, skipped: true, reason: "lock_held" });
  }

  try {
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
    const html = buildEmailHtml({
      generatedAtIso,
      totalsBySport,
      baseUrl,
      includeRiSummary,
      riSummary,
      includeLowestStates,
      lowestStates,
      includeTiles,
      includeSportTiles,
      tiles,
    });
    const subject = `TI Admin Dashboard — ${generatedAtIso.slice(0, 10)}`;

    const responsePayload = {
      ok: true,
      dry_run: dryRun,
      to: recipients,
      subject,
      settings: settings ?? null,
      sections: {
        tiles: includeTiles,
        sport_tiles: includeSportTiles,
        outreach: includeOutreach,
        ri_summary: includeRiSummary,
        lowest_states: includeLowestStates,
      },
      totalsBySportCount: totalsBySport.length,
      tiles: tiles ?? null,
      riSummary: riSummary ?? null,
      lowestStates: lowestStates ?? null,
    };

    try {
      if (!dryRun) {
        await sendEmailVerified({
          kind: "transactional",
          to: recipients,
          subject,
          html,
          allowLocalhostLinks: true,
        });
      }
      await supabaseAdmin.from("ti_admin_dashboard_email_runs" as any).insert({
        run_at: generatedAtIso,
        dry_run: dryRun,
        recipients,
        subject,
        ok: true,
        error: null,
        payload: responsePayload,
      });
      return NextResponse.json(responsePayload);
    } catch (err: any) {
      const message = String(err?.message ?? err ?? "unknown_error");
      try {
        await supabaseAdmin.from("ti_admin_dashboard_email_runs" as any).insert({
          run_at: generatedAtIso,
          dry_run: dryRun,
          recipients,
          subject,
          ok: false,
          error: message,
          payload: responsePayload,
        });
      } catch {
        // best-effort logging only
      }
      return NextResponse.json({ ok: false, error: "send_failed", detail: message }, { status: 500 });
    }
  } finally {
    try {
      await (supabaseAdmin as any).rpc("release_cron_job_lock", { p_key: LOCK_KEY });
    } catch {
      // Best-effort unlock: TTL will eventually expire.
    }
  }
}
