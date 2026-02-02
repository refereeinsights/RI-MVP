"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AcceptTermsModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleAccept = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/assignors/accept-terms", {
        method: "POST",
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || "Unable to accept terms.");
      }
      setOpen(false);
      router.push("/assignors?terms=accepted");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Unable to accept terms.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn"
        style={{
          padding: "8px 14px",
          borderRadius: 999,
          background: "#0f172a",
          color: "#fff",
          border: "1px solid #0f172a",
        }}
      >
        Review terms &amp; accept
      </button>

      {open ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              width: "100%",
              maxWidth: 720,
              background: "#fff",
              borderRadius: 18,
              boxShadow: "0 30px 60px rgba(0,0,0,0.2)",
              padding: 20,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Contact Access Terms</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 18,
                  cursor: "pointer",
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6, color: "#0b1f14" }}>
              <p style={{ marginTop: 0 }}>
                Referee Insights provides assignor contact information to help referees find officiating opportunities
                and communicate professionally.
              </p>
              <p>By accessing assignor contact details, you agree that you will:</p>
              <ul style={{ marginTop: 0, paddingLeft: 18 }}>
                <li>Use contact information only for legitimate officiating-related communication</li>
                <li>Not scrape, harvest, copy, or resell contact details</li>
                <li>Not send spam, harassment, or unsolicited commercial messages</li>
                <li>Respect requests to stop contacting an assignor</li>
              </ul>
              <p style={{ marginBottom: 0 }}>
                Misuse of assignor contact information may result in suspension or permanent loss of access to
                Referee Insights.
              </p>
            </div>

            {error ? (
              <div style={{ marginTop: 12, color: "#b91c1c", fontSize: 13 }}>{error}</div>
            ) : null}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn btnSecondary"
                style={{
                  background: "#ffffff",
                  color: "#0f172a",
                  border: "1px solid #0f172a",
                  padding: "8px 14px",
                  borderRadius: 999,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAccept}
                className="btn"
                disabled={loading}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  background: "#0f172a",
                  color: "#fff",
                  border: "1px solid #0f172a",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Saving..." : "I agree & reveal"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
