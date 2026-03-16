"use client";

import { useState } from "react";

export default function BulkDeepScanButton({ limit = 50 }: { limit?: number }) {
  const [status, setStatus] = useState<string>("");
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setStatus(`Running deep scan for up to ${limit} tournaments...`);
    try {
      const res = await fetch(
        `/api/admin/tournaments/enrichment/fees-venue?mode=missing_venues&limit=${encodeURIComponent(
          String(limit)
        )}&skip_pending=0`,
        { method: "POST" }
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        setStatus(`Error: ${json?.error || res.statusText}`);
        return;
      }
      const inserted = Number(json.inserted ?? 0);
      const attempted = Number(json.attempted ?? 0);
      const pages = Number(json.pages_fetched ?? 0);
      setStatus(`Inserted ${inserted} candidate(s) from ${attempted} tournaments • ${pages} page(s).`);
    } catch (err: any) {
      setStatus(`Error: ${err?.message || "request failed"}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <button
        type="button"
        onClick={run}
        disabled={running}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #0f3d2e",
          background: running ? "#f3f4f6" : "#0f3d2e",
          color: running ? "#111827" : "#fff",
          fontWeight: 900,
          cursor: running ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {running ? "Deep scan running..." : `Deep scan ${limit}`}
      </button>
      {status ? <div style={{ fontSize: 12, color: "#4b5563", maxWidth: 520 }}>{status}</div> : null}
    </div>
  );
}

