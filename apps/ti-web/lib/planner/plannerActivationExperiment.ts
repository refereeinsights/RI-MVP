type PlannerActivationAuthState = "signed_out" | "unverified" | "verified";

export const ANONYMOUS_PLANNER_ACTIVATION_EXPERIMENT = "anonymous_planner_activation_v1";

export type PlannerActivationVariant = "control" | "treatment";

export type PlannerActivationAssignment = {
  experimentName: typeof ANONYMOUS_PLANNER_ACTIVATION_EXPERIMENT;
  variant: PlannerActivationVariant;
  featureFlagState: "disabled" | "enabled";
  rolloutPercent: number;
  directEntryEnabled: boolean;
  anonymousPlannerEnabled: boolean;
};

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
}

function parsePercent(value: string | undefined, fallback: number) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return 0;
  if (parsed >= 100) return 100;
  return Math.floor(parsed);
}

function hashToBucket(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function getPlannerActivationAssignment(input: {
  plannerSessionId: string | null | undefined;
  authState: PlannerActivationAuthState;
  lockedVariant?: PlannerActivationVariant | null;
  lockedFeatureFlagState?: "disabled" | "enabled" | null;
}): PlannerActivationAssignment {
  const legacyDirectEntryEnabled =
    process.env.NEXT_PUBLIC_ENABLE_WEEKEND_PLANNER_DIRECT_ENTRY === "true";
  if (legacyDirectEntryEnabled) {
    const lockedVariant = input.lockedVariant === "control" || input.lockedVariant === "treatment"
      ? input.lockedVariant
      : null;
    const lockedFeatureFlagState =
      input.lockedFeatureFlagState === "enabled" || input.lockedFeatureFlagState === "disabled"
        ? input.lockedFeatureFlagState
        : null;
    const variant = lockedVariant ?? "treatment";
    const featureFlagState = lockedFeatureFlagState ?? "enabled";
    return {
      experimentName: ANONYMOUS_PLANNER_ACTIVATION_EXPERIMENT,
      variant,
      featureFlagState,
      rolloutPercent: 100,
      directEntryEnabled: variant === "treatment",
      anonymousPlannerEnabled: variant === "treatment" && input.authState === "signed_out",
    };
  }
  const experimentEnabled = parseBoolean(
    process.env.NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ENABLED,
    legacyDirectEntryEnabled,
  );
  const includeAuthenticated = parseBoolean(
    process.env.NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_INCLUDE_AUTHENTICATED,
    legacyDirectEntryEnabled,
  );
  const rolloutPercent = parsePercent(
    process.env.NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ROLLOUT_PERCENT,
    legacyDirectEntryEnabled ? 100 : 0,
  );
  const eligibleForTreatment =
    input.authState === "signed_out" || includeAuthenticated;
  const normalizedSessionId = String(input.plannerSessionId ?? "").trim().toLowerCase();
  const bucket = normalizedSessionId ? hashToBucket(normalizedSessionId) : 100;
  const lockedVariant = input.lockedVariant === "control" || input.lockedVariant === "treatment"
    ? input.lockedVariant
    : null;
  const lockedFeatureFlagState =
    input.lockedFeatureFlagState === "enabled" || input.lockedFeatureFlagState === "disabled"
      ? input.lockedFeatureFlagState
      : null;
  const treatmentAssigned =
    experimentEnabled &&
    eligibleForTreatment &&
    (rolloutPercent >= 100 || bucket < rolloutPercent);
  const variant = lockedVariant ?? (treatmentAssigned ? "treatment" : "control");
  const featureFlagState = lockedFeatureFlagState ?? (experimentEnabled ? "enabled" : "disabled");
  return {
    experimentName: ANONYMOUS_PLANNER_ACTIVATION_EXPERIMENT,
    variant,
    featureFlagState,
    rolloutPercent,
    directEntryEnabled: variant === "treatment",
    anonymousPlannerEnabled: variant === "treatment" && input.authState === "signed_out",
  };
}
