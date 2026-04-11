"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type VenueSearchResult = {
  venue_id: string;
  name: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  sport: string | null;
};

function buildCsvUrl(params: {
  states: string[];
  sports: string[];
  venueId: string | null;
  includeInferred: boolean;
}) {
  const url = new URL("/api/admin/tournaments/tourney-export", window.location.origin);
  if (params.states.length) url.searchParams.set("states", params.states.join(","));
  if (params.sports.length) url.searchParams.set("sports", params.sports.join(","));
  if (params.venueId) url.searchParams.set("venue_id", params.venueId);
  if (params.includeInferred) url.searchParams.set("include_inferred", "1");
  return url.toString();
}

export default function TourneyExportClient(props: { usStates: string[]; sportOptions: string[] }) {
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [includeInferred, setIncludeInferred] = useState(false);

  const [venueQuery, setVenueQuery] = useState("");
  const [venueResults, setVenueResults] = useState<VenueSearchResult[]>([]);
  const [venueLoading, setVenueLoading] = useState(false);
  const [venueError, setVenueError] = useState<string | null>(null);
  const [pickedVenue, setPickedVenue] = useState<VenueSearchResult | null>(null);

  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const q = venueQuery.trim();
    setVenueError(null);
    if (pickedVenue) return;
    if (q.length < 2) {
      setVenueResults([]);
      return;
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setVenueLoading(true);
      try {
        const res = await fetch(`/api/admin/venues/search?q=${encodeURIComponent(q)}`);
        const json = (await res.json()) as { results?: VenueSearchResult[]; error?: string };
        if (!res.ok || json.error) {
          setVenueError(json.error || "Venue search failed");
          setVenueResults([]);
          return;
        }
        setVenueResults(json.results ?? []);
      } catch (err: any) {
        setVenueError(err?.message ?? "Venue search failed");
        setVenueResults([]);
      } finally {
        setVenueLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [venueQuery, pickedVenue]);

  const exportUrl = useMemo(() => {
    return buildCsvUrl({
      states: selectedStates,
      sports: selectedSports,
      venueId: pickedVenue?.venue_id ?? null,
      includeInferred,
    });
  }, [includeInferred, pickedVenue, selectedSports, selectedStates]);

  function toggleSelected(list: string[], value: string) {
    if (list.includes(value)) return list.filter((v) => v !== value);
    return [...list, value];
  }

  function clearVenue() {
    setPickedVenue(null);
    setVenueQuery("");
    setVenueResults([]);
  }

  return (
    <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(3, minmax(220px, 1fr))" }}>
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>States</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => setSelectedStates([])}
              style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", fontWeight: 900, fontSize: 12 }}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setSelectedStates(props.usStates)}
              style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", fontWeight: 900, fontSize: 12 }}
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setSelectedStates([])}
              style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", fontWeight: 900, fontSize: 12 }}
            >
              Clear
            </button>
          </div>
          <div style={{ maxHeight: 260, overflow: "auto", display: "grid", gap: 6 }}>
            {props.usStates.map((st) => (
              <label key={st} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 800 }}>
                <input
                  type="checkbox"
                  checked={selectedStates.includes(st)}
                  onChange={() => setSelectedStates((prev) => toggleSelected(prev, st))}
                />
                {st}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "#64748b", fontWeight: 700 }}>
            No states selected = all states.
          </div>
        </div>

        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>Sports</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => setSelectedSports([])}
              style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", fontWeight: 900, fontSize: 12 }}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setSelectedSports(props.sportOptions)}
              style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", fontWeight: 900, fontSize: 12 }}
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setSelectedSports([])}
              style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", fontWeight: 900, fontSize: 12 }}
            >
              Clear
            </button>
          </div>
          <div style={{ maxHeight: 260, overflow: "auto", display: "grid", gap: 6 }}>
            {props.sportOptions.map((s) => (
              <label key={s} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 800 }}>
                <input
                  type="checkbox"
                  checked={selectedSports.includes(s)}
                  onChange={() => setSelectedSports((prev) => toggleSelected(prev, s))}
                />
                {s}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "#64748b", fontWeight: 700 }}>
            No sports selected = all sports.
          </div>
        </div>

        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>Venue (optional)</div>

          {pickedVenue ? (
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 10, background: "#f8fafc" }}>
              <div style={{ fontWeight: 900, fontSize: 13 }}>{pickedVenue.name ?? "Unnamed venue"}</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                {pickedVenue.street}, {pickedVenue.city}, {pickedVenue.state} {pickedVenue.zip}
              </div>
              <button
                type="button"
                onClick={clearVenue}
                style={{ marginTop: 8, padding: "6px 10px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", fontWeight: 900, fontSize: 12 }}
              >
                Clear venue
              </button>
            </div>
          ) : (
            <>
              <input
                value={venueQuery}
                onChange={(e) => setVenueQuery(e.target.value)}
                placeholder="Search venue name or address…"
                style={{ padding: 10, borderRadius: 10, border: "1px solid #cbd5e1", width: "100%" }}
              />
              <div style={{ marginTop: 6, fontSize: 11, color: "#64748b", fontWeight: 700 }}>
                {venueLoading ? "Searching…" : "Type at least 2 characters."}
              </div>
              {venueError ? <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c", fontWeight: 900 }}>{venueError}</div> : null}
              {venueResults.length ? (
                <div style={{ marginTop: 10, border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
                  {venueResults.map((v) => (
                    <button
                      key={v.venue_id}
                      type="button"
                      onClick={() => {
                        setPickedVenue(v);
                        setVenueQuery("");
                        setVenueResults([]);
                      }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: 10,
                        border: "none",
                        borderTop: "1px solid #eef2f7",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 900, fontSize: 12, color: "#0f172a" }}>{v.name ?? "Unnamed venue"}</div>
                      <div style={{ fontSize: 12, color: "#475569" }}>
                        {v.street}, {v.city}, {v.state} {v.zip}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}

          <label style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 900 }}>
            <input type="checkbox" checked={includeInferred} onChange={(e) => setIncludeInferred(e.target.checked)} />
            Include inferred venue links
          </label>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>
          Export is one row per venue link (tournament ↔ venue).
        </div>
        <a
          href={exportUrl}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #0f172a",
            background: "#0f172a",
            color: "#fff",
            fontWeight: 900,
            textDecoration: "none",
          }}
        >
          Export CSV
        </a>
      </div>
    </div>
  );
}

