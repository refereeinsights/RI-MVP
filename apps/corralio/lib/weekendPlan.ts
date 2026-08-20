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
};

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
    } as const;
  }

  const childId = assignment.childId
    ?? teams.find((team) => team.id === assignment.teamId)?.childId
    ?? null;
  const childColor = children.find((child) => child.id === childId)?.colorToken ?? null;
  return { kind: presentation.kind, label: presentation.label, childColor } as const;
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

export function groupWeekendEventsByLocalDay(events: readonly WeekendPlanEvent[], now: Date): WeekendDayGroup[] {
  const eligible = events
    .map((event, index) => ({ event, index, starts: new Date(event.startsAt) }))
    .filter(({ event, starts }) => Number.isFinite(starts.getTime()) && isInThisWeekend(event.startsAt, now))
    .sort((left, right) => left.starts.getTime() - right.starts.getTime() || left.index - right.index);

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
