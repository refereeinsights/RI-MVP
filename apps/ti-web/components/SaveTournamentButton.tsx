"use client";

import { useMemo, useState } from "react";

type SaveTournamentButtonProps = {
  tournamentId: string;
  initialSaved: boolean;
  isLoggedIn: boolean;
  isVerified: boolean;
  returnTo: string;
};

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

  const redirectPath = useMemo(() => encodeURIComponent(returnTo || "/tournaments"), [returnTo]);

  const pushToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  };

  async function onClick() {
    if (!isLoggedIn) {
      window.location.href = `/signup?returnTo=${redirectPath}`;
      return;
    }
    if (!isVerified) {
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
        pushToast(next ? "Saved to My Tournaments." : "Removed from My Tournaments.");
      }
    } catch {
      setSaved(previous);
      pushToast("Unable to update saved status.");
    } finally {
      setBusy(false);
    }
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
    </div>
  );
}
