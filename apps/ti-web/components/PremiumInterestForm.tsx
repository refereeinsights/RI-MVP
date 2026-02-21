"use client";

import { FormEvent, useState } from "react";

type PremiumInterestFormProps = {
  initialEmail?: string | null;
  compact?: boolean;
};

export default function PremiumInterestForm({
  initialEmail = "",
  compact = false,
}: PremiumInterestFormProps) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmail = email.trim();
    if (!nextEmail) {
      setStatus("error");
      setMessage("Enter an email address.");
      return;
    }
    setStatus("saving");
    setMessage("");
    try {
      const resp = await fetch("/api/premium-interest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: nextEmail }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        setStatus("error");
        setMessage(json?.error ?? "Unable to save your request.");
        return;
      }
      setStatus("saved");
      setMessage("Thanks. We will notify you when Weekend Pro is available.");
    } catch {
      setStatus("error");
      setMessage("Unable to save your request.");
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: compact ? 320 : 460 }}>
      <div style={{ fontSize: compact ? 12 : 13, fontWeight: 700 }}>
        Weekend Pro coming soon — get notified
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          style={{
            flex: "1 1 220px",
            minWidth: 200,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.35)",
            background: "rgba(10,20,18,0.35)",
            color: "#fff",
          }}
        />
        <button
          type="submit"
          disabled={status === "saving"}
          className="secondaryLink"
          style={{ minWidth: 108 }}
        >
          {status === "saving" ? "Saving..." : "Notify me"}
        </button>
      </div>
      {message ? (
        <div
          style={{
            fontSize: 12,
            color: status === "saved" ? "#d1fae5" : "#fecaca",
          }}
        >
          {message}
        </div>
      ) : null}
    </form>
  );
}
