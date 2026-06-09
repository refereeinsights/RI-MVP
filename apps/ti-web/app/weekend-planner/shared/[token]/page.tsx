import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import "../../../tournaments/tournaments.css";
import { loadPlannerGuestSharedView, plannerGuestShareBadgeStyle } from "@/lib/planner/guestShares";

import styles from "./SharedGuestPlanner.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Shared family sports schedule",
    description: "Private read-only family sports schedule shared from TournamentInsights.",
    robots: { index: false, follow: false },
  };
}

function formatDateTimeRange(startIso: string, endIso: string | null, timeZone: string | null) {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return "Schedule time unavailable";
  const resolvedTimeZone = String(timeZone ?? "").trim() || undefined;
  const day = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: resolvedTimeZone,
  });
  const startTime = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: resolvedTimeZone,
  });
  if (!endIso) return `${day} · ${startTime}`;
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return `${day} · ${startTime}`;
  const endTime = end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: resolvedTimeZone,
  });
  return `${day} · ${startTime} – ${endTime}`;
}

export default async function PlannerGuestSharePage({
  params,
}: {
  params: { token: string };
}) {
  noStore();
  const token = String(params.token ?? "").trim();
  if (!token) notFound();

  const view = await loadPlannerGuestSharedView(token);
  if (!view) notFound();

  return (
    <div className={`pitchWrap tournamentsWrap ${styles.shell}`}>
      <section className="field tournamentsField">
        <div className={styles.surface}>
          <article className={styles.heroCard}>
            <h1 className={styles.title}>Shared family sports schedule</h1>
            <p className={styles.subtext}>This is a read-only schedule shared from TournamentInsights.</p>
            <div className={styles.metaRow}>
              <span className={styles.pill}>Viewing: {view.scopeLabel}</span>
              <span className={styles.pill}>Window: {view.windowLabel}</span>
            </div>
          </article>

          {view.events.length ? (
            <div className={styles.eventList}>
              {view.events.map((event, index) => {
                const badgeStyle = plannerGuestShareBadgeStyle(event.assignmentColorToken);
                return (
                  <article className={styles.eventCard} key={`${event.startsAt}-${event.displayTitle}-${index}`}>
                    <div className={styles.eventHeader}>
                      <div>
                        <h2 className={styles.eventTitle}>{event.displayTitle}</h2>
                        <div className={styles.eventMeta}>
                          {formatDateTimeRange(event.startsAt, event.endsAt, event.timeZone)}
                          {event.fieldLabel ? ` · ${event.fieldLabel}` : ""}
                        </div>
                      </div>
                      <div className={styles.badgeRow}>
                        {event.assignmentLabel ? (
                          <span
                            className={styles.badge}
                            style={{
                              background: badgeStyle.soft,
                              borderColor: badgeStyle.border,
                              color: badgeStyle.text,
                            }}
                          >
                            {event.assignmentLabel}
                          </span>
                        ) : null}
                        {event.sourceLabel ? <span className={styles.badge}>{event.sourceLabel}</span> : null}
                      </div>
                    </div>

                    {event.linkedVenueName ? (
                      <div className={styles.eventMeta}>Linked venue: {event.linkedVenueName}</div>
                    ) : null}
                    {event.sourceLocationLabel ? (
                      <div className={styles.eventMeta}>Source location: {event.sourceLocationLabel}</div>
                    ) : null}

                    <div className={styles.linkRow}>
                      {event.linkedVenueHref ? (
                        <Link className={styles.actionLink} href={event.linkedVenueHref} target="_blank" rel="noopener noreferrer">
                          Open venue
                        </Link>
                      ) : null}
                      {event.directionsHref ? (
                        <a
                          className={`${styles.actionLink} ${styles.actionLinkSecondary}`}
                          href={event.directionsHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          referrerPolicy="no-referrer"
                        >
                          Directions
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <article className={styles.emptyCard}>
              <h2 className={styles.emptyTitle}>No upcoming events in the shared schedule.</h2>
              <p className={styles.emptyText}>The current shared window does not include any guest-safe family events.</p>
            </article>
          )}
        </div>
      </section>
    </div>
  );
}
