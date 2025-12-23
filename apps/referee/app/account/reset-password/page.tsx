"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // On mount, try to establish the recovery session from the URL hash
  // Supabase sends access_token/refresh_token in the fragment (#)
  // If we can't set the session, the page will show an error.
  useEffect(() => {
    let cancelled = false;
    async function hydrateSession() {
      setErr(null);
      try {
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        const params = new URLSearchParams(hash.replace(/^#/, ""));
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
        }
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session) throw new Error("Auth session missing! Use the email link to retry.");
        if (!cancelled) setSessionReady(true);
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message || "Recovery link is invalid or expired. Please request a new one.");
          setSessionReady(false);
        }
      }
    }
    hydrateSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);

    if (!password || password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErr(error.message);
        return;
      }
      setInfo("Password updated. You can now continue to your account.");
      setPassword("");
      setConfirm("");
    } catch {
      setErr("Unable to update password right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
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
          Reset your password
        </h1>
        <p style={{ marginTop: 8, marginBottom: 16, textAlign: "center", color: "#555", fontSize: 13 }}>
          Enter a new password for your Referee Insights account.
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
              New password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
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
              Confirm password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #bbb",
                textAlign: "center",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !sessionReady}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "none",
              background: "#111",
              color: "white",
              fontWeight: 800,
              cursor: "pointer",
              opacity: loading || !sessionReady ? 0.7 : 1,
              minHeight: 46,
            }}
          >
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
