export const UNAVAILABLE_ASSIGNMENT_LABEL = "Previous assignment unavailable";

export type AssignmentChild = {
  id: string;
  displayName: string;
};

export type AssignmentTeam = {
  id: string;
  childId: string;
  displayName: string;
};

export type ScheduleAssignmentInput =
  | { ok: true; childId: string | null; teamId: string | null }
  | { ok: false };

export type AssignmentPresentation =
  | { kind: "unassigned"; label: null }
  | { kind: "assigned"; label: string }
  | { kind: "unavailable"; label: typeof UNAVAILABLE_ASSIGNMENT_LABEL };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function parseScheduleAssignmentInput(childValue: unknown, teamValue: unknown): ScheduleAssignmentInput {
  const childId = String(childValue ?? "").trim();
  const teamId = String(teamValue ?? "").trim();

  if (!childId && !teamId) return { ok: true, childId: null, teamId: null };
  if (!isValidUuid(childId)) return { ok: false };
  if (teamId && !isValidUuid(teamId)) return { ok: false };
  return { ok: true, childId, teamId: teamId || null };
}

export function resolveAssignmentPresentation(
  assignment: { childId: string | null; teamId: string | null },
  children: readonly AssignmentChild[],
  teams: readonly AssignmentTeam[],
): AssignmentPresentation {
  if (assignment.childId && assignment.teamId) {
    return { kind: "unavailable", label: UNAVAILABLE_ASSIGNMENT_LABEL };
  }

  if (assignment.childId) {
    const child = children.find((candidate) => candidate.id === assignment.childId);
    return child
      ? { kind: "assigned", label: child.displayName }
      : { kind: "unavailable", label: UNAVAILABLE_ASSIGNMENT_LABEL };
  }

  if (assignment.teamId) {
    const team = teams.find((candidate) => candidate.id === assignment.teamId);
    const child = team ? children.find((candidate) => candidate.id === team.childId) : null;
    return team && child
      ? { kind: "assigned", label: `${child.displayName} · ${team.displayName}` }
      : { kind: "unavailable", label: UNAVAILABLE_ASSIGNMENT_LABEL };
  }

  return { kind: "unassigned", label: null };
}
