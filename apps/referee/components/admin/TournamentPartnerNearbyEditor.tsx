"use client";

import { useState } from "react";

type Category = "food" | "coffee" | "hotel";

type PartnerRow = {
  id: string;
  tournament_id: string;
  venue_id?: string | null;
  category: Category;
  name: string;
  address?: string | null;
  maps_url?: string | null;
  distance_meters?: number | null;
  sponsor_click_url?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type Props = {
  tournamentId: string;
  venues: Array<{ id: string; name: string | null; city?: string | null; state?: string | null }>;
};

export default function TournamentPartnerNearbyEditor({ tournamentId, venues }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newRow, setNewRow] = useState({
    venue_id: venues[0]?.id ?? "",
    name: "",
    category: "hotel" as Category,
    address: "",
    maps_url: "",
    sponsor_click_url: "",
    distance_meters: "",
    sort_order: "0",
    is_active: true,
  });

  const loadRows = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/tournaments/${tournamentId}/partner-nearby`);
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Partner fetch failed");
      setRows(Array.isArray(json?.rows) ? (json.rows as PartnerRow[]) : []);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Partner fetch failed");
    } finally {
      setLoading(false);
    }
  };

  const updateField = (id: string, key: keyof PartnerRow, value: string | boolean) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        if (key === "distance_meters" || key === "sort_order") {
          const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : null;
          return { ...row, [key]: Number.isFinite(parsed as number) ? parsed : null };
        }
        return { ...row, [key]: value };
      })
    );
  };

  const saveRow = async (row: PartnerRow) => {
    setBusyId(row.id);
    setError(null);
    setSaved(null);
    try {
      const resp = await fetch(`/api/admin/tournaments/${tournamentId}/partner-nearby`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          venue_id: row.venue_id ?? "",
          name: row.name,
          category: row.category,
          address: row.address ?? "",
          maps_url: row.maps_url ?? "",
          sponsor_click_url: row.sponsor_click_url ?? "",
          distance_meters: row.distance_meters ?? "",
          sort_order: row.sort_order ?? 0,
          is_active: row.is_active ?? true,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Partner save failed");
      if (json?.row?.id) {
        setRows((prev) => prev.map((item) => (item.id === json.row.id ? (json.row as PartnerRow) : item)));
      }
      setSaved(`Saved ${row.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Partner save failed");
    } finally {
      setBusyId(null);
    }
  };

  const deleteRow = async (rowId: string) => {
    setBusyId(rowId);
    setError(null);
    setSaved(null);
    try {
      const resp = await fetch(`/api/admin/tournaments/${tournamentId}/partner-nearby`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rowId }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Partner delete failed");
      setRows((prev) => prev.filter((row) => row.id !== rowId));
      setSaved("Partner row deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Partner delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const addRow = async () => {
    setBusyId("new");
    setError(null);
    setSaved(null);
    try {
      if (!newRow.name.trim()) throw new Error("Name is required");
      const resp = await fetch(`/api/admin/tournaments/${tournamentId}/partner-nearby`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRow),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Partner add failed");
      if (json?.row?.id) setRows((prev) => [...prev, json.row as PartnerRow]);
      setNewRow({
        venue_id: venues[0]?.id ?? "",
        name: "",
        category: "hotel",
        address: "",
        maps_url: "",
        sponsor_click_url: "",
        distance_meters: "",
        sort_order: "0",
        is_active: true,
      });
      setSaved("Partner row added");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Partner add failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ display: "grid", gap: 10, borderTop: "1px solid #eee", paddingTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800 }}>Tournament-specific Owl&apos;s Eye partner rows</div>
          <div style={{ fontSize: 12, color: "#666" }}>
            These rows appear above the normal Owl&apos;s Eye list when the venue is opened from this tournament.
          </div>
        </div>
        {!loaded ? (
          <button
            type="button"
            onClick={loadRows}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #111", background: "#fff", fontWeight: 800 }}
          >
            {loading ? "Loading..." : "Load partner rows"}
          </button>
        ) : null}
      </div>

      {error ? <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div> : null}
      {saved ? <div style={{ fontSize: 12, color: "#166534" }}>{saved}</div> : null}

      {loaded ? (
        <>
          <div style={{ display: "grid", gap: 8 }}>
            {rows.length ? (
              rows.map((row) => (
                <div key={row.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 10, display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 120px 120px", gap: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Venue
                      <select value={row.venue_id ?? ""} onChange={(e) => updateField(row.id, "venue_id", e.target.value)} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #ccc", marginTop: 4 }}>
                        <option value="">All tournament venues</option>
                        {venues.map((venue) => (
                          <option key={venue.id} value={venue.id}>
                            {[venue.name, venue.city, venue.state].filter(Boolean).join(" • ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Name
                      <input value={row.name ?? ""} onChange={(e) => updateField(row.id, "name", e.target.value)} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #ccc", marginTop: 4 }} />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Category
                      <select value={row.category ?? "food"} onChange={(e) => updateField(row.id, "category", e.target.value)} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #ccc", marginTop: 4 }}>
                        <option value="food">Food</option>
                        <option value="coffee">Coffee</option>
                        <option value="hotel">Hotel</option>
                      </select>
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Sort order
                      <input value={row.sort_order ?? 0} onChange={(e) => updateField(row.id, "sort_order", e.target.value)} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #ccc", marginTop: 4 }} />
                    </label>
                  </div>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>
                    Address
                    <input value={row.address ?? ""} onChange={(e) => updateField(row.id, "address", e.target.value)} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #ccc", marginTop: 4 }} />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 140px", gap: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Maps URL
                      <input value={row.maps_url ?? ""} onChange={(e) => updateField(row.id, "maps_url", e.target.value)} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #ccc", marginTop: 4 }} />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Partner click URL
                      <input value={row.sponsor_click_url ?? ""} onChange={(e) => updateField(row.id, "sponsor_click_url", e.target.value)} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #ccc", marginTop: 4 }} />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Distance meters
                      <input value={row.distance_meters ?? ""} onChange={(e) => updateField(row.id, "distance_meters", e.target.value)} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #ccc", marginTop: 4 }} />
                    </label>
                  </div>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700 }}>
                    <input type="checkbox" checked={Boolean(row.is_active)} onChange={(e) => updateField(row.id, "is_active", e.target.checked)} />
                    Active
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => saveRow(row)} disabled={busyId === row.id} style={{ padding: "8px 10px", borderRadius: 8, border: "none", background: "#111", color: "#fff", fontWeight: 800 }}>
                      {busyId === row.id ? "Saving..." : "Save row"}
                    </button>
                    <button type="button" onClick={() => deleteRow(row.id)} disabled={busyId === row.id} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #b91c1c", background: "#fff", color: "#b91c1c", fontWeight: 800 }}>
                      Delete
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 12, color: "#777" }}>No tournament-specific partner rows yet.</div>
            )}
          </div>

          <div style={{ border: "1px dashed #ccc", borderRadius: 10, padding: 10, display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800 }}>Add partner row</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 120px 120px", gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 700 }}>
                Venue
                <select value={newRow.venue_id} onChange={(e) => setNewRow((prev) => ({ ...prev, venue_id: e.target.value }))} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #ccc", marginTop: 4 }}>
                  <option value="">All tournament venues</option>
                  {venues.map((venue) => (
                    <option key={venue.id} value={venue.id}>
                      {[venue.name, venue.city, venue.state].filter(Boolean).join(" • ")}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 12, fontWeight: 700 }}>
                Name
                <input value={newRow.name} onChange={(e) => setNewRow((prev) => ({ ...prev, name: e.target.value }))} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #ccc", marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700 }}>
                Category
                <select value={newRow.category} onChange={(e) => setNewRow((prev) => ({ ...prev, category: e.target.value as Category }))} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #ccc", marginTop: 4 }}>
                  <option value="food">Food</option>
                  <option value="coffee">Coffee</option>
                  <option value="hotel">Hotel</option>
                </select>
              </label>
              <label style={{ fontSize: 12, fontWeight: 700 }}>
                Sort order
                <input value={newRow.sort_order} onChange={(e) => setNewRow((prev) => ({ ...prev, sort_order: e.target.value }))} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #ccc", marginTop: 4 }} />
              </label>
            </div>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Address
              <input value={newRow.address} onChange={(e) => setNewRow((prev) => ({ ...prev, address: e.target.value }))} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #ccc", marginTop: 4 }} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 140px", gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 700 }}>
                Maps URL
                <input value={newRow.maps_url} onChange={(e) => setNewRow((prev) => ({ ...prev, maps_url: e.target.value }))} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #ccc", marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700 }}>
                Partner click URL
                <input value={newRow.sponsor_click_url} onChange={(e) => setNewRow((prev) => ({ ...prev, sponsor_click_url: e.target.value }))} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #ccc", marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700 }}>
                Distance meters
                <input value={newRow.distance_meters} onChange={(e) => setNewRow((prev) => ({ ...prev, distance_meters: e.target.value }))} style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #ccc", marginTop: 4 }} />
              </label>
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700 }}>
              <input type="checkbox" checked={newRow.is_active} onChange={(e) => setNewRow((prev) => ({ ...prev, is_active: e.target.checked }))} />
              Active
            </label>
            <div>
              <button type="button" onClick={addRow} disabled={busyId === "new"} style={{ padding: "8px 10px", borderRadius: 8, border: "none", background: "#0f3d2e", color: "#fff", fontWeight: 800 }}>
                {busyId === "new" ? "Adding..." : "Add partner row"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
