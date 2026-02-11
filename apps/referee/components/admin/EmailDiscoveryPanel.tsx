"use client";

import { useState, useTransition } from "react";

export default function EmailDiscoveryPanel() {
  const [limit, setLimit] = useState(25);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const runDiscovery = () => {
    setStatus("Running email discovery...");
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/tournaments/enrichment/email-discovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.ok === false) {
          setStatus(json?.error || json?.message || "Email discovery failed.");
          return;
        }
        setStatus(json?.message || "Email discovery complete.");
      } catch (err: any) {
        setStatus(err?.message || "Email discovery failed.");
      }
    });
  };

  return (
    <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
        <label style={{ fontSize: 12, fontWeight: 700 }}>
          Discover contact emails (limit)
          <input
            type="number"
            value={limit}
            min={1}
            max={50}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
          />
        </label>
        <button
          type="button"
          onClick={runDiscovery}
          disabled={pending}
          style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#0f172a", color: "#fff", fontWeight: 800, opacity: pending ? 0.7 : 1 }}
        >
          {pending ? "Running..." : "Run email discovery"}
        </button>
        <span style={{ fontSize: 12, color: "#555" }}>
          New emails will appear in Tournament contacts for review.
        </span>
        <a
          href="/admin?tab=tournament-contacts"
          target="_blank"
          rel="noreferrer"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #0f172a",
            background: "#fff",
            color: "#0f172a",
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          Open Tournament Contacts ↗
        </a>
      </div>
      {status ? (
        <div style={{ marginTop: 10, fontSize: 12, color: status.includes("failed") ? "#b91c1c" : "#065f46" }}>
          {status}
        </div>
      ) : null}
    </div>
  );
}
