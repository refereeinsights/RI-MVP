"use client";

import { useState } from "react";

type LogRow = {
  id: string;
  action: string;
  level: string;
  payload: any;
  created_at: string;
};

type Props = {
  sourceId: string;
  sourceUrl: string;
  status?: string | null;
  compact?: boolean;
};

function formatTime(value: string) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
}

function summarize(payload: any) {
  if (!payload) return "No payload";
  const code = payload.error_code ? String(payload.error_code) : null;
  const status = payload.http_status != null ? `HTTP ${payload.http_status}` : "";
  const extracted =
    payload.extracted_count != null ? `extracted ${payload.extracted_count}` : "";
  return [code, extracted, status].filter(Boolean).join(" · ");
}

function buildCopySummary(url: string, payload: any) {
  const code = payload?.error_code ?? "ok";
  const status = payload?.http_status ?? "n/a";
  const finalUrl = payload?.final_url ?? "n/a";
  return `${url} | ${code} | status=${status} | final=${finalUrl}`;
}

export default function SourceLogsClient({ sourceId, sourceUrl, status, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadLogs() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tournament-sources/${sourceId}/logs?limit=25`, {
        headers: { "Cache-Control": "no-store" },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `Failed to load logs (${res.status})`);
        setLoading(false);
        return;
      }
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    loadLogs();
  }

  function handleClose() {
    setOpen(false);
  }

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={handleOpen}
          style={{
            padding: "2px 6px",
            borderRadius: 6,
            border: "1px solid #e5e7eb",
            background: "#f8fafc",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {status} · View logs
        </button>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          style={{
            padding: "4px 6px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            background: "#f9fafb",
            fontSize: 11,
          }}
        >
          Logs
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.5)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
          }}
          onClick={handleClose}
        >
          <div
            style={{
              width: "min(920px, 92vw)",
              maxHeight: "80vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Source logs</div>
                <div style={{ fontSize: 12, color: "#475569" }}>{sourceUrl}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={loadLogs}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    background: "#f8fafc",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid #0f172a",
                    background: "#0f172a",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            {loading && <div style={{ marginTop: 12, fontSize: 12 }}>Loading logs...</div>}
            {error && <div style={{ marginTop: 12, fontSize: 12, color: "#b91c1c" }}>{error}</div>}

            {!loading && !logs.length && !error && (
              <div style={{ marginTop: 12, fontSize: 12 }}>No logs yet.</div>
            )}

            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
              {logs.map((log) => (
                <div key={log.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 12, color: "#475569" }}>{formatTime(log.created_at)}</div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>
                      {log.action} · {log.level}
                    </div>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12 }}>{summarize(log.payload)}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(JSON.stringify(log.payload, null, 2))}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        background: "#f8fafc",
                        fontSize: 11,
                      }}
                    >
                      Copy JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(buildCopySummary(sourceUrl, log.payload))}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        background: "#f8fafc",
                        fontSize: 11,
                      }}
                    >
                      Copy summary
                    </button>
                  </div>
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: "pointer", fontSize: 11 }}>Details</summary>
                    <pre style={{ margin: "6px 0 0", fontSize: 11, whiteSpace: "pre-wrap" }}>
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
