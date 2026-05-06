"use client";

import { useEffect, useMemo, useState } from "react";

import { TI_SPORT_LABELS, TI_SPORTS } from "@/lib/tiSports";

function isoToUtcDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t) : null;
}

function toIsoUtc(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number) {
  const d = isoToUtcDate(iso);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoUtc(d);
}

function diffDaysInclusive(startIso: string, endIso: string) {
  const a = isoToUtcDate(startIso);
  const b = isoToUtcDate(endIso);
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function splitRange(startIso: string, endIso: string, parts: number) {
  const days = diffDaysInclusive(startIso, endIso);
  if (days === null) return [];
  const size = Math.max(1, Math.ceil((days + 1) / parts));
  const ranges: Array<{ start: string; end: string }> = [];
  let curStart = startIso;
  while (curStart <= endIso) {
    const curEnd = addDaysIso(curStart, size - 1) ?? curStart;
    ranges.push({ start: curStart, end: curEnd <= endIso ? curEnd : endIso });
    const nextStart = addDaysIso(curEnd <= endIso ? curEnd : endIso, 1);
    if (!nextStart) break;
    curStart = nextStart;
    if (ranges.length > 12) break;
  }
  return ranges;
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
    "- Every row MUST include venue_name, venue_city, venue_state (no placeholders).",
    "- venue_address MUST be the full street address (number + street name, e.g. \"123 Main St\") — do not use a city name or vague description.",
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

export default function DiscoveryV2Client() {
  const [sport, setSport] = useState<string>("soccer");
  const [state, setState] = useState<string>("CA");
  const [dateStart, setDateStart] = useState<string>("");
  const [dateEnd, setDateEnd] = useState<string>("");
  const [notice, setNotice] = useState<string>("");

  const [runs, setRuns] = useState<RunRow[]>([]);
  const [activeRunId, setActiveRunId] = useState<string>("");
  const [activeRun, setActiveRun] = useState<any | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);

  const [chunkText, setChunkText] = useState<string>("");
  const [attachBusy, setAttachBusy] = useState(false);

  const [queueDryRun, setQueueDryRun] = useState(true);
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueResult, setQueueResult] = useState<any | null>(null);

  const canCreate = Boolean(sport && state && dateStart && dateEnd);

  const chunks = useMemo(() => {
    if (!dateStart || !dateEnd) return [];
    const days = diffDaysInclusive(dateStart, dateEnd);
    const parts = days !== null && days > 120 ? 4 : 2;
    return splitRange(dateStart, dateEnd, parts);
  }, [dateStart, dateEnd]);

  const prompts = useMemo(
    () => chunks.map((c) => buildPrompt({ sport, state, start: c.start, end: c.end })),
    [chunks, sport, state]
  );

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
    <div style={{ display: "grid", gap: 16 }}>
      {notice ? (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "#fff" }}>{notice}</div>
      ) : null}

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fff" }}>
        <div style={{ fontWeight: 950, marginBottom: 8 }}>V2.5 Runner</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10 }}>
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
            <span style={{ fontSize: 12, fontWeight: 900, color: "#6b7280" }}>State</span>
            <input value={state} onChange={(e) => setState(e.target.value.toUpperCase())} placeholder="CA" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }} />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: "#6b7280" }}>From</span>
            <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: "#6b7280" }}>To</span>
            <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }} />
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
          {prompts.map((p, idx) => (
            <details key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
              <summary style={{ cursor: "pointer", fontWeight: 900 }}>Chunk {idx + 1} prompt</summary>
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
            </details>
          ))}
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
            minHeight: 180,
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
      </section>

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
            Open Tournament uploads →
          </a>
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900, marginBottom: 6 }}>
            Rows: {activeRun?.master_csv_row_count ?? 0} • Geocoded: {geocodedRowCount(activeRun?.master_csv ?? "")} • Status: {activeRun?.status ?? "—"}
          </div>
          <pre style={{ whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, fontSize: 12 }}>
            {String(activeRun?.master_csv ?? "").split("\n").slice(0, 40).join("\n")}
            {String(activeRun?.master_csv ?? "").split("\n").length > 40 ? "\n…(truncated)" : ""}
          </pre>
        </div>

        {queueResult ? (
          <pre style={{ marginTop: 10, whiteSpace: "pre-wrap", border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, fontSize: 12 }}>
            {JSON.stringify(queueResult, null, 2)}
          </pre>
        ) : null}
      </section>
    </div>
  );
}
