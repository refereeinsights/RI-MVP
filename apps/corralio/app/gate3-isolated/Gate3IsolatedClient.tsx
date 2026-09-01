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

declare global {
  interface Window { turnstile?: TurnstileApi }
}

export function Gate3IsolatedClient({ siteKey }: { siteKey: string }) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string>();
  const [phone, setPhone] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "pending" | "denied">("idle");

  const renderWidget = useCallback(() => {
    if (!container.current || !window.turnstile || widgetId.current) return;
    widgetId.current = window.turnstile.render(container.current, {
      sitekey: siteKey,
      action: "corralio_gate3_phone_auth",
      callback(token) { setCaptchaToken(token); },
      "expired-callback"() { setCaptchaToken(""); },
      "error-callback"() { setCaptchaToken(""); setStatus("denied"); },
    });
  }, [siteKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!captchaToken || status === "submitting") return;
    setStatus("submitting");
    try {
      const response = await fetch("/api/gate3/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, captchaToken }),
      });
      const result = await response.json() as { status?: unknown };
      setStatus(response.ok && result.status === "pending" ? "pending" : "denied");
    } catch {
      setStatus("denied");
    } finally {
      setCaptchaToken("");
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
    }
  }

  return (
    <main style={{ margin: "4rem auto", maxWidth: "34rem", padding: "1.5rem" }}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={renderWidget}
      />
      <p>Corralio isolated verification</p>
      <h1>Gate 3 phone-auth test</h1>
      <p>This temporary surface invokes an isolated mock-only SMS hook. It cannot send a text message.</p>
      <form onSubmit={submit}>
        <label htmlFor="gate3-phone">Disposable test phone</label>
        <input
          id="gate3-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          required
          style={{ display: "block", margin: "0.5rem 0 1rem", minHeight: "44px", width: "100%" }}
        />
        <div ref={container} />
        <button type="submit" disabled={!captchaToken || status === "submitting"} style={{ marginTop: "1rem" }}>
          {status === "submitting" ? "Checking…" : "Request isolated code"}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {status === "pending" ? "Isolated request reached the mock-only hook." : null}
        {status === "denied" ? "The isolated request was denied." : null}
      </p>
    </main>
  );
}
