"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import VenueRow, { VenueItem } from "@/components/admin/VenueRow";

type DuplicateVenueCandidate = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  linked_tournaments: number;
  owl_run_count: number;
  venue_url: string | null;
};

type DuplicateVenueGroup = {
  key: string;
  kind:
    | "exact_address_city_state"
    | "same_name_city_state"
    | "same_street_state"
    | "same_streetname_city_state"
    | "same_name_state";
  suggested_target_id: string;
  candidates: DuplicateVenueCandidate[];
};

type Props = {
  venues: VenueItem[];
  duplicateGroups?: DuplicateVenueGroup[];
};

export default function VenuesListClient({ venues, duplicateGroups = [] }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [mergingSource, setMergingSource] = useState<string | null>(null);
  const [keepingSource, setKeepingSource] = useState<string | null>(null);
  const [deletingVenueId, setDeletingVenueId] = useState<string | null>(null);
  const [targetByGroup, setTargetByGroup] = useState<Record<string, string>>({});

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const duplicateGroupId = (group: DuplicateVenueGroup) => `${group.kind}:${group.key}`;
  const selectedTargetIdForGroup = (group: DuplicateVenueGroup) =>
    targetByGroup[duplicateGroupId(group)] || group.suggested_target_id;

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

  const mergeVenue = async (sourceVenueId: string, targetVenueId: string) => {
    if (!sourceVenueId || !targetVenueId || sourceVenueId === targetVenueId) return;
    if (!window.confirm(`Merge ${sourceVenueId} into ${targetVenueId}? This will delete the source venue.`)) {
      return;
    }
    setMergingSource(sourceVenueId);
    try {
      const resp = await fetch("/api/admin/venues/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_venue_id: sourceVenueId, target_venue_id: targetVenueId, remove_source: true }),
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error(json?.error || "Merge failed");
      }
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Merge failed";
      window.alert(message);
    } finally {
      setMergingSource(null);
    }
  };

  const keepBoth = async (sourceVenueId: string, targetVenueId: string) => {
    if (!sourceVenueId || !targetVenueId || sourceVenueId === targetVenueId) return;
    if (!window.confirm(`Keep both venues (${sourceVenueId} and ${targetVenueId}) and stop flagging this pair as duplicate?`)) {
      return;
    }
    setKeepingSource(sourceVenueId);
    try {
      const resp = await fetch("/api/admin/venues/duplicate-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_venue_id: sourceVenueId,
          target_venue_id: targetVenueId,
          note: "Admin keep both",
        }),
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error(json?.error || "Keep both failed");
      }
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Keep both failed";
      window.alert(message);
    } finally {
      setKeepingSource(null);
    }
  };

  const deleteVenue = async (venueId: string, venueName: string | null) => {
    if (!venueId) return;
    const selectedVenue = venues.find((venue) => venue.id === venueId);
    const hasOwl = Boolean(selectedVenue?.owl_run_id);
    if (!window.confirm(`Delete ${venueName || venueId}? This removes Owl's Eye rows, unlinks tournaments, and deletes the venue.`)) {
      return;
    }
    if (hasOwl) {
      const confirmed = window.confirm(
        "Warning: this venue has Owl's Eye data. Deleting will permanently remove Owl's Eye runs, nearby results, and map artifacts. Continue?"
      );
      if (!confirmed) return;
    }
    setDeletingVenueId(venueId);
    try {
      const resp = await fetch("/api/admin/venues/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue_ids: [venueId], confirm_owl_delete: hasOwl }),
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error(json?.error || "Delete failed");
      }
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delete failed";
      window.alert(message);
    } finally {
      setDeletingVenueId(null);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {duplicateGroups.length > 0 ? (
        <section
          style={{
            border: "1px solid #f59e0b",
            background: "#fffaf0",
            borderRadius: 10,
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 800 }}>Duplicate venue candidates</div>
          <div style={{ fontSize: 13, color: "#78350f" }}>
            Review suggested targets and merge sources directly here. You can keep the suggestion or choose a different venue as the merge target before merging.
          </div>
          {duplicateGroups.slice(0, 25).map((group) => (
            <details key={duplicateGroupId(group)} style={{ border: "1px solid #fde68a", borderRadius: 8, background: "#fff" }}>
              <summary style={{ cursor: "pointer", padding: "8px 10px", fontWeight: 700 }}>
                {duplicateKindLabel(group.kind)} • {group.candidates.length} venues
              </summary>
              <div style={{ padding: "8px 10px", display: "grid", gap: 8 }}>
                {(() => {
                  const groupId = duplicateGroupId(group);
                  const selectedTargetId = selectedTargetIdForGroup(group);
                  const selectedTarget = group.candidates.find((item) => item.id === selectedTargetId) ?? group.candidates[0];
                  return (
                    <>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  Merge target: <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{selectedTargetId}</span>
                  {selectedTargetId === group.suggested_target_id ? " (suggested)" : " (override)"}
                </div>
                {group.candidates.map((item) => {
                  const isTarget = item.id === selectedTargetId;
                  const isSuggested = item.id === group.suggested_target_id;
                  return (
                    <div
                      key={item.id}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        padding: "8px 10px",
                        display: "grid",
                        gap: 5,
                        background: isTarget ? "#ecfdf5" : "#fff",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{item.name || "Untitled venue"}</div>
                      <div style={{ fontSize: 13, color: "#374151" }}>
                        {[item.address, item.city, item.state, item.zip].filter(Boolean).join(" • ") || "—"}
                      </div>
                      <div style={{ fontSize: 12, color: isTarget ? "#065f46" : "#6b7280", fontWeight: isTarget ? 700 : 500 }}>
                        {isTarget ? "Current merge target" : isSuggested ? "Suggested target" : "Merge source candidate"}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        ID: <span style={{ fontFamily: "monospace" }}>{item.id}</span> • Linked tournaments: {item.linked_tournaments} • Owl&apos;s Eye runs: {item.owl_run_count}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Link
                          href={`/admin/venues/${item.id}`}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #d1d5db",
                            textDecoration: "none",
                            color: "#111827",
                            fontSize: 13,
                            background: "#fff",
                          }}
                        >
                          Edit
                        </Link>
                        <Link
                          href={`/admin/venues/${item.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #d1d5db",
                            textDecoration: "none",
                            color: "#374151",
                            fontSize: 13,
                            background: "#fff",
                          }}
                        >
                          Open
                        </Link>
                        <button
                          type="button"
                          onClick={() => setTargetByGroup((prev) => ({ ...prev, [groupId]: item.id }))}
                          disabled={isTarget}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: `1px solid ${isTarget ? "#065f46" : "#9ca3af"}`,
                            background: isTarget ? "#ecfdf5" : "#fff",
                            color: isTarget ? "#065f46" : "#374151",
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: isTarget ? "default" : "pointer",
                          }}
                        >
                          {isTarget ? "Selected target" : "Use as target"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteVenue(item.id, item.name)}
                          disabled={deletingVenueId === item.id}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #dc2626",
                            background: deletingVenueId === item.id ? "#fee2e2" : "#fff",
                            color: "#b91c1c",
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: deletingVenueId === item.id ? "not-allowed" : "pointer",
                          }}
                        >
                          {deletingVenueId === item.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                      {!isTarget ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => mergeVenue(item.id, selectedTargetId)}
                            disabled={mergingSource === item.id}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1px solid #1d4ed8",
                              background: mergingSource === item.id ? "#dbeafe" : "#fff",
                              color: "#1d4ed8",
                              fontWeight: 700,
                              cursor: mergingSource === item.id ? "not-allowed" : "pointer",
                            }}
                          >
                            {mergingSource === item.id ? "Merging..." : "Merge into suggested target"}
                          </button>
                          <button
                            type="button"
                            onClick={() => keepBoth(item.id, selectedTargetId)}
                            disabled={keepingSource === item.id}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1px solid #b45309",
                              background: keepingSource === item.id ? "#fde68a" : "#fff",
                              color: "#92400e",
                              fontWeight: 700,
                              cursor: keepingSource === item.id ? "not-allowed" : "pointer",
                            }}
                          >
                            {keepingSource === item.id ? "Saving..." : "Keep both"}
                          </button>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: "#065f46", fontWeight: 700 }}>
                          Kept venue {selectedTargetId === group.suggested_target_id ? "(suggested target)" : "(override target)"}
                        </div>
                      )}
                    </div>
                  );
                })}
                    </>
                  );
                })()}
              </div>
            </details>
          ))}
        </section>
      ) : null}

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
  const duplicateKindLabel = (kind: DuplicateVenueGroup["kind"]) => {
    if (kind === "exact_address_city_state") return "Exact address match";
    if (kind === "same_name_city_state") return "Name + city + state match";
    if (kind === "same_street_state") return "Street + state match";
    if (kind === "same_streetname_city_state") return "Street name + city + state match";
    return "Name + state match";
  };
