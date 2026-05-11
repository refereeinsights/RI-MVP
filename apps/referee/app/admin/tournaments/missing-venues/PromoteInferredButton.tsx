"use client";

import { useState } from "react";

export default function PromoteInferredButton({
  tournamentId,
  venueId,
  venueName,
  inferenceMethod,
}: {
  tournamentId: string;
  venueId: string;
  venueName: string;
  inferenceMethod: string | null;
}) {
  const [status, setStatus] = useState<"idle" | "working" | "promoted" | "rejected" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const act = async (action: "promote" | "reject") => {
    setStatus("working");
    setErrorMsg(null);
    try {
      const url =
        action === "promote"
          ? "/api/admin/tournaments/enrichment/inferred/promote"
          : "/api/admin/tournaments/enrichment/inferred/reject";
      const body: Record<string, unknown> = { tournament_id: tournamentId, venue_id: venueId };
      if (action === "reject") { body.method = inferenceMethod ?? "unknown"; body.remove_link = true; }
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { setStatus("error"); setErrorMsg(json?.error || res.statusText); return; }
      setStatus(action === "promote" ? "promoted" : "rejected");
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err?.message || "request failed");
    }
  };

  if (status === "promoted") {
    return <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>✓ Confirmed: {venueName}</span>;
  }
  if (status === "rejected") {
    return <span style={{ fontSize: 11, color: "#6b7280" }}>Rejected</span>;
  }

  return (
    <div style={{ display: "grid", gap: 2 }}>
      <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700 }}>
        Inferred: {venueName}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <button
          type="button"
          disabled={status === "working"}
          onClick={() => act("promote")}
          style={{
            padding: "1px 7px",
            borderRadius: 5,
            border: "1px solid #16a34a",
            background: "#fff",
            color: "#16a34a",
            fontWeight: 700,
            fontSize: 11,
            cursor: status === "working" ? "not-allowed" : "pointer",
          }}
        >
          {status === "working" ? "…" : "Promote"}
        </button>
        <button
          type="button"
          disabled={status === "working"}
          onClick={() => act("reject")}
          style={{
            padding: "1px 7px",
            borderRadius: 5,
            border: "1px solid #9ca3af",
            background: "#fff",
            color: "#6b7280",
            fontWeight: 700,
            fontSize: 11,
            cursor: status === "working" ? "not-allowed" : "pointer",
          }}
        >
          Reject
        </button>
      </div>
      {errorMsg ? <span style={{ fontSize: 11, color: "#dc2626" }}>{errorMsg}</span> : null}
    </div>
  );
}
