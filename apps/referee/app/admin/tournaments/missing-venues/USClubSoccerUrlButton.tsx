"use client";

import { useState } from "react";

export default function USClubSoccerUrlButton({ limit = 400 }: { limit?: number }) {
  const [status, setStatus] = useState<string>("");
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setStatus("Scanning US Club Soccer directory...");
    try {
      const res = await fetch(
        `/api/admin/tournaments/enrichment/us-club-soccer?limit=${encodeURIComponent(String(limit))}`,
        { method: "POST" }
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        setStatus(`Error: ${json?.error || res.statusText}`);
        return;
      }
      setStatus(
        `Found ${json?.matched ?? 0}/${json?.attempted ?? 0} matches • inserted ${json?.inserted ?? 0} URL suggestion(s). Review in enrichment.`
      );
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
          border: "1px solid #7c3aed",
          background: running ? "#f3f4f6" : "#fff",
          color: "#7c3aed",
          fontWeight: 900,
          cursor: running ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
        }}
        title="Creates URL suggestions for tournaments whose URL points to the US Club Soccer directory"
      >
        {running ? "Scanning directory..." : "Find real URLs (US Club Soccer)"}
      </button>
      {status ? <div style={{ fontSize: 12, color: "#4b5563", maxWidth: 520 }}>{status}</div> : null}
      <a href="/admin/tournaments/enrichment" style={{ fontSize: 12, color: "#1d4ed8", textDecoration: "none" }}>
        Review URL suggestions
      </a>
    </div>
  );
}

