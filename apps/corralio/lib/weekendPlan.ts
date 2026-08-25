import type { CorralioChildColor } from "./family";
import { resolveAssignmentPresentation } from "./schedules/assignment";
import type { CorralioSport } from "./schedules/sport";
import { isInThisWeekend } from "./weekend";

export type WeekendIdentityKind = "assigned" | "unassigned" | "unavailable";

export type WeekendPlanEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string | null;
  location: string | null;
  fieldLabel: string | null;
  sport: CorralioSport | null;
  identityKind: WeekendIdentityKind;
  identityLabel: string;
  childColor: CorralioChildColor | null;
  resolvedChildId: string | null;
  estimatedDriveMinutes: number | null;
  leaveByAt: string | null;
};

export type WeekendConflict = {
  key: string;
  eventIds: readonly [string, string];
  kind: "schedule" | "same-child";
  overlapStartsAt: string;
  overlapEndsAt: string;
};

export type WeekendConflictStatus = "complete" | "candidate-limit-reached";

type IdentityChild = {
  id: string;
  displayName: string;
  colorToken: CorralioChildColor;
};

type IdentityTeam = {
  id: string;
  childId: string;
  displayName: string;
};

export function resolveWeekendEventIdentity(
  assignment: { childId: string | null; teamId: string | null },
  sourceLabel: string | null,
  children: readonly IdentityChild[],
  teams: readonly IdentityTeam[],
) {
  const presentation = resolveAssignmentPresentation(assignment, children, teams);
  if (presentation.kind !== "assigned") {
    return {
      kind: presentation.kind,
      label: presentation.label ?? sourceLabel ?? "Unassigned event",
      childColor: null,
      resolvedChildId: null,
    } as const;
  }

  const childId = assignment.childId
    ?? teams.find((team) => team.id === assignment.teamId)?.childId
    ?? null;
  const childColor = children.find((child) => child.id === childId)?.colorToken ?? null;
  return { kind: presentation.kind, label: presentation.label, childColor, resolvedChildId: childId } as const;
}

export type WeekendDayGroup = {
  key: string;
  label: string;
  events: WeekendPlanEvent[];
};

function localDayKey(date: Date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function selectWeekendEvents(events: readonly WeekendPlanEvent[], now: Date) {
  return events
    .map((event, index) => ({ event, index, starts: new Date(event.startsAt) }))
    .filter(({ event, starts }) => Number.isFinite(starts.getTime()) && isInThisWeekend(event.startsAt, now))
    .sort((left, right) => left.starts.getTime() - right.starts.getTime() || left.index - right.index)
    .map(({ event }) => event);
}

function conflictPairKey(leftId: string, rightId: string) {
  return leftId < rightId ? `${leftId}:${rightId}` : `${rightId}:${leftId}`;
}

function deriveConflictPairs(events: readonly WeekendPlanEvent[]): WeekendConflict[] {
  const conflicts: WeekendConflict[] = [];
  const seenPairs = new Set<string>();

  for (let leftIndex = 0; leftIndex < events.length; leftIndex += 1) {
    const left = events[leftIndex];
    if (!left) continue;
    const leftStart = Date.parse(left.startsAt);
    const leftEnd = left.endsAt ? Date.parse(left.endsAt) : Number.NaN;
    if (!Number.isFinite(leftStart) || !Number.isFinite(leftEnd) || leftEnd <= leftStart) continue;

    for (let rightIndex = leftIndex + 1; rightIndex < events.length; rightIndex += 1) {
      const right = events[rightIndex];
      if (!right || right.id === left.id) continue;
      const rightStart = Date.parse(right.startsAt);
      const rightEnd = right.endsAt ? Date.parse(right.endsAt) : Number.NaN;
      if (!Number.isFinite(rightStart) || !Number.isFinite(rightEnd) || rightEnd <= rightStart) continue;
      if (leftStart >= rightEnd || rightStart >= leftEnd) continue;

      const key = conflictPairKey(left.id, right.id);
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      const eventIds = left.id < right.id
        ? [left.id, right.id] as const
        : [right.id, left.id] as const;
      conflicts.push({
        key,
        eventIds,
        kind: left.resolvedChildId && left.resolvedChildId === right.resolvedChildId
          ? "same-child"
          : "schedule",
        overlapStartsAt: new Date(Math.max(leftStart, rightStart)).toISOString(),
        overlapEndsAt: new Date(Math.min(leftEnd, rightEnd)).toISOString(),
      });
    }
  }

  return conflicts.sort((left, right) =>
    Date.parse(left.overlapStartsAt) - Date.parse(right.overlapStartsAt)
      || left.key.localeCompare(right.key));
}

function groupSelectedWeekendEvents(events: readonly WeekendPlanEvent[]): WeekendDayGroup[] {
  const eligible = events.map((event) => ({ event, starts: new Date(event.startsAt) }));

  const groups = new Map<string, WeekendDayGroup>();
  for (const { event, starts } of eligible) {
    const key = localDayKey(starts);
    const group = groups.get(key) ?? {
      key,
      label: starts.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
      events: [],
    };
    group.events.push(event);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

export function buildWeekendPlan(
  candidates: readonly WeekendPlanEvent[],
  now: Date,
  candidateLimitReached = false,
) {
  const events = selectWeekendEvents(candidates, now);
  const conflictStatus: WeekendConflictStatus = candidateLimitReached
    ? "candidate-limit-reached"
    : "complete";
  return {
    events,
    dayGroups: groupSelectedWeekendEvents(events),
    conflicts: conflictStatus === "complete" ? deriveConflictPairs(events) : [],
    conflictStatus,
  };
}

export function groupWeekendEventsByLocalDay(events: readonly WeekendPlanEvent[], now: Date): WeekendDayGroup[] {
  return buildWeekendPlan(events, now).dayGroups;
}
