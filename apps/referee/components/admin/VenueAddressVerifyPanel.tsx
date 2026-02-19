"use client";

import { useState } from "react";

type VerifyRow = {
  id: string;
  name: string | null;
  changed_fields: string[];
};

type VerifyResponse = {
  tool: "venue_address_verify";
  dryRun: boolean;
  limit: number;
  scanned: number;
  updated: number;
  parsed_address_rows: number;
  geocoded_rows: number;
  timezone_rows: number;
  website_rows: number;
  rows: VerifyRow[];
};

export default function VenueAddressVerifyPanel() {
  const [limit, setLimit] = useState(100);
  const [dryRun, setDryRun] = useState(false);
  const [onlyIncomplete, setOnlyIncomplete] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResponse | null>(null);

  const runVerify = async () => {
    setRunning(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/venues/address-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit,
          dryRun,
          onlyIncomplete,
        }),
      });

      const json = await resp.json();
      if (!resp.ok) {
        throw new Error(json?.error || "venue_address_verify_failed");
      }
      setResult(json as VerifyResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "venue_address_verify_failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff", marginBottom: 16 }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>Venue Address Verify</div>
      <div style={{ fontSize: 13, color: "#4b5563", marginBottom: 10 }}>
        Parses full addresses, backfills city/state/zip, geocodes missing coordinates, derives timezone, and fills venue URL when found.
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <span>Limit</span>
          <input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value || 100))}
            style={{ width: 90, padding: "6px 8px", borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={onlyIncomplete}
            onChange={(e) => setOnlyIncomplete(e.target.checked)}
          />
          Only incomplete rows
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Dry run
        </label>
        <button
          type="button"
          onClick={runVerify}
          disabled={running}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #111827", background: "#111827", color: "#fff" }}
        >
          {running ? "Running…" : "Run venue address verify"}
        </button>
      </div>

      {error ? <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}

      {result ? (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <div style={{ fontSize: 13, color: "#1f2937" }}>
            Scanned {result.scanned} • Updated {result.updated}
            {result.dryRun ? " (dry run)" : ""}
          </div>
          <div style={{ fontSize: 12, color: "#4b5563" }}>
            Parsed address rows: {result.parsed_address_rows} • Geocoded: {result.geocoded_rows} • Timezone: {result.timezone_rows} • Website: {result.website_rows}
          </div>
          {result.rows.length > 0 ? (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
              {result.rows.slice(0, 12).map((row) => (
                <div key={row.id} style={{ padding: "8px 10px", borderTop: "1px solid #f1f5f9", fontSize: 12 }}>
                  <strong>{row.name || row.id}</strong> — {row.changed_fields.join(", ")}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#6b7280" }}>No row-level changes returned.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

