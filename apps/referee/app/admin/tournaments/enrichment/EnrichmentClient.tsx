"use client";

import React from "react";
import Link from "next/link";

type Tournament = { id: string; name: string | null; url: string | null; state: string | null };
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

function formatDate(val: string | null) {
  if (!val) return "";
  return new Date(val).toLocaleString();
}

export default function EnrichmentClient({
  tournaments,
  jobs,
  contacts,
  venues,
  comps,
}: {
  tournaments: Tournament[];
  jobs: Job[];
  contacts: ContactCandidate[];
  venues: VenueCandidate[];
  comps: CompCandidate[];
}) {
  const [selected, setSelected] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<string>("");
  const [query, setQuery] = React.useState<string>("");
  const [results, setResults] = React.useState<Tournament[]>(tournaments);
  const [searching, setSearching] = React.useState<boolean>(false);
  const [pendingContacts, setPendingContacts] = React.useState<ContactCandidate[]>(contacts);
  const [pendingVenues, setPendingVenues] = React.useState<VenueCandidate[]>(venues);
  const [pendingComps, setPendingComps] = React.useState<CompCandidate[]>(comps);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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

  const runNow = async () => {
    setStatus("Running...");
    const res = await fetch("/api/admin/tournaments/enrichment/run", { method: "POST" });
    const json = await res.json();
    setStatus(json.error ? `Run failed: ${json.error}` : "Run triggered");
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

  return (
    <main style={{ padding: "1rem", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 12 }}>Tournament Enrichment</h1>
      <p style={{ color: "#4b5563", marginBottom: 16 }}>
        Queue enrichment jobs for tournaments with URLs. Jobs fetch up to 8 pages per tournament and extract contacts, venues, and referee comp signals.
      </p>

      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
        <button onClick={() => queue()} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #0f3d2e", background: "#0f3d2e", color: "#fff" }}>
          Queue Enrichment
        </button>
        <button onClick={runNow} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #0f3d2e", background: "#fff", color: "#0f3d2e" }}>
          Run Now (limit 10)
        </button>
        <span style={{ color: "#555" }}>{status}</span>
      </div>

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
