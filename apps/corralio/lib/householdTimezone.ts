export const WEEKEND_READY_LOCAL_WEEKDAY = 4;
export const WEEKEND_READY_LOCAL_HOUR = 16;
export const WEEKEND_READY_LOCAL_MINUTE = 37;
export const WEEKEND_READY_LOCAL_WINDOW_MINUTES = 15;

const COMMON_US_TIMEZONES = [
  ["America/Los_Angeles", "Pacific Time"],
  ["America/Denver", "Mountain Time"],
  ["America/Phoenix", "Arizona Time"],
  ["America/Chicago", "Central Time"],
  ["America/New_York", "Eastern Time"],
  ["America/Anchorage", "Alaska Time"],
  ["Pacific/Honolulu", "Hawaii Time"],
] as const;

export const HOUSEHOLD_TIMEZONE_OPTIONS = COMMON_US_TIMEZONES.map(([value, label]) => ({ value, label }));

export function parseIanaTimeZone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!input || input.length > 64 || /^(?:UTC|GMT)[+-]/i.test(input)) return null;
  if (input !== "UTC" && !/^[A-Za-z][A-Za-z0-9._+-]*\/[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)?$/.test(input)) {
    return null;
  }
  try {
    const canonical = new Intl.DateTimeFormat("en-US", { timeZone: input }).resolvedOptions().timeZone;
    if (canonical === "UTC" || canonical.includes("/")) return canonical;
  } catch {
    // Unsupported identifiers fail closed.
  }
  return null;
}

export function householdTimezoneLabel(timeZone: string) {
  return HOUSEHOLD_TIMEZONE_OPTIONS.find((option) => option.value === timeZone)?.label
    ?? timeZone.split("/").at(-1)?.replaceAll("_", " ")
    ?? timeZone;
}

type ZonedParts = {
  weekday: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function zonedParts(now: Date, timeZone: string): ZonedParts | null {
  const validZone = parseIanaTimeZone(timeZone);
  if (!validZone || Number.isNaN(now.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone: validZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const weekday = weekdays[values.weekday];
  if (!weekday) return null;
  return {
    weekday,
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

export function isWeekendReadyLocalSendWindow(input: {
  now: Date;
  householdTimezone: string | null;
}) {
  if (!input.householdTimezone) return false;
  const parts = zonedParts(input.now, input.householdTimezone);
  if (!parts || parts.weekday !== WEEKEND_READY_LOCAL_WEEKDAY) return false;
  const currentMinute = parts.hour * 60 + parts.minute;
  const startMinute = WEEKEND_READY_LOCAL_HOUR * 60 + WEEKEND_READY_LOCAL_MINUTE;
  return currentMinute >= startMinute && currentMinute < startMinute + WEEKEND_READY_LOCAL_WINDOW_MINUTES;
}

export function planningWeekendStart(input: {
  now: Date;
  householdTimezone: string | null;
}) {
  if (!input.householdTimezone || !isWeekendReadyLocalSendWindow(input)) return null;
  const parts = zonedParts(input.now, input.householdTimezone);
  if (!parts) return null;
  const friday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return friday.toISOString().slice(0, 10);
}
