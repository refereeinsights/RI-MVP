import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeIcsSchedule } from "../../../../packages/lib/sports-schedule";
import { fetchIcsSchedule } from "../../../../packages/lib/sports-schedule/server";
import { createChannelIdentityGateway } from "../channelIdentity.server";
import { ingestCorralioSchedule, normalizeSubmittedScheduleUrl } from "../schedules/ingest";
import { createChannelScheduleStore } from "../schedules/channelScheduleStore.server";
import type { IntakeAssignmentTarget } from "../schedules/intakeAssignment";
import { createPendingSecretBoundary } from "../security/pendingSecret.server";
import type { SmsScheduleIntakeDependencies } from "./scheduleIntake";

function rpcRow(data: unknown) { return Array.isArray(data) ? data[0] : data; }

export function createSmsScheduleIntakeDependencies(input: {
  admin: SupabaseClient;
  channelHmacSecret: string | undefined;
  sendReply(phone: string, message: string): Promise<void>;
}): SmsScheduleIntakeDependencies {
  const identities = createChannelIdentityGateway(input.admin, input.channelHmacSecret);
  const secrets = createPendingSecretBoundary();
  return {
    async claimEvent(eventId) {
      const { data, error } = await input.admin.rpc("corralio_claim_telnyx_inbound_v1", { p_event_id: eventId });
      if (error) return "blocked";
      const decision = rpcRow(data)?.decision;
      return decision === "claimed" || decision === "duplicate" ? decision : "blocked";
    },
    async completeEvent(eventId, outcome) {
      const { error } = await input.admin.rpc("corralio_complete_telnyx_inbound_v1", {
        p_event_id: eventId, p_outcome: outcome,
      });
      if (error) throw new Error("Inbound claim completion failed");
    },
    resolveOwner: (phone) => identities.resolveVerifiedPhone(phone),
    async listTargets(owner) {
      const [teamResult, childResult] = await Promise.all([
        input.admin.from("corralio_teams").select("id,child_id,display_name")
          .eq("household_id", owner.householdId).is("archived_at", null).order("sort_order").limit(20),
        input.admin.from("corralio_children").select("id,display_name")
          .eq("household_id", owner.householdId).is("archived_at", null).order("sort_order").limit(20),
      ]);
      if (teamResult.error || childResult.error) throw new Error("Intake targets unavailable");
      const childNames = new Map((childResult.data ?? []).map((child) => [child.id, child.display_name]));
      const teams = (teamResult.data ?? []).flatMap((team): IntakeAssignmentTarget[] => {
        const childName = childNames.get(team.child_id);
        return typeof childName === "string" ? [{
          teamId: team.id,
          childId: team.child_id,
          teamName: team.display_name,
          childName,
        }] : [];
      });
      const children = (childResult.data ?? []).map((child): IntakeAssignmentTarget => ({
        teamId: null,
        childId: child.id,
        teamName: null,
        childName: child.display_name,
      }));
      return [...teams, ...children].slice(0, 20);
    },
    async inspect(rawUrl) {
      const url = normalizeSubmittedScheduleUrl(rawUrl);
      const fetched = await fetchIcsSchedule(url);
      if (!fetched.ok) return { ok: false };
      const normalized = normalizeIcsSchedule({ icsText: fetched.text, sourceUrl: fetched.finalUrl });
      if (normalized.errors.length) return { ok: false };
      return { ok: true, evidence: { calendarName: normalized.calendarName ?? null, eventTitles: normalized.events.map((event) => event.title) } };
    },
    async connect(owner, url, assignment) {
      let displayName = "Sports schedule";
      if (assignment?.teamId) {
        const { data } = await input.admin.from("corralio_teams").select("display_name")
          .eq("id", assignment.teamId).eq("household_id", owner.householdId).maybeSingle();
        if (typeof data?.display_name === "string") displayName = data.display_name;
      } else if (assignment?.childId) {
        const { data } = await input.admin.from("corralio_children").select("display_name")
          .eq("id", assignment.childId).eq("household_id", owner.householdId).maybeSingle();
        if (typeof data?.display_name === "string") displayName = data.display_name;
      }
      const result = await ingestCorralioSchedule(
        createChannelScheduleStore(input.admin, owner),
        {
          sourceUrl: url,
          displayName,
          assignment: assignment ?? undefined,
        },
      );
      return result.ok ? { ok: true, sourceId: result.sourceId } : { ok: false };
    },
    async createPending(pending) {
      const offeredTargets = pending.targets.slice(0, 9);
      const normalizedUrl = normalizeSubmittedScheduleUrl(pending.url);
      const { data, error } = await input.admin.rpc("corralio_create_pending_schedule_intake_v1", {
        p_user_id: pending.userId,
        p_household_id: pending.householdId,
        p_url_envelope: secrets.encrypt(normalizedUrl),
        p_url_fingerprint: secrets.fingerprint(normalizedUrl),
        p_candidate_team_ids: offeredTargets.flatMap((target) => target.teamId ? [target.teamId] : []),
        p_candidate_child_ids: offeredTargets.flatMap((target) => target.teamId ? [] : [target.childId]),
      });
      const row = rpcRow(data);
      if (error || typeof row?.intake_id !== "string") throw new Error("Pending intake creation failed");
      return { created: row.created === true };
    },
    async claimPending(pending) {
      const { data, error } = await input.admin.rpc("corralio_claim_pending_schedule_resolution_v1", {
        p_user_id: pending.userId,
        p_household_id: pending.householdId,
        p_event_id: pending.eventId,
        p_choice: pending.choice,
      });
      const row = rpcRow(data);
      if (error || !row) return null;
      if (typeof row.intake_id !== "string" || typeof row.url_envelope !== "string") return null;
      const assignment = row.target_kind === "team" && typeof row.target_id === "string"
        ? await (async () => {
          const { data: team } = await input.admin.from("corralio_teams").select("child_id")
            .eq("id", row.target_id).eq("household_id", pending.householdId).maybeSingle();
          return typeof team?.child_id === "string" ? { childId: team.child_id, teamId: row.target_id } : null;
        })()
        : row.target_kind === "child" && typeof row.target_id === "string"
          ? { childId: row.target_id, teamId: null }
          : row.target_kind === "unassigned" ? null : undefined;
      if (assignment === undefined) {
        await input.admin.rpc("corralio_finalize_pending_schedule_intake_v1", {
          p_intake_id: row.intake_id, p_event_id: pending.eventId,
          p_outcome: "cancelled", p_source_id: null,
        });
        return null;
      }
      try {
        return { intakeId: row.intake_id, url: secrets.decrypt(row.url_envelope), assignment };
      } catch {
        await input.admin.rpc("corralio_finalize_pending_schedule_intake_v1", {
          p_intake_id: row.intake_id, p_event_id: pending.eventId,
          p_outcome: "cancelled", p_source_id: null,
        });
        return null;
      }
    },
    async finalizePending(finalization) {
      const { error } = await input.admin.rpc("corralio_finalize_pending_schedule_intake_v1", {
        p_intake_id: finalization.intakeId,
        p_event_id: finalization.eventId,
        p_outcome: finalization.outcome,
        p_source_id: finalization.sourceId ?? null,
      });
      if (error) throw new Error("Pending intake finalization failed");
    },
    async cancelPending(owner) {
      const { data, error } = await input.admin.rpc("corralio_cancel_pending_schedule_intake_v1", {
        p_user_id: owner.userId,
        p_household_id: owner.householdId,
      });
      if (error) throw new Error("Pending intake cancellation failed");
      return data === true;
    },
    sendReply: input.sendReply,
  };
}
