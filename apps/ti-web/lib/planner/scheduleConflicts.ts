import type { PlannerEventRow } from "./types";

export type LoadedConflictInfo = { conflictCount: number };

export function detectLoadedEventConflicts(events: PlannerEventRow[]) {
  const byId = new Map<string, LoadedConflictInfo>();
  const parsed: Array<{ id: string; startMs: number; endMs: number }> = [];

  for (const event of events) {
    // Seeded tournament rows are derived context with a synthetic time range,
    // not real schedule commitments. Including them creates false conflicts.
    if (String(event.source_type ?? "").trim() === "tournament") continue;
    const id = String(event.id);
    const start = new Date(String(event.starts_at ?? ""));
    if (Number.isNaN(start.getTime())) continue;
    const startMs = start.getTime();
    const rawEnd = event.ends_at ? new Date(String(event.ends_at)) : null;
    const rawEndMs = rawEnd && !Number.isNaN(rawEnd.getTime()) ? rawEnd.getTime() : null;
    // Advisory fallback: if ends_at is missing/invalid (or even <= starts_at), assume 60 minutes.
    const endMs = rawEndMs && rawEndMs > startMs ? rawEndMs : startMs + 60 * 60_000;
    parsed.push({ id, startMs, endMs });
  }

  // Stable order supports an early-break overlap scan.
  parsed.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id));

  // Back-to-back events are not a conflict: strict inequality is intentional.
  for (let i = 0; i < parsed.length; i++) {
    const a = parsed[i]!;
    for (let j = i + 1; j < parsed.length; j++) {
      const b = parsed[j]!;
      if (b.startMs >= a.endMs) break;
      if (a.startMs < b.endMs && b.startMs < a.endMs) {
        byId.set(a.id, { conflictCount: (byId.get(a.id)?.conflictCount ?? 0) + 1 });
        byId.set(b.id, { conflictCount: (byId.get(b.id)?.conflictCount ?? 0) + 1 });
      }
    }
  }

  return byId;
}
