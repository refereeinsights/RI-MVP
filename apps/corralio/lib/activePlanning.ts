import { isValidUuid } from "./schedules/assignment";

export function buildActivePlanningEventSourceFilter(activeSourceIds: string[]) {
  if (!activeSourceIds.length) return null;
  if (activeSourceIds.some((sourceId) => !isValidUuid(sourceId))) {
    throw new Error("Active schedule source IDs must be UUIDs");
  }
  return `schedule_source_id.is.null,schedule_source_id.in.(${activeSourceIds.join(",")})`;
}
