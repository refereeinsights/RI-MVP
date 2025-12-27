"use client";

import { useEffect, useState } from "react";

import OwlsEyeBrandingOverlay from "@/components/admin/OwlsEyeBrandingOverlay";

type Sport = "soccer" | "basketball";
type RunStatus = "idle" | "running" | "error" | "success";

type VenueSearchResult = {
  venue_id: string;
  name: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  sport: string | null;
};

type RunReport = {
  runId?: string;
  status?: string;
  message?: string;
  map?: { imageUrl?: string | null; url?: string | null };
  nearby?: {
    food?: NearbyItem[];
    coffee?: NearbyItem[];
  };
};

type OwlsEyePanelProps = {
  embedded?: boolean;
  adminToken?: string;
  initialVenueId?: string;
};

function truncateId(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export default function OwlsEyePanel({ embedded = false, adminToken, initialVenueId }: OwlsEyePanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<VenueSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [copiedVenueId, setCopiedVenueId] = useState<string | null>(null);

  const [venueId, setVenueId] = useState(initialVenueId ?? "");
  const [sport, setSport] = useState<Sport>("soccer");
  const [mapUrl, setMapUrl] = useState("");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runReport, setRunReport] = useState<RunReport | null>(null);

  useEffect(() => {
    if (initialVenueId) {
      setVenueId(initialVenueId);
    }
  }, [initialVenueId]);

  const sharedHeaders = adminToken ? { "x-owls-eye-admin-token": adminToken } : {};

  const searchVenues = async () => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchError("Enter at least 2 characters to search.");
      setHasSearched(false);
      setSearchResults([]);
      return;
    }

    setSearching(true);
    setHasSearched(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const resp = await fetch(`/api/admin/venues/search?q=${encodeURIComponent(query)}`, {
        headers: sharedHeaders,
      });
      const json = await resp.json();

      if (!resp.ok) {
        setSearchError(json?.error || json?.message || "Search failed.");
        return;
      }

      setSearchResults(Array.isArray(json?.results) ? json.results : []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  const handleCopy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedVenueId(id);
      setTimeout(() => setCopiedVenueId(null), 1500);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Could not copy ID.");
    }
  };

  const handleUseVenue = (venue: VenueSearchResult) => {
    setVenueId(venue.venue_id);
    const normalizedSport = (venue.sport || "").toLowerCase();
    if (normalizedSport === "soccer" || normalizedSport === "basketball") {
      setSport(normalizedSport);
    }
  };

  const startRun = async () => {
    const trimmedVenueId = venueId.trim();
    if (!trimmedVenueId) {
      setRunStatus("error");
      setRunMessage("Venue ID is required.");
      return;
    }

    setRunStatus("running");
    setRunMessage(null);
    setRunReport(null);

    try {
      const resp = await fetch("/api/admin/owls-eye/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...sharedHeaders,
        },
        body: JSON.stringify({
          venue_id: trimmedVenueId,
          sport,
          published_map_url: mapUrl.trim() || undefined,
        }),
      });

      const json = await resp.json();
      const errorMessage = json?.error || json?.message;

      if (!resp.ok || json?.ok === false) {
        setRunStatus("error");
        setRunMessage(errorMessage || "Run failed.");
        setRunReport(json?.report ?? json);
        return;
      }

      setRunStatus("success");
      setRunMessage("Owl's Eye run completed.");
      setRunReport(json?.report ?? json);
    } catch (err) {
      setRunStatus("error");
      setRunMessage(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const mapImageUrl = (() => {
    const map = (runReport as any)?.map;
    if (!map) return null;
    return map.imageUrl || map.url || null;
  })();

  const metersToMiles = (meters?: number | null) => {
    if (meters == null) return null;
    const miles = meters / 1609.34;
    return Math.round(miles * 10) / 10;
  };

  const renderNearbyList = (items: NearbyItem[] | undefined, label: string) => {
    if (!items || items.length === 0) return <div style={{ color: "#6b7280" }}>No {label} found.</div>;
    return (
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((item, idx) => {
          const distance = metersToMiles(item.distance_meters);
          return (
            <div
              key={`${item.name}-${idx}`}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 10,
                display: "grid",
                gap: 4,
                background: item.is_sponsor ? "#fff7ed" : "white",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700 }}>{item.name}</span>
                {item.is_sponsor && (
                  <span style={{ fontSize: 11, background: "#f97316", color: "white", padding: "2px 6px", borderRadius: 6 }}>
                    Sponsor
                  </span>
                )}
              </div>
              {distance != null && (
                <div style={{ fontSize: 12, color: "#4b5563" }}>{distance} mi</div>
              )}
              {item.address && <div style={{ fontSize: 12, color: "#4b5563" }}>{item.address}</div>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                {item.maps_url && (
                  <a href={item.maps_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                    Directions
                  </a>
                )}
                {item.is_sponsor && item.sponsor_click_url && (
                  <a href={item.sponsor_click_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#c2410c" }}>
                    Offer
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ padding: embedded ? 0 : "24px", maxWidth: 900 }}>
      <h1>Owl&apos;s Eye Admin</h1>
      <p>Search venues and trigger a manual Owl&apos;s Eye run.</p>

      <div style={{ display: "grid", gap: 24, marginTop: 12 }}>
        <div style={{ border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>Venue Search</h2>
          <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
            <label>
              <div>Search (name, address, city, state)</div>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Start typing a venue..."
                style={{ width: "100%" }}
              />
            </label>
            <button onClick={searchVenues} disabled={searching}>
              {searching ? "Searching…" : "Search"}
            </button>
            {searchError && <div style={{ color: "red" }}>{searchError}</div>}
          </div>

          {hasSearched && !searching && searchResults.length === 0 && !searchError && (
            <div style={{ marginTop: 12, color: "#555" }}>No venues found.</div>
          )}

          {searchResults.length > 0 && (
            <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
              {searchResults.map((venue) => {
                const locationParts = [venue.city, venue.state].filter(Boolean).join(", ");
                const venueLabel = venue.name || "Unnamed venue";
                const idDisplay = truncateId(venue.venue_id);
                return (
                  <div
                    key={venue.venue_id}
                    style={{
                      border: "1px solid #e1e4e8",
                      borderRadius: 6,
                      padding: 10,
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{venueLabel}</div>
                    <div style={{ color: "#444" }}>
                      {locationParts || "City/state unknown"}
                      {venue.street ? ` — ${venue.street}` : ""}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 12 }}>{idDisplay}</span>
                      <button onClick={() => handleCopy(venue.venue_id)} style={{ padding: "4px 8px" }}>
                        {copiedVenueId === venue.venue_id ? "Copied" : "Copy ID"}
                      </button>
                      <button onClick={() => handleUseVenue(venue)} style={{ padding: "4px 8px" }}>
                        Use
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ border: "1px solid #ddd", padding: 16, borderRadius: 8, maxWidth: 560 }}>
          <h2 style={{ marginTop: 0 }}>Generate Owl&apos;s Eye</h2>
          <div style={{ display: "grid", gap: 12 }}>
            <label>
              <div>Venue ID (UUID)</div>
              <input
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                placeholder="uuid"
                style={{ width: "100%" }}
              />
            </label>

            <label>
              <div>Sport</div>
              <select value={sport} onChange={(e) => setSport(e.target.value as Sport)} style={{ width: "100%" }}>
                <option value="soccer">Soccer</option>
                <option value="basketball">Basketball</option>
              </select>
            </label>

            <label>
              <div>Published Map URL (optional)</div>
              <input
                value={mapUrl}
                onChange={(e) => setMapUrl(e.target.value)}
                placeholder="https://example.com/map.pdf"
                style={{ width: "100%" }}
              />
            </label>

            <button onClick={startRun} disabled={runStatus === "running"}>
              {runStatus === "running" ? "Running…" : "Run Owl's Eye"}
            </button>
            {runMessage && (
              <div style={{ color: runStatus === "error" ? "red" : "green" }}>
                {runMessage}
              </div>
            )}
          </div>

          {runReport && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Run response</div>
              <pre style={{ background: "#f6f8fa", padding: 12, overflowX: "auto" }}>
                {JSON.stringify(runReport, null, 2)}
              </pre>

              {mapImageUrl && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <div style={{ fontWeight: 600 }}>Field map</div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(mapImageUrl);
                          setRunMessage("Map URL copied");
                        } catch (err) {
                          setRunMessage(err instanceof Error ? err.message : "Copy failed");
                          setRunStatus("error");
                        }
                      }}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        background: "#f8fafc",
                        cursor: "pointer",
                      }}
                    >
                      Copy map URL
                    </button>
                  </div>
                  <div
                    style={{
                      position: "relative",
                      display: "inline-block",
                      maxWidth: "100%",
                    }}
                  >
                    <img
                      src={mapImageUrl}
                      alt="Field map artifact"
                      style={{ maxWidth: "100%", display: "block", border: "1px solid #ccc" }}
                    />
                    <OwlsEyeBrandingOverlay />
                  </div>
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Nearby</div>
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Food</div>
                    {renderNearbyList(runReport.nearby?.food, "food")}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Coffee</div>
                    {renderNearbyList(runReport.nearby?.coffee, "coffee")}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
type NearbyItem = {
  name: string;
  address?: string;
  distance_meters?: number | null;
  is_sponsor?: boolean;
  sponsor_click_url?: string;
  maps_url?: string;
};
