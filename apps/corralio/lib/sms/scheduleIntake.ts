import type { IntakeAssignmentTarget, IntakeFeedEvidence } from "../schedules/intakeAssignment";
import { resolveDeterministicIntakeAssignment } from "../schedules/intakeAssignment";
import { parseSmsIntakeContent } from "./telnyxInbound";

export type SmsIntakeOwner = { userId: string; householdId: string };
export type SmsIntakeAssignment = { childId: string; teamId: string | null } | null;

export type SmsScheduleIntakeDependencies = {
  claimEvent(eventId: string): Promise<"claimed" | "duplicate" | "blocked">;
  completeEvent(eventId: string, outcome: "connected" | "clarification_pending" | "resolved" | "duplicate" | "ignored" | "failed"): Promise<void>;
  resolveOwner(phone: string): Promise<SmsIntakeOwner | null>;
  listTargets(owner: SmsIntakeOwner): Promise<IntakeAssignmentTarget[]>;
  inspect(url: string): Promise<{ ok: true; evidence: IntakeFeedEvidence } | { ok: false }>;
  connect(owner: SmsIntakeOwner, url: string, assignment: SmsIntakeAssignment): Promise<{ ok: true; sourceId: string } | { ok: false }>;
  createPending(input: SmsIntakeOwner & { url: string; targets: IntakeAssignmentTarget[] }): Promise<{ created: boolean }>;
  claimPending(input: SmsIntakeOwner & { eventId: string; choice: number }): Promise<{
    intakeId: string;
    url: string;
    assignment: SmsIntakeAssignment;
  } | null>;
  finalizePending(input: { intakeId: string; eventId: string; outcome: "resolved" | "cancelled"; sourceId?: string }): Promise<void>;
  cancelPending(owner: SmsIntakeOwner): Promise<boolean>;
  sendReply(phone: string, message: string): Promise<void>;
};

export async function processSmsScheduleIntake(
  dependencies: SmsScheduleIntakeDependencies,
  input: { eventId: string; senderPhone: string; text: string },
) {
  const claim = await dependencies.claimEvent(input.eventId);
  if (claim !== "claimed") return { status: claim === "duplicate" ? "duplicate" as const : "denied" as const };
  try {
    const owner = await dependencies.resolveOwner(input.senderPhone);
    if (!owner) {
      await dependencies.completeEvent(input.eventId, "ignored");
      return { status: "ignored" as const };
    }
    const content = parseSmsIntakeContent(input.text);
    if (content.kind === "url") {
      const targets = await dependencies.listTargets(owner);
      const inspected = await dependencies.inspect(content.url);
      if (!inspected.ok) {
        await dependencies.completeEvent(input.eventId, "failed");
        await dependencies.sendReply(input.senderPhone, "We couldn't read that calendar link. Check it and send it again.");
        return { status: "failed" as const };
      }
      const resolution = resolveDeterministicIntakeAssignment(inspected.evidence, targets);
      if (resolution.outcome === "assigned") {
        const connected = await dependencies.connect(owner, content.url, {
          childId: resolution.target.childId,
          teamId: resolution.target.teamId,
        });
        await dependencies.completeEvent(input.eventId, connected.ok ? "connected" : "failed");
        if (connected.ok) await dependencies.sendReply(input.senderPhone, "Schedule connected. Your weekend plan is ready in Corralio.");
        return { status: connected.ok ? "connected" as const : "failed" as const };
      }
      const pending = await dependencies.createPending({ ...owner, url: content.url, targets });
      await dependencies.completeEvent(input.eventId, "clarification_pending");
      if (pending.created) {
        const options = targets.slice(0, 9).map((target, index) => target.teamName
          ? `${index + 1}. ${target.childName} - ${target.teamName}`
          : `${index + 1}. ${target.childName}`);
        options.push(`${options.length + 1}. Keep it unassigned`);
        await dependencies.sendReply(input.senderPhone, `Which team is this schedule for? Reply with a number: ${options.join("; ")}`);
      }
      return { status: "clarification_pending" as const };
    }
    if (content.kind === "choice") {
      const pending = await dependencies.claimPending({ ...owner, eventId: input.eventId, choice: content.choice });
      if (!pending) {
        await dependencies.completeEvent(input.eventId, "ignored");
        return { status: "ignored" as const };
      }
      const connected = await dependencies.connect(owner, pending.url, pending.assignment);
      await dependencies.finalizePending({
        intakeId: pending.intakeId,
        eventId: input.eventId,
        outcome: connected.ok ? "resolved" : "cancelled",
        ...(connected.ok ? { sourceId: connected.sourceId } : {}),
      });
      await dependencies.completeEvent(input.eventId, connected.ok ? "resolved" : "failed");
      if (connected.ok) await dependencies.sendReply(input.senderPhone, "Schedule connected. Your weekend plan is ready in Corralio.");
      return { status: connected.ok ? "resolved" as const : "failed" as const };
    }
    if (content.kind === "cancel") {
      const cancelled = await dependencies.cancelPending(owner);
      await dependencies.completeEvent(input.eventId, "ignored");
      if (cancelled) await dependencies.sendReply(input.senderPhone, "Schedule connection cancelled. Send the calendar link again whenever you're ready.");
      return { status: "ignored" as const };
    }
    await dependencies.completeEvent(input.eventId, "ignored");
    return { status: "ignored" as const };
  } catch {
    await dependencies.completeEvent(input.eventId, "failed").catch(() => undefined);
    return { status: "failed" as const };
  }
}
