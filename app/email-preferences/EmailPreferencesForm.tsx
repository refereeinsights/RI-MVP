"use client";

import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";

type SaveStatus = "idle" | "saving" | "success" | "error";

type EmailPreferencesFormProps = {
  userId: string;
  initialTournamentOptIn: boolean;
  initialMarketingOptIn: boolean;
};

export default function EmailPreferencesForm({
  userId,
  initialTournamentOptIn,
  initialMarketingOptIn,
}: EmailPreferencesFormProps) {
  const [tournamentUpdates, setTournamentUpdates] = useState(initialTournamentOptIn);
  const [marketingUpdates, setMarketingUpdates] = useState(initialMarketingOptIn);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  function resetNotice() {
    setError(null);
    setStatus((prev) => (prev === "saving" ? prev : "idle"));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("saving");
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          email_opt_in_tournaments: tournamentUpdates,
          email_opt_in_marketing: marketingUpdates,
        })
        .eq("user_id", userId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setStatus("success");
    } catch (err: any) {
      setStatus("error");
      setError(err?.message ?? "Unable to update your preferences.");
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={tournamentUpdates}
          onChange={(event) => {
            setTournamentUpdates(event.target.checked);
            resetNotice();
          }}
        />
        <span>
          I want to receive tournament updates and relevant referee information{" "}
          <span style={styles.recommended}>(recommended)</span>.
        </span>
      </label>

      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={marketingUpdates}
          onChange={(event) => {
            setMarketingUpdates(event.target.checked);
            resetNotice();
          }}
        />
        <span>I agree to receive marketing and promotional messages from Referee Insights.</span>
      </label>

      {error && (
        <div style={styles.error}>
          {error}
        </div>
      )}

      {status === "success" && !error && (
        <div style={styles.success}>Your preferences have been saved.</div>
      )}

      <button type="submit" style={styles.button} disabled={status === "saving"}>
        {status === "saving" ? "Saving..." : "Save preferences"}
      </button>
    </form>
  );
}

const styles: Record<string, CSSProperties> = {
  form: { display: "grid", gap: 16, marginTop: 20 },
  checkboxRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    fontSize: 15,
    lineHeight: 1.45,
  },
  recommended: { fontSize: 13, color: "#666" },
  button: {
    border: "none",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
    background: "#111",
    color: "#fff",
  },
  success: {
    fontSize: 14,
    color: "#0f8b47",
    border: "1px solid rgba(15,139,71,0.35)",
    background: "rgba(15,139,71,0.08)",
    borderRadius: 12,
    padding: "8px 12px",
  },
  error: {
    fontSize: 14,
    color: "#b00020",
    border: "1px solid rgba(176,0,32,0.35)",
    background: "rgba(176,0,32,0.08)",
    borderRadius: 12,
    padding: "8px 12px",
  },
};
