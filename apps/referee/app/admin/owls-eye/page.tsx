"use client";

import { useEffect, useMemo, useState } from "react";

type RunStatus = "idle" | "running" | "error" | "complete";

type Artifact = { url?: string | null; map_kind?: string | null };

type RunPayload = {
  run?: { run_id?: string; status?: string; error_message?: string | null };
  artifacts?: Artifact[];
  annotations?: Array<{ x: number; y: number; icon?: string }>;
  nearby_food?: Array<{ name: string; address?: string; navigation_url?: string; is_sponsored?: boolean }>;
};

export default function OwlsEyeAdminPage() {
  const [venueId, setVenueId] = useState("");
  const [sport, setSport] = useState<"soccer" | "basketball">("soccer");
  const [address, setAddress] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [runData, setRunData] = useState<RunPayload | null>(null);

  const latestArtifact = useMemo(() => runData?.artifacts?.[0], [runData]);

  const startRun = async () => {
    setStatus("running");
    setMessage(null);
    setRunData(null);

    try {
      const resp = await fetch("/api/admin/owls-eye/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: venueId.trim(),
          sport,
          address: address.trim(),
          mapUrl: mapUrl.trim() || undefined,
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
        const resp = await fetch(`/api/admin/owls-eye/run/${runId}`);
        const json = await resp.json();
        if (cancelled) return;

        if (!resp.ok) {
          setStatus("error");
          setMessage(json?.message || json?.error || "Lookup failed");
          clearInterval(interval);
          return;
        }

        setRunData(json);
        if (json?.run?.status === "complete" || json?.run?.status === "failed") {
          setStatus(json?.run?.status === "complete" ? "complete" : "error");
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
  }, [runId]);

  return (
    <div style={{ padding: "24px", maxWidth: 900 }}>
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
          <div>Address</div>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, City, ST"
            style={{ width: "100%" }}
          />
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
          <pre style={{ background: "#f6f8fa", padding: 12 }}>{JSON.stringify(runData.run ?? {}, null, 2)}</pre>

          {latestArtifact?.url && (
            <div style={{ marginTop: 12 }}>
              <div>Map artifact ({latestArtifact.map_kind ?? "latest"}):</div>
              <img
                src={latestArtifact.url}
                alt="Map artifact"
                style={{ maxWidth: "100%", border: "1px solid #ccc", marginTop: 8 }}
              />
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <div>Nearby food:</div>
            {(runData.nearby_food ?? []).length === 0 && <div>No nearby food records</div>}
            {(runData.nearby_food ?? []).map((f, idx) => (
              <div key={`${f.name}-${idx}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>{f.name}</span>
                {f.is_sponsored && <span style={{ fontSize: 12, color: "#d35400" }}>Sponsored</span>}
                {f.navigation_url && (
                  <a href={f.navigation_url} target="_blank" rel="noreferrer">
                    map
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
