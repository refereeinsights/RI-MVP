"use client";

import { useState } from "react";

type Candidate = {
  venue_name: string | null;
  venue_address: string | null;
  venue_city: string | null;
  venue_state: string | null;
  venue_zip: string | null;
  venue_url: string | null;
  confidence: "high" | "medium" | "low";
  evidence: string | null;
};

type Props = {
  tournamentId: string;
};

function formatCandidate(c: Candidate) {
  const parts = [
    c.venue_name,
    c.venue_address,
    [c.venue_city, c.venue_state].filter(Boolean).join(", "),
    c.venue_zip,
  ].filter(Boolean);
  return parts.join(" • ");
}

export default function UploadsVenueExtractButton({ tournamentId }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceUrlUsed, setSourceUrlUsed] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [acceptingKey, setAcceptingKey] = useState<string | null>(null);
  const [acceptMessage, setAcceptMessage] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setAcceptMessage(null);
    try {
      const resp = await fetch(
        `/api/admin/tournaments/uploads/venue-extract?tournament_id=${encodeURIComponent(tournamentId)}`,
        { credentials: "include" }
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || `HTTP_${resp.status}`);
      setCandidates(Array.isArray(json?.candidates) ? (json.candidates as Candidate[]) : []);
      setSourceUrlUsed(typeof json?.source_url_used === "string" ? json.source_url_used : null);
      setOpen(true);
    } catch (err) {
      setOpen(true);
      setCandidates([]);
      setSourceUrlUsed(null);
      setError(err instanceof Error ? err.message : "extract_failed");
    } finally {
      setBusy(false);
    }
  };

  const keyFor = (c: Candidate) =>
    [
      c.venue_name ?? "",
      c.venue_address ?? "",
      c.venue_city ?? "",
      c.venue_state ?? "",
      c.venue_zip ?? "",
    ]
      .join("|")
      .trim();

  const accept = async (candidate: Candidate) => {
    const key = keyFor(candidate);
    if (!key || acceptingKey) return;
    setAcceptingKey(key);
    setAcceptMessage(null);
    setError(null);
    try {
      const resp = await fetch("/api/admin/tournaments/uploads/venue-accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tournament_id: tournamentId, candidate }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.ok) throw new Error(json?.error || `HTTP_${resp.status}`);
      setCandidates((prev) => prev.filter((c) => keyFor(c) !== key));
      setAcceptMessage("Venue linked.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "accept_failed");
    } finally {
      setAcceptingKey(null);
    }
  };

  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} style={{ marginTop: 6 }}>
      <summary style={{ cursor: "pointer", display: "inline-flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void run();
          }}
          disabled={busy}
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid #0f3d2e",
            background: busy ? "#f3f4f6" : "#fff",
            color: "#0f3d2e",
            fontWeight: 900,
            fontSize: 12,
            cursor: busy ? "not-allowed" : "pointer",
          }}
          title="Fetch the tournament/source page and extract venue addresses for manual review"
        >
          {busy ? "Extracting…" : "Extract venues"}
        </button>
        <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>manual</span>
      </summary>

      <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
        {sourceUrlUsed ? (
          <div style={{ fontSize: 12, color: "#374151" }}>
            Source:{" "}
            <a href={sourceUrlUsed} target="_blank" rel="noreferrer noopener" style={{ color: "#0f3d2e", fontWeight: 900 }}>
              {sourceUrlUsed}
            </a>
          </div>
        ) : null}

        {error ? <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 900 }}>Error: {error}</div> : null}
        {acceptMessage ? <div style={{ fontSize: 12, color: "#065f46", fontWeight: 900 }}>{acceptMessage}</div> : null}

        {!error && candidates.length === 0 ? (
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>No venue addresses found.</div>
        ) : null}

        {candidates.map((c, idx) => {
          const line = formatCandidate(c) || "(no details)";
          return (
            <div key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 950, fontSize: 13, color: "#111827" }}>{line}</div>
                <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 950,
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                      color: c.confidence === "high" ? "#065f46" : c.confidence === "medium" ? "#92400e" : "#6b7280",
                      background: c.confidence === "high" ? "#ecfdf5" : c.confidence === "medium" ? "#fffbeb" : "#f9fafb",
                    }}
                  >
                    {c.confidence}
                  </span>
                  <button
                    type="button"
                    onClick={() => void accept(c)}
                    disabled={acceptingKey === keyFor(c)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 10,
                      border: "1px solid #0f3d2e",
                      background: acceptingKey === keyFor(c) ? "#f3f4f6" : "#fff",
                      color: "#0f3d2e",
                      fontWeight: 900,
                      fontSize: 12,
                      cursor: acceptingKey === keyFor(c) ? "not-allowed" : "pointer",
                    }}
                    title="Create or link a venue and attach it to this tournament"
                  >
                    {acceptingKey === keyFor(c) ? "Accepting…" : "Accept venue"}
                  </button>
                </div>
              </div>

              {c.venue_url ? (
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  <a href={c.venue_url} target="_blank" rel="noreferrer noopener" style={{ color: "#0f3d2e", fontWeight: 900 }}>
                    Map/link →
                  </a>
                </div>
              ) : null}

              {c.evidence ? <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>{c.evidence}</div> : null}
            </div>
          );
        })}
      </div>
    </details>
  );
}
