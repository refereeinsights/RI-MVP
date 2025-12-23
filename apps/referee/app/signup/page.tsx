"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signUpUser, isHandleAvailable, normalizeHandle } from "@/lib/auth";
import type { Sport } from "@/lib/auth";
import SportsPickerClient from "@/components/SportsPickerClient";
import ReferralCTA from "@/components/ReferralCTA";

const ALLOWED_SPORTS: Sport[] = ["soccer", "basketball", "football"];

function parseSports(csv: string): Sport[] {
  const raw = csv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const out: Sport[] = [];
  for (const v of raw) {
    if ((ALLOWED_SPORTS as string[]).includes(v) && !out.includes(v as Sport)) {
      out.push(v as Sport);
    }
  }
  return out;
}

export default function SignUpPage() {
  const searchParams = useSearchParams();
  const referralCode = searchParams.get("ref");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [realName, setRealName] = useState("");
  const [yearsRefereeing, setYearsRefereeing] = useState("");

  const [checkingHandle, setCheckingHandle] = useState(false);
  const [handleAvailable, setHandleAvailable] = useState<boolean | null>(null);
  const [agreed, setAgreed] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!agreed) {
      setError("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }

    const formData = new FormData(e.currentTarget);
    const sportsCsv = String(formData.get("sports") || "");
    const sports = parseSports(sportsCsv);
    const years = yearsRefereeing.trim() ? Number(yearsRefereeing) : null;

    if (sports.length === 0) {
      setError("Select at least one sport you officiate.");
      return;
    }

    try {
      await signUpUser({
        email,
        password,
        handle,
        realName,
        yearsRefereeing: years,
        sports,
        referralCode: referralCode || null,
      });

      setSuccess(true);
    } catch (err: any) {
      setError(err?.message ?? "Signup failed");
    }
  }

  if (success) {
    return (
      <div
        style={{
          width: "100%",
          padding: "4rem 1rem",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 520,
            background: "white",
            borderRadius: 14,
            padding: 24,
            boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
            border: "1px solid #ddd",
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>
            Check your email
          </h1>
          <p style={{ marginTop: 10, fontSize: 14, color: "#444" }}>
            We’ve sent a verification link to <strong>{email}</strong>.
            <br />
            You must verify your email before posting reviews.
          </p>
          <div style={{ marginTop: 24 }}>
            <ReferralCTA placement="signup_success_referral" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        padding: "4rem 1rem",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "white",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
          border: "1px solid #ddd",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>
          Create your account
        </h1>

        {error && (
          <div
            style={{
              marginTop: 12,
              marginBottom: 12,
              color: "#b00020",
              border: "1px solid rgba(176,0,32,0.25)",
              background: "rgba(176,0,32,0.06)",
              padding: 10,
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: 18, display: "grid", gap: 14 }}>
          <div style={{ textAlign: "center" }}>
            <label
              style={{
                display: "block",
                fontWeight: 800,
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #bbb",
                textAlign: "center",
              }}
            />
          </div>

          <div style={{ textAlign: "center" }}>
            <label
              style={{
                display: "block",
                fontWeight: 800,
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #bbb",
                textAlign: "center",
              }}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
              At least 8 characters
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            <label
              style={{
                display: "block",
                fontWeight: 800,
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              Public handle
            </label>
            <input
              type="text"
              required
              value={handle}
              onChange={(e) => checkHandle(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #bbb",
                textAlign: "center",
              }}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
              {checkingHandle && <span>Checking availability…</span>}
              {!checkingHandle && handleAvailable === true && (
                <span style={{ color: "#0a7a2f", fontWeight: 800 }}>
                  Handle is available
                </span>
              )}
              {!checkingHandle && handleAvailable === false && (
                <span style={{ color: "#b00020", fontWeight: 800 }}>
                  Handle is already taken
                </span>
              )}
              {!checkingHandle && handleAvailable === null && (
                <span>
                  3–20 characters: lowercase letters, numbers, underscores
                </span>
              )}
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            <label
              style={{
                display: "block",
                fontWeight: 800,
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              Real name (private)
            </label>
            <input
              type="text"
              required
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #bbb",
                textAlign: "center",
              }}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
              Used for verification and moderation. Never shown publicly.
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            <label
              style={{
                display: "block",
                fontWeight: 800,
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              Years as a referee
            </label>
            <input
              type="number"
              min={0}
              max={80}
              value={yearsRefereeing}
              onChange={(e) => setYearsRefereeing(e.target.value)}
              placeholder="e.g. 5"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #bbb",
                textAlign: "center",
              }}
            />
          </div>

          {/* Sports picker writes hidden input name="sports" */}
          <div style={{ marginTop: 2 }}>
          <SportsPickerClient name="sports" defaultSelected={[]} />
        </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              textAlign: "left",
            }}
          >
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              I agree to the{" "}
              <a href="/terms" target="_blank" rel="noreferrer">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="/privacy" target="_blank" rel="noreferrer">
                Privacy Policy
              </a>
              .
            </span>
          </label>

          <button
            type="submit"
            disabled={checkingHandle || handleAvailable === false || !agreed}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 14,
              border: "none",
              background: "#111",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
              opacity: checkingHandle || handleAvailable === false || !agreed ? 0.6 : 1,
            }}
          >
            Create account
          </button>

          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
            By creating an account, you agree to follow the Referee Insights
            community guidelines.
          </div>
        </form>
      </div>
    </div>
  );
}
