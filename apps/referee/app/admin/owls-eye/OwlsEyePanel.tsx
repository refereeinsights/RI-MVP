"use client";

import { useEffect, useMemo, useState } from "react";

type RunStatus = "idle" | "running" | "error" | "complete";

type RunPayload = {
  runId: string;
  status: string;
  message?: string;
  map?: { imageUrl?: string | null; north?: any; legend?: string[] };
  annotations?: Array<{ type?: string; x: number; y: number; label?: string; confidence?: number }>;
  nearbyFood?: Array<{
    name: string;
    distanceMiles?: number;
    address?: string;
    isSponsor?: boolean;
    sponsorClickUrl?: string;
  }>;
};

type OwlsEyePanelProps = {
  embedded?: boolean;
  adminToken?: string;
};

export default function OwlsEyePanel({ embedded = false, adminToken }: OwlsEyePanelProps) {
  const [venueId, setVenueId] = useState("");
  const [sport, setSport] = useState<"soccer" | "basketball">("soccer");
  const [mapUrl, setMapUrl] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [runData, setRunData] = useState<RunPayload | null>(null);

  const latestMapUrl = useMemo(() => runData?.map?.imageUrl ?? null, [runData]);

  const startRun = async () => {
    setStatus("running");
    setMessage(null);
    setRunData(null);

    try {
      const resp = await fetch("/api/admin/owls-eye/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(adminToken ? { "x-owls-eye-admin-token": adminToken } : {}),
        },
        body: JSON.stringify({
          venueId: venueId.trim(),
          sport,
          fieldMapUrl: mapUrl.trim() || undefined,
          mode: "manual",
        }),
      });

      const json = await resp.json();
      if (!resp.ok) {
        setStatus("error");
        setMessage(json?.message || json?.error || "Run failed");
        return;
      }

      setRunId(json.runId);
      setMessage("Run started; polling status…");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unknown error");
    }
  };

  useEffect(() => {
    if (!runId) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`/api/admin/owls-eye/run/${runId}`, {
          headers: adminToken ? { "x-owls-eye-admin-token": adminToken } : undefined,
        });
        const json = await resp.json();
        if (cancelled) return;

        if (!resp.ok) {
          setStatus("error");
          setMessage(json?.message || json?.error || "Lookup failed");
          clearInterval(interval);
          return;
        }

        setRunData(json);
        if (json?.status === "complete" || json?.status === "failed") {
          setStatus(json?.status === "complete" ? "complete" : "error");
          clearInterval(interval);
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Unknown error");
        clearInterval(interval);
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runId, adminToken]);

  return (
    <div style={{ padding: embedded ? 0 : "24px", maxWidth: 900 }}>
      <h1>Owl&apos;s Eye Admin</h1>
      <p>Trigger a manual scan and poll its status.</p>

      <div style={{ display: "grid", gap: 12, marginTop: 16, maxWidth: 560 }}>
        <label>
          <div>Venue ID (UUID)</div>
          <input
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            placeholder="uuid"
            style={{ width: "100%" }}
          />
        </label>

        <label>
          <div>Sport</div>
          <select value={sport} onChange={(e) => setSport(e.target.value as any)} style={{ width: "100%" }}>
            <option value="soccer">Soccer</option>
            <option value="basketball">Basketball</option>
          </select>
        </label>

        <label>
          <div>Published Map URL (optional)</div>
          <input
            value={mapUrl}
            onChange={(e) => setMapUrl(e.target.value)}
            placeholder="https://example.com/map.pdf"
            style={{ width: "100%" }}
          />
        </label>

        <button onClick={startRun} disabled={status === "running"}>
          {status === "running" ? "Running…" : "Run Owl's Eye Scan"}
        </button>
        {message && <div style={{ color: status === "error" ? "red" : "inherit" }}>{message}</div>}
      </div>

      {runData && (
        <div style={{ marginTop: 24 }}>
          <h2>Run</h2>
          <pre style={{ background: "#f6f8fa", padding: 12 }}>{JSON.stringify(runData, null, 2)}</pre>

          {latestMapUrl && (
            <div style={{ marginTop: 12 }}>
              <div>Map artifact:</div>
              <img
                src={latestMapUrl}
                alt="Map artifact"
                style={{ maxWidth: "100%", border: "1px solid #ccc", marginTop: 8 }}
              />
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <div>Nearby food:</div>
            {(runData.nearbyFood ?? []).length === 0 && <div>No nearby food records</div>}
            {(runData.nearbyFood ?? []).map((f, idx) => (
              <div key={`${f.name}-${idx}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>{f.name}</span>
                {f.isSponsor && <span style={{ fontSize: 12, color: "#d35400" }}>Sponsored</span>}
                {f.sponsorClickUrl && (
                  <a href={f.sponsorClickUrl} target="_blank" rel="noreferrer">
                    details
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
