"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ViewState = "checking" | "need_token" | "ready" | "success" | "error";

export default function ResetPasswordPage() {
  const [view, setView] = useState<ViewState>("checking");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.substring(1)
      : "";
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    if (!access_token || !refresh_token) {
      setView("need_token");
      return;
    }

    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error: sessionError }) => {
        if (sessionError) {
          setError(sessionError.message);
          setView("error");
        } else {
          setView("ready");
        }
      })
      .catch((err) => {
        setError(err?.message ?? "Unable to process reset link.");
        setView("error");
      });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setView("error");
    } else {
      setView("success");
    }
    setLoading(false);
  }

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 16,
          padding: "2rem",
          boxShadow: "0 14px 40px rgba(0,0,0,0.12)",
          border: "1px solid #ddd",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>
          Reset your password
        </h1>

        {view === "checking" && (
          <p style={{ marginTop: "1rem", color: "#555" }}>
            Verifying your reset link…
          </p>
        )}

        {view === "need_token" && (
          <p style={{ marginTop: "1rem", color: "#b00020" }}>
            This page requires a valid reset link. Request a new password email
            to continue.
          </p>
        )}

        {view === "error" && (
          <p style={{ marginTop: "1rem", color: "#b00020" }}>
            {error ?? "Unable to process this reset request."}
          </p>
        )}

        {view === "ready" && (
          <form
            onSubmit={handleSubmit}
            style={{ marginTop: "1.5rem", display: "grid", gap: "1rem" }}
          >
            <div style={{ textAlign: "left" }}>
              <label
                style={{
                  display: "block",
                  fontWeight: 800,
                  fontSize: 13,
                  marginBottom: 6,
                }}
              >
                New password
              </label>
              <input
                type="password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #bbb",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || password.length < 8}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 14,
                border: "none",
                background: "#111",
                color: "#fff",
                fontWeight: 900,
                cursor: "pointer",
                opacity: loading || password.length < 8 ? 0.7 : 1,
              }}
            >
              {loading ? "Saving…" : "Set password"}
            </button>
          </form>
        )}

        {view === "success" && (
          <p style={{ marginTop: "1rem", color: "#0a7a2f", fontWeight: 700 }}>
            Password updated! You can now close this tab and log in with your
            new password.
          </p>
        )}
      </div>
    </div>
  );
}
