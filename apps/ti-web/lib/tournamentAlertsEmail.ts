import { SITE_ORIGIN } from "@/lib/sitemaps";
import { ALERT_START_OFFSET_DAYS, type AlertCadence } from "@/lib/tournamentAlerts";
import { TI_SPORT_LABELS, type TiSport } from "@/lib/tiSports";
import type { TiTier } from "@/lib/entitlements";

export type TournamentAlertEmailTournament = {
  id: string;
  slug: string;
  name: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  owls_eye_counts?: {
    coffee: number;
    food: number;
    hotels: number;
    gear: number;
  } | null;
};

export function buildTournamentAlertEmail(params: {
  cadence: AlertCadence;
  tier: TiTier;
  zip: string;
  radiusMiles: number;
  daysAhead: number;
  sport: TiSport | null;
  tournaments: TournamentAlertEmailTournament[];
}) {
  const cadenceLabel = params.cadence === "daily" ? "Daily" : "Weekly";
  const sportLabel = params.sport ? TI_SPORT_LABELS[params.sport] : null;
  const subjectBase = `${cadenceLabel} tournaments near ${params.zip}`;
  const subject = sportLabel ? `${subjectBase} (${sportLabel})` : subjectBase;

  const headline = sportLabel
    ? `${cadenceLabel} ${escapeHtml(sportLabel)} tournaments near ${escapeHtml(params.zip)}`
    : `${cadenceLabel} tournaments near ${escapeHtml(params.zip)}`;

  const manageUrl = `${SITE_ORIGIN}/account/alerts`;
  const pricingUrl = `${SITE_ORIGIN}/pricing`;

  const teaserEligibleTournamentIds = new Set<string>();
  if (params.tier === "insider") {
    for (const tournament of params.tournaments) {
      if (teaserEligibleTournamentIds.size >= 2) break;
      const counts = tournament.owls_eye_counts ?? null;
      if (!counts) continue;
      const total = (counts.coffee ?? 0) + (counts.food ?? 0) + (counts.hotels ?? 0) + (counts.gear ?? 0);
      if (total <= 0) continue;
      teaserEligibleTournamentIds.add(tournament.id);
    }
  }

  const shouldShowUpgradeLine = params.tier === "insider" && teaserEligibleTournamentIds.size > 0;

  const htmlRows = params.tournaments
    .map((t) => {
      const name = t.name?.trim() ? escapeHtml(t.name.trim()) : "Tournament";
      const when = escapeHtml(formatDateRange(t.start_date, t.end_date) || "Dates TBA");
      const where = escapeHtml(formatLocation(t.city, t.state) || "Location TBA");
      const sport = t.sport?.trim() ? ` · ${escapeHtml(t.sport.trim())}` : "";
      const url = `${SITE_ORIGIN}/tournaments/${encodeURIComponent(t.slug)}`;

      const counts = t.owls_eye_counts ?? null;
      const showTeaser = teaserEligibleTournamentIds.has(t.id) && Boolean(counts);
      const teaserLine = showTeaser && counts ? buildOwlsEyeTeaserLine(counts) : null;

      return `
        <tr>
          <td style="padding:12px 0;border-top:1px solid #e2e8f0;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;color:#0f172a;font-weight:700;margin:0 0 2px 0;">${name}</div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:#334155;">${when} · ${where}${sport}</div>
            ${
              teaserLine
                ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;color:#334155;margin-top:2px;">${teaserLine}</div>`
                : ""
            }
            <div style="margin-top:8px;">
              <a href="${url}" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#2563EB;text-decoration:underline;">View details</a>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:20px 22px 6px 22px;">
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.3;color:#0f172a;font-weight:800;margin:0;">
                  ${headline}
                </div>
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:#475569;margin-top:6px;">
                  Within ${escapeHtml(String(params.radiusMiles))} miles · Planning window starts ${ALERT_START_OFFSET_DAYS} days out
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 22px 10px 22px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${htmlRows}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 22px 22px 22px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#64748b;">
                You’re receiving this because you set up a scheduled tournament alert in your TournamentInsights account.
                ${
                  shouldShowUpgradeLine
                    ? `<br />
                Weekend Pro unlocks full Owl’s Eye™ venue details. <a href="${pricingUrl}" style="color:#2563EB;text-decoration:underline;">Upgrade</a>`
                    : ""
                }
                <br />
                Manage or turn off alerts: <a href="${manageUrl}" style="color:#2563EB;text-decoration:underline;">${manageUrl}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const textLines = [
    headline,
    `Within ${params.radiusMiles} miles · Planning window starts ${ALERT_START_OFFSET_DAYS} days out`,
    "",
    ...params.tournaments.flatMap((t) => {
      const url = `${SITE_ORIGIN}/tournaments/${encodeURIComponent(t.slug)}`;
      const name = t.name?.trim() || "Tournament";
      const when = formatDateRange(t.start_date, t.end_date) || "Dates TBA";
      const where = formatLocation(t.city, t.state) || "Location TBA";
      const sport = t.sport?.trim() ? ` · ${t.sport.trim()}` : "";
      const counts = t.owls_eye_counts ?? null;
      const showTeaser = teaserEligibleTournamentIds.has(t.id) && Boolean(counts);
      const teaserLine = showTeaser && counts ? buildOwlsEyeTeaserLine(counts) : null;
      return teaserLine ? [`${name}`, `${when} · ${where}${sport}`, teaserLine, url, ""] : [`${name}`, `${when} · ${where}${sport}`, url, ""];
    }),
    "Why you received this: You set up a scheduled tournament alert in your TournamentInsights account.",
    ...(shouldShowUpgradeLine ? ["Weekend Pro unlocks full Owl’s Eye™ venue details.", `Upgrade: ${pricingUrl}`] : []),
    `Manage alerts: ${manageUrl}`,
  ];

  return { subject, html, text: textLines.join("\n") };
}

function formatLocation(city: string | null, state: string | null) {
  const parts = [city, state].map((v) => (v ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : "";
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateRange(start: string | null, end: string | null) {
  const s = formatDate(start);
  const e = formatDate(end);
  if (s && e && s !== e) return `${s} - ${e}`;
  return s || e || "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildOwlsEyeTeaserLine(counts: { coffee: number; food: number; hotels: number; gear: number }) {
  const parts: string[] = [];
  if (counts.coffee > 0) parts.push(`☕ ${escapeHtml(String(counts.coffee))}`);
  if (counts.food > 0) parts.push(`🍔 ${escapeHtml(String(counts.food))}`);
  if (counts.hotels > 0) parts.push(`🏨 ${escapeHtml(String(counts.hotels))}`);
  if (counts.gear > 0) parts.push(`⚽ ${escapeHtml(String(counts.gear))}`);
  if (!parts.length) return null;
  return `Owl’s Eye™ available — ${parts.join(" · ")}`;
}
