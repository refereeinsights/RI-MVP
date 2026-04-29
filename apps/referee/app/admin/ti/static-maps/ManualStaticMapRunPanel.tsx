"use client";

import { useMemo, useState } from "react";

type RunResponse =
  | { ok: true; ti_status: number; ms: number; ti_url: string; body: unknown }
  | { ok: false; error: string; ti_status?: number; ms?: number; ti_url?: string; body?: unknown };

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function ManualStaticMapRunPanel() {
  const [slug, setSlug] = useState("");
  const [tournamentId, setTournamentId] = useState("");
  const [force, setForce] = useState(false);
  const [batchLimit, setBatchLimit] = useState("50");
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<RunResponse | null>(null);

  const canRun = useMemo(() => true, []);

  async function run() {
    if (!canRun) return;
    setLoading(true);
    setResp(null);
    try {
      const r = await fetch("/api/admin/ti/static-maps/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim() || undefined,
          tournamentId: tournamentId.trim() || undefined,
          force,
          batchLimit: batchLimit.trim() || undefined,
        }),
      });
      const json = (await r.json().catch(() => null)) as RunResponse | null;
      if (!json) {
        setResp({ ok: false, error: `Invalid JSON response (HTTP ${r.status}).` });
        return;
      }
      setResp(json);
    } catch (err) {
      setResp({ ok: false, error: err instanceof Error ? err.message : "request_failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        marginBottom: 18,
        padding: 14,
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Manual Run (Debug)</h3>
        <div style={{ color: "#6b7280", fontSize: 12 }}>
          Leave slug/id blank to run a batch. Calls TI generator and returns full error details.
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 260 }}>
          <span style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>Tournament slug</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="e.g. demo-tournament"
            style={{
              padding: "8px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              fontSize: 13,
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 320 }}>
          <span style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>Tournament ID (uuid)</span>
          <input
            value={tournamentId}
            onChange={(e) => setTournamentId(e.target.value)}
            placeholder="optional"
            style={{
              padding: "8px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              fontSize: 13,
              fontFamily: "monospace",
            }}
          />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22 }}>
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
          <span style={{ fontSize: 13, color: "#111827" }}>Force</span>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 160 }}>
          <span style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>Batch limit</span>
          <input
            value={batchLimit}
            onChange={(e) => setBatchLimit(e.target.value)}
            placeholder="50"
            style={{
              padding: "8px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              fontSize: 13,
              fontFamily: "monospace",
            }}
          />
        </label>

        <button
          type="button"
          onClick={run}
          disabled={!canRun || loading}
          style={{
            marginTop: 18,
            padding: "9px 12px",
            borderRadius: 8,
            border: "1px solid #111827",
            background: !canRun || loading ? "#f3f4f6" : "#111827",
            color: !canRun || loading ? "#6b7280" : "#fff",
            fontSize: 13,
            fontWeight: 700,
            cursor: !canRun || loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Running…" : slug.trim() || tournamentId.trim() ? "Run single/static-map generator" : "Run batch/static-map generator"}
        </button>
      </div>

      {resp && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 8,
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 700, color: resp.ok ? "#16a34a" : "#dc2626" }}>
              {resp.ok ? "OK" : "ERROR"}
            </span>
            {"ti_status" in resp && resp.ti_status !== undefined && (
              <span style={{ color: "#374151" }}>
                TI HTTP <span style={{ fontFamily: "monospace" }}>{resp.ti_status}</span>
              </span>
            )}
            {"ms" in resp && resp.ms !== undefined && (
              <span style={{ color: "#6b7280" }}>{resp.ms}ms</span>
            )}
          {"ti_url" in resp && resp.ti_url && (
            <span style={{ color: "#6b7280" }}>
              <span style={{ fontFamily: "monospace" }}>{resp.ti_url}</span>
            </span>
          )}
          {resp.ok && typeof resp.body === "object" && resp.body && (resp.body as any).processed !== undefined && (
            <span style={{ color: "#6b7280" }}>
              processed {(resp.body as any).processed} • claimed {(resp.body as any).claimed ?? "—"} • updated {(resp.body as any).updated ?? "—"} • lease-held {(resp.body as any).skipped_lease_held ?? "—"}
            </span>
          )}
        </div>

          {"error" in resp && resp.error && (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#991b1b",
                fontSize: 13,
                marginBottom: 10,
              }}
            >
              {resp.error}
            </div>
          )}

          <details open style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb" }}>
            <summary style={{ padding: "10px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
              Response JSON
            </summary>
            <pre
              style={{
                margin: 0,
                padding: "10px 12px",
                overflowX: "auto",
                fontSize: 12,
                lineHeight: 1.4,
              }}
            >
              {formatJson(resp)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
