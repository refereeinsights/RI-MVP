import test from "node:test";
import assert from "node:assert/strict";

import { normalizeIcsEvents, userSafeError } from "./ics-import";

function isoUtc(date: Date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function formatIcsUtc(date: Date) {
  const d = isoUtc(date);
  // YYYY-MM-DDTHH:mm:ssZ -> YYYYMMDDTHHmmssZ
  return d.replace(/[-:]/g, "").replace("T", "T");
}

function buildSimpleCalendar(events: Array<{ uid?: string; summary: string; description?: string; location?: string; start: Date; end?: Date }>) {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TournamentInsights//TI Planner Tests//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "",
  ];

  for (const ev of events) {
    lines.push("BEGIN:VEVENT");
    if (ev.uid) lines.push(`UID:${ev.uid}`);
    lines.push("DTSTAMP:20260527T000000Z");
    lines.push(`SUMMARY:${ev.summary}`);
    if (ev.description) lines.push(`DESCRIPTION:${ev.description}`);
    if (ev.location !== undefined) lines.push(`LOCATION:${ev.location}`);
    lines.push(`DTSTART:${formatIcsUtc(ev.start)}`);
    if (ev.end) lines.push(`DTEND:${formatIcsUtc(ev.end)}`);
    lines.push("END:VEVENT");
    lines.push("");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\n");
}

test("normalizeIcsEvents: rejects non-ICS content safely", () => {
  const res = normalizeIcsEvents({ icsText: "hello world", sourceUrl: "https://example.com/a.ics", teamName: null });
  assert.equal(res.events.length, 0);
  assert.equal(res.parsedTotal, 0);
});

test("normalizeIcsEvents: skips events outside import window", () => {
  const now = new Date();
  const inWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const farPast = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000);

  const ics = buildSimpleCalendar([
    { uid: "in-window-1", summary: "[UAT Planner] In Window", start: inWindow, end: new Date(inWindow.getTime() + 60 * 60 * 1000) },
    { uid: "far-past-1", summary: "[UAT Planner] Far Past", start: farPast, end: new Date(farPast.getTime() + 60 * 60 * 1000) },
  ]);

  const res = normalizeIcsEvents({ icsText: ics, sourceUrl: "https://example.com/a.ics", teamName: null });
  assert.equal(res.events.length, 1);
  assert.equal(res.events[0]?.source_event_uid, "in-window-1");
});

test("normalizeIcsEvents: strips basic HTML from summary/description/location", () => {
  const now = new Date();
  const start = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const ics = buildSimpleCalendar([
    {
      uid: "html-1",
      summary: "<b>[UAT Planner]</b> Game",
      description: "<b>Bold</b> <a href=\"https://example.com\">link</a>",
      location: "Gym <b>1</b>",
      start,
      end: new Date(start.getTime() + 60 * 60 * 1000),
    },
  ]);

  const res = normalizeIcsEvents({ icsText: ics, sourceUrl: "https://example.com/a.ics", teamName: null });
  assert.equal(res.events.length, 1);
  assert.equal(res.events[0]?.title, "[UAT Planner] Game");
  assert.equal(res.events[0]?.notes, "Bold link");
  assert.equal(res.events[0]?.address_text, "Gym 1");
});

test("normalizeIcsEvents: generates deterministic fallback UID when UID is missing", () => {
  const now = new Date();
  const start = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const ics = buildSimpleCalendar([
    { summary: "[UAT Planner] Missing UID Event", description: "a", location: "Field", start, end: new Date(start.getTime() + 60 * 60 * 1000) },
  ]);

  const res1 = normalizeIcsEvents({ icsText: ics, sourceUrl: "https://example.com/a.ics", teamName: null });
  const res2 = normalizeIcsEvents({ icsText: ics, sourceUrl: "https://example.com/a.ics", teamName: null });

  assert.equal(res1.events.length, 1);
  assert.equal(res2.events.length, 1);
  const uid1 = res1.events[0]?.source_event_uid ?? "";
  const uid2 = res2.events[0]?.source_event_uid ?? "";
  assert.ok(uid1.startsWith("hash_"));
  assert.equal(uid1, uid2);
});
