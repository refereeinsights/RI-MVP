export function sanitizeReturnTo(value: string | null | undefined, fallback = "/account") {
  const raw = (value ?? "").trim();
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  return raw;
}

