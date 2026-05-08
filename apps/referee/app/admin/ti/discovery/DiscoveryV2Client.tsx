"use client";

import { useEffect, useMemo, useState } from "react";

import { TI_SPORT_LABELS, TI_SPORTS } from "@/lib/tiSports";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const QUARTER_MONTHS: [number, number, number][] = [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]];

function monthFirstDay(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
function monthLastDay(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
function currentQuarter(): number {
  return Math.ceil((new Date().getMonth() + 1) / 3);
}
function chunkMonthLabel(start: string): string {
  const m = parseInt(start.slice(5, 7), 10) - 1;
  return `${MONTHS_SHORT[m] ?? ""} ${start.slice(0, 4)}`;
}

function geocodedRowCount(masterCsv: string): number {
  const lines = masterCsv.split("\n");
  if (lines.length < 2) return 0;
  const headers = lines[0].split(",");
  const latIdx = headers.indexOf("venue_latitude");
  if (latIdx === -1) return 0;
  return lines.slice(1).filter((l) => {
    const cols = l.split(",");
    const v = (cols[latIdx] ?? "").trim();
    return v !== "" && v !== "0";
  }).length;
}

function buildPrompt(params: { sport: string; state: string; start: string; end: string }) {
  const { sport, state, start, end } = params;
  const header =
    "tournament_name,sport,city,state,start_date,end_date,official_website_url,source_url,host_org,tournament_director,tournament_director_email,referee_contact,referee_contact_email,venue_name,venue_address,venue_city,venue_state,venue_zip,venue_url,confidence,notes";
  return [
    `Find future youth ${sport} tournaments in ${state} from ${start} to ${end}.`,
    "",
    "Rules:",
    "- Return ONLY CSV (no markdown, no code fences, no explanation).",
    `- First row MUST be this exact header (exact order):`,
    header,
    "- Max 25 rows.",
    "- Only real tournaments (not leagues, weekly play, camps, clinics).",
    "- Every row must include a valid http(s) source_url that clearly supports the dates (URL only, no markdown links).",
    "- official_website_url is optional.",
    "- Multi-venue rule: ONE ROW PER VENUE (repeat tournament fields for each venue).",
    "- Venue rule (strict): Each row MUST include venue_address + venue_city + venue_state + venue_zip.",
    "- venue_address MUST be the full street address (number + street name, e.g. \"123 Main St\").",
    "- venue_zip MUST be a 5-digit US ZIP (e.g. 97229).",
    "- venue_name is OPTIONAL (blank allowed). If provided, it must be a real identifiable venue name (no placeholders).",
    "- ALL URLs must be plain text (e.g. https://example.com) — do NOT use markdown link format [text](url) anywhere in the CSV.",
    "- Do NOT use placeholder venues like: TBD, Multiple Locations, Various Venues, Portland Area Gyms, Surrounding Area Locations.",
    "- confidence is optional (high|medium|low) if you can justify it; otherwise leave blank.",
    "",
    "Output format: CSV only.",
  ].join("\n");
}

type RunRow = {
  id: string;
  sport: string;
  state: string;
  date_range_start: string;
  date_range_end: string;
  run_mode: string;
  status: string;
  master_csv_row_count: number;
  created_at: string;
};

function chunkKeyForRange(r: { start: string; end: string }) {
  return `${r.start}__${r.end}`;
}

export default function DiscoveryV2Client() {
  const [sport, setSport] = useState<string>("soccer");
  const [state, setState] = useState<string>("CA");
  const [dateMode, setDateMode] = useState<"month" | "quarter">("quarter");
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [period, setPeriod] = useState<string>(String(currentQuarter()));
  const [notice, setNotice] = useState<string>("");

  const [runs, setRuns] = useState<RunRow[]>([]);
  const [activeRunId, setActiveRunId] = useState<string>("");
  const [activeRun, setActiveRun] = useState<any | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);

  const [chunkText, setChunkText] = useState<string>("");
  const [attachBusy, setAttachBusy] = useState(false);

  const [perplexityBusy, setPerplexityBusy] = useState<Record<string, boolean>>({});
  const [perplexityResult, setPerplexityResult] = useState<
    Record<string, { kind: "ok" | "error" | "warn"; message: string }>
  >({});
  const [perplexityCitations, setPerplexityCitations] = useState<Record<string, string[]>>({});
  const [perplexityDebug, setPerplexityDebug] = useState<Record<string, any>>({});
  const [perplexityContext, setPerplexityContext] = useState<Record<string, string>>({});
  const [perplexityRunAllStartedAt, setPerplexityRunAllStartedAt] = useState<string>("");
  const [perplexityRunAllSummary, setPerplexityRunAllSummary] = useState<string>("");

  const [queueDryRun, setQueueDryRun] = useState(true);
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueResult, setQueueResult] = useState<any | null>(null);

  const canCreate = Boolean(sport && state.trim());

  const { dateStart, dateEnd } = useMemo(() => {
    const y = Number(year);
    if (dateMode === "month") {
      const m = Number(period);
      return { dateStart: monthFirstDay(y, m), dateEnd: monthLastDay(y, m) };
    }
    const q = Number(period) - 1;
    const months = QUARTER_MONTHS[q] ?? QUARTER_MONTHS[0];
    return { dateStart: monthFirstDay(y, months[0]), dateEnd: monthLastDay(y, months[2]) };
  }, [dateMode, year, period]);

  const chunks = useMemo(() => {
    const y = Number(year);
    if (dateMode === "month") {
      return [{ start: dateStart, end: dateEnd }];
    }
    const q = Number(period) - 1;
    const months = QUARTER_MONTHS[q] ?? QUARTER_MONTHS[0];
    return months.map((m) => ({ start: monthFirstDay(y, m), end: monthLastDay(y, m) }));
  }, [dateMode, year, period, dateStart, dateEnd]);

  const prompts = useMemo(
    () => chunks.map((c) => buildPrompt({ sport, state, start: c.start, end: c.end })),
    [chunks, sport, state]
  );

  async function runPerplexity(chunk: { start: string; end: string }) {
    if (!activeRunId) return;
    const key = chunkKeyForRange(chunk);
    setPerplexityBusy((p) => ({ ...p, [key]: true }));
    setPerplexityResult((p) => ({ ...p, [key]: { kind: "warn", message: "" } }));
    setPerplexityCitations((p) => ({ ...p, [key]: [] }));
    setPerplexityDebug((p) => ({ ...p, [key]: null }));

    try {
      const additional_context = (perplexityContext[key] ?? "").trim();
      const res = await fetch(`/api/admin/ti/discovery-v2/runs/${activeRunId}/perplexity/search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sport,
          state,
          date_start: chunk.start,
          date_end: chunk.end,
          future_only: true,
          additional_context: additional_context || undefined,
        }),
      });

      let json: any = null;
      try {
        json = await res.json();
      } catch {
        setPerplexityResult((p) => ({
          ...p,
          [key]: { kind: "error", message: `Perplexity failed (HTTP ${res.status}).` },
        }));
        return;
      }

      if (!json.ok) {
        const msg = String(json.error ?? "Perplexity failed");
        const batch = json.batch_id ? ` (batch ${json.batch_id})` : "";
        if (json.debug) setPerplexityDebug((p) => ({ ...p, [key]: json.debug }));
        setPerplexityResult((p) => ({
          ...p,
          [key]: { kind: "error", message: `Error${batch}: ${msg}` },
        }));
        return;
      }

      const citations = Array.isArray(json.perplexity_citations) ? json.perplexity_citations.map(String) : [];
      setPerplexityCitations((p) => ({ ...p, [key]: citations }));

      setPerplexityResult((p) => ({
        ...p,
        [key]: {
          kind: "ok",
          message: `Attached batch ${json.batch_id} (${json.accepted} rows). Master CSV rows: ${json.master_csv_row_count}`,
        },
      }));

      await loadRun(activeRunId);
      await refreshRuns();
    } finally {
      setPerplexityBusy((p) => ({ ...p, [key]: false }));
    }
  }

  async function runPerplexityAll() {
    if (!activeRunId) return;
    setNotice("");
    setQueueResult(null);
    setPerplexityRunAllSummary("");
    setPerplexityRunAllStartedAt(new Date().toISOString());

    // Mark all chunks busy up-front (single state updates to avoid races).
    const keys = chunks.map((c) => chunkKeyForRange(c));
    setPerplexityBusy((p) => Object.fromEntries([...Object.entries(p), ...keys.map((k) => [k, true])]));
    setPerplexityResult((p) =>
      Object.fromEntries([
        ...Object.entries(p),
        ...keys.map((k) => [k, { kind: "warn" as const, message: "Queued…" }]),
      ])
    );
    setPerplexityCitations((p) => Object.fromEntries([...Object.entries(p), ...keys.map((k) => [k, [] as string[]])]));
    setPerplexityDebug((p) => Object.fromEntries([...Object.entries(p), ...keys.map((k) => [k, null])]));

    try {
      setNotice(`Running Perplexity for ${chunks.length} chunk(s)…`);
      const payload = {
        sport,
        state,
        future_only: true,
        chunks: chunks.map((c) => {
          const key = chunkKeyForRange(c);
          const ctx = (perplexityContext[key] ?? "").trim();
          return { date_start: c.start, date_end: c.end, additional_context: ctx || undefined };
        }),
      };

      const res = await fetch(`/api/admin/ti/discovery-v2/runs/${activeRunId}/perplexity/run-all`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      let json: any = null;
      try {
        json = await res.json();
      } catch {
        setNotice(`Run all failed (HTTP ${res.status}).`);
        return;
      }

      const results: any[] = Array.isArray(json?.results) ? json.results : [];
      for (const r of results) {
        const key = chunkKeyForRange({ start: String(r.date_start), end: String(r.date_end) });
        if (!r.ok) {
          const batch = r.batch_id ? ` (batch ${r.batch_id})` : "";
          if (r.debug) setPerplexityDebug((p) => ({ ...p, [key]: r.debug }));
          setPerplexityResult((p) => ({ ...p, [key]: { kind: "error", message: `Error${batch}: ${String(r.error ?? "Perplexity failed")}` } }));
          continue;
        }

        const citations = Array.isArray(r.perplexity_citations) ? r.perplexity_citations.map(String) : [];
        setPerplexityCitations((p) => ({ ...p, [key]: citations }));
        setPerplexityResult((p) => ({
          ...p,
          [key]: {
            kind: "ok",
            message: `Attached batch ${r.batch_id} (${r.accepted} rows). Master CSV rows: ${r.master_csv_row_count}`,
          },
        }));
      }

      const anyError = results.some((r) => r && r.ok === false);
      const okCount = results.filter((r) => r && r.ok === true).length;
      const errCount = results.filter((r) => r && r.ok === false).length;
      setPerplexityRunAllSummary(`${okCount} succeeded, ${errCount} failed.`);
      setNotice(anyError ? "Run all finished with errors (see chunk status)." : "Run all complete.");
      await loadRun(activeRunId);
      await refreshRuns();
    } finally {
      const keys2 = chunks.map((c) => chunkKeyForRange(c));
      setPerplexityBusy((p) => Object.fromEntries([...Object.entries(p), ...keys2.map((k) => [k, false])]));
    }
  }

  async function refreshRuns() {
    const res = await fetch("/api/admin/ti/discovery-v2/runs");
    const json = (await res.json()) as any;
    if (json.ok) setRuns(json.runs ?? []);
  }

  async function loadRun(runId: string) {
    if (!runId) return;
    setLoadingRun(true);
    try {
      const res = await fetch(`/api/admin/ti/discovery-v2/runs/${runId}`);
      const json = (await res.json()) as any;
      if (!json.ok) {
        setNotice(json.error ?? "Failed to load run");
        return;
      }
      setActiveRun(json.run);
    } finally {
      setLoadingRun(false);
    }
  }

  async function createRun() {
    setNotice("");
    setQueueResult(null);
    const res = await fetch("/api/admin/ti/discovery-v2/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sport,
        state,
        date_range_start: dateStart,
        date_range_end: dateEnd,
        run_mode: "state_sport_window",
      }),
    });
    const json = (await res.json()) as any;
    if (!json.ok) {
      setNotice(json.error ?? "Failed to create run");
      return;
    }
    const id = String(json.run?.id ?? "");
    await refreshRuns();
    setActiveRunId(id);
    await loadRun(id);
    setNotice(`Created run ${id}`);
  }

  async function attachChunk() {
    if (!activeRunId) return;
    setNotice("");
    setQueueResult(null);
    setAttachBusy(true);
    try {
      const res = await fetch(`/api/admin/ti/discovery-v2/runs/${activeRunId}/paste/attach`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw_paste: chunkText }),
      });
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        setNotice(`Attach failed (HTTP ${res.status}).`);
        return;
      }
      if (!json.ok) {
        setNotice(json.error ?? "Attach failed");
        return;
      }
      const geoNote = json.geocoded > 0 ? ` ${json.geocoded} geocoded.` : "";
      setNotice(`Attached batch ${json.batch_id} (${json.accepted} rows).${geoNote} Master CSV rows: ${json.master_csv_row_count}`);
      setChunkText("");
      await loadRun(activeRunId);
      await refreshRuns();
    } finally {
      setAttachBusy(false);
    }
  }

  async function queueToUploads() {
    if (!activeRunId) return;
    setNotice("");
    setQueueBusy(true);
    try {
      const res = await fetch("/api/admin/ti/discovery-v2/queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv_run_id: activeRunId, dry_run: queueDryRun }),
      });
      const json = (await res.json()) as any;
      setQueueResult(json);
      if (!json.ok) {
        setNotice(json.error ?? "Queue failed");
        return;
      }
      setNotice(queueDryRun ? "Dry run complete." : "Queued to uploads. Open Tournament uploads to review.");
      await loadRun(activeRunId);
      await refreshRuns();
    } finally {
      setQueueBusy(false);
    }
  }

  useEffect(() => {
    refreshRuns();
  }, []);

  useEffect(() => {
    if (activeRunId) loadRun(activeRunId);
  }, [activeRunId]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16, alignItems: "start" }}>
      {/* Left column: runner + paste */}
      <div style={{ display: "grid", gap: 16 }}>
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fff" }}>
          <div style={{ fontWeight: 950, marginBottom: 8 }}>V2.5 Runner</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#6b7280" }}>Sport</span>
              <select value={sport} onChange={(e) => setSport(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                {TI_SPORTS.map((s) => (
                  <option key={s} value={s}>
                    {TI_SPORT_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#6b7280" }}>State(s)</span>
              <input
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase().replace(/\s+/g, ""))}
                placeholder="CA or RI,CT,NH"
                title="Single state code or comma-separated (e.g. RI,CT,NH)"
                style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#6b7280" }}>Mode</span>
              <select
                value={dateMode}
                onChange={(e) => {
                  const m = e.target.value as "month" | "quarter";
                  setDateMode(m);
                  setPeriod(m === "quarter" ? String(currentQuarter()) : String(new Date().getMonth() + 1));
                }}
                style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value="month">Month</option>
                <option value="quarter">Quarter</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#6b7280" }}>Year</span>
              <select value={year} onChange={(e) => setYear(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                {[new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#6b7280" }}>{dateMode === "month" ? "Month" : "Quarter"}</span>
              <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                {dateMode === "month"
                  ? MONTHS_SHORT.map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)
                  : ["Q1 Jan–Mar", "Q2 Apr–Jun", "Q3 Jul–Sep", "Q4 Oct–Dec"].map((q, i) => (
                      <option key={i + 1} value={String(i + 1)}>{q}</option>
                    ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#6b7280" }}>Runs</span>
              <select
                value={activeRunId}
                onChange={(e) => setActiveRunId(e.target.value)}
                title={activeRunId ? runs.find((r) => r.id === activeRunId)?.id : undefined}
                style={{
                  padding: 8,
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  width: "100%",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <option value="">Select…</option>
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.state} {r.sport} {r.date_range_start}→{r.date_range_end} ({r.status}, {r.master_csv_row_count})
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: "grid", gap: 4, alignItems: "end", minWidth: 140 }}>
              <button className="cta secondary" style={{ padding: "8px 12px" }} disabled={!canCreate} onClick={createRun}>
                Create run
              </button>
            </div>
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {(() => {
                const runAllDisabled = !activeRunId || chunks.length === 0 || Object.values(perplexityBusy).some(Boolean);
                const runAllBusy = Object.values(perplexityBusy).some(Boolean);
                const label = runAllBusy ? "Running all chunks…" : "Run all chunks (Perplexity)";
                return (
              <button
                className={runAllDisabled ? "cta secondary" : "cta"}
                style={{ padding: "8px 12px" }}
                disabled={runAllDisabled}
                onClick={runPerplexityAll}
              >
                {label}
              </button>
                );
              })()}
              <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
                Runs chunks sequentially (billable). Stops on first failure.
              </span>
            </div>
            {Object.values(perplexityBusy).some(Boolean) ? (
              <div style={{ fontSize: 12, color: "#111827", fontWeight: 900 }}>
                Status: running… {perplexityRunAllSummary ? `(${perplexityRunAllSummary})` : ""}
              </div>
            ) : perplexityRunAllSummary ? (
              <div style={{ fontSize: 12, color: "#111827", fontWeight: 900 }}>Last run: {perplexityRunAllSummary}</div>
            ) : null}
            {prompts.map((p, idx) => {
              const chunk = chunks[idx];
              const key = chunk ? chunkKeyForRange(chunk) : String(idx);
              const busy = Boolean(perplexityBusy[key]);
              const ctx = perplexityContext[key] ?? "";
              const result = perplexityResult[key];
              const citations = perplexityCitations[key] ?? [];
              const debug = perplexityDebug[key];
              const chunkStatus =
                busy ? "running" : result?.kind === "ok" ? "ok" : result?.kind === "error" ? "error" : result?.message ? "queued" : "";
              const chunkStatusLabel =
                chunkStatus === "running"
                  ? "running…"
                  : chunkStatus === "ok"
                  ? "ok"
                  : chunkStatus === "error"
                  ? "error"
                  : chunkStatus === "queued"
                  ? "queued"
                  : "";

              return (
                <details key={key} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 900 }}>
                    {chunkMonthLabel(chunk?.start ?? "")} — Chunk {idx + 1}
                    {chunkStatusLabel ? <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280" }}>({chunkStatusLabel})</span> : null}
                  </summary>
                <textarea
                  readOnly
                  value={p}
                  style={{
                    width: "100%",
                    minHeight: 160,
                    marginTop: 8,
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 10,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 12,
                  }}
                />
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      className="cta secondary"
                      style={{ padding: "8px 12px" }}
                      disabled={!activeRunId || busy || !chunk}
                      onClick={() => chunk && runPerplexity(chunk)}
                    >
                      {busy ? "Running Perplexity…" : "Run with Perplexity"}
                    </button>
                    <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
                      Billable Perplexity request. Geocoding is OFF by default to protect Mapbox free tier.
                    </span>
                  </div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 900, color: "#6b7280" }}>Additional context (optional)</span>
                    <textarea
                      value={ctx}
                      onChange={(e) => {
                        const next = e.target.value.slice(0, 300);
                        setPerplexityContext((p) => ({ ...p, [key]: next }));
                      }}
                      placeholder='e.g. "USYSA only" / "Showcases and invitationals only"'
                      rows={2}
                      maxLength={300}
                      style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, fontSize: 12 }}
                    />
                    <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800, textAlign: "right" }}>
                      {ctx.length} / 300
                    </div>
                  </label>

                  {result?.message ? (
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        background: result.kind === "error" ? "#fef2f2" : result.kind === "warn" ? "#fffbeb" : "#f0fdf4",
                        border: `1px solid ${result.kind === "error" ? "#fca5a5" : result.kind === "warn" ? "#fcd34d" : "#86efac"}`,
                        fontSize: 13,
                        color: "#111",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {result.message}
                    </div>
                  ) : null}

                  {debug ? (
                    <details style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 900 }}>Details</summary>
                      <pre style={{ margin: "8px 0 0", fontSize: 11, whiteSpace: "pre-wrap" }}>
                        {JSON.stringify(debug, null, 2)}
                      </pre>
                    </details>
                  ) : null}

                  {citations.length ? (
                    <details style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 900 }}>Sources</summary>
                      <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12 }}>
                        {citations.map((c) => (
                          <li key={c}>
                            <a href={c} target="_blank" rel="noreferrer noopener">
                              {c}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              </details>
              );
            })}
          </div>
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fff" }}>
          <div style={{ fontWeight: 950, marginBottom: 8 }}>Paste Chunk CSV</div>
          <textarea
            value={chunkText}
            onChange={(e) => setChunkText(e.target.value)}
            placeholder="Paste one chunk CSV here (must include the header row)…"
            style={{
              width: "100%",
              minHeight: 260,
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 10,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12,
            }}
          />
          <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="cta secondary" style={{ padding: "8px 12px" }} disabled={!activeRunId || attachBusy} onClick={attachChunk}>
              {attachBusy ? "Attaching…" : "Validate + attach"}
            </button>
            {loadingRun ? <span style={{ fontSize: 12, color: "#6b7280" }}>Loading run…</span> : null}
          </div>
          {notice ? (
            <div
              style={{
                marginTop: 10,
                padding: "10px 14px",
                borderRadius: 10,
                background: notice.toLowerCase().includes("error") || notice.toLowerCase().includes("fail") || notice.toLowerCase().includes("no valid") ? "#fef2f2" : "#f0fdf4",
                border: `1px solid ${notice.toLowerCase().includes("error") || notice.toLowerCase().includes("fail") || notice.toLowerCase().includes("no valid") ? "#fca5a5" : "#86efac"}`,
                fontSize: 13,
                color: "#111",
                whiteSpace: "pre-wrap",
              }}
            >
              {notice}
            </div>
          ) : null}
        </section>
      </div>

      {/* Right column: Master CSV — sticky */}
      <div style={{ position: "sticky", top: 16 }}>
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fff" }}>
          <div style={{ fontWeight: 950, marginBottom: 8 }}>Master CSV</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 900, fontSize: 12, color: "#374151" }}>
              <input type="checkbox" checked={queueDryRun} onChange={(e) => setQueueDryRun(e.target.checked)} />
              Dry run
            </label>
            <button className="cta secondary" style={{ padding: "8px 12px" }} disabled={!activeRunId || queueBusy} onClick={queueToUploads}>
              {queueBusy ? "Queuing…" : "Queue to uploads"}
            </button>
            <a href="/admin?tab=tournament-uploads" className="cta secondary" style={{ padding: "8px 12px", textDecoration: "none" }}>
              Open uploads →
            </a>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900, marginBottom: 6 }}>
              Rows: {activeRun?.master_csv_row_count ?? 0} • Geocoded: {geocodedRowCount(activeRun?.master_csv ?? "")} • Status: {activeRun?.status ?? "—"}
            </div>
          <pre style={{ whiteSpace: "pre-wrap", maxHeight: 400, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, fontSize: 11 }}>
              {String(activeRun?.master_csv ?? "").split("\n").slice(0, 60).join("\n")}
              {String(activeRun?.master_csv ?? "").split("\n").length > 60 ? "\n…(truncated)" : ""}
            </pre>
          </div>

          {queueResult ? (
            <pre style={{ marginTop: 10, whiteSpace: "pre-wrap", border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, fontSize: 12 }}>
              {JSON.stringify(queueResult, null, 2)}
            </pre>
          ) : null}
        </section>
      </div>
    </div>
  );
}
