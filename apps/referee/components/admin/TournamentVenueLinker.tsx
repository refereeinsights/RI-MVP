"use client";

import { useEffect, useMemo, useState } from "react";

type VenueSearchResult = {
  venue_id: string;
  name: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  sport: string | null;
};

type LinkedVenue = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
};

type Props = {
  tournamentId: string;
  initialLinkedVenues?: LinkedVenue[] | null;
  cityHint?: string | null;
  stateHint?: string | null;
};

export default function TournamentVenueLinker({ tournamentId, initialLinkedVenues, cityHint, stateHint }: Props) {
  const [linked, setLinked] = useState<LinkedVenue[]>(initialLinkedVenues ?? []);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VenueSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingVenueId, setSavingVenueId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [newZip, setNewZip] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setLinked(initialLinkedVenues ?? []);
  }, [initialLinkedVenues]);

  useEffect(() => {
    if (!newCity && cityHint) setNewCity(cityHint);
    if (!newState && stateHint) setNewState(stateHint);
  }, [cityHint, newCity, newState, stateHint]);

  const normalizedQuery = useMemo(() => query.replace(/\s+/g, " ").trim(), [query]);

  useEffect(() => {
    if (normalizedQuery.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`/api/admin/venues/search?q=${encodeURIComponent(normalizedQuery)}`, {
          credentials: "include",
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.error || "search_failed");
        setResults(Array.isArray(json?.results) ? (json.results as VenueSearchResult[]) : []);
      } catch (err) {
        setResults([]);
        setError(err instanceof Error ? err.message : "search_failed");
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(handle);
  }, [normalizedQuery]);

  const linkVenue = async (venue: VenueSearchResult) => {
    if (!tournamentId || !venue?.venue_id) return;
    const venueId = venue.venue_id;
    if (linked.some((v) => v.id === venueId)) return;
    setSavingVenueId(venueId);
    setError(null);
    try {
      const resp = await fetch("/api/admin/tournament-venues/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tournament_id: tournamentId, venue_id: venueId }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "link_failed");
      setLinked((prev) => [...prev, { id: venueId, name: venue.name ?? null, city: venue.city ?? null, state: venue.state ?? null }]);
      setQuery("");
      setResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "link_failed");
    } finally {
      setSavingVenueId(null);
    }
  };

  const unlinkVenue = async (venueId: string) => {
    if (!tournamentId || !venueId) return;
    setSavingVenueId(venueId);
    setError(null);
    try {
      const resp = await fetch("/api/admin/tournament-venues/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tournament_id: tournamentId, venue_id: venueId }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "unlink_failed");
      setLinked((prev) => prev.filter((v) => v.id !== venueId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "unlink_failed");
    } finally {
      setSavingVenueId(null);
    }
  };

  const createAndLinkVenue = async () => {
    if (!tournamentId) return;
    setCreating(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/tournament-venues/create-and-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tournament_id: tournamentId,
          name: newName,
          address: newAddress,
          city: newCity,
          state: newState,
          zip: newZip,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "create_failed");
      const venue = json?.venue as { id?: string; name?: string | null; city?: string | null; state?: string | null } | undefined;
      if (venue?.id) {
        setLinked((prev) => (prev.some((v) => v.id === venue.id) ? prev : [...prev, { id: venue.id, name: venue.name ?? null, city: venue.city ?? null, state: venue.state ?? null }]));
      }
      setNewName("");
      setNewAddress("");
      setNewZip("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "create_failed");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 8, border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fff" }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>Linked venues</div>

      {linked.length ? (
        <div style={{ display: "grid", gap: 6 }}>
          {linked.map((v) => (
            <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 12, color: "#374151" }}>{[v.name, v.city, v.state].filter(Boolean).join(" • ") || v.id}</div>
              <button
                type="button"
                onClick={() => unlinkVenue(v.id)}
                disabled={savingVenueId === v.id}
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid #b91c1c",
                  background: "#fff",
                  color: "#b91c1c",
                  fontWeight: 800,
                  fontSize: 11,
                  cursor: savingVenueId === v.id ? "not-allowed" : "pointer",
                }}
              >
                {savingVenueId === v.id ? "Saving..." : "Unlink"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "#6b7280" }}>No linked venues yet.</div>
      )}

      <div style={{ fontSize: 12, fontWeight: 800, color: "#111827", marginTop: 4 }}>Search & link another venue</div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search venues by name/address/city/state..."
        style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
      />

      {loading ? <div style={{ fontSize: 12, color: "#6b7280" }}>Searching...</div> : null}
      {error ? <div style={{ fontSize: 12, color: "#b91c1c" }}>Venue link error: {error}</div> : null}

      {!loading && results.length ? (
        <div style={{ display: "grid", gap: 6, maxHeight: 180, overflowY: "auto" }}>
          {results.map((r) => (
            <div
              key={r.venue_id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: "6px 8px",
                background: "#fff",
              }}
            >
              <div style={{ fontSize: 12, color: "#374151" }}>
                {[r.name, r.street, r.city, r.state, r.zip].filter(Boolean).join(" • ")}
              </div>
              <button
                type="button"
                onClick={() => linkVenue(r)}
                disabled={savingVenueId === r.venue_id || linked.some((v) => v.id === r.venue_id)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid #0f172a",
                  background: "#fff",
                  color: "#0f172a",
                  fontWeight: 800,
                  fontSize: 11,
                  cursor: savingVenueId === r.venue_id ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {linked.some((v) => v.id === r.venue_id) ? "Linked" : savingVenueId === r.venue_id ? "Saving..." : "Link"}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ fontSize: 12, fontWeight: 800, color: "#111827", marginTop: 6 }}>Create & link new venue</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Venue name (optional)"
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
        />
        <input
          type="text"
          value={newAddress}
          onChange={(e) => setNewAddress(e.target.value)}
          placeholder="Address"
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
        />
        <input
          type="text"
          value={newCity}
          onChange={(e) => setNewCity(e.target.value)}
          placeholder="City"
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
        />
        <input
          type="text"
          value={newState}
          onChange={(e) => setNewState(e.target.value)}
          placeholder="State"
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
        />
        <input
          type="text"
          value={newZip}
          onChange={(e) => setNewZip(e.target.value)}
          placeholder="Zip (optional)"
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
        />
      </div>
      <button
        type="button"
        onClick={createAndLinkVenue}
        disabled={creating}
        style={{
          width: "fit-content",
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid #0f172a",
          background: "#fff",
          color: "#0f172a",
          fontWeight: 900,
          fontSize: 12,
          cursor: creating ? "not-allowed" : "pointer",
        }}
      >
        {creating ? "Saving..." : "Create + link"}
      </button>
    </div>
  );
}
