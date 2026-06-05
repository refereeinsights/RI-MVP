import type { PlannerChildWithTeamsRow } from "@/lib/planner/types";

type InferredAssignment = {
  childProfileId: string;
  teamProfileId: string;
};

function normalizeLabel(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(value: string | null | undefined) {
  return normalizeLabel(value).split(/\s+/).filter(Boolean);
}

function startsWithTokens(haystack: string[], needle: string[]) {
  if (!needle.length || haystack.length < needle.length) return false;
  return needle.every((token, index) => haystack[index] === token);
}

export function inferAssignmentFromSourceLabel(args: {
  sourceLabel: string | null | undefined;
  familyProfiles: PlannerChildWithTeamsRow[];
}): InferredAssignment | null {
  const sourceLabel = String(args.sourceLabel ?? "").trim();
  if (!sourceLabel) return null;

  const sourceTokens = tokenize(sourceLabel);
  if (!sourceTokens.length) return null;

  let matchingChild: PlannerChildWithTeamsRow | null = null;
  let childMatchedTokenCount = 0;

  for (const childProfile of args.familyProfiles) {
    const childTokens = tokenize(childProfile.display_name);
    if (!childTokens.length) continue;
    if (startsWithTokens(sourceTokens, childTokens)) {
      matchingChild = childProfile;
      childMatchedTokenCount = childTokens.length;
      break;
    }

    const childLeadingToken = childTokens[0] ?? "";
    if (childLeadingToken && childLeadingToken === sourceTokens[0]) {
      matchingChild = childProfile;
      childMatchedTokenCount = 1;
      break;
    }
  }

  if (!matchingChild) return null;

  const remainingTokens = sourceTokens.slice(childMatchedTokenCount);
  const remainingNormalized = remainingTokens.join(" ");
  const sourceNormalized = sourceTokens.join(" ");

  let matchedTeamId = "";
  let matchedTeamScore = 0;
  for (const teamProfile of matchingChild.teams ?? []) {
    const teamNormalized = normalizeLabel(teamProfile.display_name);
    if (!teamNormalized) continue;
    if (remainingNormalized === teamNormalized || sourceNormalized.includes(teamNormalized) || remainingNormalized.includes(teamNormalized)) {
      const score = teamNormalized.length;
      if (score > matchedTeamScore) {
        matchedTeamId = String(teamProfile.id ?? "").trim();
        matchedTeamScore = score;
      }
    }
  }

  return {
    childProfileId: String(matchingChild.id ?? "").trim(),
    teamProfileId: matchedTeamId,
  };
}
