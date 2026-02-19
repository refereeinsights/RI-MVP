"use client";

import { useState } from "react";
import Link from "next/link";

import { tiVenueMapUrl } from "@/lib/ti/publicUrls";

type PlaceSuggestion = {
  id: string;
  name: string;
  formatted_address: string;
  lat: number | null;
  lng: number | null;
  website_uri: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export function NewVenueForm() {
  const [name, setName] = useState("");
  const [address1, setAddress1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [sport, setSport] = useState("soccer");
  const [zip, setZip] = useState("");
  const [notes, setNotes] = useState("");
  const [venueUrl, setVenueUrl] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [fieldType, setFieldType] = useState("");
  const [amenities, setAmenities] = useState("");
  const [playerParking, setPlayerParking] = useState("");
  const [indoor, setIndoor] = useState("");
  const [fieldLighting, setFieldLighting] = useState("");
  const [parkingNotes, setParkingNotes] = useState("");
  const [fieldRating, setFieldRating] = useState("");
  const [venueType, setVenueType] = useState("");
  const [fieldCount, setFieldCount] = useState("");
  const [fieldMonitors, setFieldMonitors] = useState("");
  const [refereeMentors, setRefereeMentors] = useState("");
  const [foodVendors, setFoodVendors] = useState("");
  const [coffeeVendors, setCoffeeVendors] = useState("");
  const [tournamentVendors, setTournamentVendors] = useState("");
  const [refereeTent, setRefereeTent] = useState("");
  const [restrooms, setRestrooms] = useState("");
  const [restroomsCleanliness, setRestroomsCleanliness] = useState("");
  const [paidParking, setPaidParking] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setCreatedId(null);

    try {
      const resp = await fetch("/api/admin/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          address1,
          city,
          state,
          sport,
          zip: zip || undefined,
          notes: notes || undefined,
          venue_url: venueUrl || undefined,
          latitude: latitude || undefined,
          longitude: longitude || undefined,
          field_type: fieldType || undefined,
          amenities: amenities || undefined,
          player_parking: playerParking || undefined,
          indoor: indoor === "" ? undefined : indoor === "true",
          field_lighting: fieldLighting === "" ? undefined : fieldLighting === "true",
          parking_notes: parkingNotes || undefined,
          field_rating: fieldRating || undefined,
          venue_type: venueType || undefined,
          field_count: fieldCount || undefined,
          field_monitors: fieldMonitors === "" ? undefined : fieldMonitors === "true",
          referee_mentors: refereeMentors === "" ? undefined : refereeMentors === "true",
          food_vendors: foodVendors === "" ? undefined : foodVendors === "true",
          coffee_vendors: coffeeVendors === "" ? undefined : coffeeVendors === "true",
          tournament_vendors: tournamentVendors === "" ? undefined : tournamentVendors === "true",
          referee_tent: refereeTent || undefined,
          restrooms: restrooms || undefined,
          restrooms_cleanliness: restroomsCleanliness || undefined,
          ref_paid_parking: paidParking === "" ? undefined : paidParking === "true",
        }),
      });

      const json = await resp.json();
      if (!resp.ok) {
        setError(json?.error || "Failed to create venue");
        return;
      }

      setCreatedId(json.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create venue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <label>
            <div>Name</div>
            <input value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%" }} />
          </label>
          <label>
            <div>Address</div>
            <input value={address1} onChange={(e) => setAddress1(e.target.value)} required style={{ width: "100%" }} />
          </label>
          <label>
            <div>City</div>
            <input value={city} onChange={(e) => setCity(e.target.value)} required style={{ width: "100%" }} />
          </label>
          <label>
            <div>State</div>
            <input value={state} onChange={(e) => setState(e.target.value)} required style={{ width: "100%" }} />
          </label>
          <label>
            <div>ZIP (optional)</div>
            <input value={zip} onChange={(e) => setZip(e.target.value)} style={{ width: "100%" }} />
          </label>
          <label>
            <div>Venue URL (optional)</div>
            <input value={venueUrl} onChange={(e) => setVenueUrl(e.target.value)} style={{ width: "100%" }} />
          </label>
          <label>
            <div>Sport</div>
            <select
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
            >
              <option value="soccer">Soccer</option>
              <option value="basketball">Basketball</option>
              <option value="football">Football</option>
            </select>
          </label>
          <label>
            <div>Latitude (optional)</div>
            <input value={latitude} onChange={(e) => setLatitude(e.target.value)} style={{ width: "100%" }} />
          </label>
          <label>
            <div>Longitude (optional)</div>
            <input value={longitude} onChange={(e) => setLongitude(e.target.value)} style={{ width: "100%" }} />
          </label>
          <label>
            <div>Search Google Places</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Venue name"
                style={{ width: "100%" }}
              />
              <button
                type="button"
                onClick={async () => {
                  setSearching(true);
                  setError(null);
                  setSuggestions([]);
                  try {
                    const params = new URLSearchParams();
                    params.set("q", name);
                    if (city) params.set("city", city);
                    if (state) params.set("state", state);
                    const resp = await fetch(`/api/admin/venues/places?${params.toString()}`);
                    const json = await resp.json();
                    if (!resp.ok) throw new Error(json?.error || "Places search failed");
                    setSuggestions(json.results || []);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Places search failed");
                  } finally {
                    setSearching(false);
                  }
                }}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb" }}
              >
                {searching ? "Searching…" : "Search"}
              </button>
            </div>
            {suggestions.length > 0 && (
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setAddress1(s.formatted_address || address1);
                      setCity(s.city || city);
                      setState(s.state || state);
                      setZip(s.zip || zip);
                      setLatitude(s.lat != null ? String(s.lat) : latitude);
                      setLongitude(s.lng != null ? String(s.lng) : longitude);
                      setVenueUrl(s.website_uri || venueUrl);
                    }}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      background: "#f8fafc",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: "#4b5563" }}>{s.formatted_address}</div>
                    {s.website_uri && (
                      <div style={{ fontSize: 12, color: "#111827" }}>{s.website_uri}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </label>
          <label>
            <div>Field type (optional)</div>
            <input value={fieldType} onChange={(e) => setFieldType(e.target.value)} style={{ width: "100%" }} />
          </label>
          <label>
            <div>Amenities (optional)</div>
            <input value={amenities} onChange={(e) => setAmenities(e.target.value)} style={{ width: "100%" }} />
          </label>
          <label>
            <div>Player parking (optional)</div>
            <input value={playerParking} onChange={(e) => setPlayerParking(e.target.value)} style={{ width: "100%" }} />
          </label>
          <label>
            <div>Indoor</div>
            <select value={indoor} onChange={(e) => setIndoor(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <option value="">—</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label>
            <div>Field lighting</div>
            <select value={fieldLighting} onChange={(e) => setFieldLighting(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <option value="">—</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label>
            <div>Referee paid parking</div>
            <select value={paidParking} onChange={(e) => setPaidParking(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <option value="">—</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label>
            <div>Parking notes</div>
            <input value={parkingNotes} onChange={(e) => setParkingNotes(e.target.value)} style={{ width: "100%" }} />
          </label>
          <label>
            <div>Field rating (1-5)</div>
            <input value={fieldRating} onChange={(e) => setFieldRating(e.target.value)} style={{ width: "100%" }} />
          </label>
          <label>
            <div>Venue type (complex/school/stadium/park)</div>
            <input value={venueType} onChange={(e) => setVenueType(e.target.value)} style={{ width: "100%" }} />
          </label>
          <label>
            <div>Field count</div>
            <input value={fieldCount} onChange={(e) => setFieldCount(e.target.value)} style={{ width: "100%" }} />
          </label>
          <SelectBoolean label="Field monitors" value={fieldMonitors} onChange={(v) => setFieldMonitors(v)} />
          <SelectBoolean label="Referee mentors" value={refereeMentors} onChange={(v) => setRefereeMentors(v)} />
          <SelectBoolean label="Food vendors" value={foodVendors} onChange={(v) => setFoodVendors(v)} />
          <SelectBoolean label="Coffee vendors" value={coffeeVendors} onChange={(v) => setCoffeeVendors(v)} />
          <SelectBoolean label="Tournament vendors" value={tournamentVendors} onChange={(v) => setTournamentVendors(v)} />
          <label>
            <div>Referee tent (yes/no/multiple)</div>
            <input value={refereeTent} onChange={(e) => setRefereeTent(e.target.value)} style={{ width: "100%" }} />
          </label>
          <label>
            <div>Restrooms</div>
            <select value={restrooms} onChange={(e) => setRestrooms(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <option value="">—</option>
              <option value="portable">Portable</option>
              <option value="building">Building</option>
              <option value="both">Both</option>
            </select>
          </label>
          <label>
            <div>Restrooms cleanliness (1-5)</div>
            <input
              value={restroomsCleanliness}
              onChange={(e) => setRestroomsCleanliness(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>
        </div>

        <label>
          <div>Notes (optional)</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ width: "100%" }} />
        </label>

        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-start" }}>
          <button type="submit" disabled={loading} style={{ padding: "10px 14px", borderRadius: 10 }}>
            {loading ? "Creating…" : "Create venue"}
          </button>
          {error && <span style={{ color: "red" }}>{error}</span>}
        </div>
      </form>

      {createdId && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 12,
            background: "#f8fafc",
            maxWidth: 560,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Venue created</div>
          <div style={{ fontSize: 13, color: "#374151" }}>UUID:</div>
          <pre
            style={{
              background: "white",
              border: "1px solid #e5e7eb",
              padding: 10,
              borderRadius: 8,
              fontFamily: "monospace",
              fontSize: 13,
              overflowX: "auto",
            }}
          >
            {createdId}
          </pre>
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Link
                href={`/admin/owls-eye?venueId=${createdId}`}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "#111827",
                  color: "white",
                  fontWeight: 800,
                  textDecoration: "none",
                }}
              >
                Run Owl&apos;s Eye
              </Link>
              <Link
                href="/admin/venues"
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  textDecoration: "none",
                  background: "#fff",
                }}
              >
                Back to venues
              </Link>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Public map URL</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  value={tiVenueMapUrl(createdId)}
                  readOnly
                  style={{
                    flex: "1 1 220px",
                    minWidth: 220,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                  }}
                />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(tiVenueMapUrl(createdId))}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#f8fafc",
                    cursor: "pointer",
                  }}
                >
                  Copy
                </button>
                <Link
                  href={tiVenueMapUrl(createdId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    textDecoration: "none",
                  }}
                >
                  Open
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default NewVenueForm;

function SelectBoolean({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | boolean | null | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
      <div>{label}</div>
      <select
        value={value === "" || value === null || typeof value === "undefined" ? "" : value ? "true" : "false"}
        onChange={(e) => onChange(e.target.value === "" ? "" : e.target.value === "true" ? "true" : "false")}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
      >
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </label>
  );
}
