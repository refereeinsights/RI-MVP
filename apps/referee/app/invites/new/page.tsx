"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

export default function InvitePage() {
  const searchParams = useSearchParams();
  const prefillSlug = searchParams.get("tournament_slug") || "";
  const prefillName = searchParams.get("tournament_name") || "";
  const [refereeEmail, setRefereeEmail] = useState("");
  const [refereeName, setRefereeName] = useState("");
  const [note, setNote] = useState("");
  const [tournamentSlug] = useState(prefillSlug);
  const [tournamentName] = useState(prefillName);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(refereeEmail.trim());
    return emailOk && status !== "sending";
  }, [refereeEmail, status]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referee_email: refereeEmail.trim(),
          referee_name: refereeName.trim() || null,
          note: note.trim() || null,
          tournament_slug: tournamentSlug || null,
          tournament_id: null,
          source_url: typeof window !== "undefined" ? window.location.href : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || "Unable to send invite right now.");
      }
      setStatus("success");
    } catch (err: any) {
      setError(err?.message || "Unable to send invite right now.");
      setStatus("error");
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8f6f1",
        display: "flex",
        justifyContent: "center",
        padding: "2.5rem 1rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          background: "#fff",
          borderRadius: 16,
          padding: "1.75rem",
          boxShadow: "0 14px 38px rgba(0,0,0,0.08)",
          border: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Invite a referee
        </p>
        <h1 style={{ marginTop: 4, marginBottom: 12 }}>Share the review link</h1>
        <p style={{ marginTop: 0, marginBottom: 16, lineHeight: 1.6 }}>
          We’ll email your teammate a link to leave insight after the event. Invites help us keep
          assignments transparent and fair.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Referee email *</span>
            <input
              type="email"
              required
              value={refereeEmail}
              onChange={(e) => setRefereeEmail(e.target.value)}
              placeholder="ref@example.com"
              style={inputStyle}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Referee name (optional)</span>
            <input
              type="text"
              value={refereeName}
              onChange={(e) => setRefereeName(e.target.value)}
              placeholder="Name"
              style={inputStyle}
            />
          </label>

          {(tournamentSlug || tournamentName) && (
            <div
              style={{
                background: "#f3f4f6",
                borderRadius: 12,
                padding: "10px 12px",
                border: "1px solid rgba(0,0,0,0.06)",
              }}
            >
              <strong>Tournament</strong>
              <div style={{ marginTop: 4, color: "#374151" }}>
                {tournamentName || tournamentSlug}
              </div>
            </div>
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a short note so they know why this matters."
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>

          {error && (
            <p style={{ color: "#b91c1c", margin: 0, fontSize: 14 }} role="alert">
              {error}
            </p>
          )}
          {status === "success" && (
            <p style={{ color: "#0f5132", margin: 0, fontSize: 14 }}>
              Invite sent. Thanks for helping the crew.
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              marginTop: 6,
              padding: "0.85rem 1.1rem",
              borderRadius: 12,
              border: "none",
              background: canSubmit ? "#0f3d2e" : "#9ca3af",
              color: "#fff",
              fontWeight: 700,
              cursor: canSubmit ? "pointer" : "not-allowed",
              transition: "transform 120ms ease",
            }}
          >
            {status === "sending" ? "Sending…" : "Send invite"}
          </button>
        </form>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  padding: "0.65rem 0.8rem",
  fontSize: 15,
  width: "100%",
  background: "#fff",
};
