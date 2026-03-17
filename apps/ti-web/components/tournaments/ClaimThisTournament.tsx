"use client";

import * as React from "react";

type ClaimThisTournamentProps = {
  tournamentId: string;
  tournamentName: string;
  hasDirectorEmailOnFile: boolean;
  viewerEmail?: string;
};

export default function ClaimThisTournament({
  tournamentId,
  tournamentName,
  hasDirectorEmailOnFile,
  viewerEmail = "",
}: ClaimThisTournamentProps) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState(viewerEmail);
  const [message, setMessage] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent" | "review" | "done">("idle");
  const clickLoggedRef = React.useRef(false);

  async function logClickOnce() {
    if (clickLoggedRef.current) return;
    clickLoggedRef.current = true;
    await fetch("/api/tournament-claim/click", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tournamentId }),
    }).catch(() => null);
  }

  async function startClaim() {
    setStatus("sending");
    await fetch("/api/tournament-claim/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tournamentId,
        email,
        company: "", // honeypot
      }),
    }).catch(() => null);

    // Neutral success state (we intentionally don't reveal match/mismatch).
    setStatus("sent");
  }

  async function requestReview() {
    setStatus("sending");
    await fetch("/api/tournament-claim/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tournamentId,
        email,
        message,
        company: "", // honeypot
      }),
    }).catch(() => null);
    setStatus("done");
  }

  return (
    <section
      style={{
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(0,0,0,0.25)",
        backdropFilter: "blur(10px)",
        borderRadius: 16,
        padding: 14,
        display: "grid",
        gap: 10,
      }}
    >
      <button
        type="button"
        onClick={async () => {
          const next = !open;
          setOpen(next);
          if (next) await logClickOnce();
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          width: "100%",
          padding: 0,
          border: "none",
          background: "transparent",
          color: "#fff",
          cursor: "pointer",
          textAlign: "left",
        }}
        aria-expanded={open}
      >
        <div style={{ display: "grid", gap: 2 }}>
          <div style={{ fontWeight: 900, letterSpacing: "0.01em" }}>Are you the tournament director?</div>
          <div style={{ fontSize: 13, opacity: 0.92 }}>Claim edit access for this event.</div>
        </div>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.10)",
            display: "grid",
            placeItems: "center",
            fontWeight: 900,
          }}
          aria-hidden="true"
        >
          {open ? "▾" : "▸"}
        </div>
      </button>

      {open ? (
        <div style={{ display: "grid", gap: 10 }}>
          {hasDirectorEmailOnFile ? (
            <>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.92)" }}>
                Enter the tournament director email on file for <span style={{ fontWeight: 800 }}>{tournamentName}</span>.
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                <label style={{ display: "grid", gap: 6, flex: "1 1 260px" }}>
                  <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.95 }}>Email address</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="director@org.com"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "rgba(255,255,255,0.10)",
                      color: "#fff",
                      outline: "none",
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="cta ti-home-cta ti-home-cta-primary"
                  disabled={status === "sending"}
                  onClick={startClaim}
                  style={{ padding: "10px 14px" }}
                >
                  Continue
                </button>
              </div>

              {status === "sent" ? (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.92)" }}>
                  If we can verify that email, you&apos;ll receive a magic link shortly. After you sign in, refresh this page to
                  edit the listing.
                </div>
              ) : null}

              <div style={{ borderTop: "1px solid rgba(255,255,255,0.14)", paddingTop: 10, display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, opacity: 0.9 }}>
                  Not working? Request a manual review and we&apos;ll help connect you to this listing.
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Optional: add context (ex: correct director email, official site link, etc)"
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.10)",
                    color: "#fff",
                    outline: "none",
                    resize: "vertical",
                  }}
                />
                <button
                  type="button"
                  className="cta secondary"
                  disabled={status === "sending"}
                  onClick={requestReview}
                  style={{ justifySelf: "start" }}
                >
                  Request review
                </button>
                {status === "done" ? (
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.92)" }}>
                    Request received. We&apos;ll take a look.
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.92)" }}>
                We don&apos;t have a tournament director email on file yet. Request access and we&apos;ll review it manually.
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.95 }}>Your email address</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="director@org.com"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "rgba(255,255,255,0.10)",
                      color: "#fff",
                      outline: "none",
                    }}
                  />
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Optional: official site link, venue info, anything that helps us verify"
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.10)",
                    color: "#fff",
                    outline: "none",
                    resize: "vertical",
                  }}
                />
                <button
                  type="button"
                  className="cta ti-home-cta ti-home-cta-primary"
                  disabled={status === "sending"}
                  onClick={requestReview}
                  style={{ padding: "10px 14px", justifySelf: "start" }}
                >
                  Request access
                </button>
                {status === "done" ? (
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.92)" }}>
                    Request received. We&apos;ll take a look.
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

