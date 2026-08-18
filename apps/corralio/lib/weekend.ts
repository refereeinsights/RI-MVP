const DAY_MS = 86_400_000;

function startOfDayLocal(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function addDaysLocal(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Matches TI Planner: the current Fri-Sun on weekends, otherwise the next Fri-Sun. */
export function getThisWeekendRangeLocal(now: Date) {
  const today = startOfDayLocal(now);
  const day = today.getDay();
  const friday =
    day === 5
      ? today
      : day === 6
        ? addDaysLocal(today, -1)
        : day === 0
          ? addDaysLocal(today, -2)
          : addDaysLocal(today, (5 - day + 7) % 7);
  return { start: friday, end: addDaysLocal(friday, 3) };
}

export function isInThisWeekend(startsAt: string, now: Date) {
  const eventTime = new Date(startsAt).getTime();
  if (!Number.isFinite(eventTime)) return false;
  const range = getThisWeekendRangeLocal(now);
  return eventTime >= range.start.getTime() && eventTime < range.end.getTime();
}

/** Broad server query window; the browser applies the exact local Fri-Sun range. */
export function getWeekendCandidateWindow(now: Date) {
  return {
    from: new Date(now.getTime() - 4 * DAY_MS).toISOString(),
    to: new Date(now.getTime() + 11 * DAY_MS).toISOString(),
  };
}
