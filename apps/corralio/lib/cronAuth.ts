export function isCorralioCronAuthorized(request: Request, cronSecret = process.env.CRON_SECRET) {
  const secret = String(cronSecret ?? "").trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
