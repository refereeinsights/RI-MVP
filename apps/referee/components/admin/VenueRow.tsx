"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import VenueActions from "@/components/admin/VenueActions";

type Tournament = { id: string; name: string | null; slug: string | null; sport?: string | null };

export type VenueItem = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  zip?: string | null;
  sport?: string | null;
  address1?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  surface?: string | null;
  field_type?: string | null;
  indoor?: boolean | null;
  lighting?: boolean | null;
  field_lighting?: boolean | null;
  parking_notes?: string | null;
  field_rating?: number | null;
  venue_type?: string | null;
  field_count?: number | null;
  field_monitors?: boolean | null;
  referee_mentors?: boolean | null;
  food_vendors?: boolean | null;
  coffee_vendors?: boolean | null;
  tournament_vendors?: boolean | null;
  referee_tent?: string | null;
  restrooms?: string | null;
  restrooms_cleanliness?: number | null;
  map_url?: string | null;
  tournaments: Tournament[];
};

type Props = {
  venue: VenueItem;
  onUpdated?: (next: VenueItem) => void;
};

export default function VenueRow({ venue, onUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [tournaments, setTournaments] = useState<Tournament[]>(venue.tournaments || []);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Tournament[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    return [venue.city, venue.state, venue.zip, venue.sport].filter(Boolean).join(" · ") || "—";
  }, [venue.city, venue.state, venue.zip, venue.sport]);

  const onSearch = async (q: string) => {
    setSearch(q);
    setError(null);
    if (q.trim().length < 2) {
      setOptions([]);
      return;
    }
    setSearching(true);
    try {
      const resp = await fetch(`/api/admin/tournaments/search?q=${encodeURIComponent(q)}`);
      const json = await resp.json();
      setOptions((json?.results ?? []) as Tournament[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const addTournament = (t: Tournament) => {
    if (tournaments.find((x) => x.id === t.id)) return;
    const next = [...tournaments, t];
    setTournaments(next);
    setOptions([]);
    setSearch("");
  };

  const removeTournament = (id: string) => {
    setTournaments((prev) => prev.filter((t) => t.id !== id));
  };

  const saveLinks = async () => {
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/venues/${venue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournament_ids: tournaments.map((t) => t.id) }),
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error(json?.error || "Save failed");
      }
      if (onUpdated) {
        onUpdated({ ...venue, tournaments });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 14px",
          background: "#f9fafb",
          border: "none",
          cursor: "pointer",
        }}
      >
        <div>
          <div style={{ fontWeight: 700 }}>{venue.name || "Untitled"}</div>
          <div style={{ fontSize: 13, color: "#4b5563" }}>{summary}</div>
        </div>
        <div style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>›</div>
      </button>

      {open && (
        <div style={{ padding: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ fontFamily: "monospace", fontSize: 12, color: "#374151" }}>{venue.id}</div>
            <VenueActions venueId={venue.id} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
            <InfoItem label="Address" value={venue.address1 || venue.address || "—"} />
            <InfoItem label="City/State/ZIP" value={[venue.city, venue.state, venue.zip].filter(Boolean).join(", ") || "—"} />
            <InfoItem
              label="Geo"
              value={
                venue.latitude && venue.longitude ? `${venue.latitude.toFixed(5)}, ${venue.longitude.toFixed(5)}` : "—"
              }
            />
            <InfoItem label="Surface" value={venue.surface || "—"} />
            <InfoItem label="Field type" value={venue.field_type || "—"} />
            <InfoItem label="Indoor" value={boolText(venue.indoor)} />
            <InfoItem label="Lighting" value={boolText(venue.lighting ?? venue.field_lighting)} />
            <InfoItem label="Parking" value={venue.parking_notes || "—"} />
            <InfoItem label="Field rating" value={venue.field_rating ? `${venue.field_rating}/5` : "—"} />
            <InfoItem label="Venue type" value={venue.venue_type || "—"} />
            <InfoItem label="Field count" value={venue.field_count != null ? String(venue.field_count) : "—"} />
            <InfoItem label="Field monitors" value={boolText(venue.field_monitors)} />
            <InfoItem label="Referee mentors" value={boolText(venue.referee_mentors)} />
            <InfoItem label="Food vendors" value={boolText(venue.food_vendors)} />
            <InfoItem label="Coffee vendors" value={boolText(venue.coffee_vendors)} />
            <InfoItem label="Tournament vendors" value={boolText(venue.tournament_vendors)} />
            <InfoItem label="Referee tent" value={venue.referee_tent || "—"} />
            <InfoItem label="Restrooms" value={venue.restrooms || "—"} />
            <InfoItem
              label="Restroom cleanliness"
              value={venue.restrooms_cleanliness ? `${venue.restrooms_cleanliness}/5` : "—"}
            />
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Link
              href={`/admin/owls-eye?venueId=${venue.id}`}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                background: "#111827",
                color: "white",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Run Owl&apos;s Eye
            </Link>
            {venue.map_url ? (
              <Link
                href={venue.map_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#e0f2fe",
                  textDecoration: "none",
                  fontSize: 12,
                }}
              >
                View Owl&apos;s Eye Map
              </Link>
            ) : (
              <span style={{ fontSize: 12, color: "#6b7280" }}>No Owl&apos;s Eye map yet</span>
            )}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 700 }}>Tournaments</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {tournaments.length === 0 && <span style={{ color: "#6b7280", fontSize: 13 }}>None linked</span>}
              {tournaments.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#f8fafc",
                    fontSize: 12,
                  }}
                >
                  <Link
                    href={`/admin?tab=tournament-listings&q=${encodeURIComponent(t.slug || t.name || t.id)}`}
                    style={{ textDecoration: "none", color: "#111827" }}
                  >
                    {t.name || t.slug || t.id} {t.sport ? `· ${t.sport}` : ""}
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeTournament(t.id)}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "#b91c1c",
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search tournaments by name or slug"
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", minWidth: 240 }}
              />
              {searching && <span style={{ fontSize: 12, color: "#6b7280" }}>Searching…</span>}
              {error && <span style={{ fontSize: 12, color: "#b91c1c" }}>{error}</span>}
            </div>
            {options.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => addTournament(opt)}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {opt.name || opt.slug || opt.id} {opt.sport ? `· ${opt.sport}` : ""}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                onClick={saveLinks}
                disabled={saving}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb" }}
              >
                {saving ? "Saving…" : "Save tournament links"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function boolText(val: boolean | null | undefined) {
  if (val === true) return "Yes";
  if (val === false) return "No";
  return "—";
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ color: "#4b5563" }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}
