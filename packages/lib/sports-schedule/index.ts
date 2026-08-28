import crypto from "node:crypto";

import ical from "node-ical";
import { extractIcsTextProperty } from "./icsProperty";
import { sanitizeScheduleNotes } from "./sanitize";

export { sanitizeScheduleNotes } from "./sanitize";

export const DEFAULT_SCHEDULE_WINDOW_PAST_DAYS = 30;
export const DEFAULT_SCHEDULE_WINDOW_FUTURE_DAYS = 548;
export const DEFAULT_MAX_SCHEDULE_EVENTS = 500;

export type NormalizedScheduleEvent = {
  title: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string | null;
  notes: string | null;
  scheduleArrivalAt: string | null;
  rawLocation: string | null;
  location: string | null;
  fieldLabel: string | null;
  sourceEventUid: string;
};

export type ScheduleNormalizationError = "not_ics";

export type NormalizeIcsScheduleResult = {
  events: NormalizedScheduleEvent[];
  canceledSourceEventUids: string[];
  errors: ScheduleNormalizationError[];
  parsedTotal: number;
};

type NormalizeIcsScheduleInput = {
  icsText: string;
  sourceUrl: string;
  now?: Date;
  windowPastDays?: number;
  windowFutureDays?: number;
  maxEvents?: number;
};

type ParsedStructuredDescription = {
  cleanedNotes: string | null;
  locationText: string | null;
  arrivalInstruction: string | null;
};

type RecurrenceOptions = {
  instanceStart?: Date;
  recurrenceIdentityStart?: Date;
  recurringInstance?: boolean;
};

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "");
}

function clamp(value: string | null, maxLength: number) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function normalizeStructuredNoteLabel(label: string) {
  const value = collapseWhitespace(label).toLowerCase();
  if (value === "arrive") return "Arrival";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatStructuredArrival(value: string) {
  const trimmed = collapseWhitespace(value);
  if (!trimmed) return null;
  if (/^arrive\b/i.test(trimmed)) return normalizeStructuredNoteLabel(trimmed);
  return `Arrive ${trimmed}`;
}

function parseStructuredDescription(description: string): ParsedStructuredDescription {
  const cleaned = collapseWhitespace(stripHtml(description));
  if (!cleaned) return { cleanedNotes: null, locationText: null, arrivalInstruction: null };

  const labelPattern = /\b(Game|Practice|Location|Duration|Arrival Time|Arrival|Uniform|Link):/gi;
  const matches = Array.from(cleaned.matchAll(labelPattern));
  if (!matches.length) return { cleanedNotes: cleaned, locationText: null, arrivalInstruction: null };

  const fields = new Map<string, string>();
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const key = String(match?.[1] ?? "").toLowerCase();
    const value = collapseWhitespace(
      cleaned.slice((match?.index ?? 0) + match?.[0].length, next?.index ?? cleaned.length),
    );
    if (key && value) fields.set(key, value);
  }

  const noteParts: string[] = [];
  const arrival = fields.get("arrival time") ?? fields.get("arrival");
  if (arrival) {
    const formattedArrival = formatStructuredArrival(arrival);
    if (formattedArrival) noteParts.push(formattedArrival);
  }
  const uniform = fields.get("uniform");
  if (uniform) noteParts.push(`Uniform: ${uniform}`);

  const ignoredLabels = new Set(["game", "practice", "location", "duration", "arrival time", "arrival", "uniform", "link"]);
  for (const [key, value] of fields.entries()) {
    if (!ignoredLabels.has(key)) noteParts.push(`${normalizeStructuredNoteLabel(key)}: ${value}`);
  }

  return {
    cleanedNotes: noteParts.length ? noteParts.join(" · ") : null,
    locationText: fields.get("location") ?? null,
    arrivalInstruction: arrival ?? null,
  };
}

const FIELD_ONLY_PATTERNS = [
  /^#\s*[a-z0-9-]+$/i,
  /^(field|fld)\s*[a-z0-9-]+$/i,
  /^(gym|court|diamond|rink|room|mat|pool|track|pitch)\s*[a-z0-9-]+$/i,
];

function normalizeExtractedFieldLabel(rawLabel: string) {
  const trimmed = collapseWhitespace(rawLabel);
  if (!trimmed) return "";
  const numericMarker = trimmed.match(/^#\s*([a-z0-9-]+)$/i)?.[1] ?? "";
  if (numericMarker) return `Field ${numericMarker.toUpperCase()}`;
  return trimmed.replace(/\b(fld)\b/i, "Field");
}

export function extractScheduleFieldLabel(value: string | null | undefined) {
  const trimmed = collapseWhitespace(String(value ?? ""));
  if (!trimmed) return { cleanedLocation: "", fieldLabel: null as string | null };

  const suffixMatch = trimmed.match(
    /(?:^|[\s,|/–-])((?:field|fld|court|gym|diamond|rink|room|mat|pool|track|pitch)\s*[a-z0-9-]+|#\s*[a-z0-9-]+)$/i,
  );
  if (!suffixMatch?.[1]) return { cleanedLocation: trimmed, fieldLabel: null as string | null };

  const rawLabel = collapseWhitespace(suffixMatch[1]);
  if (!FIELD_ONLY_PATTERNS.some((pattern) => pattern.test(rawLabel))) {
    return { cleanedLocation: trimmed, fieldLabel: null as string | null };
  }

  const cleanedLocation = collapseWhitespace(
    trimmed.slice(0, suffixMatch.index ?? trimmed.length).replace(/[\s,|/–-]+$/g, ""),
  );
  return {
    cleanedLocation: cleanedLocation || trimmed,
    fieldLabel: normalizeExtractedFieldLabel(rawLabel) || rawLabel,
  };
}

function safeTimeZone(value: string | null) {
  const timezone = String(value ?? "").trim();
  if (!timezone || timezone.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return null;
  }
}

function eventTimeZone(event: any) {
  const timezone = safeTimeZone(
    String(
      event?.tzid ??
        event?.timezone ??
        event?.start?.tz ??
        event?.rrule?.origOptions?.tzid ??
        event?.rrule?.options?.tzid ??
        "",
    ) || null,
  );
  return timezone === "Etc/UTC" || timezone === "UTC" ? null : timezone;
}

function timezoneOffsetMinutesAt(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const timezoneName = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  const offset = timezoneName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!offset) return 0;
  const sign = offset[1] === "-" ? -1 : 1;
  return sign * (Number(offset[2]) * 60 + Number(offset[3] ?? 0));
}

function recurrenceWallTimeToUtc(date: Date, timezone: string | null) {
  if (!timezone) return date;
  const wallTimeUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  );
  let offsetMinutes = timezoneOffsetMinutesAt(new Date(wallTimeUtc), timezone);
  let result = new Date(wallTimeUtc - offsetMinutes * 60_000);
  const resolvedOffset = timezoneOffsetMinutesAt(result, timezone);
  if (resolvedOffset !== offsetMinutes) {
    offsetMinutes = resolvedOffset;
    result = new Date(wallTimeUtc - offsetMinutes * 60_000);
  }
  return result;
}

function resolveExplicitArrivalAt(instruction: string | null, start: Date, timezone: string | null) {
  const match = String(instruction ?? "").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (hour === 12) hour = 0;
  if (match[3]?.toUpperCase() === "PM") hour += 12;

  let year: number;
  let month: number;
  let day: number;
  if (timezone) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(start);
    year = Number(parts.find((part) => part.type === "year")?.value);
    month = Number(parts.find((part) => part.type === "month")?.value);
    day = Number(parts.find((part) => part.type === "day")?.value);
  } else {
    year = start.getUTCFullYear();
    month = start.getUTCMonth() + 1;
    day = start.getUTCDate();
  }
  if (![year, month, day].every(Number.isFinite)) return null;
  const wallTime = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const arrival = recurrenceWallTimeToUtc(wallTime, timezone);
  const minutesBeforeStart = (start.getTime() - arrival.getTime()) / 60_000;
  return Number.isInteger(minutesBeforeStart) && minutesBeforeStart >= 0 && minutesBeforeStart <= 180
    ? arrival.toISOString()
    : null;
}

function parseDateOnlyToUtcMidnight(dateOnly: string, timezone: string | null) {
  const match = dateOnly.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (![year, month, day].every(Number.isFinite)) return null;

  const tz = safeTimeZone(timezone);
  if (!tz) return new Date(Date.UTC(year, month - 1, day));

  const localMidnightGuessUtc = new Date(Date.UTC(year, month - 1, day));
  const offsetParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(localMidnightGuessUtc);
  const timezoneName = offsetParts.find((part) => part.type === "timeZoneName")?.value ?? "";
  const offset = timezoneName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!offset) return localMidnightGuessUtc;
  const sign = offset[1] === "-" ? -1 : 1;
  const offsetMinutes = sign * (Number(offset[2]) * 60 + Number(offset[3] ?? 0));
  return new Date(localMidnightGuessUtc.getTime() - offsetMinutes * 60_000);
}

function toEventDate(value: unknown, timezone: string | null): Date | null {
  if (!value) return null;
  if (typeof value === "string") return parseDateOnlyToUtcMidnight(value, timezone);
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  return null;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function stableHash(parts: string[]) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

function recurrenceValues(event: any) {
  return Object.values(event?.recurrences ?? {}).filter((value): value is any => Boolean(value));
}

function recurrenceIdentity(event: any) {
  const value = event?.recurrenceid;
  return value instanceof Date && Number.isFinite(value.getTime()) ? value : null;
}

function excludedRecurrenceTimes(event: any) {
  const excluded = new Set<number>();
  for (const value of Object.values(event?.exdate ?? {})) {
    if (value instanceof Date && Number.isFinite(value.getTime())) excluded.add(value.getTime());
  }
  return excluded;
}

export function normalizeIcsSchedule(input: NormalizeIcsScheduleInput): NormalizeIcsScheduleResult {
  let parsed: Record<string, any>;
  try {
    parsed = ical.parseICS(input.icsText) as Record<string, any>;
  } catch {
    return { events: [], canceledSourceEventUids: [], errors: ["not_ics"], parsedTotal: 0 };
  }

  const now = input.now ? new Date(input.now.getTime()) : new Date();
  const windowStart = addDays(now, -(input.windowPastDays ?? DEFAULT_SCHEDULE_WINDOW_PAST_DAYS));
  const windowEnd = addDays(now, input.windowFutureDays ?? DEFAULT_SCHEDULE_WINDOW_FUTURE_DAYS);
  const maxEvents = input.maxEvents ?? DEFAULT_MAX_SCHEDULE_EVENTS;
  const events: NormalizedScheduleEvent[] = [];
  const canceledSourceEventUids = new Set<string>();
  let parsedTotal = 0;
  let sawCalendarStructure = false;

  const sourceEventUid = (params: {
    uid: string;
    identityStart: Date;
    title: string;
    location: string | null;
    recurring: boolean;
  }) => {
    const startsAt = params.identityStart.toISOString();
    if (params.uid) return params.recurring ? `${params.uid}|${startsAt}` : params.uid;
    return `hash_${stableHash([input.sourceUrl, params.title, startsAt, params.location ?? ""])}`;
  };

  const pushEvent = (event: any, recurrence: RecurrenceOptions = {}) => {
    parsedTotal += 1;
    const timezone = eventTimeZone(event);
    const start = toEventDate(recurrence.instanceStart ?? event?.start, timezone);
    if (!start || start < windowStart || start > windowEnd) return;

    const summary = extractIcsTextProperty(event?.summary).trim();
    const description = extractIcsTextProperty(event?.description).trim();
    const parsedDescription = parseStructuredDescription(description);
    const rawLocationText = collapseWhitespace(
      stripHtml(extractIcsTextProperty(event?.location).trim() || parsedDescription.locationText || ""),
    );
    const extractedLocation = extractScheduleFieldLabel(rawLocationText);
    const title = clamp(collapseWhitespace(stripHtml(summary)), 140) || "Imported calendar event";
    const notes = clamp(sanitizeScheduleNotes(parsedDescription.cleanedNotes), 2000);
    const scheduleArrivalAt = resolveExplicitArrivalAt(parsedDescription.arrivalInstruction, start, timezone);
    const rawLocation = clamp(rawLocationText, 400);
    const location = clamp(extractedLocation.cleanedLocation, 200);
    const fieldLabel = clamp(extractedLocation.fieldLabel, 80);
    const identityStart = recurrence.recurrenceIdentityStart ?? start;
    const uid = sourceEventUid({
      uid: String(event?.uid ?? "").trim(),
      identityStart,
      title,
      location,
      recurring: Boolean(recurrence.recurringInstance),
    });

    const status = String(event?.status ?? "").trim().toUpperCase();
    if (status === "CANCELLED" || status === "CANCELED") {
      canceledSourceEventUids.add(uid);
      return;
    }

    let end = toEventDate(event?.end, timezone);
    if (recurrence.instanceStart && event?.start instanceof Date && event?.end instanceof Date) {
      const duration = event.end.getTime() - event.start.getTime();
      end = duration >= 0 ? new Date(start.getTime() + duration) : null;
    }
    if (end && end < start) end = null;

    events.push({
      title,
      startsAt: start.toISOString(),
      endsAt: end?.toISOString() ?? null,
      timezone,
      notes,
      scheduleArrivalAt,
      rawLocation,
      location,
      fieldLabel,
      sourceEventUid: uid,
    });
  };

  for (const event of Object.values(parsed)) {
    if (event?.type === "VCALENDAR") {
      sawCalendarStructure = true;
      continue;
    }
    if (!event || event.type !== "VEVENT") continue;
    sawCalendarStructure = true;

    if (event.rrule && typeof event.rrule.between === "function") {
      let occurrences: Date[] = [];
      try {
        occurrences = event.rrule.between(windowStart, windowEnd, true);
      } catch {
        occurrences = [];
      }

      const exceptions = new Map<number, any>();
      for (const exception of recurrenceValues(event)) {
        const identity = recurrenceIdentity(exception);
        if (identity) exceptions.set(identity.getTime(), exception);
      }
      const excludedTimes = excludedRecurrenceTimes(event);
      const recurrenceTimezone = safeTimeZone(
        String(event?.rrule?.origOptions?.tzid ?? event?.rrule?.options?.tzid ?? "") || null,
      );

      for (const occurrence of occurrences) {
        if (events.length >= maxEvents) break;
        const normalizedOccurrence = recurrenceWallTimeToUtc(occurrence, recurrenceTimezone);
        const exception = exceptions.get(normalizedOccurrence.getTime());
        if (exception) {
          pushEvent(exception, {
            recurrenceIdentityStart: normalizedOccurrence,
            recurringInstance: true,
          });
        } else if (!excludedTimes.has(normalizedOccurrence.getTime())) {
          pushEvent(event, {
            instanceStart: normalizedOccurrence,
            recurrenceIdentityStart: normalizedOccurrence,
            recurringInstance: true,
          });
        }
      }
      continue;
    }

    pushEvent(event, {
      recurrenceIdentityStart: recurrenceIdentity(event) ?? undefined,
      recurringInstance: Boolean(recurrenceIdentity(event)),
    });
    if (events.length >= maxEvents) break;
  }

  return {
    events,
    canceledSourceEventUids: Array.from(canceledSourceEventUids),
    errors: sawCalendarStructure ? [] : ["not_ics"],
    parsedTotal,
  };
}
