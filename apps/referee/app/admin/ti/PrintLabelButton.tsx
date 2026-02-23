"use client";

import { useState } from "react";

type Props = {
  code: string;
  foundingAccess: boolean;
};

export default function PrintLabelButton({ code, foundingAccess }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePrint = async () => {
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/ti/event-codes/print-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, foundingAccess, quantity: 1 }),
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error(json?.error || "Print label failed.");
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Print label failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <button type="button" onClick={handlePrint} disabled={busy || !code}>
        {busy ? "Generating..." : "Print label"}
      </button>
      {error ? <span style={{ color: "#b91c1c", fontSize: 11 }}>{error}</span> : null}
    </div>
  );
}

