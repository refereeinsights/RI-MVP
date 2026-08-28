import { isValidUuid } from "./assignment";
import type { ScheduleConnectionFailureReason } from "./connectionAnalytics";
import type { CorralioScheduleIngestionResult } from "./ingest";
import { isSchedulePlatformAllowed, parseSchedulePlatform } from "./platforms";
import { parseCorralioSport, type CorralioSport } from "./sport";

export type TeamScheduleConnectionTeam = {
  id: string;
  childId: string;
  displayName: string;
  sport: CorralioSport | string | null;
};

export type TeamScheduleConnectionResult =
  | { ok: true; imported: number }
  | { ok: false; error: string; errorKind?: ScheduleConnectionFailureReason };

export type TeamScheduleConnectionDependencies = {
  resolveTeam(teamId: string): Promise<TeamScheduleConnectionTeam | null>;
  ingest(input: {
    sourceUrl: string;
    displayName: string;
    sport: CorralioSport | null;
    assignment: { childId: string; teamId: string };
  }): Promise<CorralioScheduleIngestionResult>;
};

export async function connectTeamScheduleWithDependencies(
  dependencies: TeamScheduleConnectionDependencies,
  input: { teamId: string; sourceUrl: string; platform: unknown },
): Promise<TeamScheduleConnectionResult> {
  const platform = parseSchedulePlatform(input.platform);
  if (!platform || !isSchedulePlatformAllowed("team", platform)) {
    return { ok: false, error: "Choose where this team schedule lives." };
  }

  const teamId = input.teamId.trim();
  if (!isValidUuid(teamId)) return { ok: false, error: "That team could not be found." };

  const sourceUrl = input.sourceUrl.trim();
  if (!sourceUrl) {
    return { ok: false, error: "Paste your team’s calendar link.", errorKind: "missing_url" };
  }

  const team = await dependencies.resolveTeam(teamId);
  if (!team || !isValidUuid(team.childId)) {
    return { ok: false, error: "That team could not be found." };
  }

  const result = await dependencies.ingest({
    sourceUrl,
    displayName: team.displayName,
    sport: parseCorralioSport(team.sport),
    assignment: { childId: team.childId, teamId: team.id },
  });
  if (!result.ok) return { ok: false, error: result.error, errorKind: result.errorKind };
  return { ok: true, imported: result.imported };
}
