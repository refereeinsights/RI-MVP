"use client";

import { useState } from "react";
import styles from "./AccountPage.module.css";

export default function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const text = await res.text();
      const json = text ? (JSON.parse(text) as any) : null;
      if (!res.ok || !json?.ok || !json?.url) {
        throw new Error(json?.error || json?.message || `portal_failed_${res.status}`);
      }
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setError(e?.message || "Unable to open billing portal right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className={styles.secondaryAction}
        style={{ width: "fit-content" }}
      >
        {loading ? "Opening..." : "Manage billing"}
      </button>
      {error ? <div className={styles.inlineError}>{error}</div> : null}
    </div>
  );
}
