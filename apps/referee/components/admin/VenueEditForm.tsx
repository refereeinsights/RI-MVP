"use client";

import { useState } from "react";
import Link from "next/link";

type Venue = Record<string, any> & { id: string };
type Tournament = { id: string; name: string | null; slug: string | null; sport?: string | null };

type Props = {
  venue: Venue;
  tournaments: Tournament[];
};

const booleanFields = [
  "indoor",
  "lighting",
  "field_lighting",
  "field_monitors",
  "referee_mentors",
  "food_vendors",
  "coffee_vendors",
  "tournament_vendors",
];

export default function VenueEditForm({ venue, tournaments }: Props) {
  const [form, setForm] = useState<Record<string, any>>({
    name: venue.name ?? "",
    address1: venue.address1 ?? venue.address ?? "",
    city: venue.city ?? "",
    state: venue.state ?? "",
    zip: venue.zip ?? "",
    sport: venue.sport ?? "",
    notes: venue.notes ?? "",
    latitude: venue.latitude ?? "",
    longitude: venue.longitude ?? "",
    venue_url: venue.venue_url ?? "",
    normalized_address: venue.normalized_address ?? "",
    geocode_source: venue.geocode_source ?? "",
    timezone: venue.timezone ?? "",
    surface: venue.surface ?? "",
    field_type: venue.field_type ?? "",
    indoor: venue.indoor ?? "",
    lighting: venue.lighting ?? "",
    field_lighting: venue.field_lighting ?? "",
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

  const setField = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
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
          <Input label="Sport" value={form.sport} onChange={(v) => setField("sport", v)} />
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
          <Input label="Surface" value={form.surface} onChange={(v) => setField("surface", v)} />
          <Input label="Field type" value={form.field_type} onChange={(v) => setField("field_type", v)} />
          <SelectBoolean label="Indoor" value={form.indoor} onChange={(v) => setField("indoor", v)} />
          <SelectBoolean label="Lighting" value={form.lighting} onChange={(v) => setField("lighting", v)} />
          <SelectBoolean label="Field lighting" value={form.field_lighting} onChange={(v) => setField("field_lighting", v)} />
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
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
          <Input label="Referee tent (yes/no/multiple)" value={form.referee_tent} onChange={(v) => setField("referee_tent", v)} />
          <Input label="Restrooms (portable/building/both)" value={form.restrooms} onChange={(v) => setField("restrooms", v)} />
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
