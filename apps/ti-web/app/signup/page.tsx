"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { sanitizeReturnTo } from "@/lib/returnTo";

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [zip, setZip] = useState("");
  const [handle, setHandle] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");
  const code = (searchParams.get("code") || "").trim();
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"), "/account");

  useEffect(() => {
    if (status !== "ok") return;
    const timer = window.setTimeout(() => {
      router.push("/");
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [status, router]);

  const emailRedirectTo = useMemo(() => {
    const tiProdOrigin = "https://www.tournamentinsights.com";
    const configured =
      process.env.NEXT_PUBLIC_TI_SITE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SITE_URL?.trim();

    const pickSafeOrigin = () => {
      if (typeof window !== "undefined") {
        const host = window.location.hostname.toLowerCase();
        if (host === "localhost" || host.endsWith(".vercel.app") || host.includes("tournamentinsights.com")) {
          return window.location.origin.replace(/\/$/, "");
        }
      }
      if (configured) {
        try {
          const url = new URL(configured);
          const host = url.hostname.toLowerCase();
          if (
            host.endsWith("tournamentinsights.com") ||
            host === "localhost" ||
            host.endsWith(".vercel.app")
          ) {
            return url.origin.replace(/\/$/, "");
          }
        } catch {
          // Fall through to TI production default.
        }
      }
      return tiProdOrigin;
    };

    return `${pickSafeOrigin()}/auth/confirm`;
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("idle");
    setMessage("");

    if (!agreed) {
      setStatus("error");
      setMessage("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }

    setStatus("saving");
    const supabase = getSupabaseBrowserClient();
    const cleanHandle = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    const cleanZip = zip.trim();

    if (cleanHandle && !/^[a-z0-9_]{3,20}$/.test(cleanHandle)) {
      setStatus("error");
      setMessage("Handle must be 3-20 characters using letters, numbers, or underscores.");
      return;
    }
    if (cleanZip && !/^\d{5}(-\d{4})?$/.test(cleanZip)) {
      setStatus("error");
      setMessage("ZIP code must be 5 digits (or ZIP+4).");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo,
        data: {
          display_name: name.trim() || null,
          zip_code: cleanZip || null,
          handle: cleanHandle || null,
        },
      },
    });

    if (error) {
      setStatus("error");
      const raw = `${(error as any)?.code ?? ""} ${(error as any)?.message ?? ""}`.toLowerCase();
      if (
        raw.includes("already registered") ||
        raw.includes("already exists") ||
        raw.includes("user_already_exists")
      ) {
        setMessage('This email already has an account. Please log in or use "Forgot password".');
      } else {
        setMessage(error.message);
      }
      return;
    }

    setStatus("ok");
    setMessage("Check your email to confirm your account.");
  }

  if (status === "ok") {
    return (
      <main style={{ maxWidth: 560, margin: "2.5rem auto", padding: "0 1rem", display: "grid", gap: 14, textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: 42, lineHeight: 1.08 }}>Check your email to confirm</h1>
        <p style={{ margin: 0, color: "#334155", fontSize: 18 }}>
          We sent a confirmation link to <strong>{email.trim()}</strong>.
        </p>
        <p style={{ margin: 0, color: "#475569", fontSize: 14 }}>
          This page will redirect to home in 12 seconds.
        </p>
        <div style={{ fontSize: 14 }}>
          <Link href="/">Go to home now</Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: "2rem auto", padding: "0 1rem", display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Create your account</h1>
      <p style={{ margin: 0, color: "#475569" }}>
        Sign up for Insider access. Weekend Pro access is coming soon.
      </p>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <input
          type="text"
          placeholder="Full name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}
        />
        <input
          type="text"
          placeholder="Handle (optional, e.g. soccermom23)"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          maxLength={20}
          style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}
        />
        <input
          type="text"
          placeholder="ZIP code (optional)"
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          maxLength={10}
          inputMode="numeric"
          style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}
        />
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
          disabled={status === "saving" || !agreed}
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #0f172a", background: "#0f172a", color: "#fff", fontWeight: 700 }}
        >
          {status === "saving" ? "Creating..." : "Sign up"}
        </button>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              id="signup-consent"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <label htmlFor="signup-consent" style={{ fontSize: 13 }}>
              I agree to the <Link href="/terms">Terms of Service</Link> and{" "}
              <Link href="/privacy">Privacy Policy</Link>.
            </label>
          </div>
          <div style={{ fontSize: 12, color: "#555" }}>
            By creating an account, you agree to follow the TournamentInsights{" "}
            <Link href="/content-standards">community guidelines</Link>.
          </div>
        </div>
      </form>
      {message ? (
        <div style={{ fontSize: 13, color: status === "error" ? "#b91c1c" : "#065f46" }}>{message}</div>
      ) : null}
      <div style={{ fontSize: 13 }}>
        Already have an account?{" "}
        <Link
          href={code ? `/login?code=${encodeURIComponent(code)}` : `/login?returnTo=${encodeURIComponent(returnTo)}`}
        >
          Log in
        </Link>
      </div>
    </main>
  );
}
