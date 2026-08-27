export type ScheduleFreshnessSource = {
  syncStatus: "pending" | "success" | "error";
  lastSyncedAt: string | null;
};

function parsedTime(value: string | null) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function relativeFreshness(value: string | null, nowMs: number): string {
  const time = parsedTime(value);
  if (time === null) return "never";
  const elapsedMinutes = Math.max(0, Math.floor((nowMs - time) / 60_000));
  if (elapsedMinutes < 1) return "just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes} ${elapsedMinutes === 1 ? "minute" : "minutes"} ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} ${elapsedHours === 1 ? "hour" : "hours"} ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays === 1) return "yesterday";
  return `${elapsedDays} days ago`;
}

export function sourceFreshnessLabel(source: ScheduleFreshnessSource, nowMs: number): string {
  const relative = relativeFreshness(source.lastSyncedAt, nowMs);
  if (source.syncStatus === "error") {
    return relative === "never"
      ? "Couldn’t refresh · Never updated successfully"
      : `Couldn’t refresh · Last updated ${relative}`;
  }
  return relative === "never" ? "Waiting for first successful update" : `Updated ${relative}`;
}

export function aggregateScheduleFreshness(
  sources: ScheduleFreshnessSource[],
  nowMs: number,
): string | null {
  if (!sources.length) return null;
  const successfulTimes = sources
    .map((source) => parsedTime(source.lastSyncedAt))
    .filter((value): value is number => value !== null);
  const oldest = successfulTimes.length ? Math.min(...successfulTimes) : null;
  const relative = oldest === null ? "never" : relativeFreshness(new Date(oldest).toISOString(), nowMs);
  if (sources.some((source) => source.syncStatus === "error")) {
    return relative === "never"
      ? "One or more schedules couldn’t refresh · No successful update yet"
      : `One or more schedules couldn’t refresh · Oldest last updated ${relative}`;
  }
  if (successfulTimes.length !== sources.length) {
    return "One or more schedules are waiting for a first successful update";
  }
  return relative === "never"
    ? "Schedule freshness: waiting for the first successful update"
    : `Schedules last fully updated ${relative}`;
}
