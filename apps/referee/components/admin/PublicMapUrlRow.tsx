"use client";

import { useState } from "react";
import Link from "next/link";

import { tiVenueMapUrl } from "@/lib/ti/publicUrls";

type Props = {
  venueId: string;
  label?: string;
  compact?: boolean;
};

export default function PublicMapUrlRow({ venueId, label = "Public map URL", compact = false }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const url = tiVenueMapUrl(venueId);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Copied");
      setTimeout(() => setMessage(null), 1200);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Copy failed");
    }
  };

  return (
    <div style={{ display: "grid", gap: 6, width: "100%" }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={url}
          readOnly
          style={{
            flex: "1 1 200px",
            minWidth: compact ? 160 : 220,
            padding: compact ? "6px 8px" : "8px 10px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            fontSize: compact ? 12 : 13,
          }}
        />
        <button
          type="button"
          onClick={handleCopy}
          style={{
            padding: compact ? "6px 10px" : "8px 12px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#f8fafc",
            cursor: "pointer",
            fontSize: compact ? 12 : 13,
          }}
        >
          Copy
        </button>
        <Link
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: compact ? "6px 10px" : "8px 12px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#fff",
            textDecoration: "none",
            fontSize: compact ? 12 : 13,
          }}
        >
          Open
        </Link>
      </div>
      {message && <div style={{ fontSize: 12, color: "#4b5563" }}>{message}</div>}
    </div>
  );
}
