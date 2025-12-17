import type { TournamentRecord } from "./types";

function sanitize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function generateSlug(
  name: string,
  city: string | null | undefined,
  state: string | null | undefined,
  existing: Set<string>
): string {
  const baseParts = [sanitize(name), sanitize(city ?? ""), sanitize(state ?? "")]
    .filter(Boolean)
    .slice(0, 3);
  const base = baseParts.length ? baseParts.join("-") : sanitize(name) || "tournament";

  if (!existing.has(base)) {
    existing.add(base);
    return base;
  }

  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  const slug = `${base}-${suffix}`;
  existing.add(slug);
  return slug;
}

export function dedupeRecords(records: TournamentRecord[]): TournamentRecord[] {
  const seen = new Set<string>();
  const deduped: TournamentRecord[] = [];
  for (const record of records) {
    const key = [record.name, record.city ?? "", record.state ?? ""]
      .map((part) => part.trim().toLowerCase())
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(record);
  }
  return deduped;
}
