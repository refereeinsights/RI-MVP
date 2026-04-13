const RESEND_ENDPOINT = "https://api.resend.com/emails";

type ResendEmailPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  reply_to?: string;
  headers?: Record<string, string>;
};

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const asSeconds = Number(trimmed);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.max(0, Math.trunc(asSeconds * 1000));
  }

  const asDate = Date.parse(trimmed);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - Date.now());
  }

  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendResendEmail(params: {
  apiKey: string;
  payload: ResendEmailPayload;
  maxRetries?: number;
  minRetryMs?: number;
  maxRetryMs?: number;
}) {
  const {
    apiKey,
    payload,
    maxRetries = 4,
    minRetryMs = 250,
    maxRetryMs = 5000,
  } = params;

  let attempt = 0;
  let lastStatus = 0;
  let lastBody = "";

  while (attempt <= maxRetries) {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return response.json().catch(() => ({}));
    }

    lastStatus = response.status;
    lastBody = await response.text().catch(() => "");

    const canRetry = response.status === 429 || response.status >= 500;
    if (!canRetry || attempt === maxRetries) break;

    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
    const backoffMs = Math.min(maxRetryMs, minRetryMs * Math.pow(2, attempt));
    const jitterMs = Math.floor(Math.random() * 150);
    const waitMs = Math.max(minRetryMs, retryAfterMs ?? backoffMs) + jitterMs;

    await sleep(waitMs);
    attempt += 1;
  }

  let message = lastBody.trim();
  try {
    const parsed = JSON.parse(lastBody);
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      const parsedMessage = String((parsed as { message?: unknown }).message ?? "").trim();
      if (parsedMessage) message = parsedMessage;
    }
  } catch {
    // Ignore body parsing errors.
  }

  const safeMessage = message ? message.slice(0, 300) : "Unknown error";
  throw new Error(`Resend API error (${lastStatus}): ${safeMessage}`);
}

