"use client";

import { useEffect, useMemo, useState } from "react";

type AlarmRow = {
  id: string;
  api: string;
  metric: "calls" | "errors" | "error_rate";
  window_type: "day" | "week" | "month";
  threshold: number;
  notify_email: string;
  cooldown_minutes: number;
  last_alerted_at: string | null;
  last_alerted_window_start: string | null;
  enabled: boolean;
  notes: string | null;
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; error: string }
  | { status: "ready" };

function fmtTs(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().replace("T", " ").replace("Z", "Z");
}

export default function ApiUsageAlarms({
  apiOptions,
}: {
  apiOptions: string[];
}) {
  const [alarms, setAlarms] = useState<AlarmRow[]>([]);
  const [load, setLoad] = useState<LoadState>({ status: "idle" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    api: apiOptions[0] ?? "mapbox",
    metric: "calls" as AlarmRow["metric"],
    window_type: "day" as AlarmRow["window_type"],
    threshold: 100,
    notify_email: "",
    cooldown_minutes: 60,
    notes: "",
    enabled: true,
  });

  const metrics = useMemo(
    () => [
      { label: "Calls", value: "calls" },
      { label: "Errors", value: "errors" },
      { label: "Error rate (%)", value: "error_rate" },
    ],
    []
  );
  const windows = useMemo(
    () => [
      { label: "Day", value: "day" },
      { label: "Week", value: "week" },
      { label: "Month", value: "month" },
    ],
    []
  );

  async function refresh() {
    setLoad({ status: "loading" });
    try {
      const res = await fetch("/api/admin/api-usage/alarms", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setAlarms((json?.alarms ?? []) as AlarmRow[]);
      setLoad({ status: "ready" });
    } catch (e: any) {
      setLoad({ status: "error", error: String(e?.message ?? e) });
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function mutate(fn: () => Promise<void>) {
    setSaving(true);
    setToast(null);
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      setToast(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#374151" }}>Alarms</h3>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
        Calendar windows in UTC. Alerts email when the metric crosses the threshold.
      </div>

      {toast && (
        <div style={{ margin: "10px 0", padding: "8px 10px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b", fontSize: 12 }}>
          {toast}
        </div>
      )}

      {load.status === "error" && (
        <div style={{ margin: "10px 0", padding: "8px 10px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b", fontSize: 12 }}>
          Failed to load alarms: {load.error}
        </div>
      )}

      <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {["Enabled", "API", "Metric", "Window", "Threshold", "Notify", "Cooldown", "Last Alert", "Actions"].map((h) => (
                <th key={h} style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb", textAlign: "left", fontSize: 12, color: "#374151", background: "#f9fafb" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alarms.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 12, fontSize: 12, color: "#6b7280" }}>
                  {load.status === "loading" ? "Loading…" : "No alarms yet."}
                </td>
              </tr>
            ) : (
              alarms.map((a) => (
                <tr key={a.id}>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(a.enabled)}
                      disabled={saving}
                      onChange={(e) =>
                        mutate(async () => {
                          const res = await fetch("/api/admin/api-usage/alarms", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: a.id, enabled: e.target.checked }),
                          });
                          const json = await res.json();
                          if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
                        })
                      }
                    />
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                    {a.api}
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", fontSize: 12 }}>{a.metric}</td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", fontSize: 12 }}>{a.window_type}</td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", fontSize: 12 }}>{a.threshold}</td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", fontSize: 12 }}>{a.notify_email}</td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", fontSize: 12 }}>{a.cooldown_minutes}m</td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", fontSize: 12, color: "#6b7280" }}>{fmtTs(a.last_alerted_at)}</td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", fontSize: 12, whiteSpace: "nowrap" }}>
                    <button
                      disabled={saving}
                      onClick={() =>
                        mutate(async () => {
                          const res = await fetch("/api/admin/api-usage/check-alarms", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ alarm_id: a.id, force: true }),
                          });
                          const json = await res.json();
                          if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
                        })
                      }
                      style={{ marginRight: 8, padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
                    >
                      Test now
                    </button>
                    <button
                      disabled={saving}
                      onClick={() =>
                        mutate(async () => {
                          const res = await fetch(`/api/admin/api-usage/alarms?id=${encodeURIComponent(a.id)}`, { method: "DELETE" });
                          const json = await res.json();
                          if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
                        })
                      }
                      style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #fecaca", background: "#fff", color: "#b91c1c", cursor: "pointer" }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14, padding: 12, borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Add alarm</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12, color: "#374151" }}>
            API
            <select
              value={draft.api}
              onChange={(e) => setDraft((d) => ({ ...d, api: e.target.value }))}
              style={{ display: "block", marginTop: 4, height: 30, borderRadius: 6, border: "1px solid #e5e7eb", padding: "0 8px" }}
            >
              {apiOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 12, color: "#374151" }}>
            Metric
            <select
              value={draft.metric}
              onChange={(e) => setDraft((d) => ({ ...d, metric: e.target.value as any }))}
              style={{ display: "block", marginTop: 4, height: 30, borderRadius: 6, border: "1px solid #e5e7eb", padding: "0 8px" }}
            >
              {metrics.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 12, color: "#374151" }}>
            Window
            <select
              value={draft.window_type}
              onChange={(e) => setDraft((d) => ({ ...d, window_type: e.target.value as any }))}
              style={{ display: "block", marginTop: 4, height: 30, borderRadius: 6, border: "1px solid #e5e7eb", padding: "0 8px" }}
            >
              {windows.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 12, color: "#374151" }}>
            Threshold
            <input
              type="number"
              value={draft.threshold}
              onChange={(e) => setDraft((d) => ({ ...d, threshold: Number(e.target.value) }))}
              style={{ display: "block", marginTop: 4, height: 30, borderRadius: 6, border: "1px solid #e5e7eb", padding: "0 8px", width: 110 }}
            />
          </label>

          <label style={{ fontSize: 12, color: "#374151" }}>
            Notify email
            <input
              type="email"
              value={draft.notify_email}
              onChange={(e) => setDraft((d) => ({ ...d, notify_email: e.target.value }))}
              placeholder="alerts@…"
              style={{ display: "block", marginTop: 4, height: 30, borderRadius: 6, border: "1px solid #e5e7eb", padding: "0 8px", width: 220 }}
            />
          </label>

          <label style={{ fontSize: 12, color: "#374151" }}>
            Cooldown (min)
            <input
              type="number"
              value={draft.cooldown_minutes}
              onChange={(e) => setDraft((d) => ({ ...d, cooldown_minutes: Number(e.target.value) }))}
              style={{ display: "block", marginTop: 4, height: 30, borderRadius: 6, border: "1px solid #e5e7eb", padding: "0 8px", width: 120 }}
            />
          </label>

          <button
            disabled={saving}
            onClick={() =>
              mutate(async () => {
                const res = await fetch("/api/admin/api-usage/alarms", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    api: draft.api,
                    metric: draft.metric,
                    window_type: draft.window_type,
                    threshold: draft.threshold,
                    notify_email: draft.notify_email,
                    cooldown_minutes: draft.cooldown_minutes,
                    notes: draft.notes,
                    enabled: draft.enabled,
                  }),
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
                setDraft((d) => ({ ...d, notify_email: "" }));
              })
            }
            style={{
              height: 30,
              borderRadius: 6,
              border: "1px solid #1e40af",
              padding: "0 12px",
              fontSize: 12,
              background: "#1e40af",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

