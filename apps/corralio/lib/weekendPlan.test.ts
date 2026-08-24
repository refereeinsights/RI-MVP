import assert from "node:assert/strict";
import test from "node:test";

import type { WeekendPlanEvent } from "./weekendPlan";
import { buildWeekendPlan, groupWeekendEventsByLocalDay, resolveWeekendEventIdentity } from "./weekendPlan";

process.env.TZ = "America/Los_Angeles";

function event(id: string, startsAt: string): WeekendPlanEvent {
  return {
    id,
    title: `Event ${id}`,
    startsAt,
    endsAt: null,
    timezone: "America/Los_Angeles",
    location: null,
    fieldLabel: null,
    sport: null,
    identityKind: "unassigned",
    identityLabel: "Schedule",
    childColor: null,
    resolvedChildId: null,
  };
}

function timedEvent(
  id: string,
  start: Date,
  end: Date | string | null,
  resolvedChildId: string | null = null,
): WeekendPlanEvent {
  return {
    ...event(id, start.toISOString()),
    endsAt: end instanceof Date ? end.toISOString() : end,
    resolvedChildId,
    identityKind: resolvedChildId ? "assigned" : "unassigned",
    identityLabel: resolvedChildId ?? "Schedule",
  };
}

const children = [
  { id: "child-a", displayName: "Avery", colorToken: "ocean" as const },
  { id: "child-b", displayName: "Jordan", colorToken: "rose" as const },
];
const teams = [{ id: "team-b", childId: "child-b", displayName: "Falcons" }];

test("resolves child and team identity through the active family projection", () => {
  assert.deepEqual(resolveWeekendEventIdentity({ childId: "child-a", teamId: null }, "Source", children, teams), {
    kind: "assigned",
    label: "Avery",
    childColor: "ocean",
    resolvedChildId: "child-a",
  });
  assert.deepEqual(resolveWeekendEventIdentity({ childId: null, teamId: "team-b" }, "Source", children, teams), {
    kind: "assigned",
    label: "Jordan · Falcons",
    childColor: "rose",
    resolvedChildId: "child-b",
  });
});

test("uses neutral source fallback and unavailable assignment presentation", () => {
  assert.deepEqual(resolveWeekendEventIdentity({ childId: null, teamId: null }, "Team calendar", children, teams), {
    kind: "unassigned",
    label: "Team calendar",
    childColor: null,
    resolvedChildId: null,
  });
  assert.deepEqual(resolveWeekendEventIdentity({ childId: null, teamId: null }, null, children, teams), {
    kind: "unassigned",
    label: "Unassigned event",
    childColor: null,
    resolvedChildId: null,
  });
  assert.deepEqual(resolveWeekendEventIdentity({ childId: "missing", teamId: null }, "Source", children, teams), {
    kind: "unavailable",
    label: "Previous assignment unavailable",
    childColor: null,
    resolvedChildId: null,
  });
});

test("groups only applicable days and keeps stable chronological order", () => {
  const now = new Date(2026, 7, 18, 12);
  const groups = groupWeekendEventsByLocalDay([
    event("sat-late", new Date(2026, 7, 22, 14).toISOString()),
    event("fri", new Date(2026, 7, 21, 18).toISOString()),
    event("sat-early-a", new Date(2026, 7, 22, 9).toISOString()),
    event("sat-early-b", new Date(2026, 7, 22, 9).toISOString()),
    event("monday", new Date(2026, 7, 24, 0).toISOString()),
    event("invalid", "not-a-date"),
  ], now);

  assert.deepEqual(groups.map((group) => group.label), ["Friday, Aug 21", "Saturday, Aug 22"]);
  assert.deepEqual(groups.map((group) => group.events.map((item) => item.id)), [
    ["fri"],
    ["sat-early-a", "sat-early-b", "sat-late"],
  ]);
});

test("returns one whole-weekend empty result instead of empty day groups", () => {
  assert.deepEqual(groupWeekendEventsByLocalDay([], new Date(2026, 7, 18, 12)), []);
});

test("uses the browser-local day bucket while retaining event timezone data", () => {
  const startsAt = new Date(2026, 7, 22, 0, 30).toISOString();
  const mixedZoneEvent = { ...event("mixed-zone", startsAt), timezone: "Pacific/Honolulu" };
  const groups = groupWeekendEventsByLocalDay([mixedZoneEvent], new Date(2026, 7, 18, 12));

  assert.equal(groups[0]?.label, "Saturday, Aug 22");
  assert.equal(groups[0]?.events[0]?.timezone, "Pacific/Honolulu");
  assert.match(new Date(startsAt).toLocaleDateString("en-US", { weekday: "long", timeZone: "Pacific/Honolulu" }), /Friday/);
});

test("detects partial, contained, and identical positive-duration overlaps", () => {
  const now = new Date(2026, 7, 18, 12);
  const at = (hour: number, minute = 0) => new Date(2026, 7, 22, hour, minute);
  const plan = buildWeekendPlan([
    timedEvent("a", at(9), at(11)),
    timedEvent("b", at(10), at(12)),
    timedEvent("contained", at(9, 30), at(10, 30)),
    timedEvent("identical", at(9), at(11)),
  ], now);

  assert.deepEqual(plan.conflicts.map((conflict) => conflict.key), [
    "a:identical",
    "a:contained",
    "contained:identical",
    "a:b",
    "b:contained",
    "b:identical",
  ]);
});

test("touching boundaries and separated events do not conflict", () => {
  const now = new Date(2026, 7, 18, 12);
  const at = (hour: number) => new Date(2026, 7, 22, hour);
  const plan = buildWeekendPlan([
    timedEvent("first", at(9), at(10)),
    timedEvent("touching", at(10), at(11)),
    timedEvent("later", at(12), at(13)),
  ], now);

  assert.deepEqual(plan.conflicts, []);
});

test("excludes missing, invalid, zero, and negative end times", () => {
  const now = new Date(2026, 7, 18, 12);
  const start = new Date(2026, 7, 22, 9);
  const valid = timedEvent("valid", new Date(2026, 7, 22, 9, 30), new Date(2026, 7, 22, 10, 30));
  const plan = buildWeekendPlan([
    valid,
    timedEvent("missing", start, null),
    timedEvent("invalid", start, "not-a-date"),
    timedEvent("zero", start, start),
    timedEvent("negative", start, new Date(2026, 7, 22, 8)),
  ], now);

  assert.deepEqual(plan.conflicts, []);
});

test("uses stable resolved child IDs for same-child classification", () => {
  const now = new Date(2026, 7, 18, 12);
  const start = new Date(2026, 7, 22, 9);
  const end = new Date(2026, 7, 22, 11);
  const plan = buildWeekendPlan([
    { ...timedEvent("team", start, end, "child-a"), identityLabel: "Avery · Owls" },
    { ...timedEvent("direct", start, end, "child-a"), identityLabel: "Avery" },
    { ...timedEvent("other", start, end, "child-b"), identityLabel: "Avery" },
    { ...timedEvent("unassigned", start, end), identityLabel: "Owls calendar" },
  ], now);

  assert.equal(plan.conflicts.find((item) => item.key === "direct:team")?.kind, "same-child");
  assert.equal(plan.conflicts.find((item) => item.key === "other:team")?.kind, "schedule");
  assert.equal(plan.conflicts.find((item) => item.key === "team:unassigned")?.kind, "schedule");
});

test("selects the exact browser-local weekend before deriving conflicts", () => {
  const now = new Date(2026, 7, 18, 12);
  const weekend = timedEvent("weekend", new Date(2026, 7, 22, 10), new Date(2026, 7, 22, 12));
  const outside = timedEvent("monday", new Date(2026, 7, 24, 10), new Date(2026, 7, 24, 12));
  const plan = buildWeekendPlan([weekend, outside], now);

  assert.deepEqual(plan.events.map((item) => item.id), ["weekend"]);
  assert.deepEqual(plan.conflicts, []);
});

test("compares absolute instants across event timezones", () => {
  const now = new Date(2026, 7, 18, 12);
  const first = { ...timedEvent("pacific", new Date("2026-08-22T16:00:00Z"), new Date("2026-08-22T18:00:00Z")), timezone: "America/Los_Angeles" };
  const second = { ...timedEvent("eastern", new Date("2026-08-22T17:00:00Z"), new Date("2026-08-22T19:00:00Z")), timezone: "America/New_York" };
  const plan = buildWeekendPlan([first, second], now);

  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0]?.overlapStartsAt, "2026-08-22T17:00:00.000Z");
  assert.equal(plan.conflicts[0]?.overlapEndsAt, "2026-08-22T18:00:00.000Z");
});

test("detects an overnight overlap across browser-local day groups", () => {
  const now = new Date(2026, 7, 18, 12);
  const friday = timedEvent("friday", new Date(2026, 7, 21, 23, 30), new Date(2026, 7, 22, 0, 30));
  const saturday = timedEvent("saturday", new Date(2026, 7, 22, 0), new Date(2026, 7, 22, 1));
  const plan = buildWeekendPlan([friday, saturday], now);

  assert.deepEqual(plan.dayGroups.map((group) => group.events.map((item) => item.id)), [["friday"], ["saturday"]]);
  assert.equal(plan.conflicts[0]?.key, "friday:saturday");
});

test("uses canonical pair keys and suppresses self and reverse duplicates", () => {
  const now = new Date(2026, 7, 18, 12);
  const start = new Date(2026, 7, 22, 9);
  const end = new Date(2026, 7, 22, 11);
  const plan = buildWeekendPlan([
    timedEvent("z", start, end),
    timedEvent("a", start, end),
    timedEvent("z", start, end),
  ], now);

  assert.deepEqual(plan.conflicts.map((item) => item.key), ["a:z"]);
  assert.deepEqual(plan.conflicts[0]?.eventIds, ["a", "z"]);
});

test("suppresses definitive conflict claims at the candidate limit", () => {
  const now = new Date(2026, 7, 18, 12);
  const candidates = [
    timedEvent("a", new Date(2026, 7, 22, 9), new Date(2026, 7, 22, 11)),
    timedEvent("b", new Date(2026, 7, 22, 10), new Date(2026, 7, 22, 12)),
  ];
  const complete = buildWeekendPlan(candidates, now, false);
  const limited = buildWeekendPlan(candidates, now, true);

  assert.equal(complete.conflicts.length, 1);
  assert.equal(limited.conflictStatus, "candidate-limit-reached");
  assert.deepEqual(limited.conflicts, []);
  assert.equal(limited.events.length, 2);
});

test("uses canonical positive midnight intervals without guessing all-day metadata", () => {
  const now = new Date(2026, 7, 18, 12);
  const midnightInterval = timedEvent("midnight", new Date(2026, 7, 22, 0), new Date(2026, 7, 23, 0));
  const timed = timedEvent("timed", new Date(2026, 7, 22, 10), new Date(2026, 7, 22, 11));

  assert.equal(buildWeekendPlan([midnightInterval, timed], now).conflicts.length, 1);
});
