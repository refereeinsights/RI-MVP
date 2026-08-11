"use client";

import * as React from "react";

const ROLE_OPTIONS = [
  "Tournament Director",
  "Club / Organization Administrator",
  "Event Staff",
  "Other",
] as const;

type ClaimThisTournamentProps = {
  tournamentId: string;
  tournamentName: string;
  hasDirectorEmailOnFile: boolean;
  viewerEmail?: string;
  variant?: "card" | "inline";
};

type Step = "email" | "review" | "done-magic-link" | "done-review";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.10)",
  color: "#fff",
  outline: "none",
  boxSizing: "border-box",
  fontSize: 14,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 5,
  fontSize: 12,
  fontWeight: 800,
  color: "rgba(255,255,255,0.95)",
};

export default function ClaimThisTournament({
  tournamentId,
  tournamentName,
  hasDirectorEmailOnFile,
  viewerEmail = "",
  variant = "card",
}: ClaimThisTournamentProps) {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>("email");
  const [email, setEmail] = React.useState(viewerEmail);
  const [submitting, setSubmitting] = React.useState(false);
  const [reviewFields, setReviewFields] = React.useState({
    name: "",
    role: "Tournament Director",
    organization: "",
    website: "",
    phone: "",
    note: "",
  });
  const [reviewError, setReviewError] = React.useState("");
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
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/tournament-claim/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tournamentId, email, company: "" }),
      });
      const json = await res.json().catch(() => ({}));
      if (json?.requiresReview) {
        setStep("review");
      } else {
        setStep("done-magic-link");
      }
    } catch {
      // Fail open: on network error, show the magic-link message since the request
      // may have succeeded before the connection dropped.
      setStep("done-magic-link");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReview() {
    if (!reviewFields.name.trim() || !reviewFields.organization.trim()) {
      setReviewError("Please enter your name and organization before submitting.");
      return;
    }
    setReviewError("");
    setSubmitting(true);
    try {
      await fetch("/api/tournament-claim/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tournamentId,
          email,
          company: "",
          name: reviewFields.name,
          role: reviewFields.role,
          organization: reviewFields.organization,
          website: reviewFields.website,
          phone: reviewFields.phone,
          note: reviewFields.note,
        }),
      }).catch(() => null);
    } finally {
      setStep("done-review");
      setSubmitting(false);
    }
  }

  function setField(field: keyof typeof reviewFields) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setReviewFields((f) => ({ ...f, [field]: e.target.value }));
  }

  return (
    <section
      style={
        variant === "inline"
          ? { display: "grid", gap: 8, alignContent: "start" }
          : {
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(0,0,0,0.25)",
              backdropFilter: "blur(10px)",
              borderRadius: 16,
              padding: 14,
              display: "grid",
              gap: 10,
            }
      }
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
          fontSize: variant === "inline" ? 13 : undefined,
          fontWeight: variant === "inline" ? 900 : undefined,
          textDecoration: variant === "inline" ? "underline" : undefined,
        }}
        aria-expanded={open}
      >
        {variant === "inline" ? (
          <div>Claim edit access →</div>
        ) : (
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ fontWeight: 900, letterSpacing: "0.01em" }}>Manage this tournament</div>
            <div style={{ fontSize: 13, opacity: 0.92 }}>
              Keep your tournament information accurate for teams and families.
            </div>
          </div>
        )}
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
            flex: "0 0 auto",
            opacity: variant === "inline" ? 0.85 : 1,
          }}
          aria-hidden="true"
        >
          {open ? "▾" : "▸"}
        </div>
      </button>

      {open ? (
        <div
          style={
            variant === "inline"
              ? {
                  display: "grid",
                  gap: 12,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(0,0,0,0.25)",
                  backdropFilter: "blur(10px)",
                  borderRadius: 16,
                  padding: 14,
                }
              : { display: "grid", gap: 12 }
          }
        >
          {step === "email" && (
            <>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.92)" }}>
                {hasDirectorEmailOnFile ? (
                  <>
                    Enter the tournament director email on file for{" "}
                    <strong>{tournamentName}</strong>. If it matches, we&apos;ll send you a
                    sign-in link.
                  </>
                ) : (
                  <>
                    We don&apos;t have a director email on file yet. Enter your email and
                    we&apos;ll walk you through verification.
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                <label style={{ ...labelStyle, flex: "1 1 220px" }}>
                  Email address
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") startClaim(); }}
                    placeholder="director@org.com"
                    style={inputStyle}
                  />
                </label>
                <button
                  type="button"
                  className="cta ti-home-cta ti-home-cta-primary"
                  onClick={startClaim}
                  disabled={submitting || !email.trim()}
                  style={{ padding: "10px 14px" }}
                >
                  {submitting ? "Checking…" : "Continue"}
                </button>
              </div>
            </>
          )}

          {step === "review" && (
            <>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.92)" }}>
                We couldn&apos;t verify this claim automatically. Tell us a little about your
                connection to <strong>{tournamentName}</strong> and we&apos;ll review it.
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 10,
                  }}
                >
                  <label style={labelStyle}>
                    Full name <Req />
                    <input
                      type="text"
                      value={reviewFields.name}
                      onChange={setField("name")}
                      placeholder="Jane Smith"
                      maxLength={120}
                      style={inputStyle}
                    />
                  </label>
                  <label style={labelStyle}>
                    Role <Req />
                    <select
                      value={reviewFields.role}
                      onChange={setField("role")}
                      style={{ ...inputStyle, appearance: "auto" as any }}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r} style={{ background: "#1e293b", color: "#fff" }}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label style={labelStyle}>
                  Organization / club name <Req />
                  <input
                    type="text"
                    value={reviewFields.organization}
                    onChange={setField("organization")}
                    placeholder="Tri-State Soccer Club"
                    maxLength={200}
                    style={inputStyle}
                  />
                </label>

                <div style={{ display: "grid", gap: 4 }}>
                  <label style={labelStyle}>
                    Official website
                    <input
                      type="url"
                      value={reviewFields.website}
                      onChange={setField("website")}
                      placeholder="https://yourclub.com"
                      maxLength={500}
                      style={inputStyle}
                    />
                  </label>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>
                    A website helps us verify your connection quickly.
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 10,
                  }}
                >
                  <label style={labelStyle}>
                    Email
                    <input
                      type="email"
                      value={email}
                      readOnly
                      style={{ ...inputStyle, opacity: 0.65 }}
                    />
                  </label>
                  <label style={labelStyle}>
                    Phone (optional)
                    <input
                      type="tel"
                      value={reviewFields.phone}
                      onChange={setField("phone")}
                      placeholder="555-867-5309"
                      maxLength={30}
                      style={inputStyle}
                    />
                  </label>
                </div>

                <label style={labelStyle}>
                  How are you connected to this tournament? (optional)
                  <textarea
                    value={reviewFields.note}
                    onChange={setField("note")}
                    placeholder="e.g. I've directed this event for 5 years. Official site is at…"
                    rows={3}
                    maxLength={2000}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </label>

                {reviewError && (
                  <div style={{ fontSize: 12, color: "rgba(255,160,160,0.95)" }}>
                    {reviewError}
                  </div>
                )}

                <button
                  type="button"
                  className="cta ti-home-cta ti-home-cta-primary"
                  onClick={submitReview}
                  disabled={submitting}
                  style={{ padding: "10px 14px", justifySelf: "start" }}
                >
                  {submitting ? "Submitting…" : "Submit for review"}
                </button>
              </div>
            </>
          )}

          {step === "done-magic-link" && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.92)" }}>
              If we can verify that email, you&apos;ll receive a sign-in link shortly. After
              you sign in, you&apos;ll have edit access to this listing.
            </div>
          )}

          {step === "done-review" && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.92)" }}>
              Request received. We&apos;ll review it and be in touch.
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function Req() {
  return <span style={{ color: "rgba(255,120,120,0.9)", fontWeight: 400 }}>*</span>;
}
