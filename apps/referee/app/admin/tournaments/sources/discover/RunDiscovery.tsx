"use client";

import { useMemo, useState } from "react";

type ResultRow = {
  url: string;
  title?: string | null;
  snippet?: string | null;
  domain?: string | null;
  status: "inserted" | "existing" | "terminal" | "updated";
  last_action?: "keep" | "dead" | "login_required" | "pdf_only" | "queue_tournament" | "queue_assignor" | null;
};

type Summary = {
  inserted: number;
  skipped_existing: number;
  skipped_terminal: number;
  duplicates_dropped: number;
  total_found: number;
  sample_urls: string[];
  results: ResultRow[];
};

type Props = {
  queries: string[];
  sportOptions: readonly string[];
  sourceTypeOptions: readonly string[];
  defaultTarget: string;
};

export default function RunDiscovery({ queries, sportOptions, sourceTypeOptions, defaultTarget }: Props) {
  const [sport, setSport] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [target, setTarget] = useState(defaultTarget === "assignor" ? "assignor" : "tournament");
  const [state, setState] = useState("");
  const [perQueryLimit, setPerQueryLimit] = useState(10);
  const [maxTotal, setMaxTotal] = useState(100);
  const [hideUpdated, setHideUpdated] = useState(false);
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
    if (!sport || (!sourceType && target === "tournament")) {
      setError(target === "tournament" ? "Sport and source type are required." : "Sport is required.");
      return;
    }
    setRunning(true);
    try {
      const res = await fetch("/api/atlas/discover-and-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries,
          target,
          sport,
          source_type: target === "tournament" ? sourceType : undefined,
          state: state.trim() || undefined,
          result_limit_per_query: perQueryLimit,
          max_total_urls: maxTotal,
        }),
      });
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        setError(data?.error || `Run failed (${res.status})`);
        return;
      }
      const nextSummary: Summary = {
        inserted: data.inserted ?? 0,
        skipped_existing: data.skipped_existing ?? 0,
        skipped_terminal: data.skipped_terminal ?? 0,
        duplicates_dropped: data.duplicates_dropped ?? 0,
        total_found: data.total_found ?? 0,
        sample_urls: Array.isArray(data.sample_urls) ? data.sample_urls : [],
        results: Array.isArray(data.results)
          ? data.results.map((r: any) => ({
              url: r.url,
              title: r.title ?? null,
              snippet: r.snippet ?? null,
              domain: r.domain ?? null,
              status: r.status === "terminal" ? "terminal" : r.status === "existing" ? "existing" : "inserted",
              last_action: null,
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
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        setError(data?.error || `Update failed (${res.status})`);
        return;
      }
      setSummary((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        next.results = prev.results.map((r) =>
          r.url === url ? { ...r, status: "updated", last_action: action } : r
        );
        return next;
      });
    } catch (err: any) {
      setError(err?.message || "Update failed");
    }
  }

  async function queueResult(row: ResultRow, nextTarget: "tournament" | "assignor") {
    setError(null);
    if (!sport || (!sourceType && nextTarget === "tournament")) {
      setError(nextTarget === "tournament" ? "Sport and source type are required." : "Sport is required.");
      return;
    }
    try {
      const res = await fetch("/api/atlas/queue-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: row.url,
          target: nextTarget,
          sport,
          source_type: nextTarget === "tournament" ? sourceType : undefined,
          state: state.trim() || undefined,
          title: row.title ?? undefined,
          snippet: row.snippet ?? undefined,
        }),
      });
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        setError(data?.error || `Queue failed (${res.status})`);
        return;
      }
      setSummary((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        next.results = prev.results.map((r) =>
          r.url === row.url
            ? data?.status === "terminal"
              ? { ...r, status: "terminal", last_action: null }
              : { ...r, status: "updated", last_action: `queue_${nextTarget}` }
            : r
        );
        return next;
      });
    } catch (err: any) {
      setError(err?.message || "Queue failed");
    }
  }

  const visibleResults =
    summary?.results?.filter((row) => (hideUpdated ? row.status !== "updated" : true)) ?? [];

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginTop: 12 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Run discovery</h3>
      <p style={{ margin: "6px 0 10px", fontSize: 12, color: "#475569" }}>
        Run generated queries and queue results for review. This does not auto-publish.
      </p>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
          Target (required)
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value === "assignor" ? "assignor" : "tournament")}
            style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
          >
            <option value="tournament">Tournament sources</option>
            <option value="assignor">Assignor sources</option>
          </select>
        </label>
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
        {target === "tournament" ? (
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
        ) : null}
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
          State (optional)
          <input
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="WA"
            style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
          Results per query
          <input
            type="number"
            min={1}
            max={50}
            value={perQueryLimit}
            onChange={(e) => setPerQueryLimit(Number(e.target.value))}
            style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
          Max total URLs
          <input
            type="number"
            min={1}
            max={200}
            value={maxTotal}
            onChange={(e) => setMaxTotal(Number(e.target.value))}
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
            <span><strong>Skipped terminal:</strong> {summary.skipped_terminal}</span>
            <span><strong>Duplicates dropped:</strong> {summary.duplicates_dropped}</span>
            <a
              href={`/admin/tournaments/sources?filter=needs_review`}
              style={{ color: "#0f172a", fontWeight: 700, textDecoration: "none" }}
            >
              Open review queue →
            </a>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              <input
                type="checkbox"
                checked={hideUpdated}
                onChange={(e) => setHideUpdated(e.target.checked)}
              />
              Hide updated
            </label>
          </div>
          {visibleResults.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              {visibleResults.slice(0, 12).map((row) => (
                <div key={row.url} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{row.domain || row.url}</div>
                  <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>{row.url}</div>
                  {row.title && <div style={{ fontSize: 12, fontWeight: 600 }}>{row.title}</div>}
                  {row.snippet && <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{row.snippet}</div>}
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {(["tournament", "assignor"] as const).map((nextTarget) => {
                      const isSelected = row.status === "updated" && row.last_action === `queue_${nextTarget}`;
                      return (
                        <button
                          key={nextTarget}
                          type="button"
                          onClick={() => queueResult(row, nextTarget)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: isSelected ? "1px solid #0f172a" : "1px solid #d1d5db",
                            background: isSelected ? "#0f172a" : "#f9fafb",
                            color: isSelected ? "#fff" : "#111827",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {`Queue as ${nextTarget}`}
                        </button>
                      );
                    })}
                    {(["keep", "dead", "login_required", "pdf_only"] as const).map((action) => {
                      const isSelected = row.status === "updated" && row.last_action === action;
                      return (
                        <button
                          key={action}
                          type="button"
                          onClick={() => updateStatus(row.url, action)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: isSelected ? "1px solid #0f172a" : "1px solid #d1d5db",
                            background: isSelected ? "#0f172a" : "#f9fafb",
                            color: isSelected ? "#fff" : "#111827",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {action.replace("_", " ")}
                        </button>
                      );
                    })}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color:
                          row.last_action === "keep"
                            ? "#065f46"
                          : row.last_action === "dead"
                            ? "#991b1b"
                          : row.status === "terminal"
                            ? "#7c2d12"
                          : row.status === "updated"
                            ? "#0f172a"
                            : "#1f2937",
                        background:
                          row.last_action === "keep"
                            ? "#d1fae5"
                          : row.last_action === "dead"
                            ? "#fee2e2"
                          : row.status === "terminal"
                            ? "#ffedd5"
                          : row.status === "updated"
                            ? "#e2e8f0"
                            : "#f3f4f6",
                        border:
                          row.last_action === "keep"
                            ? "1px solid #10b981"
                          : row.last_action === "dead"
                            ? "1px solid #ef4444"
                          : row.status === "terminal"
                            ? "1px solid #f97316"
                          : row.status === "updated"
                            ? "1px solid #0f172a"
                            : "1px solid #cbd5f5",
                        borderRadius: 999,
                        padding: "2px 8px",
                      }}
                    >
                      {row.status === "updated"
                        ? `Updated${row.last_action ? ` (${row.last_action.replace(/_/g, " ")})` : ""}`
                        : row.status === "terminal"
                        ? "Skipped (terminal)"
                        : row.status === "existing"
                        ? "Already queued"
                        : "Queued"}
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
