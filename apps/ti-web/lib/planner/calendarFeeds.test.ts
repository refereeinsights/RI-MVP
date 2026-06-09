import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPlannerCalendarFeedToken,
  buildPlannerCalendarFeedUrl,
  escapeIcsText,
  foldIcsLine,
  generatePlannerCalendarFeedTokenNonce,
  hashPlannerCalendarFeedToken,
  isPlausiblePlannerCalendarFeedToken,
  serializePlannerCalendarFeed,
} from "./calendarFeeds";

test("planner calendar feed tokens hash to stable 64-char sha256 hex", () => {
  const originalSecret = process.env.TI_CALENDAR_FEED_SECRET;
  process.env.TI_CALENDAR_FEED_SECRET = "test-calendar-secret";

  try {
    const token = buildPlannerCalendarFeedToken({
      ownerUserId: "owner-123",
      scopeType: "family",
      scopeTargetId: null,
      tokenNonce: "nonce-abc",
      tokenVersion: "version-1",
    });

    const hash = hashPlannerCalendarFeedToken(token);
    assert.match(token, /^nonce-abc\./);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(isPlausiblePlannerCalendarFeedToken(token), true);
  } finally {
    process.env.TI_CALENDAR_FEED_SECRET = originalSecret;
  }
});

test("planner calendar feed token changes when nonce or version changes", () => {
  const originalSecret = process.env.TI_CALENDAR_FEED_SECRET;
  process.env.TI_CALENDAR_FEED_SECRET = "test-calendar-secret";

  try {
    const base = {
      ownerUserId: "owner-123",
      scopeType: "family" as const,
      scopeTargetId: null,
    };

    const tokenA = buildPlannerCalendarFeedToken({
      ...base,
      tokenNonce: "nonce-a",
      tokenVersion: "version-1",
    });
    const tokenB = buildPlannerCalendarFeedToken({
      ...base,
      tokenNonce: "nonce-b",
      tokenVersion: "version-1",
    });
    const tokenC = buildPlannerCalendarFeedToken({
      ...base,
      tokenNonce: "nonce-a",
      tokenVersion: "version-2",
    });

    assert.notEqual(tokenA, tokenB);
    assert.notEqual(tokenA, tokenC);
    assert.notEqual(hashPlannerCalendarFeedToken(tokenA), hashPlannerCalendarFeedToken(tokenB));
  } finally {
    process.env.TI_CALENDAR_FEED_SECRET = originalSecret;
  }
});

test("planner calendar feed helpers build url-safe nonce and feed urls", () => {
  const nonce = generatePlannerCalendarFeedTokenNonce();
  assert.ok(nonce.length >= 43);
  assert.match(nonce, /^[A-Za-z0-9_-]+$/);

  const feedUrl = buildPlannerCalendarFeedUrl("https://www.tournamentinsights.com/", "abc.def");
  assert.equal(feedUrl, "https://www.tournamentinsights.com/weekend-planner/calendar/abc.def");
});

test("planner calendar feed escapes iCal text safely", () => {
  assert.equal(
    escapeIcsText("Team, Field; 1\\2\nLine 2"),
    "Team\\, Field\\; 1\\\\2\\nLine 2"
  );
});

test("planner calendar feed folds long RFC 5545 lines with CRLF continuation", () => {
  const folded = foldIcsLine(`SUMMARY:${"A".repeat(90)}`);
  const segments = folded.split("\r\n");
  assert.equal(segments.length, 2);
  assert.ok(Buffer.byteLength(segments[0] ?? "", "utf8") <= 75);
  assert.ok((segments[1] ?? "").startsWith(" "));
});

test("planner calendar feed serializer uses CRLF and supports empty calendars", () => {
  const serialized = serializePlannerCalendarFeed({
    name: "TournamentInsights Family Sports Schedule",
    description: "Read-only family sports schedule from TournamentInsights",
    events: [],
  });

  assert.ok(serialized.includes("BEGIN:VCALENDAR\r\n"));
  assert.ok(serialized.endsWith("\r\n"));
  assert.ok(!serialized.includes("BEGIN:VEVENT"));
});

test("planner calendar feed serializer emits stable VEVENT basics", () => {
  const originalSecret = process.env.TI_CALENDAR_FEED_SECRET;
  process.env.TI_CALENDAR_FEED_SECRET = "test-calendar-secret";

  try {
    const serialized = serializePlannerCalendarFeed({
      name: "TournamentInsights Family Sports Schedule",
      description: "Read-only family sports schedule from TournamentInsights",
      events: [
        {
          id: "event-123",
          title: "Practice — Casey",
          startsAt: "2026-06-15T14:00:00.000Z",
          endsAt: "2026-06-15T15:00:00.000Z",
          location: "Field 1, Spokane, WA",
          venueUrl: "https://www.tournamentinsights.com/venues/example",
          updatedAt: "2026-06-10T01:00:00.000Z",
        },
      ],
    });

    assert.ok(serialized.includes("BEGIN:VEVENT\r\n"));
    assert.ok(serialized.includes("SUMMARY:Practice — Casey\r\n"));
    assert.ok(serialized.includes("DTSTART:20260615T140000Z\r\n"));
    assert.ok(serialized.includes("DTEND:20260615T150000Z\r\n"));
    assert.ok(serialized.includes("URL:https://www.tournamentinsights.com/venues/example\r\n"));
    assert.ok(serialized.includes("UID:"));
    assert.ok(serialized.includes("tournamentinsights.com"));
  } finally {
    process.env.TI_CALENDAR_FEED_SECRET = originalSecret;
  }
});
