"use client";

import React from "react";
import Link from "next/link";

type Tournament = { id: string; name: string | null; url: string | null; state: string | null };
type MissingUrlTournament = {
  id: string;
  name: string | null;
  slug?: string | null;
  state: string | null;
  city: string | null;
  sport: string | null;
  level: string | null;
  source_url?: string | null;
  start_date?: string | null;
};
type Job = {
  id: string;
  tournament_id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  pages_fetched_count: number | null;
  last_error: string | null;
  tournament_name?: string | null;
  tournament_url?: string | null;
};
type ContactCandidate = {
  id: string;
  tournament_id: string;
  email: string | null;
  phone: string | null;
  role_normalized: string | null;
  source_url: string | null;
  confidence: number | null;
  created_at: string | null;
};
type VenueCandidate = {
  id: string;
  tournament_id: string;
  venue_name: string | null;
  address_text: string | null;
  source_url: string | null;
  confidence: number | null;
  created_at: string | null;
};
type CompCandidate = {
  id: string;
  tournament_id: string;
  rate_text: string | null;
  travel_housing_text: string | null;
  source_url: string | null;
  confidence: number | null;
  created_at: string | null;
};
type UrlSuggestion = {
  id: string;
  tournament_id: string;
  suggested_url: string;
  suggested_domain: string | null;
  submitter_email: string | null;
  status: string;
  created_at: string;
  tournament_name?: string | null;
  tournament_state?: string | null;
};

type UrlSearchResult = {
  tournament_id: string;
  applied_url?: string | null;
  auto_apply_threshold?: number;
  error?: string;
  candidates: Array<{
    url: string;
    score: number;
    title: string | null;
    snippet: string | null;
    final_url: string | null;
    content_type: string | null;
  }>;
};

function formatDate(val: string | null) {
  if (!val) return "";
  return new Date(val).toLocaleString();
}

export default function EnrichmentClient({
  tournaments,
  missingUrls,
  jobs,
  contacts,
  venues,
  comps,
  urlSuggestions,
}: {
  tournaments: Tournament[];
  missingUrls: MissingUrlTournament[];
  jobs: Job[];
  contacts: ContactCandidate[];
  venues: VenueCandidate[];
  comps: CompCandidate[];
  urlSuggestions: UrlSuggestion[];
}) {
  const [selected, setSelected] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<string>("");
  const [query, setQuery] = React.useState<string>("");
  const [results, setResults] = React.useState<Tournament[]>(tournaments);
  const [searching, setSearching] = React.useState<boolean>(false);
  const [pendingContacts, setPendingContacts] = React.useState<ContactCandidate[]>(contacts);
  const [pendingVenues, setPendingVenues] = React.useState<VenueCandidate[]>(venues);
  const [pendingComps, setPendingComps] = React.useState<CompCandidate[]>(comps);
  const [pendingUrlSuggestions, setPendingUrlSuggestions] = React.useState<UrlSuggestion[]>(urlSuggestions);
  const [missingSelected, setMissingSelected] = React.useState<string[]>([]);
  const [urlSearchStatus, setUrlSearchStatus] = React.useState<string>("");
  const [urlResults, setUrlResults] = React.useState<Record<string, UrlSearchResult>>({});
  const [manualUrls, setManualUrls] = React.useState<Record<string, string>>({});

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleMissing = (id: string) => {
    setMissingSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const queue = async (ids?: string[]) => {
    const toQueue = ids ?? selected;
    if (!toQueue.length) return;
    setStatus("Queuing...");
    const res = await fetch("/api/admin/tournaments/enrichment/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournament_ids: toQueue }),
    });
    const json = await res.json();
    setStatus(json.error ? `Queue failed: ${json.error}` : "Queued");
  };

  const skipTournament = async (tournamentId: string) => {
    setStatus("Skipping...");
    const res = await fetch("/api/admin/tournaments/enrichment/skip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournament_id: tournamentId }),
    });
    const json = await res.json();
    setStatus(json.error ? `Skip failed: ${json.error}` : "Skipped");
  };

  const runNow = async () => {
    setStatus("Running...");
    const res = await fetch("/api/admin/tournaments/enrichment/run", { method: "POST" });
    const json = await res.json();
    setStatus(json.error ? `Run failed: ${json.error}` : "Run triggered");
  };

  const refreshPage = () => {
    window.location.reload();
  };

  const searchUrls = async () => {
    if (!missingSelected.length) return;
    setUrlSearchStatus("Searching...");
    const res = await fetch("/api/admin/tournaments/enrichment/url-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournament_ids: missingSelected }),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      setUrlSearchStatus(`Search failed: ${json.error || res.statusText}`);
      return;
    }
    const next: Record<string, UrlSearchResult> = { ...urlResults };
    (json.results ?? []).forEach((row: UrlSearchResult) => {
      next[row.tournament_id] = row;
    });
    setUrlResults(next);
    setUrlSearchStatus("Search complete");
  };

  const applyCandidate = async (tournamentId: string, candidateUrl: string, opts?: { refresh?: boolean }) => {
    setUrlSearchStatus("Applying URL...");
    const res = await fetch("/api/admin/tournaments/enrichment/url-apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournament_id: tournamentId, candidate_url: candidateUrl }),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      setUrlSearchStatus(`Apply failed: ${json.error || res.statusText}`);
      return;
    }
    setUrlSearchStatus("Applied");
    if (opts?.refresh !== false) refreshPage();
  };

  const reviewUrlSuggestion = async (suggestionId: string, action: "approve" | "reject") => {
    setUrlSearchStatus(`${action}ing...`);
    const res = await fetch(`/api/admin/tournaments/enrichment/url-suggestions/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestion_id: suggestionId }),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      setUrlSearchStatus(`Update failed: ${json.error || res.statusText}`);
      return;
    }
    setPendingUrlSuggestions((prev) => prev.filter((row) => row.id !== suggestionId));
    setUrlSearchStatus(action === "approve" ? "Approved" : "Rejected");
  };

  const skip = async (tournamentId: string) => {
    setStatus("Skipping...");
    const res = await fetch("/api/admin/tournaments/enrichment/skip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournament_id: tournamentId }),
    });
    const json = await res.json();
    setStatus(json.error ? `Skip failed: ${json.error}` : "Skipped");
  };

  const search = async () => {
    if (query.trim().length < 2) {
      setResults(tournaments);
      setSelected([]);
      return;
    }
    setSearching(true);
    const res = await fetch(`/api/admin/tournaments/enrichment/search?q=${encodeURIComponent(query.trim())}`);
    const json = await res.json();
    if (json?.results) {
      setResults(json.results as Tournament[]);
      setSelected([]);
    }
    setSearching(false);
  };

  const act = async (
    type: "contact" | "venue" | "comp",
    id: string,
    action: "accept" | "reject" | "delete"
  ) => {
    const res = await fetch("/api/admin/tournaments/enrichment/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id, action }),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      setStatus(`Action failed: ${json.error || res.statusText}`);
      return;
    }
    setStatus(`${action}d`);
    if (type === "contact") setPendingContacts((prev) => prev.filter((c) => c.id !== id));
    if (type === "venue") setPendingVenues((prev) => prev.filter((v) => v.id !== id));
    if (type === "comp") setPendingComps((prev) => prev.filter((c) => c.id !== id));
  };

  const applySourceUrlsForSelected = async () => {
    const selected = missingUrls.filter((t) => missingSelected.includes(t.id) && t.source_url);
    if (!selected.length) {
      setUrlSearchStatus("No selected tournaments with source URLs.");
      return;
    }
    setUrlSearchStatus(`Applying source URLs for ${selected.length} tournament(s)...`);
    const res = await fetch("/api/admin/tournaments/enrichment/url-apply-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: selected.map((t) => ({ tournament_id: t.id, candidate_url: t.source_url })),
      }),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      setUrlSearchStatus(`Apply failed: ${json.error || res.statusText}`);
      return;
    }
    setUrlSearchStatus(`Applied ${json.applied ?? 0}/${json.total ?? selected.length}. Refreshing...`);
    refreshPage();
  };

  return (
    <main style={{ padding: "1rem", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 12 }}>Tournament Enrichment</h1>
      <p style={{ color: "#4b5563", marginBottom: 16 }}>
        Queue enrichment jobs for tournaments with URLs. Jobs fetch up to 8 pages per tournament and extract contacts, venues, and referee comp signals.
      </p>
      <div style={{ marginBottom: 12 }}>
        <a
          href="/admin"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #111",
            background: "#fff",
            color: "#111",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Back to Admin
        </a>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
        <button onClick={() => queue()} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #0f3d2e", background: "#0f3d2e", color: "#fff" }}>
          Queue Enrichment
        </button>
        <button onClick={runNow} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #0f3d2e", background: "#fff", color: "#0f3d2e" }}>
          Run Now (limit 10)
        </button>
        <button onClick={refreshPage} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #9ca3af", background: "#f9fafb", color: "#111827" }}>
          Refresh
        </button>
        <span style={{ color: "#555" }}>{status}</span>
      </div>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Find official websites (missing official URL)</h2>
        <p style={{ color: "#4b5563", marginTop: 0 }}>
          Search for official tournament or club URLs using Brave/Atlas. URLs with confidence ≥ 0.85 will be auto-applied to official website.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button
            onClick={searchUrls}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #0f3d2e", background: "#0f3d2e", color: "#fff" }}
          >
            Search URLs
          </button>
          <button
            onClick={applySourceUrlsForSelected}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #111", background: "#fff", color: "#111" }}
          >
            Use source URL as official (selected)
          </button>
          <span style={{ color: "#555" }}>{urlSearchStatus}</span>
        </div>
        <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid #f1f1f1", borderRadius: 8 }}>
          {missingUrls.length === 0 ? (
            <div style={{ padding: 10, color: "#6b7280" }}>No tournaments missing URLs.</div>
          ) : (
            missingUrls.map((t) => (
              <label key={t.id} style={{ display: "flex", gap: 8, padding: "6px 8px", alignItems: "center", borderBottom: "1px solid #f1f1f1" }}>
                <input type="checkbox" checked={missingSelected.includes(t.id)} onChange={() => toggleMissing(t.id)} />
                <div>
                  <div style={{ fontWeight: 600 }}>{t.name ?? "Untitled"}</div>
                  <div style={{ color: "#4b5563", fontSize: 12 }}>
                    {t.city ?? "—"}, {t.state ?? "—"} {t.sport ? `• ${t.sport}` : ""} {t.level ? `• ${t.level}` : ""}
                    {t.start_date ? ` • ${new Date(t.start_date).toLocaleDateString()}` : ""}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    {t.slug ? (
                      <a
                        href={`/admin?tab=tournament-listings&q=${encodeURIComponent(t.slug)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#0f172a", textDecoration: "underline", fontSize: 12 }}
                      >
                        Open listing
                      </a>
                    ) : (
                      <a
                        href={`/admin?tab=tournament-listings&q=${encodeURIComponent(t.name ?? "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#0f172a", textDecoration: "underline", fontSize: 12 }}
                      >
                        Open listing
                      </a>
                    )}
                    {t.slug ? (
                      <a
                        href={`/tournaments/${t.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#4b5563", textDecoration: "underline", fontSize: 12 }}
                      >
                        View public page
                      </a>
                    ) : null}
                  </div>
                  {t.source_url ? (
                    <div style={{ color: "#6b7280", fontSize: 12, display: "grid", gap: 6 }}>
                      <div style={{ wordBreak: "break-all" }}>{t.source_url}</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <a href={t.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "#0f172a", textDecoration: "underline" }}>
                          Open source URL
                        </a>
                        <span style={{ color: "#9ca3af" }}>|</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            applyCandidate(t.id, t.source_url!);
                          }}
                          style={{ padding: "2px 8px", borderRadius: 6, border: "1px solid #111", background: "#fff", color: "#111", fontSize: 12 }}
                        >
                          Use as official
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                    <input
                      type="url"
                      placeholder="Paste official website"
                      value={manualUrls[t.id] ?? ""}
                      onChange={(e) => setManualUrls((prev) => ({ ...prev, [t.id]: e.target.value }))}
                      style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #ccc", minWidth: 240 }}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        const val = (manualUrls[t.id] || "").trim();
                        if (!val) return;
                        applyCandidate(t.id, val);
                      }}
                      style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #0f172a", background: "#0f172a", color: "#fff", fontSize: 12 }}
                    >
                      Save official URL
                    </button>
                  </div>
                </div>
              </label>
            ))
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          {Object.values(urlResults).map((row) => {
            const candidates = row.candidates ?? [];
            if (!candidates.length && !row.applied_url && !row.error) return null;
            const tournament = missingUrls.find((t) => t.id === row.tournament_id);
            return (
              <div key={row.tournament_id} style={{ marginTop: 10, borderTop: "1px solid #eee", paddingTop: 8 }}>
                <div style={{ fontWeight: 700 }}>{tournament?.name ?? row.tournament_id}</div>
                {row.error && <div style={{ color: "#b00020" }}>Search failed: {row.error}</div>}
                {row.applied_url && (
                  <div style={{ color: "#0f3d2e", fontWeight: 600 }}>Auto-applied (official): {row.applied_url}</div>
                )}
                {candidates.map((c) => (
                  <div key={c.url} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>
                        <a href={c.final_url ?? c.url} target="_blank" rel="noopener noreferrer" style={{ color: "#0f172a", textDecoration: "underline" }}>
                          {c.title ?? c.url}
                        </a>
                      </div>
                      <div style={{ color: "#4b5563", fontSize: 12 }}>
                        <a href={c.final_url ?? c.url} target="_blank" rel="noopener noreferrer" style={{ color: "#4b5563", textDecoration: "underline" }}>
                          {c.url}
                        </a>
                      </div>
                      {c.snippet && <div style={{ color: "#6b7280", fontSize: 12 }}>{c.snippet}</div>}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{Math.round(c.score * 100)}%</div>
                    <button
                      onClick={() => applyCandidate(row.tournament_id, c.final_url ?? c.url)}
                      style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #0f3d2e", background: "#fff", color: "#0f3d2e", fontSize: 12 }}
                    >
                      Apply
                    </button>
                  </div>
                ))}
                {tournament?.source_url ? (
                  <div style={{ marginTop: 6 }}>
                    <button
                      onClick={() => applyCandidate(row.tournament_id, tournament.source_url!)}
                      style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #111", background: "#fff", color: "#111", fontSize: 12 }}
                    >
                      Use source URL as official
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>URL Suggestions (pending review)</h2>
        {pendingUrlSuggestions.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No pending suggestions.</div>
        ) : (
          pendingUrlSuggestions.map((s) => (
            <div key={s.id} style={{ borderTop: "1px solid #f1f1f1", padding: "8px 0" }}>
              <div style={{ fontWeight: 700 }}>
                {s.tournament_name ?? s.tournament_id} {s.tournament_state ? `(${s.tournament_state})` : ""}
              </div>
              <div style={{ color: "#4b5563", fontSize: 12 }}>{s.suggested_url}</div>
              {s.submitter_email && <div style={{ color: "#6b7280", fontSize: 12 }}>Submitted by {s.submitter_email}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button
                  onClick={() => reviewUrlSuggestion(s.id, "approve")}
                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #0f3d2e", background: "#0f3d2e", color: "#fff", fontSize: 12 }}
                >
                  Approve
                </button>
                <button
                  onClick={() => reviewUrlSuggestion(s.id, "reject")}
                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #b00020", background: "#fff", color: "#b00020", fontSize: 12 }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Tournaments (select to queue)</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tournaments by name/state"
              style={{ flex: 1, padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <button onClick={search} disabled={searching} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #0f3d2e", background: "#0f3d2e", color: "#fff" }}>
              {searching ? "Searching..." : "Search"}
            </button>
          </div>
          <div style={{ maxHeight: 360, overflow: "auto" }}>
            {results.map((t) => (
              <label key={t.id} style={{ display: "flex", gap: 8, padding: "6px 4px", alignItems: "center", borderBottom: "1px solid #f1f1f1" }}>
                <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
                <div>
                  <div style={{ fontWeight: 600 }}>{t.name ?? "Untitled"}</div>
                  <div style={{ color: "#4b5563", fontSize: 12 }}>{t.url ?? "No URL"}</div>
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    queue([t.id]);
                  }}
                  style={{ marginLeft: "auto", padding: "4px 8px", borderRadius: 6, border: "1px solid #0f3d2e", background: "#fff", color: "#0f3d2e", fontSize: 12 }}
                >
                  Queue
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    skipTournament(t.id);
                  }}
                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #b00020", background: "#fff", color: "#b00020", fontSize: 12 }}
                >
                  Skip
                </button>
              </label>
            ))}
          </div>
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Recent Jobs</h2>
          <div style={{ maxHeight: 360, overflow: "auto" }}>
            {jobs.map((job) => (
              <div key={job.id} style={{ padding: "6px 4px", borderBottom: "1px solid #f1f1f1" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600 }}>{job.status}</span>
                  <span style={{ color: "#6b7280", fontSize: 12 }}>{formatDate(job.created_at)}</span>
                </div>
                <div style={{ fontSize: 12, color: "#4b5563" }}>
                  Pages: {job.pages_fetched_count ?? 0} • Finished: {formatDate(job.finished_at) || "—"}
                </div>
                {job.last_error ? <div style={{ color: "#b91c1c", fontSize: 12 }}>Error: {job.last_error}</div> : null}
                <div style={{ fontSize: 12 }}>
                  Tournament:{" "}
                  <Link href={`/tournaments/${job.tournament_id}`}>
                    {job.tournament_name ?? job.tournament_id}
                  </Link>
                  {job.tournament_url ? (
                    <>
                      {" "}
                      •{" "}
                      <a href={job.tournament_url} target="_blank" rel="noreferrer" style={{ color: "#0f3d2e" }}>
                        source
                      </a>
                    </>
                  ) : null}
                  <div style={{ color: "#6b7280", fontSize: 11 }}>ID: {job.tournament_id}</div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      skip(job.tournament_id);
                    }}
                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #b00020", background: "#fff", color: "#b00020", fontSize: 12 }}
                  >
                    Skip enrichment
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section style={{ marginTop: 20, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Pending Candidates</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
          <div style={{ border: "1px solid #f1f1f1", borderRadius: 10, padding: 10 }}>
            <h3 style={{ marginTop: 0, fontSize: 14 }}>Contacts</h3>
            <div style={{ maxHeight: 240, overflow: "auto", fontSize: 12 }}>
              {pendingContacts.map((c) => (
                <div key={c.id} style={{ borderBottom: "1px solid #f5f5f5", padding: "6px 0" }}>
                  <div style={{ fontWeight: 700 }}>{c.role_normalized ?? "GENERAL"}</div>
                  <div>{c.email ?? c.phone ?? "—"}</div>
                  <div style={{ color: "#4b5563" }}>
                    <Link href={`/tournaments/${c.tournament_id}`}>{c.tournament_id}</Link> • conf: {c.confidence ?? 0}
                  </div>
                  {c.source_url ? (
                    <a href={c.source_url} target="_blank" rel="noreferrer" style={{ color: "#0f3d2e" }}>
                      source
                    </a>
                  ) : null}
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <button
                      onClick={() => act("contact", c.id, "accept")}
                      style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #0f3d2e", background: "#0f3d2e", color: "#fff" }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => act("contact", c.id, "reject")}
                      style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #e11d48", background: "#fff", color: "#e11d48" }}
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => act("contact", c.id, "delete")}
                      style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #9ca3af", background: "#fff", color: "#6b7280" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ border: "1px solid #f1f1f1", borderRadius: 10, padding: 10 }}>
            <h3 style={{ marginTop: 0, fontSize: 14 }}>Venues</h3>
            <div style={{ maxHeight: 240, overflow: "auto", fontSize: 12 }}>
              {pendingVenues.map((v) => (
                <div key={v.id} style={{ borderBottom: "1px solid #f5f5f5", padding: "6px 0" }}>
                  <div style={{ fontWeight: 700 }}>{v.venue_name ?? "Venue"}</div>
                  <div>{v.address_text ?? "—"}</div>
                  <div style={{ color: "#4b5563" }}>
                    <Link href={`/tournaments/${v.tournament_id}`}>{v.tournament_id}</Link> • conf: {v.confidence ?? 0}
                  </div>
                  {v.source_url ? (
                    <a href={v.source_url} target="_blank" rel="noreferrer" style={{ color: "#0f3d2e" }}>
                      source
                    </a>
                  ) : null}
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <button
                      onClick={() => act("venue", v.id, "accept")}
                      style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #0f3d2e", background: "#0f3d2e", color: "#fff" }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => act("venue", v.id, "reject")}
                      style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #e11d48", background: "#fff", color: "#e11d48" }}
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => act("venue", v.id, "delete")}
                      style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #9ca3af", background: "#fff", color: "#6b7280" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ border: "1px solid #f1f1f1", borderRadius: 10, padding: 10 }}>
            <h3 style={{ marginTop: 0, fontSize: 14 }}>Referee Comp</h3>
            <div style={{ maxHeight: 240, overflow: "auto", fontSize: 12 }}>
              {pendingComps.map((c) => (
                <div key={c.id} style={{ borderBottom: "1px solid #f5f5f5", padding: "6px 0" }}>
                  <div style={{ fontWeight: 700 }}>{c.rate_text ?? "Rates"}</div>
                  <div style={{ color: "#4b5563" }}>{c.travel_housing_text ?? ""}</div>
                  <div style={{ color: "#4b5563" }}>
                    <Link href={`/tournaments/${c.tournament_id}`}>{c.tournament_id}</Link> • conf: {c.confidence ?? 0}
                  </div>
                  {c.source_url ? (
                    <a href={c.source_url} target="_blank" rel="noreferrer" style={{ color: "#0f3d2e" }}>
                      source
                    </a>
                  ) : null}
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <button
                      onClick={() => act("comp", c.id, "accept")}
                      style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #0f3d2e", background: "#0f3d2e", color: "#fff" }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => act("comp", c.id, "reject")}
                      style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #e11d48", background: "#fff", color: "#e11d48" }}
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => act("comp", c.id, "delete")}
                      style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #9ca3af", background: "#fff", color: "#6b7280" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
