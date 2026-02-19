"use client";

import Link from "next/link";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (loginError) {
        setError(loginError.message);
        return;
      }

      await supabase.auth.getSession();
      window.location.href = "/account";
    } catch {
      setError("Unable to log in right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section style={{ width: "100%", maxWidth: 460, background: "#fff", borderRadius: 14, border: "1px solid #d9e3f6", padding: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, textAlign: "center" }}>Log in</h1>
        <p style={{ textAlign: "center", color: "#4b5563", marginTop: 8 }}>
          Access your TournamentInsights account.
        </p>
        {error ? <p style={{ color: "#b91c1c", textAlign: "center" }}>{error}</p> : null}

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1" }}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 6,
              padding: "11px 14px",
              borderRadius: 10,
              border: "none",
              background: "#1d4ed8",
              color: "white",
              fontWeight: 700,
              cursor: "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Signing in..." : "Log in"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 14, color: "#4b5563" }}>
          New here? <Link href="/signup">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
