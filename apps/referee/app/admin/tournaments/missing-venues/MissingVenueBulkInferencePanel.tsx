"use client";

import { useState } from "react";

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
    address?: string | null;
    city?: string | null;
    state?: string | null;
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
  };
  candidates: CandidateRow[];
};

export default function MissingVenueBulkInferencePanel() {
  const [limitPerTournament, setLimitPerTournament] = useState(3);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<InferenceItem[]>([]);
  const [lastResult, setLastResult] = useState<{ dry_run: boolean; wrote: number } | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkWorking, setBulkWorking] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const preview = async () => {
    setLoading(true);
    setError(null);
    setLastResult(null);
    setOpen(true);
    try {
      const resp = await fetch(
        `/api/admin/tournaments/missing-venues/infer?limit_per_tournament=${limitPerTournament}`,
        { credentials: "include" }
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "preview_failed");
      setItems(Array.isArray(json?.items) ? json.items : []);
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
    setLastResult(null);
    try {
      const resp = await fetch("/api/admin/tournaments/missing-venues/infer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ limit_per_tournament: limitPerTournament, dry_run: dryRun }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "apply_failed");
      const rows = Array.isArray(json?.rows) ? json.rows : [];
      setLastResult({ dry_run: Boolean(json?.dry_run), wrote: rows.filter((r: any) => r?.wrote).length });
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

  const bulkPromote = async (tournamentId: string, candidates: CandidateRow[]) => {
    setBulkWorking(tournamentId);
    setError(null);
    const selectedRows = candidates.filter(
      (c) => selected[`${tournamentId}:${c.venue_id}`] && c.existing_link_type === "inferred"
    );
    if (!selectedRows.length) { setBulkWorking(null); return; }
    const failures: string[] = [];
    for (const row of selectedRows) {
      try {
        const resp = await fetch("/api/admin/tournaments/enrichment/inferred/promote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tournament_id: tournamentId, venue_id: row.venue_id }),
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) failures.push(row.venue_id);
      } catch { failures.push(row.venue_id); }
    }
    if (failures.length) setError(`${failures.length} promote(s) failed`);
    setBulkWorking(null);
    await preview();
  };

  const toggleSelected = (key: string, checked: boolean) =>
    setSelected((prev) => ({ ...prev, [key]: checked }));

  const inferredCount = items.reduce(
    (sum, it) => sum + (it.candidates?.filter((c) => c.existing_link_type === "inferred").length ?? 0),
    0
  );

  return (
    <div style={{ border: "1px solid #e0e7ff", borderRadius: 10, background: "#f5f3ff", padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13, color: "#4c1d95" }}>Bulk venue inference</strong>
        <label style={{ fontSize: 12, color: "#6b7280", display: "flex", alignItems: "center", gap: 4 }}>
          Top
          <select
            value={limitPerTournament}
            onChange={(e) => setLimitPerTournament(Number(e.target.value))}
            style={{ padding: "2px 4px", fontSize: 12 }}
          >
            {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          per tournament
        </label>
        <button
          type="button"
          onClick={preview}
          disabled={loading || applying}
          style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid #7c3aed", background: "#fff", color: "#7c3aed", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
        >
          {loading ? "Loading…" : "Preview"}
        </button>
        <button
          type="button"
          onClick={() => apply(true)}
          disabled={loading || applying}
          style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid #9ca3af", background: "#fff", color: "#374151", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
        >
          {applying ? "Running…" : "Dry run"}
        </button>
        <button
          type="button"
          onClick={() => apply(false)}
          disabled={loading || applying}
          style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid #7c3aed", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
        >
          Apply (write)
        </button>
        {items.length > 0 && (
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {items.length} tournament{items.length !== 1 ? "s" : ""} • {inferredCount} already inferred
          </span>
        )}
        {lastResult && (
          <span style={{ fontSize: 12, color: lastResult.dry_run ? "#6b7280" : "#16a34a", fontWeight: 700 }}>
            {lastResult.dry_run ? `Dry run: ${lastResult.wrote} would write` : `Wrote ${lastResult.wrote} inferred links`}
          </span>
        )}
      </div>

      {error && <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626" }}>{error}</div>}

      {open && items.length === 0 && !loading && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
          No inference candidates found — venues may not meet the minimum frequency threshold (3+ tournaments at same city/state/sport).
        </div>
      )}

      {items.length > 0 && (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {items.map((it) => {
            const t = it.tournament;
            const inferredCandidates = it.candidates.filter((c) => c.existing_link_type === "inferred");
            const selectedForThis = it.candidates.filter((c) => selected[`${t.id}:${c.venue_id}`] && c.existing_link_type === "inferred");
            return (
              <div key={t.id} style={{ background: "#fff", borderRadius: 8, border: "1px solid #ddd6fe", padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{t.name ?? t.id}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{[t.city, t.state, t.sport].filter(Boolean).join(" · ")}</div>
                  </div>
                  {inferredCandidates.length > 0 && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => {
                          const next: Record<string, boolean> = { ...selected };
                          for (const c of inferredCandidates) next[`${t.id}:${c.venue_id}`] = true;
                          setSelected(next);
                        }}
                        style={{ padding: "2px 8px", borderRadius: 5, border: "1px solid #9ca3af", background: "#fff", color: "#374151", fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        disabled={bulkWorking === t.id || selectedForThis.length === 0}
                        onClick={() => bulkPromote(t.id, it.candidates)}
                        style={{ padding: "2px 8px", borderRadius: 5, border: "1px solid #16a34a", background: "#fff", color: "#16a34a", fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                      >
                        {bulkWorking === t.id ? "Working…" : "Promote selected"}
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                  {it.candidates.map((c) => {
                    const selKey = `${t.id}:${c.venue_id}`;
                    const venueLine = [c.venue?.name, c.venue?.address || [c.venue?.city, c.venue?.state].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
                    return (
                      <div key={c.venue_id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                        {c.existing_link_type === "inferred" && (
                          <input
                            type="checkbox"
                            checked={!!selected[selKey]}
                            onChange={(e) => toggleSelected(selKey, e.target.checked)}
                          />
                        )}
                        <span
                          style={{
                            padding: "1px 6px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            background: c.existing_link_type === "confirmed" ? "#dcfce7" : c.existing_link_type === "inferred" ? "#ede9fe" : "#f1f5f9",
                            color: c.existing_link_type === "confirmed" ? "#15803d" : c.existing_link_type === "inferred" ? "#7c3aed" : "#64748b",
                          }}
                        >
                          {c.existing_link_type}
                        </span>
                        <span style={{ flex: 1 }}>{venueLine || c.venue_id}</span>
                        <span style={{ color: "#9ca3af", fontSize: 11 }}>{Number(c.confidence_score).toFixed(2)}</span>
                        {c.existing_link_type !== "confirmed" && (
                          <>
                            <button
                              type="button"
                              onClick={() => promote(t.id, c.venue_id)}
                              style={{ padding: "1px 7px", borderRadius: 5, border: "1px solid #16a34a", background: "#fff", color: "#16a34a", fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                            >
                              Promote
                            </button>
                            <button
                              type="button"
                              onClick={() => reject(t.id, c.venue_id, c.inference_method)}
                              style={{ padding: "1px 7px", borderRadius: 5, border: "1px solid #9ca3af", background: "#fff", color: "#6b7280", fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {c.existing_link_type === "none" && (
                          <span style={{ fontSize: 11, color: "#f59e0b" }}>Apply first</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
