"use client";

import { useState } from "react";
import Link from "next/link";

type Venue = Record<string, any> & { id: string };
type Tournament = { id: string; name: string | null; slug: string | null; sport?: string | null };
type OwlNearbyRow = {
  id: string;
  run_id: string;
  place_id?: string | null;
  name?: string | null;
  category?: string | null;
  address?: string | null;
  maps_url?: string | null;
  distance_meters?: number | null;
  is_sponsor?: boolean | null;
  sponsor_click_url?: string | null;
  created_at?: string | null;
};

type Props = {
  venue: Venue;
  tournaments: Tournament[];
  owlNearby?: OwlNearbyRow[];
};

const booleanFields = [
  "indoor",
  "field_monitors",
  "referee_mentors",
  "food_vendors",
  "coffee_vendors",
  "tournament_vendors",
  "bring_field_chairs",
];

const VENUE_SPORT_OPTIONS = ["soccer", "baseball", "lacrosse", "basketball", "hockey", "volleyball", "futsal"] as const;

function normalizeVenueSportValue(value: unknown) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return VENUE_SPORT_OPTIONS.includes(text as (typeof VENUE_SPORT_OPTIONS)[number]) ? text : "";
}

export default function VenueEditForm({ venue, tournaments, owlNearby = [] }: Props) {
  const [form, setForm] = useState<Record<string, any>>({
    name: venue.name ?? "",
    address1: venue.address1 ?? venue.address ?? "",
    city: venue.city ?? "",
    state: venue.state ?? "",
    zip: venue.zip ?? "",
    sport: normalizeVenueSportValue(venue.sport),
    notes: venue.notes ?? "",
    latitude: venue.latitude ?? "",
    longitude: venue.longitude ?? "",
    venue_url: venue.venue_url ?? "",
    normalized_address: venue.normalized_address ?? "",
    geocode_source: venue.geocode_source ?? "",
    timezone: venue.timezone ?? "",
    field_type: venue.field_type ?? "",
    indoor: venue.indoor ?? "",
    amenities: venue.amenities ?? "",
    player_parking: venue.player_parking ?? "",
    spectator_seating: venue.spectator_seating ?? "",
    bring_field_chairs: venue.bring_field_chairs ?? "",
    seating_notes: venue.seating_notes ?? "",
    ref_paid_parking: venue.ref_paid_parking ?? "",
    parking_notes: venue.parking_notes ?? "",
    field_rating: venue.field_rating ?? "",
    venue_type: venue.venue_type ?? "",
    field_count: venue.field_count ?? "",
    field_monitors: venue.field_monitors ?? "",
    referee_mentors: venue.referee_mentors ?? "",
    food_vendors: venue.food_vendors ?? "",
    coffee_vendors: venue.coffee_vendors ?? "",
    tournament_vendors: venue.tournament_vendors ?? "",
    referee_tent: venue.referee_tent ?? "",
    restrooms: venue.restrooms ?? "",
    restrooms_cleanliness: venue.restrooms_cleanliness ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [nearbyRows, setNearbyRows] = useState<OwlNearbyRow[]>(owlNearby);
  const [nearbyBusyId, setNearbyBusyId] = useState<string | null>(null);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [nearbySaved, setNearbySaved] = useState<string | null>(null);
  const [newNearby, setNewNearby] = useState<{
    name: string;
    category: "food" | "coffee" | "hotel";
    address: string;
    maps_url: string;
    distance_meters: string;
  }>({
    name: "",
    category: "food",
    address: "",
    maps_url: "",
    distance_meters: "",
  });

  const setField = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateNearbyField = (id: string, key: keyof OwlNearbyRow, value: string | boolean) => {
    setNearbyRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        if (key === "distance_meters") {
          const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : null;
          return { ...row, distance_meters: Number.isFinite(parsed as number) ? (parsed as number) : null };
        }
        return { ...row, [key]: value };
      })
    );
  };

  const saveNearbyRow = async (row: OwlNearbyRow) => {
    setNearbyError(null);
    setNearbySaved(null);
    setNearbyBusyId(row.id);
    try {
      const resp = await fetch(`/api/admin/venues/${venue.id}/owls-eye/nearby`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          name: row.name ?? "",
          category: row.category ?? "food",
          address: row.address ?? "",
          maps_url: row.maps_url ?? "",
          distance_meters: row.distance_meters ?? "",
          is_sponsor: row.is_sponsor ?? false,
          sponsor_click_url: row.sponsor_click_url ?? "",
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Nearby update failed");
      if (json?.row?.id) {
        setNearbyRows((prev) => prev.map((r) => (r.id === json.row.id ? (json.row as OwlNearbyRow) : r)));
      }
      setNearbySaved(`Saved ${row.name || "row"}`);
    } catch (err) {
      setNearbyError(err instanceof Error ? err.message : "Nearby update failed");
    } finally {
      setNearbyBusyId(null);
    }
  };

  const deleteNearbyRow = async (rowId: string) => {
    setNearbyError(null);
    setNearbySaved(null);
    setNearbyBusyId(rowId);
    try {
      const resp = await fetch(`/api/admin/venues/${venue.id}/owls-eye/nearby`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rowId }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Nearby delete failed");
      setNearbyRows((prev) => prev.filter((r) => r.id !== rowId));
      setNearbySaved("Nearby row deleted");
    } catch (err) {
      setNearbyError(err instanceof Error ? err.message : "Nearby delete failed");
    } finally {
      setNearbyBusyId(null);
    }
  };

  const addNearbyRow = async () => {
    setNearbyError(null);
    setNearbySaved(null);
    setNearbyBusyId("new");
    try {
      if (!newNearby.name.trim()) {
        throw new Error("Name is required");
      }
      const resp = await fetch(`/api/admin/venues/${venue.id}/owls-eye/nearby`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newNearby),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Nearby insert failed");
      if (json?.row?.id) {
        setNearbyRows((prev) => [...prev, json.row as OwlNearbyRow]);
      }
      setNewNearby({ name: "", category: "food", address: "", maps_url: "", distance_meters: "" });
      setNearbySaved("Nearby row added");
    } catch (err) {
      setNearbyError(err instanceof Error ? err.message : "Nearby insert failed");
    } finally {
      setNearbyBusyId(null);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const payload = { ...form };
      booleanFields.forEach((key) => {
        if (payload[key] === "") payload[key] = null;
      });

      const resp = await fetch(`/api/admin/venues/${venue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error(json?.error || "Save failed");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <Input label="Name" value={form.name} onChange={(v) => setField("name", v)} required />
          <Input label="Address" value={form.address1} onChange={(v) => setField("address1", v)} />
          <Input label="City" value={form.city} onChange={(v) => setField("city", v)} />
          <Input label="State" value={form.state} onChange={(v) => setField("state", v)} />
          <Input label="ZIP" value={form.zip} onChange={(v) => setField("zip", v)} />
          <SelectVenueSport label="Sport" value={form.sport} onChange={(v) => setField("sport", v)} />
          <Input label="Venue URL" value={form.venue_url} onChange={(v) => setField("venue_url", v)} />
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <Input label="Latitude" value={form.latitude} onChange={(v) => setField("latitude", v)} />
          <Input label="Longitude" value={form.longitude} onChange={(v) => setField("longitude", v)} />
          <Input label="Normalized address" value={form.normalized_address} onChange={(v) => setField("normalized_address", v)} />
          <Input label="Geocode source" value={form.geocode_source} onChange={(v) => setField("geocode_source", v)} />
          <Input label="Timezone" value={form.timezone} onChange={(v) => setField("timezone", v)} />
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <Input label="Field type" value={form.field_type} onChange={(v) => setField("field_type", v)} />
          <SelectBoolean label="Indoor" value={form.indoor} onChange={(v) => setField("indoor", v)} />
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <Input label="Amenities" value={form.amenities} onChange={(v) => setField("amenities", v)} />
          <Input label="Player parking" value={form.player_parking} onChange={(v) => setField("player_parking", v)} />
          <SelectSpectatorSeating
            label="Spectator seating"
            value={form.spectator_seating}
            onChange={(v) => setField("spectator_seating", v)}
          />
          <SelectBoolean
            label="Bring field chairs"
            value={form.bring_field_chairs}
            onChange={(v) => setField("bring_field_chairs", v)}
          />
          <Input label="Seating notes" value={form.seating_notes} onChange={(v) => setField("seating_notes", v)} />
          <Input label="Parking notes" value={form.parking_notes} onChange={(v) => setField("parking_notes", v)} />
          <Input label="Field rating (1-5)" value={form.field_rating} onChange={(v) => setField("field_rating", v)} />
          <Input label="Venue type (complex/school/stadium/park)" value={form.venue_type} onChange={(v) => setField("venue_type", v)} />
          <Input label="Field count" value={form.field_count} onChange={(v) => setField("field_count", v)} />
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <SelectBoolean label="Field monitors" value={form.field_monitors} onChange={(v) => setField("field_monitors", v)} />
          <SelectBoolean label="Referee mentors" value={form.referee_mentors} onChange={(v) => setField("referee_mentors", v)} />
          <SelectBoolean label="Food vendors" value={form.food_vendors} onChange={(v) => setField("food_vendors", v)} />
          <SelectBoolean label="Coffee vendors" value={form.coffee_vendors} onChange={(v) => setField("coffee_vendors", v)} />
          <SelectBoolean label="Tournament vendors" value={form.tournament_vendors} onChange={(v) => setField("tournament_vendors", v)} />
          <SelectBoolean label="Referee paid parking" value={form.ref_paid_parking} onChange={(v) => setField("ref_paid_parking", v)} />
          <Input label="Referee tent (yes/no/multiple)" value={form.referee_tent} onChange={(v) => setField("referee_tent", v)} />
          <SelectRestrooms label="Restrooms" value={form.restrooms} onChange={(v) => setField("restrooms", v)} />
          <Input label="Restrooms cleanliness (1-5)" value={form.restrooms_cleanliness} onChange={(v) => setField("restrooms_cleanliness", v)} />
        </div>

        <label>
          <div>Notes</div>
          <textarea
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
            rows={3}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
        </label>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button type="submit" disabled={saving} style={{ padding: "10px 14px", borderRadius: 10 }}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          {saved && <span style={{ color: "#16a34a", fontSize: 13 }}>Saved</span>}
          {error && <span style={{ color: "#b91c1c", fontSize: 13 }}>{error}</span>}
        </div>
      </form>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Linked tournaments</div>
        {tournaments.length === 0 ? (
          <div style={{ color: "#6b7280", fontSize: 13 }}>No tournaments linked.</div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {tournaments.map((t) => (
              <Link
                key={t.id}
                href={`/admin?tab=tournament-listings&q=${encodeURIComponent(t.slug || t.name || t.id)}`}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  textDecoration: "none",
                  fontSize: 12,
                  background: "#f8fafc",
                }}
              >
                {t.name || t.slug || t.id} {t.sport ? `· ${t.sport}` : ""}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Owl&apos;s Eye nearby results (latest run)</div>
          <Link
            href={`/admin/owls-eye?venueId=${venue.id}`}
            style={{ fontSize: 12, color: "#1d4ed8", textDecoration: "none", fontWeight: 700 }}
          >
            Open Owl&apos;s Eye tool
          </Link>
        </div>

        {nearbyRows.length === 0 ? <div style={{ color: "#6b7280", fontSize: 13 }}>No nearby rows yet.</div> : null}

        {nearbyRows.map((row) => (
          <div
            key={row.id}
            style={{
              display: "grid",
              gap: 8,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 8,
              background: "#f8fafc",
            }}
          >
            <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
              id: {row.id} • place_id: {row.place_id || "—"}
            </div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr 2fr 2fr 1fr auto auto" }}>
              <Input label="Name" value={row.name ?? ""} onChange={(v) => updateNearbyField(row.id, "name", v)} />
              <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                <div>Category</div>
                <select
                  value={row.category || "food"}
                  onChange={(e) => updateNearbyField(row.id, "category", e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                >
                  <option value="food">Food</option>
                  <option value="coffee">Coffee</option>
                  <option value="hotel">Hotel</option>
                </select>
              </label>
              <Input label="Address" value={row.address ?? ""} onChange={(v) => updateNearbyField(row.id, "address", v)} />
              <Input label="Maps URL" value={row.maps_url ?? ""} onChange={(v) => updateNearbyField(row.id, "maps_url", v)} />
              <Input
                label="Distance (m)"
                value={row.distance_meters ?? ""}
                onChange={(v) => updateNearbyField(row.id, "distance_meters", v)}
              />
              <button
                type="button"
                onClick={() => saveNearbyRow(row)}
                disabled={nearbyBusyId === row.id}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", alignSelf: "end" }}
              >
                {nearbyBusyId === row.id ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => deleteNearbyRow(row.id)}
                disabled={nearbyBusyId === row.id}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #ef4444",
                  color: "#b91c1c",
                  background: "#fff",
                  alignSelf: "end",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10, display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Add nearby row</div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr 2fr 2fr 1fr auto" }}>
            <Input
              label="Name"
              value={newNearby.name}
              onChange={(v) => setNewNearby((prev) => ({ ...prev, name: v }))}
            />
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              <div>Category</div>
              <select
                value={newNearby.category}
                onChange={(e) => setNewNearby((prev) => ({ ...prev, category: e.target.value as "food" | "coffee" | "hotel" }))}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
              >
                <option value="food">Food</option>
                <option value="coffee">Coffee</option>
                <option value="hotel">Hotel</option>
              </select>
            </label>
            <Input
              label="Address"
              value={newNearby.address}
              onChange={(v) => setNewNearby((prev) => ({ ...prev, address: v }))}
            />
            <Input
              label="Maps URL"
              value={newNearby.maps_url}
              onChange={(v) => setNewNearby((prev) => ({ ...prev, maps_url: v }))}
            />
            <Input
              label="Distance (m)"
              value={newNearby.distance_meters}
              onChange={(v) => setNewNearby((prev) => ({ ...prev, distance_meters: v }))}
            />
            <button
              type="button"
              onClick={addNearbyRow}
              disabled={nearbyBusyId === "new"}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", alignSelf: "end" }}
            >
              {nearbyBusyId === "new" ? "Adding…" : "Add"}
            </button>
          </div>
        </div>

        {nearbySaved ? <div style={{ color: "#16a34a", fontSize: 13 }}>{nearbySaved}</div> : null}
        {nearbyError ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{nearbyError}</div> : null}
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
      <div>{label}</div>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
      />
    </label>
  );
}

function SelectBoolean({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | "" | null | undefined;
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

function SelectRestrooms({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
      <div>{label}</div>
      <select
        value={(() => {
          const raw = (value ?? "").toString().trim();
          const normalized = raw.toLowerCase();
          if (normalized === "portable" || normalized === "portables") return "Portable";
          if (normalized === "building" || normalized === "bathroom" || normalized === "bathrooms") return "Building";
          if (normalized === "both" || normalized === "portable and building" || normalized === "building and portable")
            return "Both";
          if (raw === "Portable" || raw === "Building" || raw === "Both") return raw;
          return "";
        })()}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
      >
        <option value="">—</option>
        <option value="Portable">Portable</option>
        <option value="Building">Building</option>
        <option value="Both">Both</option>
      </select>
    </label>
  );
}

function SelectVenueSport({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
      <div>{label}</div>
      <select
        value={normalizeVenueSportValue(value)}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
      >
        <option value="">—</option>
        <option value="soccer">Soccer</option>
        <option value="baseball">Baseball</option>
        <option value="lacrosse">Lacrosse</option>
        <option value="basketball">Basketball</option>
        <option value="hockey">Hockey</option>
        <option value="volleyball">Volleyball</option>
        <option value="futsal">Futsal</option>
      </select>
    </label>
  );
}

function SelectSpectatorSeating({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
      <div>{label}</div>
      <select
        value={(value ?? "").toString()}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
      >
        <option value="">—</option>
        <option value="none">None</option>
        <option value="limited">Limited</option>
        <option value="bleachers">Bleachers</option>
        <option value="covered_bleachers">Covered bleachers</option>
        <option value="mixed">Mixed</option>
      </select>
    </label>
  );
}
