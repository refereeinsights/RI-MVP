"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { buildNavigationLinks } from "@/lib/navigation";
import { corralioSportIcon, corralioSportLabel, type CorralioSport } from "@/lib/schedules/sport";
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
  sport: CorralioSport | null;
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
  const [navigationLocation, setNavigationLocation] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const navigationDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => setNow(new Date()), []);
  useEffect(() => {
    const dialog = navigationDialogRef.current;
    if (navigationLocation && dialog && !dialog.open) dialog.showModal();
  }, [navigationLocation]);
  const weekendEvents = useMemo(
    () => (now ? events.filter((event) => isInThisWeekend(event.startsAt, now)) : []),
    [events, now],
  );

  if (!now) return <div className="weekendLoading">Loading this weekend…</div>;
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
                  <div className="eventTitleRow">
                    <h3>{event.title}</h3>
                    {event.sport ? (
                      <span className="sportIcon" aria-label={corralioSportLabel(event.sport)} title={corralioSportLabel(event.sport)}>
                        {corralioSportIcon(event.sport)}
                      </span>
                    ) : null}
                  </div>
                  {event.assignmentLabel || event.sourceLabel ? (
                    <p className="eventLabel">{event.assignmentLabel ?? event.sourceLabel}</p>
                  ) : null}
                  {event.location ? (
                    <button
                      className="eventLocation"
                      type="button"
                      aria-haspopup="dialog"
                      onClick={() => {
                        setCopied(false);
                        setNavigationLocation(event.location);
                      }}
                    >
                      {event.location}{event.fieldLabel ? ` · ${event.fieldLabel}` : ""}
                    </button>
                  ) : null}
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
