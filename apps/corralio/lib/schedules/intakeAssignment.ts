export const SMS_ASSIGNMENT_RULE_VERSION = "corralio-sms-assignment-v1";

export type IntakeAssignmentTarget = {
  teamId: string | null;
  childId: string;
  teamName: string | null;
  childName: string;
};

export type IntakeFeedEvidence = {
  calendarName: string | null;
  eventTitles: readonly string[];
};

function normalized(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
}

export function resolveDeterministicIntakeAssignment(
  evidence: IntakeFeedEvidence,
  targets: readonly IntakeAssignmentTarget[],
): { outcome: "assigned"; target: IntakeAssignmentTarget; ruleVersion: string } | {
  outcome: "clarification_required";
  ruleVersion: string;
} {
  const calendarName = evidence.calendarName ? normalized(evidence.calendarName) : "";
  if (!calendarName) return { outcome: "clarification_required", ruleVersion: SMS_ASSIGNMENT_RULE_VERSION };

  const titleEvidence = evidence.eventTitles.map(normalized).filter(Boolean);
  const candidates = targets.filter((target) => {
    const teamName = normalized(target.teamName ?? "");
    if (!teamName || teamName !== calendarName) return false;
    // CALNAME is never enough by itself. Require a second, exact full-team-name
    // signal from at least one event title. This is bounded token matching, not
    // fuzzy similarity; conflicting/missing evidence always asks the parent.
    return titleEvidence.some((title) => ` ${title} `.includes(` ${teamName} `));
  });
  return candidates.length === 1 && candidates[0].teamId
    ? { outcome: "assigned", target: candidates[0], ruleVersion: SMS_ASSIGNMENT_RULE_VERSION }
    : { outcome: "clarification_required", ruleVersion: SMS_ASSIGNMENT_RULE_VERSION };
}
