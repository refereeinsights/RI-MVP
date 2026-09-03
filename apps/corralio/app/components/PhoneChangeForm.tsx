"use client";

import { FormEvent, useState } from "react";

export function PhoneChangeForm() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit(path: string, body: object) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("denied");
  }

  async function request(event: FormEvent) {
    event.preventDefault();
    setPending(true); setNotice("");
    try {
      await submit("/api/auth/phone/change/request", { phone });
      setStep("code"); setNotice("Enter the code sent to your new number.");
    } catch { setNotice("We couldn’t start that phone change. Please try again."); }
    finally { setPending(false); }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setPending(true); setNotice("");
    try {
      await submit("/api/auth/phone/change/verify", { phone, token: code });
      setPhone(""); setCode(""); setStep("phone"); setNotice("Your verified phone number was updated.");
    } catch { setNotice("That code couldn’t be verified. Check it and try again."); }
    finally { setPending(false); }
  }

  return (
    <section aria-labelledby="account-phone-heading">
      <h2 id="account-phone-heading">Verified phone</h2>
      {step === "phone" ? (
        <form className="stackForm" onSubmit={request}>
          <label htmlFor="account-phone">New mobile number</label>
          <input id="account-phone" type="tel" autoComplete="tel" value={phone}
            onChange={(event) => setPhone(event.target.value)} required />
          <button className="secondaryButton" type="submit" disabled={pending}>
            {pending ? "Sending code…" : "Verify a new number"}
          </button>
        </form>
      ) : (
        <form className="stackForm" onSubmit={verify}>
          <label htmlFor="account-phone-code">Verification code</label>
          <input id="account-phone-code" inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9]{6}" maxLength={6} value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required />
          <button className="secondaryButton" type="submit" disabled={pending || code.length !== 6}>
            {pending ? "Verifying…" : "Confirm phone change"}
          </button>
        </form>
      )}
      {notice ? <p className="formNotice" role="status">{notice}</p> : null}
    </section>
  );
}
