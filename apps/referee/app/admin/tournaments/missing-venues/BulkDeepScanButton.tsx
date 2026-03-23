"use client";

import { useState } from "react";

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function BulkDeepScanButton({ initialLimit = 50, total }: { initialLimit?: number; total?: number }) {
  const [status, setStatus] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [limit, setLimit] = useState<number>(clampInt(initialLimit, 1, 200));

  const runOnce = async (): Promise<any | null> => {
    if (running) return;
    try {
      const res = await fetch(
        `/api/admin/tournaments/enrichment/fees-venue?mode=missing_venues&limit=${encodeURIComponent(
          String(limit)
        )}&skip_pending=0`,
        { method: "POST" }
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        return { ok: false, error: json?.error || res.statusText };
      }
      return json;
    } catch (err: any) {
      return { ok: false, error: err?.message || "request failed" };
    }
  };

  const run = async () => {
    if (running) return;
    setRunning(true);
    setStatus(`Running deep scan for up to ${limit} tournaments...`);
    try {
      const json = await runOnce();
      if (!json?.ok) {
        setStatus(`Error: ${json?.error || "request failed"}`);
        return;
      }
      const inserted = Number(json.inserted ?? 0);
      const attempted = Number(json.attempted ?? 0);
      const pages = Number(json.pages_fetched ?? 0);
      const skippedLinked = Number(json.skipped_linked ?? 0);
      setStatus(
        `Inserted ${inserted} candidate(s) from ${attempted} tournaments • ${pages} page(s).` +
          (skippedLinked ? ` (Skipped linked: ${skippedLinked})` : "")
      );
    } finally {
      setRunning(false);
    }
  };

  const runAll = async () => {
    if (running) return;
    const totalCount = Number(total ?? 0);
    if (!totalCount || totalCount <= 0) {
      setStatus("No backlog count available on this page.");
      return;
    }
    setRunning(true);
    const plannedRuns = clampInt(Math.ceil(totalCount / Math.max(1, limit)), 1, 50);
    let totalInserted = 0;
    let totalAttempted = 0;
    let totalPages = 0;
    let totalSkippedLinked = 0;
    try {
      for (let i = 0; i < plannedRuns; i += 1) {
        setStatus(`Batch ${i + 1}/${plannedRuns}: running (limit ${limit})...`);
        const json = await runOnce();
        if (!json?.ok) {
          setStatus(`Batch ${i + 1}/${plannedRuns}: error: ${json?.error || "request failed"}`);
          return;
        }
        const inserted = Number(json.inserted ?? 0);
        const attempted = Number(json.attempted ?? 0);
        const pages = Number(json.pages_fetched ?? 0);
        const skippedLinked = Number(json.skipped_linked ?? 0);
        totalInserted += inserted;
        totalAttempted += attempted;
        totalPages += pages;
        totalSkippedLinked += skippedLinked;
        setStatus(
          `Batch ${i + 1}/${plannedRuns}: inserted ${inserted} from ${attempted} tournaments • ${pages} page(s). ` +
            `Totals: inserted ${totalInserted} • attempted ${totalAttempted} • pages ${totalPages}.` +
            (totalSkippedLinked ? ` (Skipped linked total: ${totalSkippedLinked})` : "")
        );
        if (!attempted) break;
        await sleep(300);
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="number"
          min={1}
          max={200}
          value={limit}
          onChange={(e) => setLimit(clampInt(Number(e.target.value || 0), 1, 200))}
          disabled={running}
          style={{ width: 90, padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1" }}
          title="Batch size (max 200)"
        />
        <span style={{ fontSize: 12, color: "#475569" }}>per batch</span>
      </div>
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
      {typeof total === "number" && total > limit ? (
        <button
          type="button"
          onClick={runAll}
          disabled={running}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #111827",
            background: running ? "#f3f4f6" : "#fff",
            color: "#111827",
            fontWeight: 900,
            cursor: running ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
          title={`Runs ~${Math.ceil(total / Math.max(1, limit))} batch(es)`}
        >
          {running ? "Deep scan running..." : `Deep scan all (${total})`}
        </button>
      ) : null}
      {status ? <div style={{ fontSize: 12, color: "#4b5563", maxWidth: 520 }}>{status}</div> : null}
    </div>
  );
}
