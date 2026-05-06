"use client";

import { useMemo, useState } from "react";

import { TI_SPORT_LABELS, TI_SPORTS } from "@/lib/tiSports";

import DiscoveryV2Client from "./DiscoveryV2Client";

type CandidateRow = {
  id: string;
  created_at: string | null;
  discovery_batch_id: string;
  name: string;
  sport: string;
  start_date: string;
  end_date: string;
  city: string;
  state: string;
  venue_raw: string | null;
  organizer: string | null;
  official_website_url: string | null;
  source_url: string;
  source_domain: string | null;
  confidence_label: string;
  dedupe_status: string;
  import_status: string;
  imported_tournament_id: string | null;
  review_notes: string | null;
};

function asText(v: unknown) {
  return typeof v === "string" ? v : "";
}

export default function DiscoveryWorkbenchClient() {
  const [mode, setMode] = useState<"v2" | "v1">("v2");
  const [sport, setSport] = useState<string>("soccer");
  const [state, setState] = useState<string>("CA");
  const [dateStart, setDateStart] = useState<string>("");
  const [dateEnd, setDateEnd] = useState<string>("");
  const [metro, setMetro] = useState<string>("");
  const [organizer, setOrganizer] = useState<string>("");

  const [generatedPrompt, setGeneratedPrompt] = useState<string>("");
  const [searchKey, setSearchKey] = useState<string>("");
  const [notice, setNotice] = useState<string>("");

  const [rawPaste, setRawPaste] = useState<string>("");
  const [validatePreview, setValidatePreview] = useState<any[] | null>(null);
  const [validateErrors, setValidateErrors] = useState<Array<{ index: number; error: string }> | null>(null);
  const [savedBatchId, setSavedBatchId] = useState<string | null>(null);

  const [filterImport, setFilterImport] = useState<string>("queued");
  const [filterConfidence, setFilterConfidence] = useState<string>("all");
  const [filterDedupe, setFilterDedupe] = useState<string>("all");

  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const canGenerate = Boolean(sport && state && dateStart && dateEnd);

  async function generatePrompt() {
    setNotice("");
    setGeneratedPrompt("");
    setSearchKey("");
    const res = await fetch("/api/admin/ti/discovery/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sport,
        state,
        date_range_start: dateStart,
        date_range_end: dateEnd,
        search_type: metro ? "metro" : organizer ? "organizer" : "long_tail",
        metro: metro || null,
        organizer: organizer || null,
      }),
    });
    const json = (await res.json()) as any;
    if (!json?.ok) {
      setNotice(String(json?.error ?? "Failed to generate prompt"));
      return;
    }
    setGeneratedPrompt(json.generated_prompt);
    setSearchKey(json.search_key);
  }

  async function validatePaste() {
    setNotice("");
    setValidateErrors(null);
    setValidatePreview(null);
    const res = await fetch("/api/admin/ti/discovery/intake/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raw_paste: rawPaste }),
    });
    const json = (await res.json()) as any;
    if (!json.ok && json.error) {
      setNotice(json.error);
      return;
    }
    setValidateErrors(json.errors ?? null);
    setValidatePreview(json.preview ?? null);
    if (Array.isArray(json.errors) && json.errors.length) {
      setNotice(`Validation errors: ${json.errors.length}`);
    } else {
      setNotice(`Valid rows: ${json.rows_valid ?? 0}/${json.rows_total ?? 0}`);
    }
  }

  async function saveBatch() {
    setNotice("");
    setSavedBatchId(null);
    const res = await fetch("/api/admin/ti/discovery/intake/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        raw_paste: rawPaste,
        generated_prompt: generatedPrompt || null,
        provider: "chatgpt",
      }),
    });
    const json = (await res.json()) as any;
    if (!json.ok) {
      setNotice(json.error ?? "Save failed");
      return;
    }
    setSavedBatchId(json.batch_id);
    setNotice(`Saved batch ${json.batch_id} (${json.saved} candidates)`);
    await loadCandidates(json.batch_id);
  }

  async function loadCandidates(batchId?: string | null) {
    setLoadingCandidates(true);
    try {
      const params = new URLSearchParams();
      params.set("import_status", filterImport);
      params.set("confidence", filterConfidence);
      params.set("dedupe_status", filterDedupe);
      params.set("limit", "250");
      if (batchId) params.set("batch_id", batchId);
      const res = await fetch(`/api/admin/ti/discovery/candidates?${params.toString()}`);
      const json = (await res.json()) as any;
      if (!json.ok) {
        setNotice(json.error ?? "Failed to load candidates");
        return;
      }
      setCandidates((json.rows ?? []) as CandidateRow[]);
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function rejectCandidate(id: string) {
    setNotice("");
    const res = await fetch("/api/admin/ti/discovery/candidates", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, import_status: "rejected" }),
    });
    const json = (await res.json()) as any;
    if (!json.ok) {
      setNotice(json.error ?? "Reject failed");
      return;
    }
    await loadCandidates(savedBatchId);
  }

  async function importCandidate(id: string) {
    setNotice("");
    const res = await fetch("/api/admin/ti/discovery/candidates/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ candidate_id: id }),
    });
    const json = (await res.json()) as any;
    if (!json.ok) {
      setNotice(json.error ?? "Import failed");
      return;
    }
    setNotice(`Imported tournament ${json.imported_slug ?? json.imported_tournament_id}`);
    await loadCandidates(savedBatchId);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          className={mode === "v2" ? "cta primary" : "cta secondary"}
          style={{ padding: "8px 12px" }}
          onClick={() => setMode("v2")}
        >
          V2.5 CSV Runner
        </button>
        <button
          className={mode === "v1" ? "cta primary" : "cta secondary"}
          style={{ padding: "8px 12px" }}
          onClick={() => setMode("v1")}
        >
          V1 JSON Intake
        </button>
      </div>

      {mode === "v2" ? <DiscoveryV2Client /> : null}

      {mode === "v1" ? (
        <>
      {notice ? (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "#fff" }}>{notice}</div>
      ) : null}

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fff" }}>
        <div style={{ fontWeight: 950, marginBottom: 8 }}>Search Builder</div>
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

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: "#6b7280" }}>Metro (optional)</span>
            <input value={metro} onChange={(e) => setMetro(e.target.value)} placeholder="Greensboro" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: "#6b7280" }}>Organizer (optional)</span>
            <input value={organizer} onChange={(e) => setOrganizer(e.target.value)} placeholder="Big Time Hoops" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }} />
          </label>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button className="cta secondary" style={{ padding: "8px 12px" }} disabled={!canGenerate} onClick={generatePrompt}>
            Generate prompt
          </button>
          {searchKey ? <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 900 }}>search_key: {searchKey}</span> : null}
        </div>

        <div style={{ marginTop: 10 }}>
          <textarea
            value={generatedPrompt}
            onChange={(e) => setGeneratedPrompt(e.target.value)}
            placeholder="Generated prompt will appear here…"
            style={{ width: "100%", minHeight: 160, border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}
          />
        </div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fff" }}>
        <div style={{ fontWeight: 950, marginBottom: 8 }}>Results Intake</div>
        <textarea
          value={rawPaste}
          onChange={(e) => setRawPaste(e.target.value)}
          placeholder='Paste ChatGPT JSON array here (no markdown).'
          style={{ width: "100%", minHeight: 180, border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}
        />
        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="cta secondary" style={{ padding: "8px 12px" }} onClick={validatePaste}>
            Validate (dry-run)
          </button>
          <button className="cta secondary" style={{ padding: "8px 12px" }} onClick={saveBatch}>
            Save batch
          </button>
          {savedBatchId ? <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 900 }}>batch: {savedBatchId}</span> : null}
        </div>
        {validateErrors && validateErrors.length ? (
          <div style={{ marginTop: 10, border: "1px solid #fee2e2", background: "#fff1f2", borderRadius: 12, padding: 10 }}>
            <div style={{ fontWeight: 950, color: "#991b1b" }}>Validation errors</div>
            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
              {validateErrors.slice(0, 20).map((e, idx) => (
                <li key={idx} style={{ fontSize: 12, color: "#991b1b", fontWeight: 800 }}>
                  Row {e.index + 1}: {e.error}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {validatePreview && validatePreview.length ? (
          <div style={{ marginTop: 10, borderTop: "1px solid #f3f4f6", paddingTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#6b7280", textTransform: "uppercase" }}>Preview (first 50)</div>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 8, color: "#111827" }}>
              {JSON.stringify(validatePreview, null, 2)}
            </pre>
          </div>
        ) : null}
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 950 }}>Candidate Queue</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select value={filterImport} onChange={(e) => setFilterImport(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
              <option value="queued">queued</option>
              <option value="imported">imported</option>
              <option value="rejected">rejected</option>
              <option value="all">all</option>
            </select>
            <select value={filterConfidence} onChange={(e) => setFilterConfidence(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
              <option value="all">confidence: all</option>
              <option value="high">high</option>
              <option value="medium">medium</option>
              <option value="low">low</option>
            </select>
            <select value={filterDedupe} onChange={(e) => setFilterDedupe(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
              <option value="all">dedupe: all</option>
              <option value="exact">exact</option>
              <option value="likely">likely</option>
              <option value="possible">possible</option>
              <option value="none">none</option>
              <option value="unreviewed">unreviewed</option>
            </select>
            <button className="cta secondary" style={{ padding: "8px 12px" }} onClick={() => loadCandidates(savedBatchId)}>
              {loadingCandidates ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 6px", fontSize: 12, color: "#6b7280" }}>Name</th>
                <th style={{ textAlign: "left", padding: "8px 6px", fontSize: 12, color: "#6b7280" }}>When</th>
                <th style={{ textAlign: "left", padding: "8px 6px", fontSize: 12, color: "#6b7280" }}>Where</th>
                <th style={{ textAlign: "left", padding: "8px 6px", fontSize: 12, color: "#6b7280" }}>Confidence</th>
                <th style={{ textAlign: "left", padding: "8px 6px", fontSize: 12, color: "#6b7280" }}>Dedupe</th>
                <th style={{ textAlign: "left", padding: "8px 6px", fontSize: 12, color: "#6b7280" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "8px 6px", minWidth: 340 }}>
                    <div style={{ fontWeight: 950 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
                      {c.sport} • {c.source_domain ?? "—"}
                    </div>
                    <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="cta secondary" style={{ padding: "6px 10px" }}>
                        Source ↗
                      </a>
                      {c.official_website_url ? (
                        <a href={c.official_website_url} target="_blank" rel="noopener noreferrer" className="cta secondary" style={{ padding: "6px 10px" }}>
                          Official ↗
                        </a>
                      ) : null}
                    </div>
                  </td>
                  <td style={{ padding: "8px 6px", fontSize: 12, fontWeight: 900, color: "#111827", minWidth: 150 }}>
                    <div>{c.start_date}</div>
                    <div style={{ color: "#6b7280" }}>→ {c.end_date}</div>
                  </td>
                  <td style={{ padding: "8px 6px", fontSize: 12, fontWeight: 900, color: "#111827", minWidth: 180 }}>
                    {c.city}, {c.state}
                    {c.venue_raw ? <div style={{ marginTop: 4, color: "#6b7280", fontWeight: 800 }}>{c.venue_raw}</div> : null}
                  </td>
                  <td style={{ padding: "8px 6px", fontSize: 12, fontWeight: 950 }}>{c.confidence_label}</td>
                  <td style={{ padding: "8px 6px", fontSize: 12, fontWeight: 950 }}>{c.dedupe_status}</td>
                  <td style={{ padding: "8px 6px", minWidth: 220 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {c.import_status !== "imported" ? (
                        <button className="cta secondary" style={{ padding: "6px 10px" }} onClick={() => importCandidate(c.id)}>
                          Import
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: "#065f46", fontWeight: 950 }}>Imported</span>
                      )}
                      {c.import_status !== "rejected" ? (
                        <button className="cta secondary" style={{ padding: "6px 10px" }} onClick={() => rejectCandidate(c.id)}>
                          Reject
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 900 }}>Rejected</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {candidates.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "12px 6px", color: "#6b7280", fontWeight: 900 }}>
                    No candidates loaded.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
        </>
      ) : null}
    </div>
  );
}
