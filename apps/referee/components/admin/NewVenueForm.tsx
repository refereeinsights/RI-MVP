"use client";

import { useState } from "react";
import Link from "next/link";

export function NewVenueForm() {
  const [name, setName] = useState("");
  const [address1, setAddress1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setCreatedId(null);

    try {
      const resp = await fetch("/api/admin/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          address1,
          city,
          state,
          zip: zip || undefined,
          notes: notes || undefined,
        }),
      });

      const json = await resp.json();
      if (!resp.ok) {
        setError(json?.error || "Failed to create venue");
        return;
      }

      setCreatedId(json.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create venue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 560 }}>
        <label>
          <div>Name</div>
          <input value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%" }} />
        </label>
        <label>
          <div>Address 1</div>
          <input value={address1} onChange={(e) => setAddress1(e.target.value)} required style={{ width: "100%" }} />
        </label>
        <label>
          <div>City</div>
          <input value={city} onChange={(e) => setCity(e.target.value)} required style={{ width: "100%" }} />
        </label>
        <label>
          <div>State</div>
          <input value={state} onChange={(e) => setState(e.target.value)} required style={{ width: "100%" }} />
        </label>
        <label>
          <div>ZIP (optional)</div>
          <input value={zip} onChange={(e) => setZip(e.target.value)} style={{ width: "100%" }} />
        </label>
        <label>
          <div>Notes (optional)</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ width: "100%" }} />
        </label>

        <button type="submit" disabled={loading} style={{ padding: "10px 14px", borderRadius: 10 }}>
          {loading ? "Creating…" : "Create venue"}
        </button>
        {error && <div style={{ color: "red" }}>{error}</div>}
      </form>

      {createdId && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 12,
            background: "#f8fafc",
            maxWidth: 560,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Venue created</div>
          <div style={{ fontSize: 13, color: "#374151" }}>UUID:</div>
          <pre
            style={{
              background: "white",
              border: "1px solid #e5e7eb",
              padding: 10,
              borderRadius: 8,
              fontFamily: "monospace",
              fontSize: 13,
              overflowX: "auto",
            }}
          >
            {createdId}
          </pre>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link
              href={`/admin/owls-eye?venueId=${createdId}`}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "#111827",
                color: "white",
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              Run Owl&apos;s Eye
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default NewVenueForm;
