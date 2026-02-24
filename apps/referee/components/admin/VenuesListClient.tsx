"use client";

import { useMemo, useState } from "react";

import VenueRow, { VenueItem } from "@/components/admin/VenueRow";

type Props = {
  venues: VenueItem[];
};

export default function VenuesListClient({ venues }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleSelected = (venueId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(venueId);
      else next.delete(venueId);
      return Array.from(next);
    });
  };

  const selectAll = () => setSelectedIds(venues.map((v) => v.id));
  const clearAll = () => setSelectedIds([]);

  const bulkDelete = async () => {
    if (!selectedIds.length) return;
    const selectedVenues = venues.filter((v) => selectedSet.has(v.id));
    const selectedWithOwl = selectedVenues.filter((v) => Boolean(v.owl_run_id)).length;
    if (
      !window.confirm(
        `Clean delete ${selectedIds.length} venues? This removes Owl's Eye rows, unlinks tournaments, and deletes venues.`
      )
    ) {
      return;
    }
    if (selectedWithOwl > 0) {
      const confirmed = window.confirm(
        `Warning: ${selectedWithOwl} selected venue${selectedWithOwl === 1 ? "" : "s"} have Owl's Eye data. Deleting will permanently remove Owl's Eye runs, nearby results, and map artifacts. Continue?`
      );
      if (!confirmed) return;
    }

    setBulkDeleting(true);
    try {
      const resp = await fetch("/api/admin/venues/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue_ids: selectedIds, confirm_owl_delete: selectedWithOwl > 0 }),
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error(json?.error || "Bulk delete failed");
      }
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bulk delete failed";
      window.alert(message);
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "8px 10px",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#f9fafb",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700 }}>Selected venues: {selectedIds.length}</div>
        <button type="button" onClick={selectAll} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}>
          Select all
        </button>
        <button type="button" onClick={clearAll} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}>
          Clear
        </button>
        <button
          type="button"
          onClick={bulkDelete}
          disabled={bulkDeleting || selectedIds.length === 0}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #ef4444",
            color: "#b91c1c",
            background: bulkDeleting || selectedIds.length === 0 ? "#fee2e2" : "#fff",
            fontWeight: 700,
          }}
        >
          {bulkDeleting ? "Deleting..." : "Clean delete selected"}
        </button>
      </div>

      {venues.length === 0 ? (
        <div style={{ padding: 12, color: "#6b7280", fontSize: 14 }}>No venues found.</div>
      ) : (
        venues.map((v) => (
          <VenueRow
            key={v.id}
            venue={v}
            selectable
            selected={selectedSet.has(v.id)}
            onToggleSelected={toggleSelected}
          />
        ))
      )}
    </div>
  );
}
