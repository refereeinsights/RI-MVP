export function extractIcsTextProperty(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const candidate = value as { val?: unknown };
  return typeof candidate.val === "string" ? candidate.val : "";
}
