"use client";

import { useState } from "react";

const LABEL_WIDTH_KEY = "ri_event_label_width_in";
const LABEL_HEIGHT_KEY = "ri_event_label_height_in";

type Props = {
  code: string;
  foundingAccess: boolean;
  formId?: string;
};

export default function PrintLabelButton({ code, foundingAccess, formId }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePrint = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let codeValue = code;
      let foundingAccessValue = foundingAccess;

      if (formId) {
        const formEl = document.getElementById(formId) as HTMLFormElement | null;
        if (formEl) {
          const fd = new FormData(formEl);
          const formCode = String(fd.get("code") ?? "").trim();
          codeValue = formCode || codeValue;
          foundingAccessValue = fd.get("founding_access") != null;
        }
      }

      if (!codeValue) {
        throw new Error("Code is required.");
      }

      let widthInches = 1.5;
      let heightInches = 0.75;
      try {
        const widthStored = Number(window.localStorage.getItem(LABEL_WIDTH_KEY) ?? "1.5");
        const heightStored = Number(window.localStorage.getItem(LABEL_HEIGHT_KEY) ?? "0.75");
        if (Number.isFinite(widthStored)) widthInches = Math.max(0.5, Math.min(4, widthStored));
        if (Number.isFinite(heightStored)) heightInches = Math.max(0.5, Math.min(2, heightStored));
      } catch {
        // ignore storage issues
      }

      const resp = await fetch("/api/admin/ti/event-codes/print-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeValue, foundingAccess: foundingAccessValue, quantity: 1, widthInches, heightInches }),
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
      <button type="button" onClick={handlePrint} disabled={busy}>
        {busy ? "Generating..." : "Print label"}
      </button>
      {error ? <span style={{ color: "#b91c1c", fontSize: 11 }}>{error}</span> : null}
    </div>
  );
}
