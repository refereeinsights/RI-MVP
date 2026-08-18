"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState, type FormEvent } from "react";
import { buildCorralioAuthEmailRedirect } from "@/lib/authEmailRedirect";

type Notice = { status: "success" | "error"; message: string } | null;

export function SignInForm() {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      setNotice({ status: "error", message: "Sign-in is not configured yet." });
      return;
    }
    setPending(true);
    setNotice(null);
    const supabase = createBrowserClient(url, anonKey);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: buildCorralioAuthEmailRedirect(window.location.origin),
        shouldCreateUser: true,
      },
    });
    setPending(false);
    setNotice(error
      ? { status: "error", message: "We couldn’t send the sign-in link. Try again." }
      : { status: "success", message: "Check your email for a secure sign-in link." });
  }

  return (
    <form className="stackForm" onSubmit={submit}>
      <label htmlFor="email">Email address</label>
      <input id="email" name="email" type="email" autoComplete="email" required placeholder="parent@example.com" />
      <button className="primaryButton" type="submit" disabled={pending}>{pending ? "Sending link…" : "Continue with email"}</button>
      {notice ? <p className={`formNotice ${notice.status}`} role="status">{notice.message}</p> : null}
    </form>
  );
}
