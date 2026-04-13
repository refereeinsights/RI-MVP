"use client";

import { FormEvent, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  initialEmail?: string;
  returnTo?: string;
};

function pickSafeOrigin(configured: string | null) {
  const fallbacks = ["https://www.refereeinsights.com"];

  if (typeof window !== "undefined" && window.location?.origin) {
    const host = window.location.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".vercel.app") || host.endsWith("refereeinsights.com")) {
      return window.location.origin.replace(/\/$/, "");
    }
  }

  if (configured) {
    try {
      const url = new URL(configured);
      const host = url.hostname.toLowerCase();
      if (host.endsWith("refereeinsights.com") || host === "localhost" || host.endsWith(".vercel.app")) {
        return url.origin.replace(/\/$/, "");
      }
    } catch {
      // ignore invalid url
    }
  }

  return fallbacks[0];
}

export default function ResendVerificationForm({ initialEmail = "", returnTo = "/account" }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const emailRedirectTo = useMemo(() => {
    const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() || null;
    const origin = pickSafeOrigin(configured);
    const next = returnTo.startsWith("/") ? returnTo : "/account";
    return `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;
  }, [returnTo]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmail = email.trim();
    if (!nextEmail) {
      setStatus("error");
      setMessage("Enter your account email.");
      return;
    }

    setStatus("sending");
    setMessage("");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: nextEmail,
      options: { emailRedirectTo },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("sent");
    setMessage("Verification email sent.");
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 10, maxWidth: 440 }}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        required
        style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}
      />
      <button
        type="submit"
        disabled={status === "sending"}
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid #0f172a",
          background: "#0f172a",
          color: "#fff",
          fontWeight: 700,
        }}
      >
        {status === "sending" ? "Sending..." : "Resend verification email"}
      </button>
      {message ? (
        <div style={{ fontSize: 13, color: status === "sent" ? "#065f46" : "#b91c1c" }}>{message}</div>
      ) : null}
    </form>
  );
}

