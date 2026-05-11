"use client";

import { useState } from "react";

export default function PerplexityVenueButton({ tournamentId }: { tournamentId: string }) {
  const [status, setStatus] = useState<string>("");
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setStatus("Searching...");
    try {
      const res = await fetch("/api/admin/tournaments/enrichment/venue-perplexity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tournament_id: tournamentId }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        setStatus(`Error: ${json?.error || res.statusText}`);
        return;
      }
      const inserted = Number(json.inserted ?? 0);
      if (inserted === 0) {
        setStatus(json.message ?? "No venues found");
      } else {
        const names = (json.candidates ?? [])
          .map((c: any) => c.venue_name || c.address_text)
          .filter(Boolean)
          .slice(0, 3);
        setStatus(
          `Found ${inserted} venue${inserted !== 1 ? "s" : ""}${names.length ? `: ${names.join(", ")}` : ""}`
        );
      }
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
          border: "1px solid #7c3aed",
          background: running ? "#f5f3ff" : "#fff",
          color: "#7c3aed",
          fontWeight: 800,
          cursor: running ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
          fontSize: 13,
        }}
      >
        {running ? "Searching..." : "Find via Perplexity"}
      </button>
      {status ? (
        <div style={{ fontSize: 12, color: "#4b5563", maxWidth: 280 }}>{status}</div>
      ) : null}
    </div>
  );
}
