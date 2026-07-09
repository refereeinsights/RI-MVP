"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";

import styles from "./WeekendPlanner.module.css";

type PlannerGuestSharePanelState = {
  hasShare: boolean;
  shareActive: boolean;
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

export default function PlannerGuestSharePanelClient(props: {
  initialState: PlannerGuestSharePanelState;
  entitlement: "explorer" | "insider" | "weekend_pro" | "unknown";
  authState: "verified" | "unverified";
}) {
  const [state, setState] = useState(props.initialState);
  const [revealedUrl, setRevealedUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<ActionStatus>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const viewedRef = useRef(false);

  const detailsLabel = useMemo(() => {
    if (!state.hasShare) return "No guest link created yet.";
    if (state.paused) return "Sharing is paused until Weekend Pro is active again.";
    if (state.shareActive) return "Active family schedule link.";
    return "Guest link is currently inactive.";
  }, [state]);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    void trackTiEvent("planner_guest_share_panel_viewed", {
      surface: "guest_share",
      source_page_type: "planner",
      action_surface: "guest_share",
      auth_state: props.authState,
      entitlement: props.entitlement,
    });
  }, [props.authState, props.entitlement]);

  async function runAction(action: "create" | "reveal" | "regenerate" | "revoke") {
    setStatus("working");
    setErrorText(null);

    try {
      const response = await fetch("/api/weekend-planner/guest-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; state?: PlannerGuestSharePanelState; share_url?: string }
        | null;

      if (!response.ok || !payload?.ok || !payload.state) {
        throw new Error(payload?.error || "Could not update family sharing.");
      }

      setState(payload.state);
      if (action === "revoke") {
        setRevealedUrl(null);
        void trackTiEvent("planner_guest_share_disabled", {
          surface: "guest_share",
          source_page_type: "planner",
          action_surface: "guest_share",
          auth_state: props.authState,
          entitlement: props.entitlement,
        });
        setStatus("idle");
        return;
      }

      if (action === "create") {
        void trackTiEvent("planner_guest_share_created", {
          surface: "guest_share",
          source_page_type: "planner",
          action_surface: "guest_share",
          auth_state: props.authState,
          entitlement: props.entitlement,
        });
      } else if (action === "regenerate") {
        void trackTiEvent("planner_guest_share_regenerated", {
          surface: "guest_share",
          source_page_type: "planner",
          action_surface: "guest_share",
          auth_state: props.authState,
          entitlement: props.entitlement,
        });
      }

      const shareUrl = String(payload.share_url ?? "").trim();
      if (shareUrl) {
        setRevealedUrl(shareUrl);
        try {
          await navigator.clipboard.writeText(shareUrl);
          void trackTiEvent("planner_guest_share_copied", {
            surface: "guest_share",
            source_page_type: "planner",
            action_surface: "guest_share",
            auth_state: props.authState,
            entitlement: props.entitlement,
          });
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
      setErrorText(error instanceof Error ? error.message : "Could not update family sharing.");
      window.setTimeout(() => setStatus("idle"), 1800);
    }
  }

  return (
    <article className={styles.panelCard} data-planner-share-panel="true">
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Share family sports schedule</h2>
        <p className={styles.panelSub}>{state.helperText}</p>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.sharePanelStack}>
          <div className={styles.shareStatusRow}>
            <div>
              <div className={styles.shareStatusTitle}>{detailsLabel}</div>
              {state.lastAccessedAt ? (
                <div className={styles.smallHelper}>
                  Last opened: {formatLastAccessed(state.lastAccessedAt) ?? "Unavailable"}
                </div>
              ) : null}
            </div>
            {status === "copied" ? <div className={styles.shareSuccess}>Copied</div> : null}
          </div>

          {revealedUrl ? (
            <div className={styles.shareRevealWrap}>
              <label className={`label ${styles.labelDark}`} htmlFor="planner-family-share-url">
                Guest link
              </label>
              <input
                id="planner-family-share-url"
                className={`input ${styles.inputDark}`}
                value={revealedUrl}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
            </div>
          ) : null}

          {errorText ? <div className={styles.shareError}>{errorText}</div> : null}

          <div className={styles.shareButtonGrid}>
            {state.canCreate && !state.shareActive ? (
              <button className={styles.ctaFull} type="button" onClick={() => void runAction("create")} disabled={status === "working"}>
                Create guest link
              </button>
            ) : null}

            {state.canReveal ? (
              <button className={styles.ctaFull} type="button" onClick={() => void runAction("reveal")} disabled={status === "working"}>
                {revealedUrl ? "Copy guest link again" : "Reveal and copy guest link"}
              </button>
            ) : null}

            {state.canRegenerate ? (
              <button className={`${styles.ctaFull} ${styles.ctaSecondary}`} type="button" onClick={() => void runAction("regenerate")} disabled={status === "working"}>
                Regenerate guest link
              </button>
            ) : null}

            {state.canRevoke ? (
              <button className={styles.shareDangerBtn} type="button" onClick={() => void runAction("revoke")} disabled={status === "working"}>
                Revoke guest link
              </button>
            ) : null}
          </div>

          {!state.isWeekendPro ? (
            <div className={styles.smallHelper}>
              Family schedule sharing is included with Weekend Pro.
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
