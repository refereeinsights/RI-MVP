"use client";

import { useMemo, useState } from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";

type SaveTournamentButtonProps = {
  tournamentId: string;
  initialSaved: boolean;
  isLoggedIn: boolean;
  isVerified: boolean;
  returnTo: string;
};

const dismissedKey = (tournamentId: string) => `ti:saved_tournament_notify_prompt_dismissed:${tournamentId}`;

export default function SaveTournamentButton({
  tournamentId,
  initialSaved,
  isLoggedIn,
  isVerified,
  returnTo,
}: SaveTournamentButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [notifyPromptOpen, setNotifyPromptOpen] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);

  const redirectPath = useMemo(() => encodeURIComponent(returnTo || "/tournaments"), [returnTo]);

  const pushToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  };

  const markDismissedThisSession = () => {
    try {
      window.sessionStorage.setItem(dismissedKey(tournamentId), "1");
    } catch {
      // ignore
    }
  };

  const wasDismissedThisSession = () => {
    try {
      return window.sessionStorage.getItem(dismissedKey(tournamentId)) === "1";
    } catch {
      return false;
    }
  };

  async function onClick() {
    void trackTiEvent("Tournament Save Clicked", {
      tournamentId,
      saved_before: saved,
      logged_in: isLoggedIn,
      verified: isVerified,
    });

    if (!isLoggedIn) {
      void trackTiEvent("Tournament Save Auth Redirect", {
        tournamentId,
        reason: "not_logged_in",
        returnTo,
      });
      window.location.href = `/signup?returnTo=${redirectPath}`;
      return;
    }
    if (!isVerified) {
      void trackTiEvent("Tournament Save Auth Redirect", {
        tournamentId,
        reason: "email_unverified",
        returnTo,
      });
      window.location.href = `/verify-email?returnTo=${redirectPath}`;
      return;
    }
    if (busy) return;
    setBusy(true);

    const previous = saved;
    const next = !previous;
    setSaved(next);
    try {
      const resp = await fetch(`/api/saved-tournaments/${encodeURIComponent(tournamentId)}`, {
        method: next ? "POST" : "DELETE",
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        setSaved(previous);
        if (json?.code === "EMAIL_UNVERIFIED") {
          window.location.href = `/verify-email?returnTo=${redirectPath}`;
          return;
        }
        pushToast("Unable to update saved status.");
      } else {
        if (next) {
          void trackTiEvent("Tournament Saved", { tournamentId });
        }

        pushToast(next ? "Saved to My Tournaments." : "Removed from My Tournaments.");

        // Post-save notification opt-in prompt (soft opt-in, per-tournament).
        if (next && !wasDismissedThisSession() && json?.notify_on_changes === false) {
          setNotifyPromptOpen(true);
          void trackTiEvent("Saved Tournament Notify Prompt Shown", { tournamentId });
        } else {
          setNotifyPromptOpen(false);
        }
      }
    } catch {
      setSaved(previous);
      pushToast("Unable to update saved status.");
    } finally {
      setBusy(false);
    }
  }

  async function enableNotifications() {
    if (notifyBusy) return;
    setNotifyBusy(true);
    try {
      const resp = await fetch(`/api/saved-tournaments/${encodeURIComponent(tournamentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify_on_changes: true }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        pushToast("Unable to turn on updates.");
        return;
      }

      markDismissedThisSession();
      setNotifyPromptOpen(false);
      pushToast("Updates turned on.");
      void trackTiEvent("Saved Tournament Notify Enabled", { tournamentId });
    } catch {
      pushToast("Unable to turn on updates.");
    } finally {
      setNotifyBusy(false);
    }
  }

  function dismissNotificationsPrompt() {
    markDismissedThisSession();
    setNotifyPromptOpen(false);
    void trackTiEvent("Saved Tournament Notify Dismissed", { tournamentId });
  }

  const label = saved ? "Saved" : "Save";

  return (
    <div className="detailSaveWrap">
      <button
        type="button"
        className={`secondaryLink detailSaveButton${saved ? " detailSaveButton--saved" : ""}`}
        disabled={busy}
        onClick={onClick}
        aria-pressed={saved}
      >
        <span aria-hidden="true">{saved ? "🔖" : "🔖"}</span>
        <span>{busy ? "Saving..." : label}</span>
      </button>
      {toast ? <div className="detailSaveToast">{toast}</div> : null}
      {notifyPromptOpen ? (
        <div className="detailSavePrompt" role="status">
          <div className="detailSavePromptTitle">Tournament saved</div>
          <div className="detailSavePromptBody">Want email updates if dates, location, or the official link changes?</div>
          <div className="detailSavePromptActions">
            <button
              type="button"
              className="secondaryLink detailSavePromptPrimary"
              disabled={notifyBusy}
              onClick={enableNotifications}
            >
              {notifyBusy ? "Turning on..." : "Turn on updates"}
            </button>
            <button
              type="button"
              className="secondaryLink detailSavePromptSecondary"
              disabled={notifyBusy}
              onClick={dismissNotificationsPrompt}
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
