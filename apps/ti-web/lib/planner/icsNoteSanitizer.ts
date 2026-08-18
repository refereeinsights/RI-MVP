import { sanitizeScheduleNotes } from "../../../../packages/lib/sports-schedule";

export function sanitizeImportedNotesText(rawNotes: string | null | undefined) {
  return sanitizeScheduleNotes(rawNotes);
}

export function sanitizeIcsNotesForDisplay(notes: string | null | undefined, sourceType?: string | null) {
  const normalizedSourceType = String(sourceType ?? "").trim().toLowerCase();
  const normalizedNotes = String(notes ?? "").replace(/\s+/g, " ").trim();
  if (!normalizedNotes) return "";
  if (normalizedSourceType !== "ics") return normalizedNotes;
  return sanitizeImportedNotesText(normalizedNotes) ?? "";
}
