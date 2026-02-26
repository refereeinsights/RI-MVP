"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function ensureRecoverySession() {
      setError(null);
      try {
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        const params = new URLSearchParams(hash.replace(/^#/, ""));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
        }

        const { data, error: getSessionError } = await supabase.auth.getSession();
        if (getSessionError) throw getSessionError;
        if (!data.session) {
          throw new Error("Recovery link is invalid or expired. Request a new password reset link.");
        }

        if (!cancelled) setSessionReady(true);
      } catch (e: any) {
        if (!cancelled) {
          setSessionReady(false);
          setError(e?.message || "Recovery link is invalid or expired. Request a new password reset link.");
        }
      }
    }

    ensureRecoverySession();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setPassword("");
      setConfirm("");
      setMessage("Password updated. You can now log in with your new password.");
    } catch {
      setError("Unable to update password right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "2rem auto", padding: "0 1rem", display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Reset your password</h1>
      <p style={{ margin: 0, color: "#475569" }}>
        Enter a new password for your Tournament Insights account.
      </p>

      {error ? <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div> : null}
      {message ? <div style={{ fontSize: 13, color: "#065f46" }}>{message}</div> : null}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <input
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          autoComplete="new-password"
          style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={8}
          required
          autoComplete="new-password"
          style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}
        />
        <button
          type="submit"
          disabled={loading || !sessionReady}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #0f172a",
            background: "#0f172a",
            color: "#fff",
            fontWeight: 700,
            opacity: loading || !sessionReady ? 0.7 : 1,
          }}
        >
          {loading ? "Updating..." : "Update password"}
        </button>
      </form>

      <div style={{ fontSize: 13 }}>
        <Link href="/login">Back to login</Link>
      </div>
    </main>
  );
}
