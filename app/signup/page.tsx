"use client";

import { useMemo, useState } from "react";
import { signUpUser, isHandleAvailable, normalizeHandle, Sport } from "@/lib/auth";

const SPORTS: { key: Sport; label: string; icon: string }[] = [
  { key: "soccer", label: "Soccer", icon: "⚽" },
  { key: "basketball", label: "Basketball", icon: "🏀" },
  { key: "football", label: "Football", icon: "🏈" },
];

type BadgePreview = {
  code: string;
  label: string;
  icon: string;
  description: string;
};

const BADGES: BadgePreview[] = [
  {
    code: "founding_referee",
    label: "Founding Referee",
    icon: "⭐",
    description: "Awarded to early adopters during the founding period.",
  },
  {
    code: "verified_referee",
    label: "Verified Referee",
    icon: "✅",
    description: "Available after you request verification and an admin approves it.",
  },
  {
    code: "top_contributor",
    label: "Top Contributor",
    icon: "🏅",
    description: "Earned through high-quality contributions over time.",
  },
];

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [realName, setRealName] = useState("");
  const [yearsRefereeing, setYearsRefereeing] = useState<string>("");

  const [sports, setSports] = useState<Sport[]>([]);

  const [checkingHandle, setCheckingHandle] = useState(false);
  const [handleAvailable, setHandleAvailable] = useState<boolean | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function toggleSport(s: Sport) {
    setSports((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function checkHandle(value: string) {
    const normalized = normalizeHandle(value);
    setHandle(normalized);

    if (normalized.length < 3) {
      setHandleAvailable(null);
      return;
    }

    setCheckingHandle(true);
    setError(null);

    try {
      const available = await isHandleAvailable(normalized);
      setHandleAvailable(available);
    } catch {
      setError("Unable to check handle availability");
      setHandleAvailable(null);
    } finally {
      setCheckingHandle(false);
    }
  }

  const yearsNum = useMemo(() => {
    const t = yearsRefereeing.trim();
    if (!t) return null;
    const n = Number.parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
  }, [yearsRefereeing]);

  // 1) Disable submit until valid
  const isEmailValid = useMemo(() => /\S+@\S+\.\S+/.test(email.trim()), [email]);
  const isPasswordValid = useMemo(() => password.length >= 8, [password]);
  const isRealNameValid = useMemo(() => realName.trim().length >= 2, [realName]);
  const normalizedHandle = useMemo(() => normalizeHandle(handle), [handle]);
  const isHandleBasicValid = useMemo(
    () => /^[a-z0-9_]{3,20}$/.test(normalizedHandle),
    [normalizedHandle]
  );
  const isYearsValid = useMemo(() => yearsNum === null || (yearsNum >= 0 && yearsNum <= 80), [yearsNum]);
  const hasSport = useMemo(() => sports.length > 0, [sports]);

  const canSubmit = useMemo(() => {
    return (
      isEmailValid &&
      isPasswordValid &&
      isRealNameValid &&
      isHandleBasicValid &&
      isYearsValid &&
      hasSport &&
      handleAvailable === true &&
      !checkingHandle
    );
  }, [
    isEmailValid,
    isPasswordValid,
    isRealNameValid,
    isHandleBasicValid,
    isYearsValid,
    hasSport,
    handleAvailable,
    checkingHandle,
  ]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!canSubmit) return;

    try {
      await signUpUser({
        email,
        password,
        handle,
        realName,
        yearsRefereeing: yearsNum,
        sports,
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message ?? "Signup failed");
    }
  }

  return (
    <div className="page">
      <div className={`card ${success ? "cardSuccess" : ""}`}>
        {success ? (
          // 4) Post-signup landing page + 2) success animation
          <div className="center fadeInUp">
            <div className="successIcon" aria-hidden>
              🎉
            </div>
            <h1 className="title">You’re almost in!</h1>
            <p className="subtext">
              We sent a verification link to <strong>{email.trim()}</strong>.
            </p>

            <div className="steps">
              <div className="step">
                <div className="stepNum">1</div>
                <div className="stepBody">
                  <div className="stepTitle">Verify your email</div>
                  <div className="stepText">
                    Open the email and click the link. This helps protect the community.
                  </div>
                </div>
              </div>
              <div className="step">
                <div className="stepNum">2</div>
                <div className="stepBody">
                  <div className="stepTitle">Complete your profile</div>
                  <div className="stepText">
                    Add any missing details later. Your real name stays private.
                  </div>
                </div>
              </div>
              <div className="step">
                <div className="stepNum">3</div>
                <div className="stepBody">
                  <div className="stepTitle">Start contributing</div>
                  <div className="stepText">
                    Post reviews with your handle, build reputation, and earn badges.
                  </div>
                </div>
              </div>
            </div>

            <div className="smallNote">
              Didn’t get an email? Check spam or try again in a minute.
            </div>
          </div>
        ) : (
          <>
            <div className="center">
              <h1 className="title">Join Referee Insights</h1>
              <p className="subtext">Built by referees. Trusted by the community.</p>
            </div>

            {error && <div className="error">{error}</div>}

            <form onSubmit={handleSubmit} className="form">
              <div className="field">
                <label className="label">Email</label>
                <input
                  className="input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {!isEmailValid && email.trim().length > 0 && (
                  <div className="hint bad">Enter a valid email address</div>
                )}
              </div>

              <div className="field">
                <label className="label">Password</label>
                <input
                  className="input"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <div className={`hint ${isPasswordValid ? "" : "bad"}`}>
                  At least 8 characters
                </div>
              </div>

              <div className="field">
                <label className="label">Public handle</label>
                <input
                  className="input"
                  type="text"
                  required
                  value={handle}
                  onChange={(e) => checkHandle(e.target.value)}
                />
                <div className="hint">
                  {checkingHandle && <span>Checking availability…</span>}
                  {!checkingHandle && handleAvailable === true && (
                    <span className="ok">Handle is available</span>
                  )}
                  {!checkingHandle && handleAvailable === false && (
                    <span className="bad">Handle is already taken</span>
                  )}
                  {!checkingHandle && handleAvailable === null && (
                    <span className={isHandleBasicValid || handle.trim() === "" ? "" : "bad"}>
                      3–20 chars: lowercase, numbers, underscores
                    </span>
                  )}
                </div>
              </div>

              <div className="field">
                <label className="label">Real name (private)</label>
                <input
                  className="input"
                  type="text"
                  required
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                />
                <div className="hint">Used for verification/moderation. Never shown publicly.</div>
              </div>

              <div className="field">
                <label className="label">Years as a referee</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={80}
                  value={yearsRefereeing}
                  onChange={(e) => setYearsRefereeing(e.target.value)}
                  placeholder="e.g. 5"
                />
                {!isYearsValid && <div className="hint bad">Enter a number from 0–80</div>}
              </div>

              <div className="field">
                <label className="label">Sports</label>
                <div className="sportsRow" role="group" aria-label="Sports">
                  {SPORTS.map((s) => {
                    const selected = sports.includes(s.key);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        className={`sportBtn ${selected ? "selected" : ""}`}
                        onClick={() => toggleSport(s.key)}
                        aria-pressed={selected}
                      >
                        <span className="icon" aria-hidden>
                          {s.icon}
                        </span>
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                <div className={`hint ${hasSport ? "" : "bad"}`}>Select at least one sport.</div>
              </div>

              {/* 3) Badge preview */}
              <div className="badgePreview">
                <div className="badgeTitle">Badge preview</div>
                <div className="badgeGrid">
                  {BADGES.map((b) => (
                    <div key={b.code} className="badgeCard">
                      <div className="badgeHeader">
                        <span className="badgeIcon" aria-hidden>
                          {b.icon}
                        </span>
                        <span className="badgeLabel">{b.label}</span>
                      </div>
                      <div className="badgeDesc">{b.description}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Create account button (always a real button) */}
              <button type="submit" className="submit" disabled={!canSubmit}>
                Create account
              </button>

              {/* helper why disabled */}
              {!canSubmit && (
                <div className="disabledHint">
                  Complete all fields, pick at least one sport, and choose an available handle.
                </div>
              )}
            </form>
          </>
        )}
      </div>

      {/* Inline CSS so styling/centering always works */}
      <style jsx>{`
        .page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: #c68642;
          background-image:
            linear-gradient(to right, rgba(255, 255, 255, 0.18) 2px, transparent 2px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.18) 2px, transparent 2px);
          background-size: 220px 220px;
        }
        .card {
          width: 100%;
          max-width: 560px;
          background: rgba(255, 255, 255, 0.95);
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
          padding: 28px;
        }
        .cardSuccess {
          max-width: 640px;
        }
        .center {
          text-align: center;
        }
        .title {
          margin: 0;
          font-size: 28px;
          font-weight: 800;
          line-height: 1.2;
        }
        .subtext {
          margin: 10px 0 0;
          color: #444;
          font-size: 14px;
        }
        .error {
          margin: 14px 0 0;
          text-align: center;
          color: #b00020;
          font-size: 14px;
          font-weight: 600;
        }

        .form {
          margin-top: 18px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
        }
        .field {
          width: 100%;
          max-width: 380px;
          text-align: center;
        }
        .label {
          display: block;
          font-size: 14px;
          font-weight: 700;
          margin-bottom: 6px;
        }
        .input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #bbb;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 14px;
          text-align: center;
          outline: none;
          background: #fff;
        }
        .input:focus {
          border-color: #111;
        }

        .hint {
          margin-top: 6px;
          font-size: 12px;
          color: #555;
        }
        .ok {
          color: #0a7a2f;
          font-weight: 700;
        }
        .bad {
          color: #b00020;
          font-weight: 700;
        }

        .sportsRow {
          display: flex;
          justify-content: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .sportBtn {
          border: 1px solid #111;
          background: #fff;
          color: #111;
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 13px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          user-select: none;
        }
        .sportBtn.selected {
          background: #111;
          color: #fff;
        }
        .icon {
          font-size: 16px;
          line-height: 1;
        }

        .badgePreview {
          width: 100%;
          max-width: 520px;
          margin-top: 4px;
          text-align: left;
        }
        .badgeTitle {
          font-weight: 800;
          font-size: 13px;
          margin: 6px 0 8px;
          text-align: center;
        }
        .badgeGrid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        @media (min-width: 520px) {
          .badgeGrid {
            grid-template-columns: 1fr 1fr;
          }
        }
        .badgeCard {
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 12px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.9);
        }
        .badgeHeader {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 800;
          margin-bottom: 4px;
        }
        .badgeIcon {
          font-size: 16px;
        }
        .badgeLabel {
          font-size: 13px;
        }
        .badgeDesc {
          font-size: 12px;
          color: #555;
          line-height: 1.35;
        }

        .submit {
          width: 100%;
          max-width: 380px;
          margin-top: 6px;
          border: none;
          border-radius: 12px;
          padding: 12px 14px;
          background: #111;
          color: #fff;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
        }
        .submit:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .disabledHint {
          max-width: 420px;
          text-align: center;
          font-size: 12px;
          color: #555;
          margin-top: -6px;
        }

        /* 2) Success animation */
        .fadeInUp {
          animation: fadeInUp 420ms ease-out both;
        }
        .successIcon {
          font-size: 34px;
          margin-bottom: 10px;
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Success steps */
        .steps {
          margin-top: 18px;
          display: grid;
          gap: 12px;
          text-align: left;
        }
        .step {
          display: flex;
          gap: 12px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 12px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.85);
        }
        .stepNum {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          background: #111;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          flex: 0 0 auto;
        }
        .stepTitle {
          font-weight: 900;
          margin-bottom: 2px;
        }
        .stepText {
          font-size: 12px;
          color: #555;
          line-height: 1.35;
        }
        .smallNote {
          margin-top: 14px;
          font-size: 12px;
          color: #555;
        }
      `}</style>
    </div>
  );
}
