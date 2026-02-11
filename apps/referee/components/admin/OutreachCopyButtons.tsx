"use client";

import { useState } from "react";

type Props = {
  subject: string;
  body: string;
  followupSubject: string;
  followupBody: string;
  disabled?: boolean;
};

export default function OutreachCopyButtons({
  subject,
  body,
  followupSubject,
  followupBody,
  disabled,
}: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = async (key: string, text: string) => {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied("error");
      setTimeout(() => setCopied(null), 1500);
    }
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      <button
        type="button"
        onClick={() => handleCopy("subject", subject)}
        disabled={disabled}
        style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #111", background: disabled ? "#e5e7eb" : "#fff", fontSize: 12 }}
      >
        {copied === "subject" ? "Subject copied" : "Copy subject"}
      </button>
      <button
        type="button"
        onClick={() => handleCopy("body", body)}
        disabled={disabled}
        style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #111", background: disabled ? "#e5e7eb" : "#fff", fontSize: 12 }}
      >
        {copied === "body" ? "Email copied" : "Copy email"}
      </button>
      <button
        type="button"
        onClick={() => handleCopy("followup-subject", followupSubject)}
        disabled={disabled}
        style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #111", background: disabled ? "#e5e7eb" : "#fff", fontSize: 12 }}
      >
        {copied === "followup-subject" ? "Follow-up subject copied" : "Copy follow-up subject"}
      </button>
      <button
        type="button"
        onClick={() => handleCopy("followup-body", followupBody)}
        disabled={disabled}
        style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #111", background: disabled ? "#e5e7eb" : "#fff", fontSize: 12 }}
      >
        {copied === "followup-body" ? "Follow-up copied" : "Copy follow-up email"}
      </button>
    </div>
  );
}
