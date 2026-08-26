"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { computeWeekendLeaveByAction, computeWhatFitsAction, recordWhatFitsAnalyticsAction, recordWeeklyEngagementAction } from "@/app/actions";
import type { WhatFitsServerResult } from "@/lib/whatFits.server";
import { buildNavigationLinks } from "@/lib/navigation";
import { WhatFitsPanel } from "./WhatFitsPanel";
import { corralioSportIcon, corralioSportLabel } from "@/lib/schedules/sport";
import { getThisWeekendRangeLocal } from "@/lib/weekend";
import { buildWeekendPlan, type WeekendConflict, type WeekendPlanEvent } from "@/lib/weekendPlan";

function validTimeZone(timezone: string | null) {
  if (!timezone) return undefined;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return undefined;
  }
}

function formatOverlapTime(conflict: WeekendConflict) {
  const starts = new Date(conflict.overlapStartsAt);
  const ends = new Date(conflict.overlapEndsAt);
  const options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${starts.toLocaleTimeString("en-US", options)}–${ends.toLocaleTimeString("en-US", options)} local time`;
}

function EventCard({ event, conflicts, onNavigate }: { event: WeekendPlanEvent; conflicts: WeekendConflict[]; onNavigate: (location: string) => void }) {
  const starts = new Date(event.startsAt);
  const timeZone = validTimeZone(event.timezone);
  const colorClass = event.childColor ? ` eventColor-${event.childColor}` : "";
  const location = event.location;
  const leaveBy = event.leaveByAt ? new Date(event.leaveByAt) : null;

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
      {conflicts.length ? (
        <p className="eventConflictBadge">
          <span aria-hidden="true">!</span>
          {conflicts.length === 1
            ? conflicts[0]?.kind === "same-child" ? "Same child conflict" : "Schedule conflict"
            : `${conflicts.length} schedule conflicts`}
        </p>
      ) : null}
      <div className="eventCardContent">
        <time dateTime={event.startsAt}>
          <strong>{starts.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone })}</strong>
        </time>
        <div className="eventBody">
          <h4>{event.title}</h4>
          {leaveBy && event.estimatedDriveMinutes ? (
            <p className="eventLeaveBy">
              Leave by {leaveBy.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZone,
              })} (est.) · ~{event.estimatedDriveMinutes} min estimated drive
            </p>
          ) : null}
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

export function ThisWeekend({ events, candidateLimitReached = false }: { events: WeekendPlanEvent[]; candidateLimitReached?: boolean }) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [navigationLocation, setNavigationLocation] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const navigationDialogRef = useRef<HTMLDialogElement>(null);
  const engagementRecordedRef = useRef(false);
  const leaveByTriggeredRef = useRef(false);
  const [foodResult, setFoodResult] = useState<WhatFitsServerResult | null>(null);
  const [coffeeResult, setCoffeeResult] = useState<WhatFitsServerResult | null>(null);
  const [coffeeLoading, setCoffeeLoading] = useState(false);

  useEffect(() => setNow(new Date()), []);
  useEffect(() => {
    const dialog = navigationDialogRef.current;
    if (navigationLocation && dialog && !dialog.open) dialog.showModal();
  }, [navigationLocation]);

  const plan = useMemo(
    () => (now ? buildWeekendPlan(events, now, candidateLimitReached) : null),
    [candidateLimitReached, events, now],
  );
  useEffect(() => {
    if (!plan || engagementRecordedRef.current) return;
    engagementRecordedRef.current = true;

    // The analytics period is a server-computed UTC ISO week. The plan shown
    // here intentionally keeps its existing browser-local Fri-Sun boundary.
    void recordWeeklyEngagementAction(
      plan.conflictStatus === "candidate-limit-reached"
        ? {
            hadConflict: null,
            conflictCount: null,
            conflictCheckUnavailable: true,
          }
        : {
            hadConflict: plan.conflicts.length > 0,
            conflictCount: plan.conflicts.length,
            conflictCheckUnavailable: false,
          },
    );
  }, [plan]);
  useEffect(() => {
    if (!plan || leaveByTriggeredRef.current || plan.events.length === 0) return;
    leaveByTriggeredRef.current = true;
    const eventIds = plan.events.map((event) => event.id);
    void computeWeekendLeaveByAction(eventIds).then(async (result) => {
      if (result.changed) router.refresh();
      const whatFits = await computeWhatFitsAction({ eventIds, mode: "food", candidateLimitReached: plan.conflictStatus === "candidate-limit-reached" });
      setFoodResult(whatFits);
      if (whatFits.kind === "suppressed") {
        void recordWhatFitsAnalyticsAction({ event: "what_fits_suppressed", mode: "food", reason: whatFits.reason });
      }
    });
  }, [plan, router]);

  const conflictPresentation = useMemo(() => {
    const eventById = new Map((plan?.events ?? []).map((event) => [event.id, event]));
    const conflictsByEventId = new Map<string, WeekendConflict[]>();
    for (const conflict of plan?.conflicts ?? []) {
      for (const eventId of conflict.eventIds) {
        const current = conflictsByEventId.get(eventId) ?? [];
        current.push(conflict);
        conflictsByEventId.set(eventId, current);
      }
    }
    return { eventById, conflictsByEventId };
  }, [plan]);

  if (!now) return <div className="weekendLoading" role="status">Loading this weekend…</div>;
  const range = getThisWeekendRangeLocal(now);
  const rangeLabel = `${range.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${new Date(range.end.getTime() - 1).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const navigationLinks = navigationLocation ? buildNavigationLinks(navigationLocation) : null;
  const dayGroups = plan?.dayGroups ?? [];
  const conflicts = plan?.conflicts ?? [];

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
      {plan?.conflictStatus === "candidate-limit-reached" ? (
        <div className="conflictCoverageNotice" role="status">
          <strong>Conflict check unavailable</strong>
          <p>There are too many nearby schedule events to verify every overlap right now. Your weekend events are still shown below.</p>
        </div>
      ) : conflicts.length ? (
        <section className="conflictSummary" aria-labelledby="conflict-summary-heading">
          <div>
            <p className="eyebrow">Schedule check</p>
            <h3 id="conflict-summary-heading">{conflicts.length} {conflicts.length === 1 ? "conflict" : "conflicts"} this weekend</h3>
          </div>
          <ol>
            {conflicts.map((conflict) => {
              const first = conflictPresentation.eventById.get(conflict.eventIds[0]);
              const second = conflictPresentation.eventById.get(conflict.eventIds[1]);
              if (!first || !second) return null;
              return (
                <li key={conflict.key}>
                  <span>{conflict.kind === "same-child" ? "Same child conflict" : "Schedule conflict"}</span>
                  <p><strong>{first.identityLabel} · {first.title}</strong> overlaps <strong>{second.identityLabel} · {second.title}</strong>.</p>
                  <p className="conflictOverlap">Overlap: {formatOverlapTime(conflict)}</p>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
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
                    <Fragment key={event.id}>
                      <EventCard
                        event={event}
                        conflicts={conflictPresentation.conflictsByEventId.get(event.id) ?? []}
                        onNavigate={(location) => {
                          setCopied(false);
                          setNavigationLocation(location);
                        }}
                      />
                      {foodResult?.kind === "ready" && foodResult.currentEventId === event.id ? (
                        <WhatFitsPanel
                          food={foodResult}
                          coffee={coffeeResult}
                          coffeeLoading={coffeeLoading}
                          onLoadCoffee={() => {
                            if (!plan || coffeeLoading || coffeeResult) return;
                            setCoffeeLoading(true);
                            void computeWhatFitsAction({
                              eventIds: plan.events.map((candidate) => candidate.id),
                              mode: "coffee",
                              candidateLimitReached: plan.conflictStatus === "candidate-limit-reached",
                            }).then((result) => {
                              setCoffeeResult(result);
                              if (result.kind === "suppressed") {
                                void recordWhatFitsAnalyticsAction({ event: "what_fits_suppressed", mode: "coffee", reason: result.reason });
                              }
                            }).finally(() => setCoffeeLoading(false));
                          }}
                          onNavigate={(location) => {
                            setCopied(false);
                            setNavigationLocation(location);
                          }}
                        />
                      ) : null}
                    </Fragment>
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
