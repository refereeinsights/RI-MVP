"use client";

import { useState, useTransition } from "react";

export default function CopyFieldButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={() => startTransition(() => void handleCopy())}
      disabled={pending}
      style={{
        borderRadius: 8,
        border: "1px solid #cbd5e1",
        background: copied ? "#dbeafe" : "#ffffff",
        color: "#0f172a",
        padding: "8px 12px",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {copied ? `${label} copied` : label}
    </button>
  );
}
