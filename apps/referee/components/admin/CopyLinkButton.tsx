"use client";

import { useState } from "react";

type Props = {
  text: string;
  label?: string;
};

export default function CopyLinkButton({ text, label = "Copy" }: Props) {
  const [message, setMessage] = useState<string | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied");
      setTimeout(() => setMessage(null), 1200);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Copy failed");
      setTimeout(() => setMessage(null), 1600);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      style={{
        padding: "6px 10px",
        borderRadius: 8,
        border: "1px solid #cbd5f5",
        background: "#fff",
        fontSize: 12,
        fontWeight: 800,
        cursor: "pointer",
      }}
      aria-label={message ?? label}
      title={message ?? label}
    >
      {message ?? label}
    </button>
  );
}
