"use client";

import { useMemo, useState } from "react";

type CandidateRow = {
  tournament_id: string;
  venue_id: string;
  confidence_score: string | number;
  inference_method: string;
  rank_inference: number;
  existing_link_type: "none" | "inferred" | "confirmed";
  venue?: {
    id: string;
    name?: string | null;
    city?: string | null;
    state?: string | null;
    address?: string | null;
    venue_url?: string | null;
  } | null;
};

type InferenceItem = {
  tournament: {
    id: string;
    name?: string | null;
    city?: string | null;
    state?: string | null;
    sport?: string | null;
    start_date?: string | null;
    updated_at?: string | null;
  };
  candidates: CandidateRow[];
};

export default function UploadsVenueInferencePanel() {
  const [limitPerTournament, setLimitPerTournament] = useState(3);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [bulkWorkingTournamentId, setBulkWorkingTournamentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<InferenceItem[]>([]);
  const [lastApplyResult, setLastApplyResult] = useState<{ dry_run: boolean; wrote: number } | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const inferredCount = useMemo(
    () => items.reduce((sum, it) => sum + (it.candidates?.filter((c) => c.existing_link_type === "inferred").length ?? 0), 0),
    [items]
  );

  const preview = async () => {
    setLoading(true);
    setError(null);
    setLastApplyResult(null);
    try {
      const resp = await fetch(
        `/api/admin/tournaments/uploads/inferred?limit_per_tournament=${encodeURIComponent(String(limitPerTournament))}`,
        { credentials: "include" }
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "preview_failed");
      setItems(Array.isArray(json?.items) ? (json.items as InferenceItem[]) : []);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : "preview_failed");
    } finally {
      setLoading(false);
    }
  };

  const apply = async (dryRun: boolean) => {
    setApplying(true);
    setError(null);
    setLastApplyResult(null);
    try {
      const resp = await fetch("/api/admin/tournaments/uploads/inferred", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ limit_per_tournament: limitPerTournament, dry_run: dryRun }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "apply_failed");
      const rows = Array.isArray(json?.rows) ? (json.rows as any[]) : [];
      setLastApplyResult({ dry_run: Boolean(json?.dry_run), wrote: rows.filter((r) => r?.wrote).length });
      await preview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "apply_failed");
    } finally {
      setApplying(false);
    }
  };

  const promote = async (tournamentId: string, venueId: string) => {
    setError(null);
    try {
      const resp = await fetch("/api/admin/tournaments/enrichment/inferred/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tournament_id: tournamentId, venue_id: venueId }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "promote_failed");
      await preview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "promote_failed");
    }
  };

  const promoteOnce = async (tournamentId: string, venueId: string) => {
    const resp = await fetch("/api/admin/tournaments/enrichment/inferred/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ tournament_id: tournamentId, venue_id: venueId }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json?.error || "promote_failed");
  };

  const reject = async (tournamentId: string, venueId: string, method: string) => {
    setError(null);
    try {
      const resp = await fetch("/api/admin/tournaments/enrichment/inferred/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tournament_id: tournamentId, venue_id: venueId, method, remove_link: true }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "reject_failed");
      await preview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "reject_failed");
    }
  };

  const rejectOnce = async (tournamentId: string, venueId: string, method: string) => {
    const resp = await fetch("/api/admin/tournaments/enrichment/inferred/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ tournament_id: tournamentId, venue_id: venueId, method, remove_link: true }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json?.error || "reject_failed");
  };

  const toggleSelected = (key: string, checked: boolean) => {
    setSelected((prev) => ({ ...prev, [key]: checked }));
  };

  const selectAllInferredForTournament = (tournamentId: string, candidates: CandidateRow[]) => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const c of candidates) {
        if (c.existing_link_type !== "inferred") continue;
        next[`${tournamentId}:${c.venue_id}`] = true;
      }
      return next;
    });
  };

  const clearSelectionForTournament = (tournamentId: string) => {
    setSelected((prev) => {
      const next: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (!k.startsWith(`${tournamentId}:`)) next[k] = v;
      }
      return next;
    });
  };

  const bulkPromote = async (tournamentId: string, candidates: CandidateRow[]) => {
    setBulkWorkingTournamentId(tournamentId);
    setError(null);
    try {
      const selectedRows = candidates.filter((c) => selected[`${tournamentId}:${c.venue_id}`] && c.existing_link_type === "inferred");
      if (!selectedRows.length) return;
      const failures: Array<{ venue_id: string; error: string }> = [];
      for (const row of selectedRows) {
        try {
          await promoteOnce(tournamentId, row.venue_id);
        } catch (err) {
          failures.push({
            venue_id: row.venue_id,
            error: err instanceof Error ? err.message : "promote_failed",
          });
        }
      }
      if (failures.length) {
        setError(`Bulk promote: ${failures.length}/${selectedRows.length} failed (first: ${failures[0].venue_id} ${failures[0].error}).`);
      }
      clearSelectionForTournament(tournamentId);
      await preview();
    } finally {
      setBulkWorkingTournamentId(null);
    }
  };

  const bulkReject = async (tournamentId: string, candidates: CandidateRow[]) => {
    setBulkWorkingTournamentId(tournamentId);
    setError(null);
    try {
      const selectedRows = candidates.filter((c) => selected[`${tournamentId}:${c.venue_id}`] && c.existing_link_type === "inferred");
      if (!selectedRows.length) return;
      const failures: Array<{ venue_id: string; error: string }> = [];
      for (const row of selectedRows) {
        try {
          await rejectOnce(tournamentId, row.venue_id, row.inference_method);
        } catch (err) {
          failures.push({
            venue_id: row.venue_id,
            error: err instanceof Error ? err.message : "reject_failed",
          });
        }
      }
      if (failures.length) {
        setError(`Bulk reject: ${failures.length}/${selectedRows.length} failed (first: ${failures[0].venue_id} ${failures[0].error}).`);
      }
      clearSelectionForTournament(tournamentId);
      await preview();
    } finally {
      setBulkWorkingTournamentId(null);
    }
  };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fff", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 13 }}>Draft venue inference (uploads)</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Previews and writes inferred venue links for draft tournaments with no confirmed venue links. Promoting makes it confirmed.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: "#111827", display: "inline-flex", gap: 8, alignItems: "center" }}>
            Limit
            <input
              type="number"
              min={1}
              max={10}
              value={limitPerTournament}
              onChange={(e) => setLimitPerTournament(Math.max(1, Math.min(10, Math.trunc(Number(e.target.value) || 3))))}
              style={{ width: 70, padding: 6, borderRadius: 10, border: "1px solid #d1d5db" }}
            />
          </label>
          <button
            type="button"
            onClick={preview}
            disabled={loading || applying}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #0f172a",
              background: "#fff",
              color: "#0f172a",
              fontWeight: 900,
              cursor: loading || applying ? "not-allowed" : "pointer",
              fontSize: 12,
            }}
          >
            {loading ? "Loading..." : "Preview"}
          </button>
          <button
            type="button"
            onClick={() => apply(true)}
            disabled={loading || applying}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #334155",
              background: "#fff",
              color: "#334155",
              fontWeight: 900,
              cursor: loading || applying ? "not-allowed" : "pointer",
              fontSize: 12,
            }}
          >
            {applying ? "Working..." : "Apply (dry-run)"}
          </button>
          <button
            type="button"
            onClick={() => apply(false)}
            disabled={loading || applying}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "none",
              background: "#0f3d2e",
              color: "#fff",
              fontWeight: 900,
              cursor: loading || applying ? "not-allowed" : "pointer",
              fontSize: 12,
            }}
          >
            {applying ? "Working..." : "Apply (write inferred)"}
          </button>
        </div>
      </div>

      {error ? <div style={{ fontSize: 12, color: "#b91c1c" }}>Inference error: {error}</div> : null}
      {lastApplyResult ? (
        <div style={{ fontSize: 12, color: "#0f3d2e" }}>
          Apply complete: dry_run={String(lastApplyResult.dry_run)} wrote={lastApplyResult.wrote}. Refresh the page if you want the linked-venues widgets to show updates.
        </div>
      ) : null}

      {items.length ? (
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Tournaments with candidates: <strong>{items.length}</strong> · Candidate rows already linked (inferred): <strong>{inferredCount}</strong>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "#6b7280" }}>No preview loaded yet.</div>
      )}

      {items.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((it) => (
            <details key={it.tournament.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
              <summary style={{ cursor: "pointer", fontWeight: 900, fontSize: 12, color: "#111827" }}>
                {[it.tournament.name, it.tournament.city, it.tournament.state, it.tournament.sport, it.tournament.start_date]
                  .filter(Boolean)
                  .join(" • ") || it.tournament.id}
              </summary>
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => selectAllInferredForTournament(it.tournament.id, it.candidates ?? [])}
                    disabled={bulkWorkingTournamentId === it.tournament.id}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#111827",
                      fontWeight: 900,
                      fontSize: 12,
                      cursor: bulkWorkingTournamentId === it.tournament.id ? "not-allowed" : "pointer",
                    }}
                  >
                    Select all inferred
                  </button>
                  <button
                    type="button"
                    onClick={() => clearSelectionForTournament(it.tournament.id)}
                    disabled={bulkWorkingTournamentId === it.tournament.id}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#6b7280",
                      fontWeight: 900,
                      fontSize: 12,
                      cursor: bulkWorkingTournamentId === it.tournament.id ? "not-allowed" : "pointer",
                    }}
                  >
                    Clear selection
                  </button>
                  <button
                    type="button"
                    onClick={() => bulkPromote(it.tournament.id, it.candidates ?? [])}
                    disabled={bulkWorkingTournamentId === it.tournament.id}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid #0f172a",
                      background: "#fff",
                      color: "#0f172a",
                      fontWeight: 900,
                      fontSize: 12,
                      cursor: bulkWorkingTournamentId === it.tournament.id ? "not-allowed" : "pointer",
                    }}
                  >
                    {bulkWorkingTournamentId === it.tournament.id ? "Working..." : "Promote selected"}
                  </button>
                  <button
                    type="button"
                    onClick={() => bulkReject(it.tournament.id, it.candidates ?? [])}
                    disabled={bulkWorkingTournamentId === it.tournament.id}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid #b91c1c",
                      background: "#fff",
                      color: "#b91c1c",
                      fontWeight: 900,
                      fontSize: 12,
                      cursor: bulkWorkingTournamentId === it.tournament.id ? "not-allowed" : "pointer",
                    }}
                  >
                    {bulkWorkingTournamentId === it.tournament.id ? "Working..." : "Reject selected"}
                  </button>
                </div>
                {(it.candidates ?? []).map((c) => {
                  const venueLabel =
                    [c.venue?.name, c.venue?.city, c.venue?.state].filter(Boolean).join(" • ") ||
                    c.venue_id ||
                    "unknown venue";
                  const canAction = c.existing_link_type === "inferred";
                  const key = `${c.tournament_id}:${c.venue_id}`;
                  return (
                    <div key={`${c.tournament_id}:${c.venue_id}`} style={{ display: "grid", gap: 6, padding: 8, border: "1px solid #e5e7eb", borderRadius: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 12, color: "#111827" }}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={Boolean(selected[key])}
                              onChange={(e) => toggleSelected(key, e.target.checked)}
                              disabled={!canAction || bulkWorkingTournamentId === it.tournament.id}
                            />
                            <span>
                              <strong>#{c.rank_inference}</strong> {venueLabel}
                            </span>
                          </label>
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          conf: <strong>{String(c.confidence_score)}</strong> · link: <strong>{c.existing_link_type}</strong>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => promote(c.tournament_id, c.venue_id)}
                          disabled={!canAction}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid #0f172a",
                            background: "#fff",
                            color: "#0f172a",
                            fontWeight: 900,
                            fontSize: 12,
                            cursor: canAction ? "pointer" : "not-allowed",
                          }}
                        >
                          Promote
                        </button>
                        <button
                          type="button"
                          onClick={() => reject(c.tournament_id, c.venue_id, c.inference_method)}
                          disabled={!canAction}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid #b91c1c",
                            background: "#fff",
                            color: "#b91c1c",
                            fontWeight: 900,
                            fontSize: 12,
                            cursor: canAction ? "pointer" : "not-allowed",
                          }}
                        >
                          Reject
                        </button>
                        {!canAction ? (
                          <div style={{ fontSize: 12, color: "#6b7280" }}>Apply (write) first to enable promote/reject.</div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      ) : null}
    </div>
  );
}
