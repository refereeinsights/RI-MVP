"use client";

import Script from "next/script";
import { FormEvent, useCallback, useRef, useState } from "react";

type TurnstileApi = {
  render(element: HTMLElement, options: {
    sitekey: string;
    action: string;
    callback(token: string): void;
    "expired-callback"(): void;
    "error-callback"(): void;
  }): string;
  reset(widgetId: string): void;
};

declare global { interface Window { turnstile?: TurnstileApi } }

export function PhoneAuthForm({ siteKey }: { siteKey: string }) {
  const captchaContainer = useRef<HTMLDivElement>(null);
  const captchaWidgetId = useRef<string>();
  const captchaToken = useRef<string | null>(null);
  const submissionInFlight = useRef(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  const renderCaptcha = useCallback(() => {
    if (!captchaContainer.current || !window.turnstile || captchaWidgetId.current) return;
    captchaWidgetId.current = window.turnstile.render(captchaContainer.current, {
      sitekey: siteKey,
      action: "corralio_phone_auth",
      callback(token) { captchaToken.current = token; },
      "expired-callback"() { captchaToken.current = null; },
      "error-callback"() {
        captchaToken.current = null;
        setNotice("We couldn’t verify this request. Please try again.");
      },
    });
  }, [siteKey]);

  function resetCaptcha() {
    captchaToken.current = null;
    if (captchaWidgetId.current) window.turnstile?.reset(captchaWidgetId.current);
  }

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = captchaToken.current;
    if (submissionInFlight.current || !token) {
      setNotice("Complete the security check, then try again.");
      return;
    }
    submissionInFlight.current = true;
    captchaToken.current = null;
    setPending(true);
    setNotice("");
    try {
      const response = await fetch("/api/auth/phone/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, captchaToken: token }),
      });
      if (!response.ok) throw new Error("denied");
      setStep("code");
      setNotice("Enter the verification code we sent.");
    } catch {
      setNotice("We couldn’t send a code right now. Please try again.");
    } finally {
      submissionInFlight.current = false;
      setPending(false);
      resetCaptcha();
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setNotice("");
    try {
      const response = await fetch("/api/auth/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, token: code }),
      });
      if (!response.ok) throw new Error("denied");
      window.location.assign("/");
    } catch {
      setNotice("That code couldn’t be verified. Check it and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="phoneAuth" aria-labelledby="phone-auth-title">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={renderCaptcha}
      />
      <h3 id="phone-auth-title">Get started with your phone</h3>
      {step === "phone" ? (
        <form className="stackForm" onSubmit={requestCode}>
          <label htmlFor="phone-auth-number">Mobile number</label>
          <input id="phone-auth-number" type="tel" autoComplete="tel" value={phone}
            onChange={(event) => setPhone(event.target.value)} required />
          <div ref={captchaContainer} />
          <button className="primaryButton" type="submit" disabled={pending}>
            {pending ? "Sending code…" : "Text me a code"}
          </button>
        </form>
      ) : (
        <form className="stackForm" onSubmit={verifyCode}>
          <label htmlFor="phone-auth-code">Verification code</label>
          <input id="phone-auth-code" inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9]{6}" maxLength={6} value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required />
          <button className="primaryButton" type="submit" disabled={pending || code.length !== 6}>
            {pending ? "Verifying…" : "Verify and continue"}
          </button>
          <button className="quietButton" type="button" onClick={() => { setStep("phone"); setCode(""); setNotice(""); }}>
            Use a different number
          </button>
        </form>
      )}
      {notice ? <p className="formNotice" role="status">{notice}</p> : null}
    </section>
  );
}
