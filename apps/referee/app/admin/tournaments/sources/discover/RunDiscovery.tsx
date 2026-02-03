"use client";

import { useMemo, useState } from "react";

type ResultRow = {
  url: string;
  title?: string | null;
  snippet?: string | null;
  domain?: string | null;
  status: "inserted" | "existing" | "updated";
};

type Summary = {
  inserted: number;
  skipped_existing: number;
  total_found: number;
  sample_urls: string[];
  results: ResultRow[];
};

type Props = {
  queries: string[];
  sportOptions: readonly string[];
  sourceTypeOptions: readonly string[];
};

export default function RunDiscovery({ queries, sportOptions, sourceTypeOptions }: Props) {
  const [sport, setSport] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [state, setState] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const hasQueries = queries.length > 0;
  const queryPreview = useMemo(() => queries.slice(0, 6), [queries]);

  async function runDiscovery() {
    setError(null);
    setSummary(null);
    if (!hasQueries) {
      setError("Generate queries first.");
      return;
    }
    if (!sport || !sourceType) {
      setError("Sport and source type are required.");
      return;
    }
    setRunning(true);
    try {
      const res = await fetch("/api/atlas/discover-and-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries,
          sport,
          source_type: sourceType,
          state: state.trim() || undefined,
          result_limit_per_query: 10,
          max_total_urls: 100,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Run failed");
        return;
      }
      const nextSummary: Summary = {
        inserted: data.inserted ?? 0,
        skipped_existing: data.skipped_existing ?? 0,
        total_found: data.total_found ?? 0,
        sample_urls: Array.isArray(data.sample_urls) ? data.sample_urls : [],
        results: Array.isArray(data.results)
          ? data.results.map((r: any) => ({
              url: r.url,
              title: r.title ?? null,
              snippet: r.snippet ?? null,
              domain: r.domain ?? null,
              status: r.status === "existing" ? "existing" : "inserted",
            }))
          : [],
      };
      setSummary(nextSummary);
    } catch (err: any) {
      setError(err?.message || "Run failed");
    } finally {
      setRunning(false);
    }
  }

  async function updateStatus(url: string, action: "keep" | "dead" | "login_required" | "pdf_only") {
    try {
      const res = await fetch("/api/atlas/update-source-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Update failed");
        return;
      }
      setSummary((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        next.results = prev.results.map((r) =>
          r.url === url ? { ...r, status: "updated" } : r
        );
        return next;
      });
    } catch (err: any) {
      setError(err?.message || "Update failed");
    }
  }

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginTop: 12 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Run discovery</h3>
      <p style={{ margin: "6px 0 10px", fontSize: 12, color: "#475569" }}>
        Run generated queries and queue results for review. This does not auto-publish.
      </p>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
          Sport (required)
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
          >
            <option value="">Select sport</option>
            {sportOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
          Source type (required)
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
          >
            <option value="">Select type</option>
            {sourceTypeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
          State (optional)
          <input
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="WA"
            style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>
      </div>
      {queryPreview.length > 0 && (
        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
          {queryPreview.map((q, idx) => (
            <div key={idx} style={{ fontSize: 12, color: "#475569" }}>
              {q}
            </div>
          ))}
          {queries.length > queryPreview.length && (
            <div style={{ fontSize: 12, color: "#94a3b8" }}>+{queries.length - queryPreview.length} more queries</div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={runDiscovery}
          disabled={running}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "none",
            background: running ? "#94a3b8" : "#0f172a",
            color: "#fff",
            fontWeight: 800,
            cursor: running ? "not-allowed" : "pointer",
          }}
        >
          {running ? "Running..." : "Run discovery"}
        </button>
        {error && <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span>}
      </div>

      {summary && (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
            <span><strong>Found:</strong> {summary.total_found}</span>
            <span><strong>Inserted:</strong> {summary.inserted}</span>
            <span><strong>Existing:</strong> {summary.skipped_existing}</span>
            <a
              href={`/admin/tournaments/sources?filter=needs_review`}
              style={{ color: "#0f172a", fontWeight: 700, textDecoration: "none" }}
            >
              Open review queue →
            </a>
          </div>
          {summary.results.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              {summary.results.slice(0, 12).map((row) => (
                <div key={row.url} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{row.domain || row.url}</div>
                  <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>{row.url}</div>
                  {row.title && <div style={{ fontSize: 12, fontWeight: 600 }}>{row.title}</div>}
                  {row.snippet && <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{row.snippet}</div>}
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {(["keep", "dead", "login_required", "pdf_only"] as const).map((action) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => updateStatus(row.url, action)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid #d1d5db",
                          background: "#f9fafb",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {action.replace("_", " ")}
                      </button>
                    ))}
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>
                      {row.status === "updated" ? "Updated" : row.status === "existing" ? "Already queued" : "Queued"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
