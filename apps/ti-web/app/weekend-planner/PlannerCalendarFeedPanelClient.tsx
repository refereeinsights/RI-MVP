"use client";

import { useMemo, useState } from "react";

import styles from "./WeekendPlanner.module.css";

type PlannerCalendarFeedPanelState = {
  hasFeed: boolean;
  feedActive: boolean;
  isWeekendPro: boolean;
  isUnverified: boolean;
  canCreate: boolean;
  canReveal: boolean;
  canRegenerate: boolean;
  canCopy: boolean;
  canRevoke: boolean;
  paused: boolean;
  helperText: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastAccessedAt: string | null;
};

type ActionStatus = "idle" | "working" | "copied" | "error";

function formatLastAccessed(value: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export default function PlannerCalendarFeedPanelClient(props: {
  initialState: PlannerCalendarFeedPanelState;
}) {
  const [state, setState] = useState(props.initialState);
  const [revealedUrl, setRevealedUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<ActionStatus>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);

  const detailsLabel = useMemo(() => {
    if (!state.hasFeed) return "No calendar subscription URL created yet.";
    if (state.paused) return "Calendar subscription is paused until Weekend Pro is active again.";
    if (state.feedActive) return "Active private family calendar subscription.";
    return "Calendar subscription is currently inactive.";
  }, [state]);

  async function runAction(action: "create" | "reveal" | "regenerate" | "revoke") {
    setStatus("working");
    setErrorText(null);

    try {
      const response = await fetch("/api/weekend-planner/calendar-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; state?: PlannerCalendarFeedPanelState; feed_url?: string }
        | null;

      if (!response.ok || !payload?.ok || !payload.state) {
        throw new Error(payload?.error || "Could not update calendar subscription.");
      }

      setState(payload.state);
      if (action === "revoke") {
        setRevealedUrl(null);
        setStatus("idle");
        return;
      }

      const feedUrl = String(payload.feed_url ?? "").trim();
      if (feedUrl) {
        setRevealedUrl(feedUrl);
        try {
          await navigator.clipboard.writeText(feedUrl);
          setStatus("copied");
          window.setTimeout(() => setStatus("idle"), 1400);
          return;
        } catch {
          // fall through to idle with revealed URL
        }
      }

      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setErrorText(error instanceof Error ? error.message : "Could not update calendar subscription.");
      window.setTimeout(() => setStatus("idle"), 1800);
    }
  }

  return (
    <article className={styles.panelCard} data-planner-calendar-feed-panel="true">
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Subscribe in your calendar</h2>
        <p className={styles.panelSub}>{state.helperText}</p>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.sharePanelStack}>
          <div className={styles.shareStatusRow}>
            <div>
              <div className={styles.shareStatusTitle}>{detailsLabel}</div>
              {state.lastAccessedAt ? (
                <div className={styles.smallHelper}>
                  Last calendar fetch: {formatLastAccessed(state.lastAccessedAt) ?? "Unavailable"}
                </div>
              ) : null}
            </div>
            {status === "copied" ? <div className={styles.shareSuccess}>Copied</div> : null}
          </div>

          {revealedUrl ? (
            <div className={styles.shareRevealWrap}>
              <label className={`label ${styles.labelDark}`} htmlFor="planner-family-calendar-feed-url">
                Calendar subscription URL
              </label>
              <input
                id="planner-family-calendar-feed-url"
                className={`input ${styles.inputDark}`}
                value={revealedUrl}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
            </div>
          ) : null}

          {errorText ? <div className={styles.shareError}>{errorText}</div> : null}

          <div className={styles.shareButtonGrid}>
            {state.canCreate && !state.feedActive ? (
              <button className={styles.ctaFull} type="button" onClick={() => void runAction("create")} disabled={status === "working"}>
                Create calendar feed
              </button>
            ) : null}

            {state.canReveal ? (
              <button className={styles.ctaFull} type="button" onClick={() => void runAction("reveal")} disabled={status === "working"}>
                {revealedUrl ? "Copy calendar URL again" : "Reveal and copy calendar URL"}
              </button>
            ) : null}

            {state.canRegenerate ? (
              <button className={`${styles.ctaFull} ${styles.ctaSecondary}`} type="button" onClick={() => void runAction("regenerate")} disabled={status === "working"}>
                Regenerate calendar URL
              </button>
            ) : null}

            {state.canRevoke ? (
              <button className={styles.shareDangerBtn} type="button" onClick={() => void runAction("revoke")} disabled={status === "working"}>
                Revoke calendar URL
              </button>
            ) : null}
          </div>

          <div className={styles.calendarFeedCaveat}>
            Calendar apps control how often subscribed calendars refresh. Updates may not appear immediately,
            especially in Google Calendar.
          </div>
          <div className={styles.calendarFeedWarning}>
            Revoking or regenerating the calendar URL stops future refreshes, but external calendar apps may retain
            previously fetched events until they refresh or the subscription is removed.
          </div>

          <div className={styles.calendarFeedHowTo}>
            <div className={styles.calendarFeedHowToTitle}>How to add it</div>
            <ul className={styles.calendarFeedHowToList}>
              <li>Apple Calendar: open the link on iPhone or add it in Calendar subscription settings.</li>
              <li>Google Calendar: use “Add calendar by URL.” Google controls refresh timing.</li>
              <li>Outlook: use “Subscribe from web” and paste the URL.</li>
            </ul>
          </div>

          {!state.isWeekendPro ? (
            <div className={styles.smallHelper}>
              Calendar subscriptions are included with Weekend Pro.
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
