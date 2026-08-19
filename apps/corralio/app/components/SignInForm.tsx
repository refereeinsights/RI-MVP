"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { buildCorralioAuthEmailRedirect } from "@/lib/authEmailRedirect";
import { getCorralioSupabaseBrowserClient } from "@/lib/supabase/browser";

type Notice = { status: "success" | "error"; message: string } | null;

const INVALID_PASSWORD_MESSAGE = "We couldn’t sign you in with that email and password.";

export function SignInForm() {
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<"password" | "magic-link" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [showPassword, setShowPassword] = useState(false);

  function getEmail() {
    const input = emailRef.current;
    if (!input || !input.reportValidity()) return null;
    return input.value.trim();
  }

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = getEmail();
    const password = passwordRef.current?.value ?? "";
    if (!email || !password) return;

    setPending("password");
    setNotice(null);
    try {
      const supabase = getCorralioSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setNotice({ status: "error", message: INVALID_PASSWORD_MESSAGE });
        return;
      }
      form.reset();
      window.location.assign("/");
    } catch {
      setNotice({ status: "error", message: INVALID_PASSWORD_MESSAGE });
    } finally {
      setPending(null);
    }
  }

  async function sendMagicLink() {
    const email = getEmail();
    if (!email) return;

    setPending("magic-link");
    setNotice(null);
    try {
      const supabase = getCorralioSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: buildCorralioAuthEmailRedirect(window.location.origin),
          shouldCreateUser: true,
        },
      });
      setNotice(error
        ? { status: "error", message: "We couldn’t send the sign-in link. Try again." }
        : { status: "success", message: "Check your email for a secure sign-in link." });
    } catch {
      setNotice({ status: "error", message: "We couldn’t send the sign-in link. Try again." });
    } finally {
      setPending(null);
    }
  }

  return (
    <form className="stackForm" onSubmit={signInWithPassword}>
      <label htmlFor="email">Email address</label>
      <input ref={emailRef} id="email" name="email" type="email" autoComplete="email" required placeholder="parent@example.com" />

      <div className="passwordLabelRow">
        <label htmlFor="password">Password</label>
        <Link href="/account/forgot-password">Forgot password?</Link>
      </div>
      <div className="passwordInputRow">
        <input
          ref={passwordRef}
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          required
        />
        <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-controls="password" aria-pressed={showPassword}>
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>

      <button className="primaryButton" type="submit" disabled={pending !== null}>
        {pending === "password" ? "Signing in…" : "Sign in"}
      </button>

      <div className="authDivider" aria-hidden="true"><span>or</span></div>
      <button className="secondaryButton authSecondaryButton" type="button" onClick={sendMagicLink} disabled={pending !== null}>
        {pending === "magic-link" ? "Sending link…" : "Email me a sign-in link"}
      </button>
      <p className="authHelp">New here? Email yourself a sign-in link to create or confirm your account.</p>
      {notice ? <p className={`formNotice ${notice.status}`} role="status">{notice.message}</p> : null}
    </form>
  );
}
