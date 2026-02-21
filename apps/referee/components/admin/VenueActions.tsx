"use client";

import { useState } from "react";
import Link from "next/link";

type Props = {
  venueId: string;
  venueName?: string | null;
  onRemoveFromList?: () => void;
};

export default function VenueActions({ venueId, venueName, onRemoveFromList }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [copying, setCopying] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");
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

  const onMerge = async () => {
    const target = mergeTargetId.trim();
    if (!target) {
      setError("Enter target venue UUID");
      return;
    }
    if (target === venueId) {
      setError("Target venue must be different from source venue");
      return;
    }
    if (!window.confirm(`Merge venue "${venueName || venueId}" into ${target}? This will move tournament links and delete the source venue.`)) {
      return;
    }
    setMerging(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/venues/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_venue_id: venueId, target_venue_id: target, remove_source: true }),
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error(json?.error || "Merge failed");
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setMerging(false);
    }
  };

  const onCopy = async () => {
    if (!window.confirm(`Copy venue "${venueName || venueId}" into a new venue ID?`)) return;
    setCopying(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/venues/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_venue_id: venueId }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json?.error || "Copy failed");
      }
      const copiedId = json?.copied_venue_id ? String(json.copied_venue_id) : "";
      const copiedName = json?.copied_venue_name ? String(json.copied_venue_name) : "Copied venue";
      window.alert(`${copiedName} created with new ID: ${copiedId}`);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copy failed");
    } finally {
      setCopying(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
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
        onClick={onCopy}
        disabled={copying}
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid #0f766e",
          background: copying ? "#ccfbf1" : "#fff",
          color: "#0f766e",
          cursor: copying ? "not-allowed" : "pointer",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {copying ? "Copying..." : "Copy"}
      </button>
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
      <input
        value={mergeTargetId}
        onChange={(e) => setMergeTargetId(e.target.value)}
        placeholder="Merge into venue UUID"
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid #d1d5db",
          minWidth: 240,
          fontSize: 13,
        }}
      />
      <button
        type="button"
        onClick={onMerge}
        disabled={merging}
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid #1d4ed8",
          background: merging ? "#dbeafe" : "#fff",
          color: "#1d4ed8",
          cursor: merging ? "not-allowed" : "pointer",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {merging ? "Merging..." : "Merge"}
      </button>
      {onRemoveFromList ? (
        <button
          type="button"
          onClick={onRemoveFromList}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#fff",
            color: "#374151",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Remove from list
        </button>
      ) : null}
      </div>
      {error && <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span>}
    </div>
  );
}
