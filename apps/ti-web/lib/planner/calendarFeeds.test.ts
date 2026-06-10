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
  resolvePlannerCalendarFeedByToken,
  serializePlannerCalendarFeed,
} from "./calendarFeeds";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

test("planner calendar feed token resolution prefers RPC result", async () => {
  const originalRpc = (supabaseAdmin as any).rpc;
  const originalFrom = (supabaseAdmin as any).from;
  const row = {
    id: "feed-1",
    owner_user_id: "owner-1",
    feed_type: "ical",
    scope_type: "family",
    scope_target_id: null,
    token_nonce: "nonce",
    token_version_nonce: "version",
    token_hash: "a".repeat(64),
    active: true,
    revoked_at: null,
    rotated_at: null,
    last_accessed_at: null,
    created_at: "2026-06-10T00:00:00.000Z",
    updated_at: "2026-06-10T00:00:00.000Z",
  };

  (supabaseAdmin as any).rpc = async () => ({ data: [row], error: null });
  (supabaseAdmin as any).from = () => {
    throw new Error("from() should not be used when RPC succeeds");
  };

  try {
    const result = await resolvePlannerCalendarFeedByToken("token.value");
    assert.deepEqual(result, row);
  } finally {
    (supabaseAdmin as any).rpc = originalRpc;
    (supabaseAdmin as any).from = originalFrom;
  }
});

test("planner calendar feed token resolution falls back when RPC is unavailable", async () => {
  const originalRpc = (supabaseAdmin as any).rpc;
  const originalFrom = (supabaseAdmin as any).from;
  const row = {
    id: "feed-2",
    owner_user_id: "owner-2",
    feed_type: "ical",
    scope_type: "family",
    scope_target_id: null,
    token_nonce: "nonce-2",
    token_version_nonce: "version-2",
    token_hash: "b".repeat(64),
    active: true,
    revoked_at: null,
    rotated_at: null,
    last_accessed_at: null,
    created_at: "2026-06-10T00:00:00.000Z",
    updated_at: "2026-06-10T00:00:00.000Z",
  };

  (supabaseAdmin as any).rpc = async () => ({ data: null, error: { message: "function not found" } });
  (supabaseAdmin as any).from = () => ({
    select() {
      return this;
    },
    eq() {
      return this;
    },
    maybeSingle: async () => ({ data: row, error: null }),
  });

  try {
    const result = await resolvePlannerCalendarFeedByToken("other.token");
    assert.deepEqual(result, row);
  } finally {
    (supabaseAdmin as any).rpc = originalRpc;
    (supabaseAdmin as any).from = originalFrom;
  }
});
