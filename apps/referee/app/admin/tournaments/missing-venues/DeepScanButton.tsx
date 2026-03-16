"use client";

import { useState } from "react";

export default function DeepScanButton({ tournamentId }: { tournamentId: string }) {
  const [status, setStatus] = useState<string>("");
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setStatus("Running deep scan...");
    try {
      const res = await fetch(
        `/api/admin/tournaments/enrichment/fees-venue?mode=missing_venues&limit=1&skip_pending=0&tournament_id=${encodeURIComponent(
          tournamentId
        )}`,
        { method: "POST" }
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        setStatus(`Error: ${json?.error || res.statusText}`);
        return;
      }
      const inserted = Number(json.inserted ?? 0);
      const pages = Number(json.pages_fetched ?? 0);
      const summary = Array.isArray(json.summary) ? json.summary : [];
      const hint =
        summary.length && summary[0]?.found?.length ? `Found: ${summary[0].found.join(", ")}` : "Scan complete";
      setStatus(`Inserted ${inserted} candidate(s) • ${pages} page(s). ${hint}`);
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
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid #111827",
          background: running ? "#f3f4f6" : "#fff",
          color: "#111827",
          fontWeight: 800,
          cursor: running ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {running ? "Scanning..." : "Deep scan"}
      </button>
      {status ? <div style={{ fontSize: 12, color: "#4b5563", maxWidth: 280 }}>{status}</div> : null}
      <a href="/admin/tournaments/enrichment" style={{ fontSize: 12, color: "#1d4ed8", textDecoration: "none" }}>
        Review candidates
      </a>
    </div>
  );
}

