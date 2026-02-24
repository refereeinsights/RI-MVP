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

type Props = {
  cityHint?: string | null;
  stateHint?: string | null;
};

export default function TournamentVenueMatcher({ cityHint, stateHint }: Props) {
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [venueCity, setVenueCity] = useState("");
  const [venueState, setVenueState] = useState("");
  const [venueZip, setVenueZip] = useState("");
  const [existingVenueId, setExistingVenueId] = useState("");
  const [results, setResults] = useState<VenueSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!venueCity && cityHint) setVenueCity(cityHint);
    if (!venueState && stateHint) setVenueState(stateHint);
  }, [cityHint, stateHint, venueCity, venueState]);

  const query = useMemo(
    () => `${venueName} ${venueAddress}`.replace(/\s+/g, " ").trim(),
    [venueAddress, venueName]
  );

  useEffect(() => {
    if (existingVenueId) {
      return;
    }
    if (query.length < 2) {
      setResults([]);
      setError(null);
      return;
    }

    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`/api/admin/venues/search?q=${encodeURIComponent(query)}`, {
          credentials: "include",
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(json?.error || "Venue search failed");
        }
        setResults(Array.isArray(json?.results) ? (json.results as VenueSearchResult[]) : []);
      } catch (err) {
        setResults([]);
        setError(err instanceof Error ? err.message : "Venue search failed");
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(handle);
  }, [existingVenueId, query]);

  const clearSelectedVenue = () => {
    if (existingVenueId) setExistingVenueId("");
  };

  const applyMatch = (match: VenueSearchResult) => {
    setExistingVenueId(match.venue_id);
    setVenueName(match.name ?? "");
    setVenueAddress(match.street ?? "");
    setVenueCity(match.city ?? "");
    setVenueState(match.state ?? "");
    setVenueZip(match.zip ?? "");
    setResults([]);
    setError(null);
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <input type="hidden" name="existing_venue_id" value={existingVenueId} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: 10,
        }}
      >
        <input
          type="text"
          name="venue_name"
          value={venueName}
          onChange={(e) => {
            clearSelectedVenue();
            setVenueName(e.target.value);
          }}
          placeholder="Venue name"
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
        />
        <input
          type="text"
          name="venue_address"
          value={venueAddress}
          onChange={(e) => {
            clearSelectedVenue();
            setVenueAddress(e.target.value);
          }}
          placeholder="Address"
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
        />
        <input
          type="text"
          name="venue_city"
          value={venueCity}
          onChange={(e) => {
            clearSelectedVenue();
            setVenueCity(e.target.value);
          }}
          placeholder="City"
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
        />
        <input
          type="text"
          name="venue_state"
          value={venueState}
          onChange={(e) => {
            clearSelectedVenue();
            setVenueState(e.target.value);
          }}
          placeholder="State"
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
        />
        <input
          type="text"
          name="venue_zip"
          value={venueZip}
          onChange={(e) => {
            clearSelectedVenue();
            setVenueZip(e.target.value);
          }}
          placeholder="Zip"
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
        />
      </div>

      {existingVenueId ? (
        <div style={{ fontSize: 12, color: "#166534", fontWeight: 700 }}>
          Selected existing venue. Click Add venue to link this venue.
        </div>
      ) : null}

      {loading ? <div style={{ fontSize: 12, color: "#555" }}>Searching existing venues...</div> : null}
      {error ? <div style={{ fontSize: 12, color: "#b91c1c" }}>Venue search failed: {error}</div> : null}

      {!loading && !existingVenueId && results.length > 0 ? (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1f2937" }}>Potential existing venue matches</div>
          <div style={{ display: "grid", gap: 6, maxHeight: 180, overflowY: "auto" }}>
            {results.map((result) => (
              <div
                key={result.venue_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  padding: "6px 8px",
                  background: "#fff",
                }}
              >
                <div style={{ fontSize: 12, color: "#374151" }}>
                  {[result.name, result.street, result.city, result.state, result.zip].filter(Boolean).join(" • ")}
                </div>
                <button
                  type="button"
                  onClick={() => applyMatch(result)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid #0f172a",
                    background: "#fff",
                    color: "#0f172a",
                    fontWeight: 700,
                    fontSize: 11,
                    whiteSpace: "nowrap",
                  }}
                >
                  Use
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

