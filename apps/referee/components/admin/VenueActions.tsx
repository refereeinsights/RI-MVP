"use client";

import { useState } from "react";
import Link from "next/link";

type Props = { venueId: string };

export default function VenueActions({ venueId }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async () => {
    if (!window.confirm("Delete this venue? This will remove its links to tournaments.")) return;
    setDeleting(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/venues/${venueId}`, { method: "DELETE" });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error(json?.error || "Delete failed");
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <Link
        href={`/admin/venues/${venueId}`}
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          textDecoration: "none",
          background: "#fff",
          fontSize: 13,
        }}
      >
        Edit
      </Link>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid #ef4444",
          background: deleting ? "#fecdd3" : "#fff",
          color: "#b91c1c",
          cursor: deleting ? "not-allowed" : "pointer",
          fontSize: 13,
        }}
      >
        {deleting ? "Deleting..." : "Delete"}
      </button>
      {error && <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span>}
    </div>
  );
}
