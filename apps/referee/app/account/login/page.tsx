"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AccountLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErr(error.message);
        return;
      }

      await supabase.auth.getSession();
      window.location.href = "/account";
    } catch {
      setErr("Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
      }}
    >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: "white",
            borderRadius: 12,
        padding: 20,
        boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
      }}
    >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, textAlign: "center" }}>
          Account Login
        </h1>
        <p style={{ marginTop: 8, marginBottom: 16, textAlign: "center", color: "#555", fontSize: 13 }}>
          Sign in to manage your profile.
        </p>

        {err && (
          <div style={{ color: "#b00020", textAlign: "center", marginBottom: 10 }}>
            {err}
          </div>
        )}
        {info && (
          <div style={{ color: "#0a7a2f", textAlign: "center", marginBottom: 10 }}>
            {info}
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <div style={{ textAlign: "center" }}>
            <label style={{ display: "block", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
              Email
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              autoComplete="email"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #bbb",
                textAlign: "center",
              }}
            />
          </div>

      <div style={{ textAlign: "center" }}>
        <label style={{ display: "block", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
          Password
        </label>
        <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              autoComplete="current-password"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #bbb",
                textAlign: "center",
            }}
          />
          <div style={{ marginTop: 8, fontSize: 12 }}>
            <button
              type="button"
              onClick={async () => {
                setErr(null);
                setInfo(null);
                const targetEmail = email.trim();
                if (!targetEmail) {
                  setErr("Enter your email above first.");
                  return;
                }
                try {
                  setLoading(true);
                  const res = await fetch("/api/auth/send-reset", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: targetEmail }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok || data?.ok === false) {
                    setErr(data?.error || "Unable to send reset link right now.");
                  } else {
                    setInfo("Check your email for a password reset link.");
                  }
                } catch {
                  setErr("Unable to send reset link right now.");
                } finally {
                  setLoading(false);
                }
              }}
              style={{
                background: "none",
                border: "none",
                color: "#0a7a2f",
                cursor: "pointer",
                  textDecoration: "underline",
                  padding: 0,
                }}
              >
                Forgot my password
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "none",
              background: "#111",
              color: "white",
              fontWeight: 800,
              cursor: "pointer",
              opacity: loading ? 0.7 : 1,
              minHeight: 46,
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
