import assert from "node:assert/strict";
import test from "node:test";

import { normalizeIcsSchedule, sanitizeScheduleNotes } from "./index";

const NOW = new Date("2026-08-18T12:00:00.000Z");

function calendar(events: string[]) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sports Schedule Contract Tests//EN",
    ...events,
    "END:VCALENDAR",
  ].join("\n");
}

test("normalizes a single event while preserving raw location and optional-field defaults", () => {
  const result = normalizeIcsSchedule({
    now: NOW,
    sourceUrl: "https://example.com/team.ics",
    icsText: calendar([
      "BEGIN:VEVENT",
      "UID:single-1",
      "DTSTART:20260822T170000Z",
      "SUMMARY:<b>Saturday Game</b>",
      "LOCATION:Regional Sports Park, 100 Main St, Spokane, WA #6",
      "END:VEVENT",
    ]),
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.parsedTotal, 1);
  assert.deepEqual(result.events[0], {
    title: "Saturday Game",
    startsAt: "2026-08-22T17:00:00.000Z",
    endsAt: "2026-08-22T17:00:00.000Z",
    timezone: null,
    notes: null,
    rawLocation: "Regional Sports Park, 100 Main St, Spokane, WA #6",
    location: "Regional Sports Park, 100 Main St, Spokane, WA",
    fieldLabel: "Field 6",
    sourceEventUid: "single-1",
  });
});

test("expands recurrence, applies a moved exception, and omits a cancelled instance", () => {
  const result = normalizeIcsSchedule({
    now: NOW,
    sourceUrl: "https://example.com/recurring.ics",
    icsText: calendar([
      "BEGIN:VEVENT",
      "UID:repeat-1",
      "DTSTART;TZID=America/Los_Angeles:20260820T180000",
      "DTEND;TZID=America/Los_Angeles:20260820T190000",
      "RRULE:FREQ=WEEKLY;COUNT=3",
      "SUMMARY:Practice",
      "LOCATION:Gym 1",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:repeat-1",
      "RECURRENCE-ID;TZID=America/Los_Angeles:20260827T180000",
      "DTSTART;TZID=America/Los_Angeles:20260827T190000",
      "DTEND;TZID=America/Los_Angeles:20260827T200000",
      "SUMMARY:Practice moved",
      "LOCATION:Gym 2",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:repeat-1",
      "RECURRENCE-ID;TZID=America/Los_Angeles:20260903T180000",
      "DTSTART;TZID=America/Los_Angeles:20260903T180000",
      "DTEND;TZID=America/Los_Angeles:20260903T190000",
      "STATUS:CANCELLED",
      "SUMMARY:Practice",
      "LOCATION:Gym 1",
      "END:VEVENT",
    ]),
  });

  assert.equal(result.events.length, 2);
  assert.deepEqual(
    result.events.map(({ title, startsAt, endsAt, timezone, sourceEventUid }) => ({
      title,
      startsAt,
      endsAt,
      timezone,
      sourceEventUid,
    })),
    [
      {
        title: "Practice",
        startsAt: "2026-08-21T01:00:00.000Z",
        endsAt: "2026-08-21T02:00:00.000Z",
        timezone: "America/Los_Angeles",
        sourceEventUid: "repeat-1|2026-08-21T01:00:00.000Z",
      },
      {
        title: "Practice moved",
        startsAt: "2026-08-28T02:00:00.000Z",
        endsAt: "2026-08-28T03:00:00.000Z",
        timezone: "America/Los_Angeles",
        sourceEventUid: "repeat-1|2026-08-28T01:00:00.000Z",
      },
    ],
  );
  assert.deepEqual(result.canceledSourceEventUids, ["repeat-1|2026-09-04T01:00:00.000Z"]);
});

test("creates deterministic fallback identity without a provider UID", () => {
  const input = {
    now: NOW,
    sourceUrl: "https://example.com/no-uid.ics",
    icsText: calendar([
      "BEGIN:VEVENT",
      "DTSTART:20260823T180000Z",
      "SUMMARY:Game",
      "LOCATION:Field House",
      "END:VEVENT",
    ]),
  };
  const first = normalizeIcsSchedule(input).events[0]?.sourceEventUid;
  const second = normalizeIcsSchedule(input).events[0]?.sourceEventUid;
  assert.match(first ?? "", /^hash_[0-9a-f]{32}$/);
  assert.equal(first, second);
});

test("reports malformed input without throwing", () => {
  const result = normalizeIcsSchedule({
    now: NOW,
    sourceUrl: "https://example.com/not-calendar.txt",
    icsText: "not an iCalendar document",
  });
  assert.deepEqual(result, {
    events: [],
    canceledSourceEventUids: [],
    errors: ["not_ics"],
    parsedTotal: 0,
  });
});

test("sanitizes HTML, URLs, UUIDs, and structured schedule notes", () => {
  const result = normalizeIcsSchedule({
    now: NOW,
    sourceUrl: "https://example.com/notes.ics",
    icsText: calendar([
      "BEGIN:VEVENT",
      "UID:notes-1",
      "DTSTART:20260824T180000Z",
      "SUMMARY:<b>Practice</b>",
      "DESCRIPTION:<b>Arrival note</b>: https://example.com/private deadbeef-aaaa-4bbb-8ccc-1234567890ab",
      "END:VEVENT",
    ]),
  });
  assert.equal(result.events[0]?.notes, "Arrival note:");
  assert.equal(sanitizeScheduleNotes("Token abcdef0123456789abcdef0123456789."), "Token.");
});
