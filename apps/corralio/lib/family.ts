import { parseCorralioSport, type CorralioSport } from "./schedules/sport";

export const CORRALIO_CHILD_COLORS = [
  "forest",
  "ocean",
  "amber",
  "violet",
  "rose",
  "teal",
] as const;

export type CorralioChildColor = (typeof CORRALIO_CHILD_COLORS)[number];

export function parseChildColor(value: unknown): CorralioChildColor {
  const normalized = String(value ?? "").trim().toLowerCase();
  return CORRALIO_CHILD_COLORS.includes(normalized as CorralioChildColor)
    ? (normalized as CorralioChildColor)
    : "forest";
}

export function normalizeFamilyName(value: unknown, maximumLength: number) {
  const normalized = String(value ?? "").trim();
  return normalized.length >= 1 && normalized.length <= maximumLength ? normalized : null;
}

export function nextChildColor(existingActiveColors: readonly unknown[]): CorralioChildColor {
  return CORRALIO_CHILD_COLORS[existingActiveColors.length % CORRALIO_CHILD_COLORS.length];
}

export function parseTeamSport(value: unknown): CorralioSport | null | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return parseCorralioSport(normalized) ?? undefined;
}
