import { SITE_ORIGIN } from "@/lib/sitemaps";

export type SavedTournamentChangeEmailTournament = {
  id: string;
  slug: string;
  name: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  change_summary?: string[] | null;
};

export function buildSavedTournamentChangeDigestEmail(params: {
  tournaments: SavedTournamentChangeEmailTournament[];
}) {
  const subject = "Updates to your saved tournaments";
  const manageUrl = `${SITE_ORIGIN}/account`;

  const htmlRows = params.tournaments
    .map((t) => {
      const name = t.name?.trim() ? escapeHtml(t.name.trim()) : "Tournament";
      const when = escapeHtml(formatDateRange(t.start_date, t.end_date) || "Dates TBA");
      const where = escapeHtml(formatLocation(t.city, t.state) || "Location TBA");
      const sport = t.sport?.trim() ? ` · ${escapeHtml(t.sport.trim())}` : "";
      const url = `${SITE_ORIGIN}/tournaments/${encodeURIComponent(t.slug)}`;
      const changeSummary = (t.change_summary ?? []).map((v) => (v ?? "").trim()).filter(Boolean);
      const changeHtml = changeSummary.length
        ? `
          <ul style="margin:8px 0 0 0;padding:0 0 0 18px;">
            ${changeSummary
              .slice(0, 6)
              .map(
                (item) =>
                  `<li style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;color:#0f172a;margin:0 0 2px 0;">${escapeHtml(
                    item
                  )}</li>`
              )
              .join("")}
          </ul>
        `
        : "";
      return `
        <tr>
          <td style="padding:12px 0;border-top:1px solid #e2e8f0;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;color:#0f172a;font-weight:700;margin:0 0 2px 0;">${name}</div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:#334155;">${when} · ${where}${sport}</div>
            ${changeHtml}
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
                  Updates to your saved tournaments
                </div>
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:#475569;margin-top:6px;">
                  We noticed updates to tournaments you saved in TournamentInsights.
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
                You’re receiving this because you enabled “Notify me of changes” on saved tournaments in your account.
                <br />
                Manage saved tournaments & notifications: <a href="${manageUrl}" style="color:#2563EB;text-decoration:underline;">${manageUrl}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const textLines = [
    "Updates to your saved tournaments",
    "",
    ...params.tournaments.flatMap((t) => {
      const url = `${SITE_ORIGIN}/tournaments/${encodeURIComponent(t.slug)}`;
      const name = t.name?.trim() || "Tournament";
      const when = formatDateRange(t.start_date, t.end_date) || "Dates TBA";
      const where = formatLocation(t.city, t.state) || "Location TBA";
      const sport = t.sport?.trim() ? ` · ${t.sport.trim()}` : "";
      const changeSummary = (t.change_summary ?? []).map((v) => (v ?? "").trim()).filter(Boolean);
      return [
        `${name}`,
        `${when} · ${where}${sport}`,
        ...(changeSummary.length ? changeSummary.slice(0, 6).map((line) => `- ${line}`) : []),
        url,
        "",
      ];
    }),
    "Why you received this: You enabled notifications for saved tournaments in your TournamentInsights account.",
    `Manage: ${manageUrl}`,
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
