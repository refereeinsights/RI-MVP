"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { sanitizeReturnTo } from "@/lib/returnTo";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const code = (searchParams?.get("code") ?? "").trim();
  const notice = (searchParams?.get("notice") ?? "").trim();
  const returnTo = sanitizeReturnTo(searchParams?.get("returnTo") ?? null, "/account");
  const nextPath = code ? `/join?code=${encodeURIComponent(code)}` : returnTo;
  const signupHref = code ? `/signup?code=${encodeURIComponent(code)}` : `/signup?returnTo=${encodeURIComponent(returnTo)}`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    const trimmed = identifier.trim();
    const resp = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: trimmed, password }),
    });

    const payload = (await resp.json().catch(() => null)) as
      | { ok: true }
      | { ok: false; needs_verify?: boolean; email?: string; error?: string }
      | null;

    if (!resp.ok || !payload || (payload as any).ok !== true) {
      const needsVerify = Boolean(payload && (payload as any).needs_verify);
      const email = typeof (payload as any)?.email === "string" ? String((payload as any).email) : trimmed;
      if (needsVerify) {
        router.replace(
          `/verify-email?returnTo=${encodeURIComponent(nextPath)}&email=${encodeURIComponent(email)}`
        );
        router.refresh();
        return;
      }

      setStatus("error");
      setMessage((payload as any)?.error || "Invalid login.");
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 480, margin: "2rem auto", padding: "0 1rem", display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Log in</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <input
          type="text"
          placeholder="Email or username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Link
            href={`/forgot-password?returnTo=${encodeURIComponent(returnTo)}`}
            style={{ fontSize: 13, color: "#0f3d2e", fontWeight: 600, textDecoration: "none" }}
          >
            Forgot password?
          </Link>
        </div>
        <button
          type="submit"
          disabled={status === "saving"}
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #0f172a", background: "#0f172a", color: "#fff", fontWeight: 700 }}
        >
          {status === "saving" ? "Logging in..." : "Log in"}
        </button>
      </form>
      {message ? <div style={{ fontSize: 13, color: "#b91c1c" }}>{message}</div> : null}
      {notice ? <div style={{ fontSize: 12, color: "#64748b" }}>Notice: {notice}</div> : null}
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontSize: 13, color: "#64748b", textAlign: "center" }}>or</div>
        <Link
          href={signupHref}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #16a34a",
            background: "#ecfdf5",
            color: "#065f46",
            fontWeight: 800,
            textAlign: "center",
            textDecoration: "none",
          }}
        >
          Create free account
        </Link>
        <div style={{ fontSize: 13, textAlign: "center" }}>
          Need an account? <Link href={signupHref}>Sign up</Link>
        </div>
      </div>
    </main>
  );
}
