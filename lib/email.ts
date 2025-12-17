const RESEND_ENDPOINT = "https://api.resend.com/emails";

type EmailRecipient = string | string[];

type EmailPayload = {
  to: EmailRecipient;
  subject: string;
  html: string;
  text?: string;
  from?: string;
};

function normalizeRecipients(to: EmailRecipient): string[] {
  if (Array.isArray(to)) {
    return to.filter(Boolean);
  }
  if (!to) return [];
  return [to];
}

export async function sendEmail(payload: EmailPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not configured; skipping email send.");
    return { skipped: true };
  }

  const to = normalizeRecipients(payload.to);
  if (to.length === 0) {
    console.warn("sendEmail called without recipients; skipping.");
    return { skipped: true };
  }

  const from =
    payload.from ??
    process.env.REVIEW_ALERT_FROM ??
    "Referee Insights <refereeinsights@gmail.com>";

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text ?? "",
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    console.error("Failed to send email", res.status, errorBody);
    throw new Error("Failed to send email.");
  }

  return res.json().catch(() => ({}));
}

export async function sendLowScoreAlertEmail(params: {
  tournamentName: string;
  tournamentId: string;
  reviewerHandle?: string | null;
  minScore: number;
  scores: Record<string, number>;
}) {
  const recipients = (process.env.REVIEW_ALERT_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    console.warn("REVIEW_ALERT_EMAILS not configured; skipping low-score alert email.");
    return { skipped: true };
  }

  const { tournamentName, tournamentId, reviewerHandle, minScore, scores } = params;
  const subject = `Low referee review score (${minScore}) for ${tournamentName}`;
  const scoresList = Object.entries(scores)
    .map(([label, value]) => `<li><strong>${label}</strong>: ${value}</li>`)
    .join("");

  const html = `
    <div>
      <p>A new referee review requires manual moderation.</p>
      <p>
        <strong>Tournament:</strong> ${tournamentName} (${tournamentId})<br/>
        ${reviewerHandle ? `<strong>Reviewer:</strong> ${reviewerHandle}<br/>` : ""}
        <strong>Lowest score:</strong> ${minScore}
      </p>
      <p>Submitted scores:</p>
      <ul>${scoresList}</ul>
    </div>
  `;

  const text =
    `A new referee review for ${tournamentName} (${tournamentId}) scored ${minScore}.\n` +
    Object.entries(scores)
      .map(([label, value]) => `${label}: ${value}`)
      .join("\n");

  return sendEmail({ to: recipients, subject, html, text });
}
