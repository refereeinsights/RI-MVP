"use client";

import { useMemo, useState } from "react";

type CsvRow = {
  tournament_uuid: string;
  tournament_name?: string;
  organizer_kind?: string;
  organizer_value?: string;
  venue_id?: string;
  venue_name: string;
  venue_address?: string;
  venue_city?: string;
  venue_state?: string;
  venue_zip?: string;
  confidence?: string;
  notes?: string;
};

type IngestResultRow = {
  tournament_uuid: string;
  venue_name: string;
  venue_id?: string | null;
  action: "linked_existing_venue" | "created_venue" | "already_linked" | "skipped" | "error";
  message?: string | null;
};

type IngestResponse = {
  tool: "venue_enrichment_csv_ingest";
  dryRun: boolean;
  rows_in_file: number;
  rows_processed: number;
  venues_created: number;
  venues_matched: number;
  links_created: number;
  links_already_present: number;
  skipped: number;
  errors: number;
  rows: IngestResultRow[];
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\"") {
      const next = line[i + 1];
      if (inQuotes && next === "\"") {
        cur += "\"";
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);

  const tournamentIdIdx = idx("tournament_uuid") >= 0 ? idx("tournament_uuid") : idx("tournament_id");
  const tournamentNameIdx = idx("tournament_name");
  const organizerKindIdx = idx("organizer_kind");
  const organizerValueIdx = idx("organizer_value");
  const venueIdIdx = idx("venue_id");
  const venueNameIdx = idx("venue_name");
  const venueAddressIdx = idx("venue_address");
  const venueAddressTextIdx = idx("venue_address_text");
  const venueCityIdx = idx("venue_city");
  const venueStateIdx = idx("venue_state");
  const venueZipIdx = idx("venue_zip");
  const confidenceIdx = idx("confidence");
  const notesIdx = idx("notes");

  if (tournamentIdIdx < 0 || venueNameIdx < 0) {
    throw new Error(
      `CSV must include headers: tournament_uuid (or tournament_id),venue_name (and optionally venue_id,venue_address/venue_address_text,venue_city,venue_state,venue_zip,confidence,notes). Got: ${header.join(
        ","
      )}`
    );
  }

  const out: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const tournament_uuid = (cols[tournamentIdIdx] ?? "").trim();
    const venue_name = (cols[venueNameIdx] ?? "").trim();
    if (!tournament_uuid || !venue_name) continue;

    out.push({
      tournament_uuid,
      tournament_name: tournamentNameIdx >= 0 ? (cols[tournamentNameIdx] ?? "").trim() : undefined,
      organizer_kind: organizerKindIdx >= 0 ? (cols[organizerKindIdx] ?? "").trim() : undefined,
      organizer_value: organizerValueIdx >= 0 ? (cols[organizerValueIdx] ?? "").trim() : undefined,
      venue_id: venueIdIdx >= 0 ? (cols[venueIdIdx] ?? "").trim() : undefined,
      venue_name,
      venue_address:
        venueAddressIdx >= 0
          ? (cols[venueAddressIdx] ?? "").trim()
          : venueAddressTextIdx >= 0
            ? (cols[venueAddressTextIdx] ?? "").trim()
            : undefined,
      venue_city: venueCityIdx >= 0 ? (cols[venueCityIdx] ?? "").trim() : undefined,
      venue_state: venueStateIdx >= 0 ? (cols[venueStateIdx] ?? "").trim() : undefined,
      venue_zip: venueZipIdx >= 0 ? (cols[venueZipIdx] ?? "").trim() : undefined,
      confidence: confidenceIdx >= 0 ? (cols[confidenceIdx] ?? "").trim() : undefined,
      notes: notesIdx >= 0 ? (cols[notesIdx] ?? "").trim() : undefined,
    });
  }
  return out;
}

export default function VenueVenueEnrichmentCsvPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResponse | null>(null);

  const fileLabel = useMemo(() => (file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : "No file chosen"), [file]);

  const runIngest = async () => {
    if (!file) {
      setError("Please choose a CSV file first.");
      return;
    }

    if (!dryRun) {
      const ok = window.confirm("Apply changes to the database (create venues + link tournaments)?");
      if (!ok) return;
    }

    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        throw new Error("No data rows found in CSV.");
      }

      const resp = await fetch("/api/admin/venues/venue-enrichment-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, rows }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        throw new Error(json?.error || "venue_enrichment_csv_failed");
      }
      setResult(json as IngestResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "venue_enrichment_csv_failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff", marginBottom: 16 }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>Venue Enrichment CSV</div>
      <div style={{ fontSize: 13, color: "#4b5563", marginBottom: 10 }}>
        Upload a CSV with `tournament_uuid` + venue details. The tool links to an existing venue when found, or creates a new venue and links it.
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
            }}
          />
          <span style={{ color: "#6b7280" }}>{fileLabel}</span>
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Dry run
        </label>

        <button
          type="button"
          onClick={runIngest}
          disabled={running || !file}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #111827", background: "#111827", color: "#fff" }}
        >
          {running ? "Running…" : dryRun ? "Run CSV ingest (dry run)" : "Run CSV ingest (apply)"}
        </button>
      </div>

      {error ? <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}

      {result ? (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <div style={{ fontSize: 13, color: "#1f2937" }}>
            Processed {result.rows_processed}/{result.rows_in_file} row(s) • Links created {result.links_created} • Venues created{" "}
            {result.venues_created}
            {result.dryRun ? " (dry run)" : ""}
          </div>
          <div style={{ fontSize: 12, color: "#4b5563" }}>
            Matched venues: {result.venues_matched} • Already linked: {result.links_already_present} • Skipped: {result.skipped} • Errors:{" "}
            {result.errors}
          </div>

          {result.rows.length > 0 ? (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
              {result.rows.slice(0, 12).map((row, idx) => (
                <div key={`${row.tournament_uuid}:${row.venue_name}:${idx}`} style={{ padding: "8px 10px", borderTop: "1px solid #f1f5f9", fontSize: 12 }}>
                  <strong>{row.venue_name}</strong> — {row.action}
                  {row.message ? <span style={{ color: "#6b7280" }}> • {row.message}</span> : null}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#6b7280" }}>No row-level results returned.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
