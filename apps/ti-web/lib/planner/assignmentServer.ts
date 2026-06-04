import { isUuid } from "@/lib/venues/isUuid";

type AssignmentValidationParams = {
  supabase: any;
  userId: string;
  childProfileId: string | null;
  teamProfileId: string | null;
};

type AssignmentValidationResult =
  | {
      ok: true;
      childProfileId: string | null;
      teamProfileId: string | null;
    }
  | {
      ok: false;
      error:
        | "invalid_child_profile_id"
        | "invalid_team_profile_id"
        | "child_profile_id_required_for_team"
        | "child_profile_not_found"
        | "team_profile_not_found"
        | "child_profile_archived"
        | "team_profile_archived"
        | "invalid_team_for_child"
        | "server_error";
      status: number;
    };

export function parseOptionalPlannerProfileId(value: unknown) {
  if (value === undefined) {
    return { provided: false, value: null as string | null, invalid: false };
  }

  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return { provided: true, value: null as string | null, invalid: false };
  }

  if (!isUuid(normalized)) {
    return { provided: true, value: null as string | null, invalid: true };
  }

  return { provided: true, value: normalized, invalid: false };
}

export async function validatePlannerAssignment(
  params: AssignmentValidationParams
): Promise<AssignmentValidationResult> {
  const { supabase, userId, childProfileId, teamProfileId } = params;

  if (!childProfileId && !teamProfileId) {
    return { ok: true, childProfileId: null, teamProfileId: null };
  }

  if (!childProfileId && teamProfileId) {
    return { ok: false, error: "child_profile_id_required_for_team", status: 400 };
  }

  const { data: childProfile, error: childError } = await (supabase.from("planner_children" as any) as any)
    .select("id,is_archived")
    .eq("id", childProfileId)
    .eq("user_id", userId)
    .maybeSingle();

  if (childError) {
    return { ok: false, error: "server_error", status: 500 };
  }
  if (!childProfile) {
    return { ok: false, error: "child_profile_not_found", status: 404 };
  }
  if (childProfile.is_archived) {
    return { ok: false, error: "child_profile_archived", status: 409 };
  }

  if (!teamProfileId) {
    return { ok: true, childProfileId, teamProfileId: null };
  }

  const { data: teamProfile, error: teamError } = await (supabase.from("planner_teams" as any) as any)
    .select("id,child_id,is_archived")
    .eq("id", teamProfileId)
    .eq("user_id", userId)
    .maybeSingle();

  if (teamError) {
    return { ok: false, error: "server_error", status: 500 };
  }
  if (!teamProfile) {
    return { ok: false, error: "team_profile_not_found", status: 404 };
  }
  if (teamProfile.is_archived) {
    return { ok: false, error: "team_profile_archived", status: 409 };
  }
  if (String(teamProfile.child_id) !== String(childProfileId)) {
    return { ok: false, error: "invalid_team_for_child", status: 409 };
  }

  return { ok: true, childProfileId, teamProfileId };
}
