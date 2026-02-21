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
  venue_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  field_type?: string | null;
  indoor?: boolean | null;
  amenities?: string | null;
  player_parking?: string | null;
  spectator_seating?: string | null;
  bring_field_chairs?: boolean | null;
  seating_notes?: string | null;
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
  owl_run_id?: string | null;
  owl_status?: string | null;
  owl_last_run_at?: string | null;
  owl_food_count?: number | null;
  owl_coffee_count?: number | null;
  owl_hotel_count?: number | null;
  tournaments: Tournament[];
};

type Props = {
  venue: VenueItem;
  onUpdated?: (next: VenueItem) => void;
};

export default function VenueRow({ venue, onUpdated }: Props) {
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [tournaments, setTournaments] = useState<Tournament[]>(venue.tournaments || []);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Tournament[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingOwlMap, setSavingOwlMap] = useState(false);
  const [owlMapUrl, setOwlMapUrl] = useState(venue.map_url ?? "");
  const [error, setError] = useState<string | null>(null);

  const sportLabel = useMemo(() => {
    const raw = (venue.sport ?? "").trim();
    if (!raw) return "";
    return raw
      .split(",")
      .map((part) => {
        const t = part.trim().toLowerCase();
        return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
      })
      .filter(Boolean)
      .join(", ");
  }, [venue.sport]);

  const summary = useMemo(() => {
    return [venue.city, venue.state, venue.zip, sportLabel].filter(Boolean).join(" · ") || "—";
  }, [venue.city, venue.state, venue.zip, sportLabel]);

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

  const saveOwlMap = async () => {
    setSavingOwlMap(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/venues/${venue.id}/owls-eye`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ map_url: owlMapUrl }),
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error(json?.error || "Owl's Eye map save failed");
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Owl's Eye map save failed");
    } finally {
      setSavingOwlMap(false);
    }
  };

  if (hidden) return null;

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
            <VenueActions venueId={venue.id} venueName={venue.name} onRemoveFromList={() => setHidden(true)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
            <InfoItem label="Address" value={venue.address1 || venue.address || "—"} />
            <InfoItem
              label="Venue URL"
              value={venue.venue_url || "—"}
              href={venue.venue_url || undefined}
            />
            <InfoItem label="City/State/ZIP" value={[venue.city, venue.state, venue.zip].filter(Boolean).join(", ") || "—"} />
            <InfoItem
              label="Geo"
              value={
                venue.latitude && venue.longitude ? `${venue.latitude.toFixed(5)}, ${venue.longitude.toFixed(5)}` : "—"
              }
            />
            <InfoItem label="Field type" value={venue.field_type || "—"} />
            <InfoItem label="Indoor" value={boolText(venue.indoor)} />
            <InfoItem label="Amenities" value={venue.amenities || "—"} />
            <InfoItem label="Player parking" value={venue.player_parking || "—"} />
            <InfoItem label="Spectator seating" value={venue.spectator_seating || "—"} />
            <InfoItem label="Bring field chairs" value={boolText(venue.bring_field_chairs)} />
            <InfoItem label="Seating notes" value={venue.seating_notes || "—"} />
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
            <InfoItem label="Owl's Eye run" value={venue.owl_run_id || "—"} />
            <InfoItem label="Owl's Eye status" value={venue.owl_status || "—"} />
            <InfoItem
              label="Owl's Eye last run"
              value={venue.owl_last_run_at ? new Date(venue.owl_last_run_at).toLocaleString() : "—"}
            />
            <InfoItem
              label="Owl nearby counts"
              value={`food ${venue.owl_food_count ?? 0} • coffee ${venue.owl_coffee_count ?? 0} • hotels ${venue.owl_hotel_count ?? 0}`}
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
            <input
              value={owlMapUrl}
              onChange={(e) => setOwlMapUrl(e.target.value)}
              placeholder="Set Owl's Eye map URL"
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", minWidth: 280 }}
            />
            <button
              type="button"
              onClick={saveOwlMap}
              disabled={savingOwlMap}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
            >
              {savingOwlMap ? "Saving map…" : "Save Owl's Eye map"}
            </button>
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

function InfoItem({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ color: "#4b5563" }}>{label}</div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          style={{ fontWeight: 600, color: "#2563eb", textDecoration: "none", wordBreak: "break-all" }}
        >
          {value}
        </a>
      ) : (
        <div style={{ fontWeight: 600 }}>{value}</div>
      )}
    </div>
  );
}
