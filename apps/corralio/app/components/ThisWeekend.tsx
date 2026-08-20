"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { buildNavigationLinks } from "@/lib/navigation";
import { corralioSportIcon, corralioSportLabel } from "@/lib/schedules/sport";
import { getThisWeekendRangeLocal } from "@/lib/weekend";
import { groupWeekendEventsByLocalDay, type WeekendPlanEvent } from "@/lib/weekendPlan";

function validTimeZone(timezone: string | null) {
  if (!timezone) return undefined;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return undefined;
  }
}

function EventCard({ event, onNavigate }: { event: WeekendPlanEvent; onNavigate: (location: string) => void }) {
  const starts = new Date(event.startsAt);
  const timeZone = validTimeZone(event.timezone);
  const colorClass = event.childColor ? ` eventColor-${event.childColor}` : "";
  const location = event.location;

  return (
    <li className={`eventCard eventCard-${event.identityKind}${colorClass}`}>
      <div className="eventIdentityRow">
        <span className="eventIdentityMarker" aria-hidden="true" />
        <p>{event.identityLabel}</p>
        {event.sport ? (
          <span className="sportIcon" aria-label={corralioSportLabel(event.sport)} title={corralioSportLabel(event.sport)}>
            {corralioSportIcon(event.sport)}
          </span>
        ) : null}
      </div>
      <div className="eventCardContent">
        <time dateTime={event.startsAt}>
          <strong>{starts.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone })}</strong>
        </time>
        <div className="eventBody">
          <h4>{event.title}</h4>
          {location ? (
            <button className="eventLocation" type="button" aria-haspopup="dialog" onClick={() => onNavigate(location)}>
              {location}{event.fieldLabel ? ` · ${event.fieldLabel}` : ""}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function ThisWeekend({ events }: { events: WeekendPlanEvent[] }) {
  const [now, setNow] = useState<Date | null>(null);
  const [navigationLocation, setNavigationLocation] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const navigationDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => setNow(new Date()), []);
  useEffect(() => {
    const dialog = navigationDialogRef.current;
    if (navigationLocation && dialog && !dialog.open) dialog.showModal();
  }, [navigationLocation]);

  const dayGroups = useMemo(
    () => (now ? groupWeekendEventsByLocalDay(events, now) : []),
    [events, now],
  );

  if (!now) return <div className="weekendLoading" role="status">Loading this weekend…</div>;
  const range = getThisWeekendRangeLocal(now);
  const rangeLabel = `${range.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${new Date(range.end.getTime() - 1).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const navigationLinks = navigationLocation ? buildNavigationLinks(navigationLocation) : null;

  function closeNavigation() {
    navigationDialogRef.current?.close();
    setNavigationLocation(null);
    setCopied(false);
  }

  async function copyLocation() {
    if (!navigationLocation || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(navigationLocation);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="weekendPlan">
      <p className="sectionKicker">{rangeLabel}</p>
      {dayGroups.length ? (
        <div className="weekendDays">
          {dayGroups.map((group) => {
            const headingId = `weekend-day-${group.key}`;
            return (
              <section className="weekendDay" aria-labelledby={headingId} key={group.key}>
                <div className="weekendDayHeading">
                  <h3 id={headingId}>{group.label}</h3>
                  <span>{group.events.length} {group.events.length === 1 ? "event" : "events"}</span>
                </div>
                <ol className="eventList">
                  {group.events.map((event) => (
                    <EventCard
                      event={event}
                      key={event.id}
                      onNavigate={(location) => {
                        setCopied(false);
                        setNavigationLocation(location);
                      }}
                    />
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="emptyState">
          <h3>No events this weekend</h3>
          <p>Your schedule is connected. Events will appear here when they fall on Friday, Saturday, or Sunday.</p>
        </div>
      )}
      <dialog
        className="navigationDialog"
        ref={navigationDialogRef}
        aria-labelledby="navigation-dialog-title"
        onClose={() => {
          setNavigationLocation(null);
          setCopied(false);
        }}
        onClick={(event) => {
          if (event.currentTarget === event.target) closeNavigation();
        }}
      >
        {navigationLocation && navigationLinks ? (
          <div className="navigationSheet">
            <div>
              <p className="eyebrow">Directions</p>
              <h3 id="navigation-dialog-title">Open this location with</h3>
              <p>{navigationLocation}</p>
            </div>
            <div className="navigationChoices">
              <a href={navigationLinks.appleMaps} target="_blank" rel="noopener noreferrer">Apple Maps</a>
              <a href={navigationLinks.googleMaps} target="_blank" rel="noopener noreferrer">Google Maps</a>
              <a href={navigationLinks.waze} target="_blank" rel="noopener noreferrer">Waze</a>
              <button type="button" onClick={copyLocation}>{copied ? "Address copied" : "Copy address"}</button>
              <button type="button" onClick={closeNavigation}>Cancel</button>
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
