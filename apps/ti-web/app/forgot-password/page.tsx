"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { sanitizeReturnTo } from "@/lib/returnTo";

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"), "/account");
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage(null);
    try {
      const origin =
        typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "https://www.tournamentinsights.com";
      const redirectTo = `${origin}/account/reset-password?returnTo=${encodeURIComponent(returnTo)}`;

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (error) throw error;
      setStatus("done");
      setMessage("If an account exists for that email, we sent a password reset link.");
    } catch (e: any) {
      setStatus("error");
      setMessage(e?.message || "Unable to send reset email right now.");
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: "2rem auto", padding: "0 1rem", display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Forgot password</h1>
      <p style={{ margin: 0, color: "#475569" }}>
        Enter your email and we’ll send you a password reset link.
      </p>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}
        />
        <button
          type="submit"
          disabled={status === "saving"}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #0f172a",
            background: "#0f172a",
            color: "#fff",
            fontWeight: 700,
            opacity: status === "saving" ? 0.7 : 1,
          }}
        >
          {status === "saving" ? "Sending..." : "Send reset link"}
        </button>
      </form>

      {message ? (
        <div style={{ fontSize: 13, color: status === "error" ? "#b91c1c" : "#065f46" }}>{message}</div>
      ) : null}

      <div style={{ fontSize: 13 }}>
        <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>Back to login</Link>
      </div>
    </main>
  );
}

