"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import VenueRow, { VenueItem } from "@/components/admin/VenueRow";

type RecentTournamentVenueLink = {
  venue_id: string;
  link_created_at: string | null;
  venue: {
    id: string;
    name: string | null;
    address: string | null;
    address1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    venue_url: string | null;
  } | null;
};

type RecentTournamentVenueLinks = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  updated_at: string | null;
  official_website_url: string | null;
  source_url: string | null;
  links: RecentTournamentVenueLink[];
};

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
  owl_score?: number | null;
};

type DuplicateVenueGroup = {
  key: string;
  kind:
    | "exact_address_city_state"
    | "same_name_city_state"
    | "same_street_state"
    | "same_streetname_city_state"
    | "same_name_state"
    | "owls_eye_suspect";
  suggested_target_id: string;
  candidates: DuplicateVenueCandidate[];
};

type Props = {
  venues: VenueItem[];
  duplicateGroups?: DuplicateVenueGroup[];
  recentTournamentVenueLinks?: RecentTournamentVenueLinks[];
  recentTournamentVenueLinksFrom?: string;
  recentTournamentVenueLinksTo?: string;
  preservedFilters?: Record<string, string | undefined>;
};

function duplicateKindLabel(kind: DuplicateVenueGroup["kind"]) {
  if (kind === "owls_eye_suspect") return "Owl's Eye suspect";
  if (kind === "exact_address_city_state") return "Exact address match";
  if (kind === "same_name_city_state") return "Name + city + state match";
  if (kind === "same_street_state") return "Street + state match";
  if (kind === "same_streetname_city_state") return "Street name + city + state match";
  return "Name + state match";
}

function formatShortDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 10);
}

function formatVenueLine(v: RecentTournamentVenueLink["venue"]) {
  if (!v) return "Unknown venue";
  const addr = v.address1 || v.address || "";
  const line = [addr, v.city, v.state, v.zip].filter(Boolean).join(", ");
  return [v.name || "Untitled venue", line].filter(Boolean).join(" • ");
}

export default function VenuesListClient({
  venues,
  duplicateGroups = [],
  recentTournamentVenueLinks = [],
  recentTournamentVenueLinksFrom = "",
  recentTournamentVenueLinksTo = "",
  preservedFilters = {},
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [mergingSource, setMergingSource] = useState<string | null>(null);
  const [keepingSource, setKeepingSource] = useState<string | null>(null);
  const [deletingVenueId, setDeletingVenueId] = useState<string | null>(null);
  const [targetByGroup, setTargetByGroup] = useState<Record<string, string>>({});
  const dismissedStorageKey = useMemo(() => {
    const from = recentTournamentVenueLinksFrom || "none";
    const to = recentTournamentVenueLinksTo || "none";
    return `admin:venues:recent_tournament_venue_links:dismissed:v1:${from}:${to}`;
  }, [recentTournamentVenueLinksFrom, recentTournamentVenueLinksTo]);

  // Hydration safety: do not read localStorage during initial render.
  const [dismissedTournamentIds, setDismissedTournamentIds] = useState<Set<string>>(new Set());
  const [recentState, setRecentState] = useState<RecentTournamentVenueLinks[]>(recentTournamentVenueLinks);
  const [unlinkingKey, setUnlinkingKey] = useState<string | null>(null);
  const [deletingTournamentId, setDeletingTournamentId] = useState<string | null>(null);

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

  const unlinkTournamentVenue = async (tournamentId: string, venueId: string) => {
    const key = `${tournamentId}:${venueId}`;
    if (!window.confirm(`Unlink venue ${venueId} from tournament ${tournamentId}?`)) return;
    setUnlinkingKey(key);
    try {
      const resp = await fetch("/api/admin/tournament-venues/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournament_id: tournamentId, venue_id: venueId }),
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error(json?.error || "Unlink failed");
      }
      setRecentState((prev) =>
        prev
          .map((t) => (t.id !== tournamentId ? t : { ...t, links: t.links.filter((l) => l.venue_id !== venueId) }))
          .filter((t) => t.links.length > 0)
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unlink failed";
      window.alert(message);
    } finally {
      setUnlinkingKey(null);
    }
  };

  const persistDismissed = (next: Set<string>) => {
    setDismissedTournamentIds(next);
    try {
      window.localStorage.setItem(dismissedStorageKey, JSON.stringify(Array.from(next)));
    } catch {
      // ignore
    }
  };

  const dismissTournamentFromRecent = (tournamentId: string) => {
    if (!tournamentId) return;
    setRecentState((prev) => prev.filter((t) => t.id !== tournamentId));
    const next = new Set(dismissedTournamentIds);
    next.add(tournamentId);
    persistDismissed(next);
  };

  const resetDismissedRecent = () => {
    if (!window.confirm("Clear reviewed/hidden tournaments for this date range?")) return;
    try {
      window.localStorage.removeItem(dismissedStorageKey);
    } catch {
      // ignore
    }
    window.location.reload();
  };

  const deleteTournament = async (tournamentId: string, tournamentName: string | null) => {
    if (!tournamentId) return;
    const label = tournamentName || tournamentId;
    if (!window.confirm(`Delete tournament "${label}"? This cannot be undone.`)) return;
    const confirmed = window.confirm(`Really delete "${label}"? This will unlink any venues and remove it from listings.`);
    if (!confirmed) return;
    setDeletingTournamentId(tournamentId);
    try {
      const resp = await fetch("/api/admin/tournaments/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournament_id: tournamentId }),
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error(json?.error || "Delete tournament failed");
      }
      dismissTournamentFromRecent(tournamentId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delete tournament failed";
      window.alert(message);
    } finally {
      setDeletingTournamentId(null);
    }
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(dismissedStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) {
        setDismissedTournamentIds(new Set());
        setRecentState(recentTournamentVenueLinks);
        return;
      }

      const nextDismissed = new Set(parsed.map((v) => String(v)).filter(Boolean));
      setDismissedTournamentIds(nextDismissed);
      if (nextDismissed.size === 0) {
        setRecentState(recentTournamentVenueLinks);
        return;
      }
      setRecentState(recentTournamentVenueLinks.filter((t) => !nextDismissed.has(t.id)));
    } catch {
      setDismissedTournamentIds(new Set());
      setRecentState(recentTournamentVenueLinks);
    }
  }, [dismissedStorageKey, recentTournamentVenueLinks]);

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
                        {item.owl_score != null ? ` • Owl score: ${item.owl_score}` : ""}
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

      {duplicateGroups.length > 0 ? (
        <section
          style={{
            border: "1px solid #d1d5db",
            background: "#fff",
            borderRadius: 10,
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Recent tournament venue links</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                Review venue links added in this date range and quickly unlink incorrect ones.
              </div>
            </div>
            <form method="GET" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {Object.entries(preservedFilters).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
              <input type="hidden" name="duplicates" value="1" />
              <label style={{ fontSize: 12, color: "#374151", fontWeight: 700 }}>
                From{" "}
                <input
                  type="date"
                  name="link_from"
                  defaultValue={recentTournamentVenueLinksFrom}
                  style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb", marginLeft: 6 }}
                />
              </label>
              <label style={{ fontSize: 12, color: "#374151", fontWeight: 700 }}>
                To{" "}
                <input
                  type="date"
                  name="link_to"
                  defaultValue={recentTournamentVenueLinksTo}
                  style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb", marginLeft: 6 }}
                />
              </label>
              <button
                type="submit"
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #1d4ed8",
                  background: "#fff",
                  color: "#1d4ed8",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Load
              </button>
            </form>
          </div>

          {recentState.length === 0 ? (
            <div style={{ padding: 10, borderRadius: 8, background: "#f9fafb", border: "1px solid #e5e7eb", color: "#6b7280" }}>
              No venue links found in this range.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {recentState.slice(0, 80).map((t) => {
                const url = t.official_website_url || t.source_url || "";
                return (
                  <details key={t.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff" }}>
                    <summary style={{ cursor: "pointer", padding: "10px 12px", display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 800 }}>{t.name || t.id}</span>
                      <span style={{ color: "#6b7280", fontSize: 13 }}>
                        {[t.city, t.state].filter(Boolean).join(", ") || "—"}
                      </span>
                      <span style={{ color: "#6b7280", fontSize: 13 }}>
                        Updated: {formatShortDate(t.updated_at) || "—"}
                      </span>
                      <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            dismissTournamentFromRecent(t.id);
                          }}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #10b981",
                            background: "#ecfdf5",
                            color: "#065f46",
                            fontSize: 13,
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          Reviewed (hide)
                        </button>
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>
                            Official URL
                          </a>
                        ) : (
                          <span style={{ color: "#9ca3af", fontSize: 13 }}>No URL</span>
                        )}
                      </span>
                    </summary>
                    <div style={{ padding: "10px 12px", display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          Tournament ID: <span style={{ fontFamily: "monospace" }}>{t.id}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteTournament(t.id, t.name)}
                          disabled={deletingTournamentId === t.id}
                          style={{
                            marginLeft: "auto",
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #dc2626",
                            background: deletingTournamentId === t.id ? "#fee2e2" : "#fff",
                            color: "#b91c1c",
                            fontSize: 13,
                            fontWeight: 800,
                            cursor: deletingTournamentId === t.id ? "not-allowed" : "pointer",
                          }}
                        >
                          {deletingTournamentId === t.id ? "Deleting..." : "Delete tournament"}
                        </button>
                      </div>
                      {t.links.map((l) => {
                        const v = l.venue;
                        const linkKey = `${t.id}:${l.venue_id}`;
                        return (
                          <div key={linkKey} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <div style={{ flex: 1, minWidth: 260 }}>
                              <div style={{ fontWeight: 700 }}>{formatVenueLine(v)}</div>
                              <div style={{ fontSize: 12, color: "#6b7280" }}>
                                Linked: {formatShortDate(l.link_created_at) || "—"} • Venue ID:{" "}
                                <span style={{ fontFamily: "monospace" }}>{l.venue_id}</span>
                              </div>
                            </div>
                            {v?.id ? (
                              <Link
                                href={`/admin/venues/${v.id}`}
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 8,
                                  border: "1px solid #d1d5db",
                                  textDecoration: "none",
                                  color: "#111827",
                                  fontSize: 13,
                                  background: "#fff",
                                  fontWeight: 700,
                                }}
                              >
                                Open venue
                              </Link>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => unlinkTournamentVenue(t.id, l.venue_id)}
                              disabled={unlinkingKey === linkKey}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 8,
                                border: "1px solid #dc2626",
                                background: unlinkingKey === linkKey ? "#fee2e2" : "#fff",
                                color: "#b91c1c",
                                fontSize: 13,
                                fontWeight: 800,
                                cursor: unlinkingKey === linkKey ? "not-allowed" : "pointer",
                              }}
                            >
                              {unlinkingKey === linkKey ? "Unlinking..." : "Unlink"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
              {dismissedTournamentIds.size > 0 ? (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={resetDismissedRecent}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#111827",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Reset hidden ({dismissedTournamentIds.size})
                  </button>
                </div>
              ) : null}
            </div>
          )}
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
