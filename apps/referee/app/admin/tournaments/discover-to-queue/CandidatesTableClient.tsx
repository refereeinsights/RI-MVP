"use client";

import { useEffect, useMemo, useState } from "react";

export type DiscoverToQueueCandidate = {
  normalized: string;
  canonical: string;
  host: string;
  title: string | null;
  snippet: string | null;
  domain: string | null;
  alreadyKnown: boolean;
  registrySkipReason: string | null;
};

function storageKey(params: { sport: string; state: string }) {
  return `discoverToQueueHidden:${params.sport}:${params.state}`;
}

function loadHidden(params: { sport: string; state: string }) {
  try {
    const raw = window.localStorage.getItem(storageKey(params));
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.map((v) => String(v || "").trim()).filter(Boolean));
  } catch {
    return new Set<string>();
  }
}

function saveHidden(params: { sport: string; state: string }, hidden: Set<string>) {
  try {
    window.localStorage.setItem(storageKey(params), JSON.stringify(Array.from(hidden)));
  } catch {
    // ignore
  }
}

export default function CandidatesTableClient(props: {
  sport: string;
  state: string;
  candidates: DiscoverToQueueCandidate[];
}) {
  const { sport, state, candidates } = props;

  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setHidden(loadHidden({ sport, state }));
    setLoaded(true);
  }, [sport, state]);

  useEffect(() => {
    if (!loaded) return;
    saveHidden({ sport, state }, hidden);
  }, [hidden, loaded, sport, state]);

  const visibleCandidates = useMemo(() => {
    if (!hidden.size) return candidates;
    return candidates.filter((c) => !hidden.has(c.normalized));
  }, [candidates, hidden]);

  const hiddenCount = candidates.length - visibleCandidates.length;

  function hide(normalized: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.add(normalized);
      return next;
    });
  }

  function resetHidden() {
    setHidden(new Set());
  }

  function hideDisabled() {
    setHidden((prev) => {
      const next = new Set(prev);
      for (const c of candidates) {
        if (c.alreadyKnown || Boolean(c.registrySkipReason)) next.add(c.normalized);
      }
      return next;
    });
  }

  function clearHiddenForSportState() {
    try {
      window.localStorage.removeItem(storageKey({ sport, state }));
    } catch {
      // ignore
    }
    resetHidden();
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <div style={{ display: "grid", gap: 2 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>
            Candidates ({visibleCandidates.length}
            {hiddenCount ? ` shown, ${hiddenCount} hidden` : ""})
          </h2>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>
            Hide is local-only (saved per sport+state in your browser).
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={hideDisabled} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", fontWeight: 900, fontSize: 12 }}>
            Hide disabled
          </button>
          <button
            type="button"
            onClick={resetHidden}
            disabled={!hiddenCount}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              background: "#fff",
              fontWeight: 900,
              fontSize: 12,
              opacity: hiddenCount ? 1 : 0.5,
              cursor: hiddenCount ? "pointer" : "default",
            }}
          >
            Show all
          </button>
          <button
            type="button"
            onClick={clearHiddenForSportState}
            disabled={!hiddenCount}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #fee2e2",
              background: "#fff",
              color: "#991b1b",
              fontWeight: 900,
              fontSize: 12,
              opacity: hiddenCount ? 1 : 0.5,
              cursor: hiddenCount ? "pointer" : "default",
            }}
          >
            Clear hidden
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", background: "#f8fafc" }}>
              <th style={{ padding: "10px 10px", fontSize: 12, borderBottom: "1px solid #e2e8f0", width: 46 }}>Pick</th>
              <th style={{ padding: "10px 10px", fontSize: 12, borderBottom: "1px solid #e2e8f0" }}>Result</th>
              <th style={{ padding: "10px 10px", fontSize: 12, borderBottom: "1px solid #e2e8f0", width: 220 }}>Status</th>
              <th style={{ padding: "10px 10px", fontSize: 12, borderBottom: "1px solid #e2e8f0", width: 90 }}>Remove</th>
            </tr>
          </thead>
          <tbody>
            {visibleCandidates.map((c) => {
              const disabled = c.alreadyKnown || Boolean(c.registrySkipReason);
              const status = c.alreadyKnown ? "Already in DB/registry" : c.registrySkipReason ? c.registrySkipReason : "New";
              return (
                <tr key={c.normalized}>
                  <td style={{ padding: "10px 10px", borderTop: "1px solid #eef2f7", verticalAlign: "top" }}>
                    <input type="checkbox" name="url" value={c.canonical} defaultChecked={!disabled} disabled={disabled} />
                  </td>
                  <td style={{ padding: "10px 10px", borderTop: "1px solid #eef2f7", verticalAlign: "top" }}>
                    <div style={{ fontWeight: 900, fontSize: 13, color: "#0f172a" }}>{c.title ?? c.domain ?? c.host}</div>
                    <div style={{ marginTop: 2, fontSize: 12, color: "#475569" }}>{c.snippet ?? ""}</div>
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      <a href={c.canonical} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", textDecoration: "none" }}>
                        {c.host}
                      </a>
                    </div>
                  </td>
                  <td style={{ padding: "10px 10px", borderTop: "1px solid #eef2f7", verticalAlign: "top", fontSize: 12, color: disabled ? "#64748b" : "#0f172a", fontWeight: 800 }}>
                    {status}
                  </td>
                  <td style={{ padding: "10px 10px", borderTop: "1px solid #eef2f7", verticalAlign: "top" }}>
                    <button
                      type="button"
                      onClick={() => hide(c.normalized)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                        background: "#fff",
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      Hide
                    </button>
                  </td>
                </tr>
              );
            })}
            {!visibleCandidates.length ? (
              <tr>
                <td colSpan={4} style={{ padding: 14, color: "#64748b", fontSize: 13, fontWeight: 800 }}>
                  No visible candidates (all hidden).
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

