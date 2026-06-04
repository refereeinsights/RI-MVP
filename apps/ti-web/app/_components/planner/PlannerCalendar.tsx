"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ScheduleXCalendar, useNextCalendarApp } from "@schedule-x/react";
import {
  createViewMonthAgenda,
  createViewMonthGrid,
} from "@schedule-x/calendar";
import { createEventsServicePlugin } from "@schedule-x/events-service";
import { createCalendarControlsPlugin } from "@schedule-x/calendar-controls";
import "temporal-polyfill/global";
import "@schedule-x/theme-shadcn/dist/index.css";
import type { PlannerChildWithTeamsRow, PlannerEventRow, PlannerSourceRow } from "@/lib/planner/types";
import { getFamilyColorToken, getUnassignedFamilyColorToken } from "@/lib/planner/familyColors";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";
import styles from "./Planner.module.css";

type Props = {
  scheduleView: "upcoming" | "weekend" | "season";
  events: PlannerEventRow[];
  hasMore: boolean;
  activeTimezone: string;
  sourceLabelById: Record<string, string>;
  sources: PlannerSourceRow[];
  familyProfiles: PlannerChildWithTeamsRow[];
  onTimezoneChange: (tz: string) => void;
  entitlement: "explorer" | "insider" | "weekend_pro" | "unknown";
};

function safeBrowserTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof tz === "string" && tz.trim()) return tz.trim();
  } catch {
    // ignore
  }
  return "UTC";
}

function isValidIanaTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function formatEventTimeRange(args: { startIso: string; endIso: string; timeZone: string }) {
  const start = new Date(args.startIso);
  const end = new Date(args.endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  const fmt = new Intl.DateTimeFormat(undefined, { timeZone: args.timeZone, hour: "numeric", minute: "2-digit" });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

type DetailState = { open: boolean; eventId: string | null };

export default function PlannerCalendar(props: Props) {
  const hasEvents = (props.events ?? []).length > 0;

  const [tzPickerOpen, setTzPickerOpen] = useState(false);
  const [detail, setDetail] = useState<DetailState>({ open: false, eventId: null });
  const [displayedMonth, setDisplayedMonth] = useState<{ year: number; month: number } | null>(null);
  const [weeksToShow, setWeeksToShow] = useState(6);
  const detailEvent = useMemo(() => {
    if (!detail.open || !detail.eventId) return null;
    return (props.events ?? []).find((e) => e.id === detail.eventId) ?? null;
  }, [detail.eventId, detail.open, props.events]);

  const calendarTz = isValidIanaTimeZone(props.activeTimezone) ? props.activeTimezone : "UTC";
  const activeFamilyChildIds = useMemo(() => {
    return (props.familyProfiles ?? [])
      .filter((childProfile) => !childProfile.is_archived)
      .map((childProfile) => String(childProfile.id))
      .filter(Boolean);
  }, [props.familyProfiles]);

  const familyProfilesById = useMemo(() => {
    const out = new Map<string, PlannerChildWithTeamsRow>();
    for (const childProfile of props.familyProfiles ?? []) {
      out.set(String(childProfile.id), childProfile);
    }
    return out;
  }, [props.familyProfiles]);

  function fallbackSourceLabel() {
    return "Connected calendar";
  }

  function labelForEventSource(e: PlannerEventRow) {
    if (String(e.source_type ?? "") !== "ics") return "Manual event";
    const sid = String((e as any)?.source_id ?? "").trim();
    if (!sid) return fallbackSourceLabel();
    const label = String((props.sourceLabelById as any)?.[sid] ?? "").trim();
    return label || fallbackSourceLabel();
  }

  function sourceLocationForEvent(e: PlannerEventRow) {
    return [e.address_text, e.city, e.state].map((v) => String(v ?? "").trim()).filter(Boolean).join(", ");
  }

  function linkedVenueLabelForEvent(e: PlannerEventRow) {
    const venue = e.linkedVenue ?? null;
    const name = String(venue?.name ?? "").trim();
    const address = String(venue?.address ?? "").trim();
    const cityState = [venue?.city, venue?.state].filter(Boolean).map((v) => String(v ?? "").trim()).filter(Boolean).join(", ");
    if (name || address || cityState) {
      return [name, address, cityState].filter(Boolean).join(" · ");
    }
    return "";
  }

  function venueLinesForEvent(e: PlannerEventRow) {
    const linked = linkedVenueLabelForEvent(e);
    const source = sourceLocationForEvent(e);
    const lines: string[] = [];
    if (linked) lines.push(`Linked venue: ${linked}`);
    if (source && source !== linked) lines.push(`Source location: ${source}`);
    return lines;
  }

  const sourceAssignmentsById = useMemo(() => {
    const out = new Map<string, PlannerSourceRow>();
    for (const source of props.sources ?? []) {
      out.set(String(source.id), source);
    }
    return out;
  }, [props.sources]);

  function sourceAssignmentForEvent(e: PlannerEventRow) {
    const sourceId = String(e.source_id ?? "").trim();
    const sourceAssignment = sourceId ? sourceAssignmentsById.get(sourceId) ?? null : null;
    return {
      childProfileId: String(sourceAssignment?.child_profile_id ?? e.child_profile_id ?? "").trim(),
      teamProfileId: String(sourceAssignment?.team_profile_id ?? e.team_profile_id ?? "").trim(),
    };
  }

  function childLabel(childId: string | null | undefined) {
    const normalizedChildId = String(childId ?? "").trim();
    if (!normalizedChildId) return null;
    const childProfile = familyProfilesById.get(normalizedChildId) ?? null;
    if (!childProfile) return null;
    return childProfile.is_archived ? `${childProfile.display_name} (Archived)` : childProfile.display_name;
  }

  function teamLabel(teamId: string | null | undefined) {
    const normalizedTeamId = String(teamId ?? "").trim();
    if (!normalizedTeamId) return null;
    for (const childProfile of props.familyProfiles ?? []) {
      const teamProfile = childProfile.teams.find((team) => String(team.id) === normalizedTeamId);
      if (!teamProfile) continue;
      return teamProfile.is_archived ? `${teamProfile.display_name} (Archived)` : teamProfile.display_name;
    }
    return null;
  }

  function assignmentLabelForEvent(e: PlannerEventRow) {
    const assignment = sourceAssignmentForEvent(e);
    const childName = childLabel(assignment.childProfileId);
    if (!childName) return null;
    const teamName = teamLabel(assignment.teamProfileId);
    return teamName ? `${childName} · ${teamName}` : childName;
  }

  function assignmentShortLabelForEvent(e: PlannerEventRow) {
    return childLabel(sourceAssignmentForEvent(e).childProfileId);
  }

  const timeZones = useMemo(() => {
    const base = [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Phoenix",
      "America/Anchorage",
      "Pacific/Honolulu",
      "UTC",
    ];
    const browserTz = safeBrowserTimeZone();
    const merged = new Set<string>(base);
    if (browserTz) merged.add(browserTz);
    if (calendarTz) merged.add(calendarTz);
    return Array.from(merged).filter(isValidIanaTimeZone).sort((a, b) => a.localeCompare(b));
  }, [calendarTz]);

  const sxCalendars = useMemo(() => {
    const out: Record<
      string,
      {
        colorName: string;
        label: string;
        lightColors: { main: string; container: string; onContainer: string };
      }
    > = {};

    out.unassigned = {
      colorName: "unassigned",
      label: "Unassigned",
      lightColors: {
        main: getUnassignedFamilyColorToken().main,
        container: getUnassignedFamilyColorToken().soft,
        onContainer: "#111827",
      },
    };

    for (const childId of activeFamilyChildIds) {
      const childName = childLabel(childId) || "Assigned child";
      const token = getFamilyColorToken(childId, activeFamilyChildIds);
      out[`family:${childId}`] = {
        colorName: `family_${childId.replace(/[^a-z0-9_]/gi, "").slice(0, 20).toLowerCase() || "child"}`,
        label: childName,
        lightColors: { main: token.main, container: token.soft, onContainer: "#0f172a" },
      };
    }

    return out;
  }, [activeFamilyChildIds]);

  const sxEvents = useMemo(() => {
    const list = props.events ?? [];
    return list.map((e) => {
      const title = String(e.title ?? "").trim() || "Untitled event";
      const shortFamilyLabel = assignmentShortLabelForEvent(e);
      const assignment = sourceAssignmentForEvent(e);
      const startInstant = Temporal.Instant.from(String(e.starts_at));
      const start = startInstant.toZonedDateTimeISO(calendarTz);
      const endInstant = e.ends_at ? Temporal.Instant.from(String(e.ends_at)) : startInstant.add({ hours: 1 });
      const end = endInstant.toZonedDateTimeISO(calendarTz);
      const childProfileId = String(assignment.childProfileId ?? "").trim();
      const calendarId = childProfileId ? `family:${childProfileId}` : "unassigned";
      return { id: e.id, title: shortFamilyLabel ? `${shortFamilyLabel} · ${title}` : title, start, end, calendarId };
    });
  }, [props.events, calendarTz, props.familyProfiles, props.sources]);

  const controls = useMemo(() => createCalendarControlsPlugin(), []);
  const eventsService = useMemo(() => createEventsServicePlugin(), []);
  const initialViewWasSetRef = useRef(false);
  const initialJumpToEventMonthRef = useRef(false);

  const views = useMemo(() => [createViewMonthGrid(), createViewMonthAgenda()] as any, []);
  const monthGridName = views.find((v: any) => v?.name?.includes?.("month") && v?.name?.includes?.("grid"))?.name ?? views[0]?.name;
  const monthAgendaName = views.find((v: any) => v?.name?.includes?.("month") && v?.name?.includes?.("agenda"))?.name ?? views[0]?.name;

  const calendar = useNextCalendarApp({
    theme: "shadcn",
    views,
    defaultView: window.innerWidth < 768 ? monthAgendaName : monthGridName,
    timezone: calendarTz,
    events: sxEvents as any,
    calendars: sxCalendars as any,
    plugins: [eventsService as any, controls as any],
    callbacks: {
      onRangeUpdate: (_range: any) => {
        try {
          const d = controls.getDate();
          if (d?.year && d?.month) setDisplayedMonth({ year: d.year, month: d.month });
        } catch {
          // ignore
        }
      },
      onRender: () => {
        if (!initialViewWasSetRef.current) {
          initialViewWasSetRef.current = true;
          try {
            controls.setTimezone(calendarTz as any);
            controls.setView((window.innerWidth < 768 ? monthAgendaName : monthGridName) as any);
          } catch {
            // ignore
          }
          // Seed the displayed month label from controls on first render
          try {
            const d = controls.getDate();
            if (d?.year && d?.month) setDisplayedMonth({ year: d.year, month: d.month });
          } catch {
            // ignore
          }
        }

        try {
          controls.setTimezone(calendarTz as any);
        } catch {
          // ignore
        }

        // Ensure the calendar opens to the first month that contains loaded events.
        // This runs once per mount and avoids showing an empty current month when all events are later.
        if (hasEvents && !initialJumpToEventMonthRef.current) {
          initialJumpToEventMonthRef.current = true;
          try {
            const earliest = (props.events ?? [])
              .slice()
              .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)) || String(a.id).localeCompare(String(b.id)))[0];
            if (earliest?.starts_at) {
              const zdt = Temporal.Instant.from(String(earliest.starts_at)).toZonedDateTimeISO(calendarTz);
              const firstOfMonth = Temporal.PlainDate.from({ year: zdt.year, month: zdt.month, day: 1 });
              // Defer one tick so the calendar controls are definitely ready.
              setTimeout(() => {
                try {
                  controls.setDate(firstOfMonth as any);
                } catch {
                  // ignore
                }
              }, 0);
            }
          } catch {
            // ignore
          }
        }
      },
      onEventClick: (calendarEvent: any) => {
        const id = String(calendarEvent?.id ?? "").trim();
        if (!id) return;
        setDetail({ open: true, eventId: id });
        try {
          const eventRow = (props.events ?? []).find((e) => String(e.id) === id) ?? null;
          const sourceType = String((eventRow as any)?.source_type ?? "").toLowerCase();
          const eventSourceType = sourceType === "ics" ? "ics" : sourceType === "manual" ? "manual" : "unknown";
          trackTiEvent("planner_calendar_event_detail_opened", {
            surface: "weekend_planner",
            entitlement: props.entitlement,
            event_source_type: eventSourceType,
          });
        } catch {
          // ignore; analytics must fail open
        }
      },
    },
  });

  useEffect(() => {
    try {
      controls.setTimezone(calendarTz as any);
    } catch {
      // ignore
    }
  }, [calendarTz, controls]);

  useEffect(() => {
    try { eventsService.set(sxEvents as any); } catch { /* ignore */ }
  }, [sxEvents, eventsService]);

  const navNextDisabled = useMemo(() => {
    if (props.scheduleView === "upcoming" && displayedMonth) {
      const now = new Date();
      const limitYear = now.getMonth() >= 10 ? now.getFullYear() + 1 : now.getFullYear();
      const limitMonth = ((now.getMonth() + 2) % 12) + 1;
      if (
        displayedMonth.year > limitYear ||
        (displayedMonth.year === limitYear && displayedMonth.month >= limitMonth)
      ) return true;
    }
    return weeksToShow >= 6;
  }, [props.scheduleView, displayedMonth, weeksToShow]);

  function goToAdjacentMonth(delta: 1 | -1) {
    try {
      const cur = controls.getDate();
      controls.setDate(cur.add({ months: delta }) as any);
    } catch {
      // ignore
    }
  }

  return (
    <div className={styles.calendarContainer}>
      <div className={styles.timezoneBar}>
        <div style={{ flex: 1 }} />
        <div className={styles.timezonePill}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span>{calendarTz}</span>
          {tzPickerOpen ? (
            <select
              className={styles.timezoneSelect}
              value={calendarTz}
              onChange={(e) => {
                props.onTimezoneChange(e.target.value);
                setTzPickerOpen(false);
              }}
            >
              {timeZones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          ) : (
            <button className={styles.timezoneChangeBtn} type="button" onClick={() => setTzPickerOpen(true)}>
              Change
            </button>
          )}
        </div>
      </div>

      {hasEvents ? (
        <div className={styles.calendarLegend}>
          <span className={styles.legendTitle}>Family colors</span>
          {activeFamilyChildIds.map((childId) => {
            const token = getFamilyColorToken(childId, activeFamilyChildIds);
            return (
              <span key={childId} className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: token.main }} aria-hidden="true" />
                <span>{childLabel(childId) || "Assigned child"}</span>
              </span>
            );
          })}
          <span className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: getUnassignedFamilyColorToken().main }} aria-hidden="true" />
            <span>Unassigned</span>
          </span>
        </div>
      ) : null}

      {!hasEvents ? (
        <div className={styles.calendarEmptyState}>
          <div style={{ fontWeight: 900 }}>No events to display.</div>
          <div className={styles.muted}>Connect a calendar or add events to get started.</div>
        </div>
      ) : (
        <div className={styles.calendarFrame}>
          <div className={styles.calendarNavBar}>
            <button
              className={styles.calendarNavBtn}
              type="button"
              aria-label="Previous month"
              onClick={() => goToAdjacentMonth(-1)}
            >
              &#8249;
            </button>
            <span className={styles.calendarNavLabel}>
              {displayedMonth
                ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
                    new Date(displayedMonth.year, displayedMonth.month - 1, 1)
                  )
                : ""}
            </span>
            <button
              className={styles.calendarNavBtn}
              type="button"
              aria-label="Next month"
              disabled={navNextDisabled}
              onClick={() => goToAdjacentMonth(1)}
            >
              &#8250;
            </button>
            <div className={styles.calendarZoomRow}>
              <button
                className={styles.calendarNavBtn}
                type="button"
                aria-label="Show fewer weeks"
                disabled={weeksToShow <= 1}
                onClick={() => setWeeksToShow((w) => Math.max(1, w - 1))}
              >
                &minus;
              </button>
              <span className={styles.calendarZoomLabel}>{weeksToShow}w</span>
              <button
                className={styles.calendarNavBtn}
                type="button"
                aria-label="Show more weeks"
                disabled={navNextDisabled}
                onClick={() => setWeeksToShow((w) => Math.min(6, w + 1))}
              >
                +
              </button>
            </div>
          </div>
          {props.scheduleView === "upcoming" ? (
            <div style={{ fontSize: 11, padding: "4px 14px 0", textAlign: "center", color: "#6b7280" }}>
              Events loaded for next 30 days
            </div>
          ) : null}
          <div className={styles.calendarWeekdayBar} aria-hidden="true">
            {(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const).map((d) => (
              <span key={d} className={styles.calendarWeekdayCell}>{d}</span>
            ))}
          </div>
          <div
            className={`sx-react-calendar-wrapper ${styles.sxWrapper}`}
            style={{ "--calendar-weeks-visible": weeksToShow } as React.CSSProperties}
          >
            <ScheduleXCalendar calendarApp={calendar} />
          </div>
        </div>
      )}

      {detail.open && detailEvent ? (
        <div className={styles.eventDetailOverlay} role="dialog" aria-modal="true" aria-label="Event details">
          <div className={styles.eventDetailPanel}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
              <div className={styles.eventDetailTitle}>{String(detailEvent.title ?? "").trim() || "Untitled event"}</div>
              <button
                className={styles.eventDetailClose}
                type="button"
                aria-label="Close"
                onClick={() => setDetail({ open: false, eventId: null })}
              >
                ×
              </button>
            </div>

            <div className={styles.eventDetailBody}>
              <div className={styles.eventDetailMeta}>
                {formatEventTimeRange({
                  startIso: detailEvent.starts_at,
                  endIso: detailEvent.ends_at ?? new Date(new Date(detailEvent.starts_at).getTime() + 60 * 60 * 1000).toISOString(),
                  timeZone: calendarTz,
                })}
              </div>

              {assignmentLabelForEvent(detailEvent) ? (
                <div className={styles.eventDetailBadgeRow}>
                  <span
                    className={styles.assignmentBadge}
                    style={{
                      background: getFamilyColorToken(sourceAssignmentForEvent(detailEvent).childProfileId, activeFamilyChildIds).soft,
                      borderColor: getFamilyColorToken(sourceAssignmentForEvent(detailEvent).childProfileId, activeFamilyChildIds).border,
                      color: getFamilyColorToken(sourceAssignmentForEvent(detailEvent).childProfileId, activeFamilyChildIds).text,
                    }}
                  >
                    {assignmentLabelForEvent(detailEvent)}
                  </span>
                </div>
              ) : null}

              {(() => {
                const lines = venueLinesForEvent(detailEvent);
                if (!lines.length) return null;
                return lines.map((line) => (
                  <div key={line} className={styles.eventDetailMeta}>
                    {line}
                  </div>
                ));
              })()}

              {detailEvent.notes ? <div className={styles.eventDetailNotes}>{detailEvent.notes}</div> : null}
            </div>

            <div className={styles.eventDetailSource}>
              Source: {labelForEventSource(detailEvent)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
