"use client";

import { useState } from "react";

type VerifyRow = {
  id: string;
  name: string | null;
  changed_fields: string[];
};

type CategoryStat = { complete: number; existing: number; error: number; skipped: number };

type GeocodeSample = { query: string | null; expectedState: string | null; outcome: string };

type VerifyResponse = {
  tool: "venue_address_verify";
  dryRun: boolean;
  limit: number;
  scanned: number;
  updated: number;
  stats: {
    address: CategoryStat;
    geocode: CategoryStat;
    timezone: CategoryStat;
    website: CategoryStat;
  };
  rows: VerifyRow[];
  _debug?: { geocodeSamples: GeocodeSample[] };
};

export default function VenueAddressVerifyPanel() {
  const [limit, setLimit] = useState(100);
  const [dryRun, setDryRun] = useState(false);
  const [onlyIncomplete, setOnlyIncomplete] = useState(true);
  const [fillTimezone, setFillTimezone] = useState(false);
  const [fillWebsite, setFillWebsite] = useState(false);
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
          fillTimezone,
          fillWebsite,
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
        Parses full addresses, backfills city/state/zip, and geocodes missing coordinates (Mapbox). Timezone (Google) and website URL (Google Places) are opt-in.
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
          <input type="checkbox" checked={fillTimezone} onChange={(e) => setFillTimezone(e.target.checked)} />
          Fill timezone (Google)
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={fillWebsite} onChange={(e) => setFillWebsite(e.target.checked)} />
          Fill website URL (Google Places)
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {(
              [
                { label: "Address", note: "Mapbox", stat: result.stats.address },
                { label: "Geocoding", note: "Mapbox", stat: result.stats.geocode },
                { label: "Timezone", note: "Google", stat: result.stats.timezone },
                { label: "Website URL", note: "Google Places", stat: result.stats.website },
              ] as const
            ).map(({ label, note, stat }) => (
              <div key={label} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 5 }}>
                  {label} <span style={{ color: "#9ca3af", fontWeight: 400 }}>({note})</span>
                </div>
                <div style={{ fontSize: 12, display: "grid", gap: 2 }}>
                  <span style={{ color: stat.complete > 0 ? "#166534" : "#6b7280" }}>complete: {stat.complete}</span>
                  <span style={{ color: "#374151" }}>existing: {stat.existing}</span>
                  <span style={{ color: stat.error > 0 ? "#b91c1c" : "#6b7280" }}>error: {stat.error}</span>
                  <span style={{ color: "#9ca3af" }}>skipped: {stat.skipped}</span>
                </div>
              </div>
            ))}
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

          {result._debug?.geocodeSamples && result._debug.geocodeSamples.length > 0 ? (
            <div style={{ border: "1px solid #fef08a", borderRadius: 8, padding: "8px 10px", background: "#fefce8" }}>
              <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4, color: "#854d0e" }}>Debug — geocode samples (first 5 attempts)</div>
              {result._debug.geocodeSamples.map((s, i) => (
                <div key={i} style={{ fontSize: 11, fontFamily: "monospace", marginBottom: 2, color: s.outcome === "error" ? "#b91c1c" : "#374151" }}>
                  [{s.outcome}] {s.query ?? "(null)"}{s.expectedState ? ` · state=${s.expectedState}` : ""}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

