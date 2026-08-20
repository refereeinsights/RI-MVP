import assert from "node:assert/strict";
import test from "node:test";

import type { WeekendPlanEvent } from "./weekendPlan";
import { groupWeekendEventsByLocalDay, resolveWeekendEventIdentity } from "./weekendPlan";

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
  });
  assert.deepEqual(resolveWeekendEventIdentity({ childId: null, teamId: "team-b" }, "Source", children, teams), {
    kind: "assigned",
    label: "Jordan · Falcons",
    childColor: "rose",
  });
});

test("uses neutral source fallback and unavailable assignment presentation", () => {
  assert.deepEqual(resolveWeekendEventIdentity({ childId: null, teamId: null }, "Team calendar", children, teams), {
    kind: "unassigned",
    label: "Team calendar",
    childColor: null,
  });
  assert.deepEqual(resolveWeekendEventIdentity({ childId: null, teamId: null }, null, children, teams), {
    kind: "unassigned",
    label: "Unassigned event",
    childColor: null,
  });
  assert.deepEqual(resolveWeekendEventIdentity({ childId: "missing", teamId: null }, "Source", children, teams), {
    kind: "unavailable",
    label: "Previous assignment unavailable",
    childColor: null,
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
