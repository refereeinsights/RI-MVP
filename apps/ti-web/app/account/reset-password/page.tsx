"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { sanitizeReturnTo } from "@/lib/returnTo";

function stripInjectedRecoveryParamsFromReturnTo(raw: string | null) {
  const value = (raw || "").trim();
  if (!value) return null;
  const tokenIdx = value.indexOf("token_hash=");
  if (tokenIdx === -1) return value;
  const qIdx = value.lastIndexOf("?", tokenIdx);
  if (qIdx === -1) return value;
  const stripped = value.slice(0, qIdx);
  return stripped || "/";
}

export default function ResetPasswordPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const searchParams = useSearchParams();
  const returnTo = sanitizeReturnTo(
    stripInjectedRecoveryParamsFromReturnTo(searchParams?.get("returnTo") ?? null),
    "/account"
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function ensureRecoverySession() {
      setError(null);
      try {
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          const query = url.searchParams;
          const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));

          // Newer Supabase recovery links may send a token_hash (often prefixed with `pkce_`).
          const injectedReturnTo = stripInjectedRecoveryParamsFromReturnTo(query.get("returnTo"));
          const rawReturnTo = (query.get("returnTo") || "").trim();
          const tokenHashFromReturnTo = (() => {
            const idx = rawReturnTo.indexOf("token_hash=");
            if (idx === -1) return "";
            const qIdx = rawReturnTo.lastIndexOf("?", idx);
            const rawQuery = qIdx === -1 ? rawReturnTo.slice(idx) : rawReturnTo.slice(qIdx + 1);
            const params = new URLSearchParams(rawQuery);
            return (params.get("token_hash") || "").trim();
          })();
          const typeFromReturnTo = (() => {
            const idx = rawReturnTo.indexOf("token_hash=");
            if (idx === -1) return "";
            const qIdx = rawReturnTo.lastIndexOf("?", idx);
            const rawQuery = qIdx === -1 ? rawReturnTo.slice(idx) : rawReturnTo.slice(qIdx + 1);
            const params = new URLSearchParams(rawQuery);
            return (params.get("type") || "").trim();
          })();

          const tokenHash = ((query.get("token_hash") || "").trim() || tokenHashFromReturnTo).trim();
          const type = ((query.get("type") || "").trim() || typeFromReturnTo).trim();
          if (tokenHash && type === "recovery") {
            const { data, error: verifyError } = await supabase.auth.verifyOtp({
              type: "recovery",
              token_hash: tokenHash,
            });
            if (verifyError) throw verifyError;

            const accessToken = data?.session?.access_token;
            const refreshToken = data?.session?.refresh_token;
            if (accessToken && refreshToken) {
              const { error: sessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (sessionError) throw sessionError;
            }

            // Remove sensitive recovery params from the URL after we establish a session.
            query.delete("token_hash");
            query.delete("type");
            if (rawReturnTo && rawReturnTo.includes("token_hash=")) {
              query.set("returnTo", injectedReturnTo || "/");
            }
            url.hash = "";
            window.history.replaceState({}, "", url.toString());
          }

          const accessToken = hashParams.get("access_token") || query.get("access_token");
          const refreshToken = hashParams.get("refresh_token") || query.get("refresh_token");
          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionError) throw sessionError;

            url.hash = "";
            query.delete("access_token");
            query.delete("refresh_token");
            window.history.replaceState({}, "", url.toString());
          }
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
      setDone(true);
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

      {done ? (
        <Link
          href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #0f172a",
            background: "#0f172a",
            color: "#fff",
            fontWeight: 700,
            textDecoration: "none",
            width: "fit-content",
          }}
        >
          Log in
        </Link>
      ) : (
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
      )}

      <div style={{ fontSize: 13 }}>
        <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>Back to login</Link>
      </div>
    </main>
  );
}
