"use client";

import React, { useMemo, useState } from "react";

function ReviewDisclaimerModal({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div style={modalStyles.backdrop} role="dialog" aria-modal="true">
      <div style={modalStyles.modal}>
        <h2 style={{ marginTop: 0 }}>Before You Submit</h2>
        <p style={{ lineHeight: 1.5 }}>
          Reviews on Referee Insights represent <strong>personal opinions</strong>{" "}
          and experiences.
        </p>
        <p style={{ lineHeight: 1.5 }}>
          Do not include false statements, personal attacks, private information,
          or content you do not have the right to share.
        </p>
        <p style={{ lineHeight: 1.5 }}>
          Referee Insights does not verify reviews and is not responsible for
          disputes arising from submitted content.
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={modalStyles.secondary}>
            Cancel
          </button>
          <button onClick={onConfirm} style={modalStyles.primary}>
            I understand and agree
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NewReviewPage() {
  const [subjectName, setSubjectName] = useState("");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return (
      subjectName.trim().length > 2 &&
      text.trim().length > 10 &&
      acknowledged &&
      !loading
    );
  }, [subjectName, text, acknowledged, loading]);

  async function doSubmit() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_name: subjectName.trim(),
          rating,
          text: text.trim(),
          disclaimer_acknowledged: true,
          disclaimer_acknowledged_at: new Date().toISOString(),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(json?.error ?? "Failed to submit review.");
        return;
      }

      setMsg("Review submitted.");
      setSubjectName("");
      setRating(5);
      setText("");
      setAcknowledged(false);
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to submit review.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    // Force the modal before first submit attempt
    if (!acknowledged) {
      setShowModal(true);
      return;
    }

    void doSubmit();
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Write a review</h1>
        <p style={styles.muted}>
          Reviews are opinions. Please follow our{" "}
          <a href="/disclaimer">review disclaimer</a>.
        </p>

        <form onSubmit={onSubmit} style={styles.form}>
          <label style={styles.label}>
            Referee / Subject name
            <input
              style={styles.input}
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder="e.g., John D."
              required
            />
          </label>

          <label style={styles.label}>
            Rating
            <select
              style={styles.input}
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.label}>
            Review
            <textarea
              style={{ ...styles.input, minHeight: 140 }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write your experience clearly and respectfully."
              required
            />
          </label>

          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>
              I understand the <a href="/disclaimer">Review & Content Disclaimer</a>.
            </span>
          </label>

          {msg && <div style={styles.notice}>{msg}</div>}

          <button type="submit" disabled={!canSubmit} style={styles.button}>
            {loading ? "Submitting..." : "Submit review"}
          </button>
        </form>

        <ReviewDisclaimerModal
          open={showModal}
          onCancel={() => setShowModal(false)}
          onConfirm={() => {
            setAcknowledged(true);
            setShowModal(false);
            // After acknowledging, submit immediately if inputs are valid
            if (subjectName.trim().length > 2 && text.trim().length > 10) {
              void doSubmit();
            }
          }}
        />
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { padding: "40px 16px", display: "flex", justifyContent: "center" },
  card: {
    width: "100%",
    maxWidth: 680,
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 16,
    padding: 20,
  },
  h1: { margin: 0, fontSize: 28 },
  muted: { opacity: 0.75, marginTop: 8, marginBottom: 16, lineHeight: 1.4 },
  form: { display: "grid", gap: 12 },
  label: { display: "grid", gap: 6, fontWeight: 600 },
  input: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.2)",
    fontSize: 14,
  },
  checkboxRow: { display: "flex", gap: 10, alignItems: "flex-start", lineHeight: 1.3 },
  button: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
  },
  notice: {
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.2)",
  },
};

const modalStyles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: "100%",
    maxWidth: 560,
    background: "white",
    borderRadius: 16,
    padding: 18,
  },
  primary: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
  },
  secondary: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.2)",
    cursor: "pointer",
    fontWeight: 700,
    background: "transparent",
  },
};
