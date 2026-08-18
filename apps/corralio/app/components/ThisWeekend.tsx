"use client";

import { useEffect, useMemo, useState } from "react";

import { getThisWeekendRangeLocal, isInThisWeekend } from "@/lib/weekend";

export type WeekendEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string | null;
  location: string | null;
  fieldLabel: string | null;
  sourceLabel: string | null;
  assignmentLabel: string | null;
};

function validTimeZone(timezone: string | null) {
  if (!timezone) return undefined;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return undefined;
  }
}

export function ThisWeekend({ events }: { events: WeekendEvent[] }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const weekendEvents = useMemo(
    () => (now ? events.filter((event) => isInThisWeekend(event.startsAt, now)) : []),
    [events, now],
  );

  if (!now) return <div className="weekendLoading">Loading this weekend…</div>;
  const range = getThisWeekendRangeLocal(now);
  const rangeLabel = `${range.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${new Date(range.end.getTime() - 1).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div>
      <p className="sectionKicker">{rangeLabel}</p>
      {weekendEvents.length ? (
        <ol className="eventList">
          {weekendEvents.map((event) => {
            const starts = new Date(event.startsAt);
            const timeZone = validTimeZone(event.timezone);
            return (
              <li className="eventCard" key={event.id}>
                <time dateTime={event.startsAt}>
                  <strong>{starts.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone })}</strong>
                  <span>{starts.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone })}</span>
                </time>
                <div className="eventBody">
                  <h3>{event.title}</h3>
                  {event.assignmentLabel || event.sourceLabel ? (
                    <p className="eventLabel">{event.assignmentLabel ?? event.sourceLabel}</p>
                  ) : null}
                  {event.location ? <p className="eventLocation">{event.location}{event.fieldLabel ? ` · ${event.fieldLabel}` : ""}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="emptyState">
          <h3>No events this weekend</h3>
          <p>Your schedule is connected. Events will appear here when they fall on Friday, Saturday, or Sunday.</p>
        </div>
      )}
    </div>
  );
}
