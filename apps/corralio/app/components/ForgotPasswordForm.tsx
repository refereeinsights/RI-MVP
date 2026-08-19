"use client";

import { useRef, useState, type FormEvent } from "react";

type State = "idle" | "pending" | "success" | "error";

export function ForgotPasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<State>("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") ?? "").trim();
    setState("pending");
    try {
      const response = await fetch("/api/auth/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        setState("error");
        return;
      }
      formRef.current?.reset();
      setState("success");
    } catch {
      setState("error");
    }
  }

  return (
    <form ref={formRef} className="stackForm" onSubmit={submit}>
      <label htmlFor="recovery-email">Email address</label>
      <input id="recovery-email" name="email" type="email" autoComplete="email" required />
      <button className="primaryButton" type="submit" disabled={state === "pending"}>
        {state === "pending" ? "Sending…" : "Send password-reset email"}
      </button>
      {state === "success" ? (
        <p className="formNotice success" role="status">If an account exists for that email, we’ve sent password-reset instructions.</p>
      ) : null}
      {state === "error" ? (
        <p className="formNotice error" role="alert">We couldn’t send password-reset instructions right now. Please try again.</p>
      ) : null}
    </form>
  );
}
