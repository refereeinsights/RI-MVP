"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { getCorralioPasswordUpdateError } from "@/lib/passwordError";
import { getCorralioSupabaseBrowserClient } from "@/lib/supabase/browser";

export function PasswordForm({ recovery = false }: { recovery?: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<{ status: "success" | "error"; message: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("passwordConfirmation") ?? "");
    if (password !== confirmation) {
      setNotice({ status: "error", message: "Passwords do not match." });
      return;
    }

    setPending(true);
    setNotice(null);
    try {
      const supabase = getCorralioSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setNotice({ status: "error", message: getCorralioPasswordUpdateError(error) });
        return;
      }
      formRef.current?.reset();
      setNotice({
        status: "success",
        message: recovery ? "Your password has been reset." : "Your password has been saved.",
      });
    } catch {
      setNotice({ status: "error", message: "We couldn’t update your password. Please try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} className="stackForm" onSubmit={submit}>
      <label htmlFor="new-password">New password</label>
      <div className="passwordInputRow">
        <input id="new-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required />
        <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-controls="new-password password-confirmation" aria-pressed={showPassword}>
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
      <label htmlFor="password-confirmation">Confirm password</label>
      <input id="password-confirmation" name="passwordConfirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" required />
      <button className="primaryButton" type="submit" disabled={pending}>
        {pending ? "Saving…" : recovery ? "Save new password" : "Save password"}
      </button>
      {notice ? <p className={`formNotice ${notice.status}`} role={notice.status === "error" ? "alert" : "status"}>{notice.message}</p> : null}
      {notice?.status === "success" && recovery ? <Link className="authTextLink" href="/">Return to Corralio</Link> : null}
    </form>
  );
}
