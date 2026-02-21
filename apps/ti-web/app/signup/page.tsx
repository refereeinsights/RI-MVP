"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  const emailRedirectTo = useMemo(() => {
    const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (configured) return `${configured.replace(/\/$/, "")}/verify-email`;
    if (typeof window !== "undefined") return `${window.location.origin}/verify-email`;
    return undefined;
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    const supabase = getSupabaseBrowserClient();

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("ok");
    setMessage("Check your email to confirm your account.");
  }

  return (
    <main style={{ maxWidth: 480, margin: "2rem auto", padding: "0 1rem", display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Create your account</h1>
      <p style={{ margin: 0, color: "#475569" }}>
        Sign up for Insider access. Weekend Pro access is coming soon.
      </p>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}
        />
        <button
          type="submit"
          disabled={status === "saving"}
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #0f172a", background: "#0f172a", color: "#fff", fontWeight: 700 }}
        >
          {status === "saving" ? "Creating..." : "Sign up"}
        </button>
      </form>
      {message ? (
        <div style={{ fontSize: 13, color: status === "ok" ? "#065f46" : "#b91c1c" }}>{message}</div>
      ) : null}
      <div style={{ fontSize: 13 }}>
        Already have an account? <Link href="/login">Log in</Link>
      </div>
    </main>
  );
}
