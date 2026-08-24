export const WEEKLY_ENGAGEMENT_FAILURE_LOG =
  "corralio: weekly engagement write failed";

export type EngagementPayload = {
  hadConflict: boolean | null;
  conflictCount: number | null;
  conflictCheckUnavailable: boolean;
};

type HouseholdViewer = { householdId: string | null };

type WeeklyEngagementDependencies<Viewer extends HouseholdViewer> = {
  resolveViewer: () => Promise<Viewer | null>;
  callRpc: (
    viewer: Viewer & { householdId: string },
    payload: EngagementPayload,
  ) => Promise<{ error: unknown }>;
  log: (message: string) => void;
};

function logFailure(log: (message: string) => void) {
  try {
    log(WEEKLY_ENGAGEMENT_FAILURE_LOG);
  } catch {
    // Best-effort measurement must never affect the planner, even if logging fails.
  }
}

export async function recordWeeklyEngagement<Viewer extends HouseholdViewer>(
  deps: WeeklyEngagementDependencies<Viewer>,
  payload: EngagementPayload,
): Promise<void> {
  try {
    const viewer = await deps.resolveViewer();
    if (!viewer?.householdId) return;

    const { error } = await deps.callRpc(
      { ...viewer, householdId: viewer.householdId },
      payload,
    );
    if (error) logFailure(deps.log);
  } catch {
    logFailure(deps.log);
  }
}
