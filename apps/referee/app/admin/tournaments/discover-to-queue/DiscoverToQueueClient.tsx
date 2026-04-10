"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CandidatesTableClient, { type DiscoverToQueueCandidate } from "./CandidatesTableClient";

type StateCountsResponse = { sport: string; counts: Record<string, number> };
type DiscoverResponse = {
  sport: string;
  state: string;
  perQueryLimit: number;
  years: number[];
  provider: string;
  candidates: DiscoverToQueueCandidate[];
  blockedCount: number;
  wrongLocationCount: number;
};
type QueueResponse = { sport: string; queued: number; skipped: number; errors: number; errorSamples: string[] };

function resultsKey(params: { sport: string; state: string; perQueryLimit: number; years: string }) {
  return `discoverToQueue:lastResults:${params.sport}:${params.state}:${params.perQueryLimit}:${params.years}`;
}

function parseYears(input: string) {
  const years = input
    .split(",")
    .map((y) => Number(String(y).trim()))
    .filter((y) => Number.isFinite(y) && y >= 2024 && y <= 2030);
  return years.length ? years : [new Date().getFullYear(), new Date().getFullYear() + 1];
}

export default function DiscoverToQueueClient(props: {
  sportOptions: string[];
  usStates: string[];
  defaultSport: string;
  defaultPerQuery: number;
  defaultYears: string;
}) {
  const [sport, setSport] = useState(props.defaultSport);
  const [state, setState] = useState("");
  const [perQuery, setPerQuery] = useState(String(props.defaultPerQuery));
  const [years, setYears] = useState(props.defaultYears);

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [loadingDiscover, setLoadingDiscover] = useState(false);
  const [loadingQueue, setLoadingQueue] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [discoverInfo, setDiscoverInfo] = useState<{ provider: string; blockedCount: number; wrongLocationCount: number } | null>(null);
  const [candidates, setCandidates] = useState<DiscoverToQueueCandidate[] | null>(null);

  const queueFormRef = useRef<HTMLFormElement | null>(null);

  const yearsList = useMemo(() => parseYears(years), [years]);
  const perQueryLimit = useMemo(() => {
    const n = Number(perQuery);
    if (!Number.isFinite(n)) return props.defaultPerQuery;
    return Math.min(12, Math.max(3, Math.floor(n)));
  }, [perQuery, props.defaultPerQuery]);

  const resultsStorageKey = useMemo(() => resultsKey({ sport, state, perQueryLimit, years: yearsList.join(",") }), [sport, state, perQueryLimit, yearsList]);

  useEffect(() => {
    // Load last results for this exact query, if present.
    try {
      const raw = window.localStorage.getItem(resultsStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DiscoverResponse;
      if (!parsed?.candidates || !Array.isArray(parsed.candidates)) return;
      setCandidates(parsed.candidates);
      setDiscoverInfo({ provider: parsed.provider, blockedCount: parsed.blockedCount ?? 0, wrongLocationCount: parsed.wrongLocationCount ?? 0 });
    } catch {
      // ignore
    }
  }, [resultsStorageKey]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingCounts(true);
      try {
        const res = await fetch("/api/admin/tournaments/discover-to-queue", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "state_counts", sport }),
        });
        const json = (await res.json()) as StateCountsResponse & { error?: string };
        if (!cancelled && !json.error) setCounts(json.counts ?? {});
      } finally {
        if (!cancelled) setLoadingCounts(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [sport]);

  async function runDiscover() {
    if (!state) {
      setNotice("Select a state, then run discovery.");
      return;
    }
    setNotice(null);
    setLoadingDiscover(true);
    try {
      const res = await fetch("/api/admin/tournaments/discover-to-queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "discover",
          sport,
          state,
          perQueryLimit,
          years: yearsList,
        }),
      });
      const json = (await res.json()) as DiscoverResponse & { error?: string; message?: string };
      if (json.error) {
        setNotice(json.message || json.error);
        return;
      }
      setCandidates(json.candidates ?? []);
      setDiscoverInfo({ provider: json.provider, blockedCount: json.blockedCount ?? 0, wrongLocationCount: json.wrongLocationCount ?? 0 });
      try {
        window.localStorage.setItem(resultsStorageKey, JSON.stringify(json));
      } catch {
        // ignore
      }
    } finally {
      setLoadingDiscover(false);
    }
  }

  async function queueSelected(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!queueFormRef.current) return;
    const fd = new FormData(queueFormRef.current);
    const urls = fd
      .getAll("url")
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    const overrideSkip = String(fd.get("override_skip") || "") === "on";
    if (!urls.length) {
      setNotice("Select at least one URL to queue.");
      return;
    }
    setNotice(null);
    setLoadingQueue(true);
    try {
      const res = await fetch("/api/admin/tournaments/discover-to-queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "queue", sport, urls, overrideSkip }),
      });
      const json = (await res.json()) as QueueResponse & { error?: string; message?: string };
      if (json.error) {
        setNotice(json.message || json.error);
        return;
      }
      const parts: string[] = [];
      parts.push(`Queued ${json.queued}.`);
      if (json.skipped) parts.push(`Skipped ${json.skipped} (source guard).`);
      if (json.errors) parts.push(`Errors ${json.errors}.`);
      if (json.errorSamples?.length) parts.push(`Sample: ${json.errorSamples.join(" | ")}`);
      setNotice(parts.join(" "));
    } finally {
      setLoadingQueue(false);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      {notice ? (
        <div style={{ marginBottom: 12, border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 12, padding: "10px 12px", color: "#1e3a8a", fontWeight: 800, fontSize: 13 }}>
          {notice}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: 12 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
            Sport
            <select value={sport} onChange={(e) => setSport(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff" }}>
              {props.sportOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
            State {loadingCounts ? <span style={{ fontSize: 11, color: "#64748b" }}>(loading counts…)</span> : null}
            <select value={state} onChange={(e) => setState(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff" }}>
              <option value="">Select…</option>
              {props.usStates.map((st) => (
                <option key={st} value={st}>
                  {st} ({counts?.[st] ?? 0})
                </option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Counts are upcoming published canonical tournaments for the selected sport.</span>
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
            Per-query results
            <input value={perQuery} onChange={(e) => setPerQuery(e.target.value)} inputMode="numeric" style={{ padding: 10, borderRadius: 10, border: "1px solid #cbd5e1" }} />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
            Years (comma-separated)
            <input value={years} onChange={(e) => setYears(e.target.value)} placeholder="2026,2027" style={{ padding: 10, borderRadius: 10, border: "1px solid #cbd5e1" }} />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={runDiscover}
            disabled={loadingDiscover}
            style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: "#0f172a", color: "#fff", fontWeight: 900, opacity: loadingDiscover ? 0.7 : 1 }}
          >
            {loadingDiscover ? "Discovering..." : "Discover URLs"}
          </button>
          <a href="/admin?tab=tournament-uploads" style={{ fontSize: 13, color: "#1d4ed8", fontWeight: 800, textDecoration: "none" }}>
            Back to uploads
          </a>
        </div>

        {discoverInfo?.blockedCount ? (
          <div style={{ border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: 12, padding: "10px 12px", color: "#475569", fontSize: 13 }}>
            Filtered out <strong>{discoverInfo.blockedCount}</strong> junk results (wikipedia / fifa / world cup).
          </div>
        ) : null}

        {discoverInfo?.wrongLocationCount ? (
          <div style={{ border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: 12, padding: "10px 12px", color: "#475569", fontSize: 13 }}>
            Filtered out <strong>{discoverInfo.wrongLocationCount}</strong> results that look out-of-state / non-US based on title/snippet.
          </div>
        ) : null}

        {candidates?.length ? (
          <form ref={queueFormRef} onSubmit={queueSelected}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, color: "#0f172a" }}>
                <input type="checkbox" name="override_skip" />
                Override source skip guard
              </label>
            </div>

            <CandidatesTableClient sport={sport} state={state} candidates={candidates} />

            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" disabled={loadingQueue} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #0f172a", background: "#0f172a", color: "#fff", fontWeight: 900, opacity: loadingQueue ? 0.7 : 1 }}>
                {loadingQueue ? "Queueing..." : "Queue selected URLs"}
              </button>
            </div>
          </form>
        ) : candidates ? (
          <div style={{ border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: 12, padding: "10px 12px", color: "#475569", fontSize: 13 }}>
            No candidates found.
          </div>
        ) : null}
      </div>
    </div>
  );
}

