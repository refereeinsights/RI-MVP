import type { PlannerEventRow } from "./types";

export type AnonymousClaimablePlannerEvent = PlannerEventRow & {
  id: `anon-event:${string}`;
  source_type: "manual";
};

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeNullableId(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || "";
}

export function isAnonymousClaimablePlannerEvent(value: PlannerEventRow | null | undefined): value is AnonymousClaimablePlannerEvent {
  if (!value) return false;
  const id = String(value.id ?? "").trim();
  const sourceType = String(value.source_type ?? "").trim();
  return id.startsWith("anon-event:") && sourceType === "manual";
}

export function filterAnonymousClaimablePlannerEvents(events: PlannerEventRow[] | null | undefined) {
  return (events ?? []).filter(isAnonymousClaimablePlannerEvent);
}

export function buildPlannerEventDedupSignature(event: Pick<
  PlannerEventRow,
  "title" | "event_type" | "starts_at" | "ends_at" | "tournament_id" | "venue_id"
>) {
  return [
    normalizeText(event.title),
    normalizeText(event.event_type),
    String(event.starts_at ?? "").trim(),
    String(event.ends_at ?? "").trim(),
    normalizeNullableId(event.tournament_id),
    normalizeNullableId(event.venue_id),
  ].join("|");
}
