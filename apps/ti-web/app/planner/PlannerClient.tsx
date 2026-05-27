"use client";

import { useEffect, useMemo, useState } from "react";
import UpgradeWeekendProButton from "@/components/UpgradeWeekendProButton";
import type {
  PlannerEventCreateBody,
  PlannerEventRow,
  PlannerEventType,
  PlannerEventUpdateBody,
} from "@/lib/planner/types";
import styles from "./Planner.module.css";

type Props = {
  initialEvents: PlannerEventRow[];
  isPaid: boolean;
};

type PlannerSourceRow = {
  id: string;
  source_type: string;
  source_name: string | null;
  team_name: string | null;
  last_synced_at: string | null;
  sync_status: string | null;
  sync_error: string | null;
  created_at: string | null;
};

type VenueSearchResult = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
};

type TournamentSearchResult = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
};

const EVENT_TYPES: { value: PlannerEventType; label: string }[] = [
  { value: "game", label: "Game" },
  { value: "practice", label: "Practice" },
  { value: "travel", label: "Travel" },
  { value: "hotel", label: "Hotel" },
  { value: "meal", label: "Meal" },
  { value: "check_in", label: "Check-in" },
  { value: "referee_assignment", label: "Referee assignment" },
  { value: "other", label: "Other" },
];

function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function safeTimeZone(value: string | null) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v }).format(new Date());
    return v;
  } catch {
    return null;
  }
}

function toDateTimeLocalValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function dayKey(iso: string, timeZone: string | null) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "invalid";
  const tz = safeTimeZone(timeZone) || "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function formatDayLabel(dayIso: string, timeZone: string | null) {
  // dayIso is YYYY-MM-DD, treat as UTC date anchor.
  const d = new Date(`${dayIso}T00:00:00Z`);
  const tz = safeTimeZone(timeZone) || "UTC";
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function formatTimeRange(params: { startIso: string; endIso?: string | null; timeZone: string | null }) {
  const start = new Date(params.startIso);
  if (Number.isNaN(start.getTime())) return "";
  const tz = safeTimeZone(params.timeZone) || "UTC";
  const fmt = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const startText = fmt.format(start);
  if (!params.endIso) return startText;
  const end = new Date(params.endIso);
  if (Number.isNaN(end.getTime())) return startText;
  const endText = fmt.format(end);
  return `${startText} – ${endText}`;
}

function formatDateRangeLabel(start: string | null, end: string | null) {
  if (!start && !end) return null;
  const s = start ? new Date(`${start}T00:00:00Z`) : null;
  const e = end ? new Date(`${end}T00:00:00Z`) : null;
  const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
  const sText = s && !Number.isNaN(s.getTime()) ? fmt.format(s) : null;
  const eText = e && !Number.isNaN(e.getTime()) ? fmt.format(e) : null;
  if (sText && eText) return `${sText} – ${eText}`;
  return sText || eText;
}

function mapsSearchUrl(query: string) {
  const q = String(query ?? "").trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function appleMapsUrl(query: string) {
  const q = String(query ?? "").trim();
  if (!q) return null;
  return `https://maps.apple.com/?q=${encodeURIComponent(q)}`;
}

function wazeUrl(query: string) {
  const q = String(query ?? "").trim();
  if (!q) return null;
  return `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`;
}

function isLikelyMobile() {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia?.("(pointer: coarse)").matches) return true;
  } catch {
    // ignore
  }
  const ua = String(navigator.userAgent || "").toLowerCase();
  return ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod") || ua.includes("android");
}

async function jsonFetch<T>(url: string, init: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
  const json = (await res.json().catch(() => null)) as T | null;
  if (!res.ok) {
    const msg =
      (json as any)?.error ||
      (json as any)?.message ||
      `Request failed (${res.status})`;
    throw new Error(String(msg));
  }
  return json as T;
}

export default function PlannerClient(props: Props) {
  const tz = useMemo(() => browserTimeZone(), []);
  const [events, setEvents] = useState<PlannerEventRow[]>(props.initialEvents ?? []);
  const [sources, setSources] = useState<PlannerSourceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sourcesBusy, setSourcesBusy] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importSourceName, setImportSourceName] = useState("");
  const [importTeamName, setImportTeamName] = useState("");
  const [importResult, setImportResult] = useState<string | null>(null);

  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [mapPickerQuery, setMapPickerQuery] = useState<string>("");

  const [createTitle, setCreateTitle] = useState("");
  const [createType, setCreateType] = useState<PlannerEventType>("game");
  const [createStartsLocal, setCreateStartsLocal] = useState("");
  const [createEndsLocal, setCreateEndsLocal] = useState("");
  const [createVenueId, setCreateVenueId] = useState("");
  const [createVenueQuery, setCreateVenueQuery] = useState("");
  const [createVenueResults, setCreateVenueResults] = useState<VenueSearchResult[]>([]);
  const [createVenueSearching, setCreateVenueSearching] = useState(false);
  const [createSelectedVenue, setCreateSelectedVenue] = useState<VenueSearchResult | null>(null);

  const [createTournamentId, setCreateTournamentId] = useState("");
  const [createTournamentQuery, setCreateTournamentQuery] = useState("");
  const [createTournamentResults, setCreateTournamentResults] = useState<TournamentSearchResult[]>([]);
  const [createTournamentSearching, setCreateTournamentSearching] = useState(false);
  const [createSelectedTournament, setCreateSelectedTournament] = useState<TournamentSearchResult | null>(null);
  const [createAddress, setCreateAddress] = useState("");
  const [createCity, setCreateCity] = useState("");
  const [createState, setCreateState] = useState("");
  const [createNotes, setCreateNotes] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const editingEvent = events.find((e) => e.id === editingId) ?? null;

  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState<PlannerEventType>("game");
  const [editStartsLocal, setEditStartsLocal] = useState("");
  const [editEndsLocal, setEditEndsLocal] = useState("");
  const [editVenueId, setEditVenueId] = useState("");
  const [editVenueQuery, setEditVenueQuery] = useState("");
  const [editVenueResults, setEditVenueResults] = useState<VenueSearchResult[]>([]);
  const [editVenueSearching, setEditVenueSearching] = useState(false);
  const [editSelectedVenue, setEditSelectedVenue] = useState<VenueSearchResult | null>(null);

  const [editTournamentId, setEditTournamentId] = useState("");
  const [editTournamentQuery, setEditTournamentQuery] = useState("");
  const [editTournamentResults, setEditTournamentResults] = useState<TournamentSearchResult[]>([]);
  const [editTournamentSearching, setEditTournamentSearching] = useState(false);
  const [editSelectedTournament, setEditSelectedTournament] = useState<TournamentSearchResult | null>(null);
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editState, setEditState] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const effectiveTimeZoneForEvent = (e: PlannerEventRow) => safeTimeZone(e.timezone) || tz || "UTC";
  const locationTextForEvent = (e: PlannerEventRow) => [e.address_text, e.city, e.state].filter(Boolean).join(", ").trim();
  const mapsUrlForEvent = (e: PlannerEventRow) => {
    const loc = locationTextForEvent(e);
    if (!loc) return null;
    return mapsSearchUrl(loc);
  };

  function openMapForEvent(e: PlannerEventRow) {
    const loc = locationTextForEvent(e);
    if (!loc) return;

    if (isLikelyMobile()) {
      setMapPickerQuery(loc);
      setMapPickerOpen(true);
      return;
    }

    const url = mapsSearchUrl(loc);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  const applyVenueToCreateLocationIfEmpty = (v: VenueSearchResult) => {
    const address = String(v.address ?? "").trim();
    const city = String(v.city ?? "").trim();
    const state = String(v.state ?? "").trim();
    if (!createAddress.trim() && address) setCreateAddress(address);
    if (!createCity.trim() && city) setCreateCity(city);
    if (!createState.trim() && state) setCreateState(state);
  };

  const applyVenueToEditLocationIfEmpty = (v: VenueSearchResult) => {
    const address = String(v.address ?? "").trim();
    const city = String(v.city ?? "").trim();
    const state = String(v.state ?? "").trim();
    if (!editAddress.trim() && address) setEditAddress(address);
    if (!editCity.trim() && city) setEditCity(city);
    if (!editState.trim() && state) setEditState(state);
  };

  async function loadEvents() {
    const res = await jsonFetch<{ ok: true; events: PlannerEventRow[] }>("/api/planner/events", { method: "GET" });
    setEvents((res.events ?? []).slice().sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))));
  }

  async function loadSources() {
    setSourcesBusy(true);
    try {
      const res = await jsonFetch<{ ok: true; sources: PlannerSourceRow[] }>("/api/planner/sources", { method: "GET" });
      setSources(res.sources ?? []);
    } finally {
      setSourcesBusy(false);
    }
  }

  // Best-effort initial load of sources (planner page is authed; no sensitive URL returned).
  useEffect(() => {
    void loadSources().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const groups = new Map<string, PlannerEventRow[]>();
    for (const e of events) {
      const groupTz = effectiveTimeZoneForEvent(e);
      const key = dayKey(e.starts_at, groupTz);
      const list = groups.get(key) ?? [];
      list.push(e);
      groups.set(key, list);
    }
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return sortedKeys.map((key) => ({ key, events: (groups.get(key) ?? []).slice() }));
  }, [events, tz]);

  function resetCreateForm() {
    setCreateTitle("");
    setCreateType("game");
    setCreateStartsLocal("");
    setCreateEndsLocal("");
    setCreateVenueId("");
    setCreateVenueQuery("");
    setCreateVenueResults([]);
    setCreateVenueSearching(false);
    setCreateSelectedVenue(null);
    setCreateTournamentId("");
    setCreateTournamentQuery("");
    setCreateTournamentResults([]);
    setCreateTournamentSearching(false);
    setCreateSelectedTournament(null);
    setCreateAddress("");
    setCreateCity("");
    setCreateState("");
    setCreateNotes("");
  }

  function resetImportForm() {
    setImportUrl("");
    setImportSourceName("");
    setImportTeamName("");
    setImportResult(null);
  }

  function beginEdit(e: PlannerEventRow) {
    setEditingId(e.id);
    setEditTitle(e.title ?? "");
    setEditType((e.event_type as PlannerEventType) || "game");
    setEditStartsLocal(toDateTimeLocalValue(e.starts_at));
    setEditEndsLocal(toDateTimeLocalValue(e.ends_at));
    setEditVenueId(e.venue_id ?? "");
    setEditSelectedVenue(null);
    setEditVenueQuery("");
    setEditVenueResults([]);
    setEditVenueSearching(false);
    setEditTournamentId(e.tournament_id ?? "");
    setEditSelectedTournament(null);
    setEditTournamentQuery("");
    setEditTournamentResults([]);
    setEditTournamentSearching(false);
    setEditAddress(e.address_text ?? "");
    setEditCity(e.city ?? "");
    setEditState(e.state ?? "");
    setEditNotes(e.notes ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function onCreate() {
    setError(null);
    setNotice(null);
    if (!createTitle.trim()) {
      setError("Title is required.");
      return;
    }
    if (!createStartsLocal) {
      setError("Start time is required.");
      return;
    }

    const startsIso = new Date(createStartsLocal).toISOString();
    const endsIso = createEndsLocal ? new Date(createEndsLocal).toISOString() : null;

    const body: PlannerEventCreateBody = {
      title: createTitle.trim(),
      event_type: createType,
      starts_at: startsIso,
      ends_at: endsIso,
      timezone: tz,
      tournament_id: createTournamentId.trim() || null,
      venue_id: createVenueId.trim() || null,
      address_text: createAddress.trim() || null,
      city: createCity.trim() || null,
      state: createState.trim() || null,
      notes: createNotes.trim() || null,
    };

    setBusy(true);
    try {
      const res = await jsonFetch<{ ok: true; event: PlannerEventRow }>("/api/planner/events", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setEvents((prev) => [...prev, res.event].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      resetCreateForm();
    } catch (e: any) {
      setError(e?.message || "Failed to create event.");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit() {
    if (!editingEvent) return;
    setError(null);
    setNotice(null);
    if (!editTitle.trim()) {
      setError("Title is required.");
      return;
    }
    if (!editStartsLocal) {
      setError("Start time is required.");
      return;
    }

    const startsIso = new Date(editStartsLocal).toISOString();
    const endsIso = editEndsLocal ? new Date(editEndsLocal).toISOString() : null;

    const body: PlannerEventUpdateBody = {
      title: editTitle.trim(),
      event_type: editType,
      starts_at: startsIso,
      ends_at: endsIso,
      timezone: tz,
      tournament_id: editTournamentId.trim() || null,
      venue_id: editVenueId.trim() || null,
      address_text: editAddress.trim() || null,
      city: editCity.trim() || null,
      state: editState.trim() || null,
      notes: editNotes.trim() || null,
    };

    setBusy(true);
    try {
      const res = await jsonFetch<{ ok: true; event: PlannerEventRow }>(`/api/planner/events/${editingEvent.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setEvents((prev) =>
        prev
          .map((e) => (e.id === editingEvent.id ? res.event : e))
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      );
      setEditingId(null);
    } catch (e: any) {
      setError(e?.message || "Failed to update event.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(e: PlannerEventRow) {
    if (!confirm(`Delete "${e.title}"?`)) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await jsonFetch<{ ok: true }>(`/api/planner/events/${e.id}`, { method: "DELETE" });
      setEvents((prev) => prev.filter((x) => x.id !== e.id));
      if (editingId === e.id) setEditingId(null);
    } catch (e: any) {
      setError(e?.message || "Failed to delete event.");
    } finally {
      setBusy(false);
    }
  }

  async function onImportIcs() {
    setError(null);
    setNotice(null);
    setImportResult(null);
    const url = importUrl.trim();
    if (!url) {
      setError("Enter a valid iCal/ICS calendar URL.");
      return;
    }

    setBusy(true);
    try {
      const res = await jsonFetch<{
        ok: true;
        sourceId: string;
        sourceName: string | null;
        imported: number;
        updated: number;
        skipped: number;
      }>("/api/planner/sources/import-ics", {
        method: "POST",
        body: JSON.stringify({
          sourceUrl: url,
          sourceName: importSourceName.trim() || null,
          teamName: importTeamName.trim() || null,
        }),
      });
      setImportResult(`Imported ${res.imported} · Updated ${res.updated} · Skipped ${res.skipped}`);
      await Promise.all([loadEvents(), loadSources()]);
    } catch (e: any) {
      setError(e?.message || "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onRefreshSource(sourceId: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await jsonFetch<{
        ok: true;
        imported: number;
        updated: number;
        skipped: number;
      }>(`/api/planner/sources/${encodeURIComponent(sourceId)}/refresh`, { method: "POST" });
      setNotice(`Schedule refreshed · +${res.imported} new · ${res.updated} updated`);
      await Promise.all([loadEvents(), loadSources()]);
    } catch (e: any) {
      setError(e?.message || "Refresh failed.");
    } finally {
      setBusy(false);
    }
  }

  // Venue search (create)
  useEffect(() => {
    if (createSelectedVenue) return;
    const q = createVenueQuery.trim();
    if (q.length < 2) {
      setCreateVenueResults([]);
      setCreateVenueSearching(false);
      return;
    }
    setCreateVenueSearching(true);
    const t = setTimeout(() => {
      void jsonFetch<{ ok: true; venues: VenueSearchResult[] }>("/api/planner/search/venues?q=" + encodeURIComponent(q), {
        method: "GET",
      })
        .then((res) => setCreateVenueResults(res.venues ?? []))
        .catch(() => setCreateVenueResults([]))
        .finally(() => setCreateVenueSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [createVenueQuery, createSelectedVenue]);

  // Tournament search (create)
  useEffect(() => {
    if (createSelectedTournament) return;
    const q = createTournamentQuery.trim();
    if (q.length < 2) {
      setCreateTournamentResults([]);
      setCreateTournamentSearching(false);
      return;
    }
    setCreateTournamentSearching(true);
    const t = setTimeout(() => {
      void jsonFetch<{ ok: true; tournaments: TournamentSearchResult[] }>("/api/planner/search/tournaments?q=" + encodeURIComponent(q), {
        method: "GET",
      })
        .then((res) => setCreateTournamentResults(res.tournaments ?? []))
        .catch(() => setCreateTournamentResults([]))
        .finally(() => setCreateTournamentSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [createTournamentQuery, createSelectedTournament]);

  // Venue search (edit)
  useEffect(() => {
    if (editSelectedVenue) return;
    const q = editVenueQuery.trim();
    if (q.length < 2) {
      setEditVenueResults([]);
      setEditVenueSearching(false);
      return;
    }
    setEditVenueSearching(true);
    const t = setTimeout(() => {
      void jsonFetch<{ ok: true; venues: VenueSearchResult[] }>("/api/planner/search/venues?q=" + encodeURIComponent(q), {
        method: "GET",
      })
        .then((res) => setEditVenueResults(res.venues ?? []))
        .catch(() => setEditVenueResults([]))
        .finally(() => setEditVenueSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [editVenueQuery, editSelectedVenue]);

  // Tournament search (edit)
  useEffect(() => {
    if (editSelectedTournament) return;
    const q = editTournamentQuery.trim();
    if (q.length < 2) {
      setEditTournamentResults([]);
      setEditTournamentSearching(false);
      return;
    }
    setEditTournamentSearching(true);
    const t = setTimeout(() => {
      void jsonFetch<{ ok: true; tournaments: TournamentSearchResult[] }>("/api/planner/search/tournaments?q=" + encodeURIComponent(q), {
        method: "GET",
      })
        .then((res) => setEditTournamentResults(res.tournaments ?? []))
        .catch(() => setEditTournamentResults([]))
        .finally(() => setEditTournamentSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [editTournamentQuery, editSelectedTournament]);

  return (
    <div className={styles.page}>
      {mapPickerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.5)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: 12,
            zIndex: 50,
          }}
          onClick={() => setMapPickerOpen(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              width: "100%",
              maxWidth: 520,
              padding: 14,
              border: "1px solid rgba(15,23,42,0.12)",
              boxShadow: "0 10px 30px rgba(15,23,42,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Open in maps</div>
            <div className={styles.muted} style={{ marginBottom: 12 }}>
              {mapPickerQuery}
            </div>
            <div className={styles.eventActions}>
              {appleMapsUrl(mapPickerQuery) ? (
                <a className={styles.primaryBtn} href={appleMapsUrl(mapPickerQuery) || undefined} target="_blank" rel="noreferrer">
                  Apple Maps
                </a>
              ) : null}
              {mapsSearchUrl(mapPickerQuery) ? (
                <a className={styles.secondaryBtn} href={mapsSearchUrl(mapPickerQuery) || undefined} target="_blank" rel="noreferrer">
                  Google Maps
                </a>
              ) : null}
              {wazeUrl(mapPickerQuery) ? (
                <a className={styles.secondaryBtn} href={wazeUrl(mapPickerQuery) || undefined} target="_blank" rel="noreferrer">
                  Waze
                </a>
              ) : null}
              <button className={styles.secondaryBtn} type="button" onClick={() => setMapPickerOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
          }}
          onClick={() => {
            if (busy) return;
            setImportOpen(false);
          }}
        >
          <div
            className={styles.card}
            style={{ width: "100%", maxWidth: 520, marginTop: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.cardTitle}>Import calendar link</div>
            <div className={styles.muted} style={{ marginBottom: 10 }}>
              Paste an iCal/ICS calendar link from your team or tournament schedule. We’ll add the events to your weekend
              planner.
            </div>

            {importResult ? (
              <div className={styles.muted} style={{ color: "#166534", fontWeight: 900, marginBottom: 10 }}>
                {importResult}
              </div>
            ) : null}

            <div className={styles.formGrid}>
              <div>
                <label className={styles.label}>Calendar URL *</label>
                <input
                  className={styles.input}
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://…/calendar.ics"
                />
              </div>
              <div className={styles.row2}>
                <div>
                  <label className={styles.label}>Source name (optional)</label>
                  <input
                    className={styles.input}
                    value={importSourceName}
                    onChange={(e) => setImportSourceName(e.target.value)}
                    placeholder="12U Tigers Calendar"
                  />
                </div>
                <div>
                  <label className={styles.label}>Team name (optional)</label>
                  <input
                    className={styles.input}
                    value={importTeamName}
                    onChange={(e) => setImportTeamName(e.target.value)}
                    placeholder="12U Tigers"
                  />
                </div>
              </div>
              <div className={styles.actionsRow}>
                <button className={styles.primaryBtn} onClick={onImportIcs} disabled={busy}>
                  Import schedule
                </button>
                <button
                  className={styles.secondaryBtn}
                  onClick={() => {
                    if (busy) return;
                    resetImportForm();
                    setImportOpen(false);
                  }}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
              <div className={styles.muted}>
                Calendar import works best with public iCal links. TeamSnap, SportsEngine, and GameChanger login
                integrations are not required for this stage.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Planner</h1>
          <p className={styles.subtitle}>Add your schedule, travel, and hotel details for tournament weekend.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className={styles.secondaryBtn} onClick={() => { setImportOpen(true); setImportResult(null); }} disabled={busy}>
            Import calendar link
          </button>
        </div>
      </div>

      {!props.isPaid ? (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Weekend Pro</div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Unlock venue intel and planning shortcuts.</div>
            <div className={styles.muted}>Upgrade anytime. Planner stays free — Weekend Pro adds the good stuff.</div>
            <div style={{ maxWidth: 420 }}>
              <UpgradeWeekendProButton entry_point="planner" />
            </div>
          </div>
        </div>
      ) : null}

      <div className={styles.card}>
        <div className={styles.cardTitle}>Add event</div>

        {error ? <div className={styles.muted} style={{ color: "#b91c1c", fontWeight: 800 }}>{error}</div> : null}
        {notice ? <div className={styles.muted} style={{ color: "#166534", fontWeight: 900 }}>{notice}</div> : null}

        <div className={styles.formGrid}>
          <div>
            <label className={styles.label}>Title *</label>
            <input className={styles.input} value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="Game vs Tigers" />
          </div>

          <div className={styles.row2}>
            <div>
              <label className={styles.label}>Type</label>
              <select className={styles.select} value={createType} onChange={(e) => setCreateType(e.target.value as PlannerEventType)}>
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={styles.label}>Venue</label>
              <div className={styles.muted} style={{ marginTop: -6, marginBottom: 6 }}>
                No venue needed — you can use an address or location instead.
              </div>
              {createSelectedVenue ? (
                <div className={styles.eventItem} style={{ padding: 10 }}>
                  <div className={styles.eventTitle}>{createSelectedVenue.name || "Selected venue"}</div>
                  <div className={styles.eventMeta}>
                    {[createSelectedVenue.city, createSelectedVenue.state].filter(Boolean).join(", ")}
                  </div>
                  <div className={styles.eventActions}>
                    <button
                      className={styles.secondaryBtn}
                      type="button"
                      onClick={() => {
                        setCreateSelectedVenue(null);
                        setCreateVenueId("");
                      }}
                      disabled={busy}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <input
                    className={styles.input}
                    value={createVenueQuery}
                    onChange={(e) => setCreateVenueQuery(e.target.value)}
                    placeholder="Search by venue name"
                  />
                  {createVenueSearching ? <div className={styles.muted}>Searching…</div> : null}
                  {!createVenueSearching && createVenueQuery.trim().length >= 2 && createVenueResults.length === 0 ? (
                    <div className={styles.muted}>No matches found.</div>
                  ) : null}
                  {createVenueResults.length > 0 ? (
                    <div style={{ border: "1px solid rgba(15,23,42,0.12)", borderRadius: 10, overflow: "hidden" }}>
                      {createVenueResults.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          className={styles.secondaryBtn}
                          style={{ width: "100%", justifyContent: "space-between", borderRadius: 0 }}
                          onClick={() => {
                            setCreateSelectedVenue(v);
                            setCreateVenueId(v.id);
                            applyVenueToCreateLocationIfEmpty(v);
                            setCreateVenueQuery("");
                            setCreateVenueResults([]);
                          }}
                          disabled={busy}
                        >
                          <span>{v.name || "Unnamed venue"}</span>
                          <span className={styles.muted}>{[v.city, v.state].filter(Boolean).join(", ")}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>

            <div>
              <label className={styles.label}>Tournament</label>
              <div className={styles.muted} style={{ marginTop: -6, marginBottom: 6 }}>
                Tournament is optional.
              </div>
              {createSelectedTournament ? (
                <div className={styles.eventItem} style={{ padding: 10 }}>
                  <div className={styles.eventTitle}>{createSelectedTournament.name || "Selected tournament"}</div>
                  <div className={styles.eventMeta}>
                    {formatDateRangeLabel(createSelectedTournament.start_date, createSelectedTournament.end_date) || ""}
                </div>
                <div className={styles.eventActions}>
                  <button
                    className={styles.secondaryBtn}
                    type="button"
                    onClick={() => {
                      setCreateSelectedTournament(null);
                      setCreateTournamentId("");
                    }}
                    disabled={busy}
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <>
                <input
                  className={styles.input}
                  value={createTournamentQuery}
                  onChange={(e) => setCreateTournamentQuery(e.target.value)}
                  placeholder="Search by tournament name (optional)"
                />
                {createTournamentSearching ? <div className={styles.muted}>Searching…</div> : null}
                {!createTournamentSearching && createTournamentQuery.trim().length >= 2 && createTournamentResults.length === 0 ? (
                  <div className={styles.muted}>No matches found.</div>
                ) : null}
                {createTournamentResults.length > 0 ? (
                  <div style={{ border: "1px solid rgba(15,23,42,0.12)", borderRadius: 10, overflow: "hidden" }}>
                    {createTournamentResults.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={styles.secondaryBtn}
                        style={{ width: "100%", justifyContent: "space-between", borderRadius: 0 }}
                        onClick={() => {
                          setCreateSelectedTournament(t);
                          setCreateTournamentId(t.id);
                          setCreateTournamentQuery("");
                          setCreateTournamentResults([]);
                        }}
                        disabled={busy}
                      >
                        <span>{t.name || "Unnamed tournament"}</span>
                        <span className={styles.muted}>
                          {formatDateRangeLabel(t.start_date, t.end_date) || ""}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
            <div className={styles.muted}>Tournament is optional.</div>
          </div>

          <div className={styles.row2}>
            <div>
              <label className={styles.label}>Starts *</label>
              <input className={styles.input} type="datetime-local" value={createStartsLocal} onChange={(e) => setCreateStartsLocal(e.target.value)} />
            </div>
            <div>
              <label className={styles.label}>Ends (optional)</label>
              <input className={styles.input} type="datetime-local" value={createEndsLocal} onChange={(e) => setCreateEndsLocal(e.target.value)} />
            </div>
          </div>

          <div className={styles.row2}>
            <div>
              <label className={styles.label}>Address or location</label>
              <input className={styles.input} value={createAddress} onChange={(e) => setCreateAddress(e.target.value)} placeholder="123 Main St" />
            </div>
            <div className={styles.row2}>
              <div>
                <label className={styles.label}>City</label>
                <input className={styles.input} value={createCity} onChange={(e) => setCreateCity(e.target.value)} placeholder="Temecula" />
              </div>
              <div>
                <label className={styles.label}>State</label>
                <input className={styles.input} value={createState} onChange={(e) => setCreateState(e.target.value)} placeholder="CA" />
              </div>
            </div>
          </div>

          <div>
            <label className={styles.label}>Notes (optional)</label>
            <textarea className={styles.textarea} value={createNotes} onChange={(e) => setCreateNotes(e.target.value)} placeholder="Parking, gate, field #, etc." />
          </div>

          <div className={styles.actionsRow}>
            <button className={styles.primaryBtn} onClick={onCreate} disabled={busy}>
              Add event
            </button>
            <button className={styles.secondaryBtn} onClick={resetCreateForm} disabled={busy}>
              Clear
            </button>
            <div className={styles.muted} style={{ alignSelf: "center" }}>
              Timezone: {tz || "UTC"}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Synced calendars</div>
        {sourcesBusy ? <div className={styles.muted}>Loading…</div> : null}
        {!sourcesBusy && sources.length === 0 ? (
          <div className={styles.muted}>No synced calendars yet.</div>
        ) : null}
        {!sourcesBusy && sources.length > 0 ? (
          <div style={{ display: "grid", gap: 10 }}>
            {sources.map((s) => (
              <div key={s.id} className={styles.eventItem}>
                <div className={styles.eventTitle}>{s.source_name || "Imported calendar"}</div>
                <div className={styles.eventMeta}>
                  {s.team_name ? `${s.team_name} · ` : ""}
                  {s.sync_status ? `${s.sync_status}` : "unknown"}
                  {s.last_synced_at ? ` · ${new Date(s.last_synced_at).toLocaleString()}` : ""}
                </div>
                {s.sync_error ? <div className={styles.eventMeta} style={{ color: "#b91c1c", fontWeight: 800 }}>{s.sync_error}</div> : null}
                <div className={styles.eventActions}>
                  <button className={styles.primaryBtn} onClick={() => onRefreshSource(s.id)} disabled={busy}>
                    Refresh schedule
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Your events</div>

        {events.length === 0 ? (
          <div className={styles.muted}>No events yet. Add your first event above.</div>
        ) : (
          grouped.map((g) => {
            const groupTz = g.events[0] ? effectiveTimeZoneForEvent(g.events[0]) : tz || "UTC";
            return (
              <div key={g.key} className={styles.dayGroup}>
                <div className={styles.dayHeader}>{formatDayLabel(g.key, groupTz)}</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {g.events.map((e) => {
                    const eTz = effectiveTimeZoneForEvent(e);
                    const isEditing = editingId === e.id;
                    return (
                      <div key={e.id} className={styles.eventItem}>
                        <div className={styles.eventTitle}>
                          {e.title}{" "}
                          <span className={styles.muted} style={{ fontWeight: 800 }}>
                            · {String(e.event_type || "game")}
                          </span>
                          {String(e.source_type || "") === "ics" ? (
                            <span className={styles.muted} style={{ fontWeight: 900 }}>
                              {" "}
                              · Synced from calendar
                            </span>
                          ) : null}
                        </div>
                        <div className={styles.eventMeta}>
                          {formatTimeRange({ startIso: e.starts_at, endIso: e.ends_at, timeZone: eTz })}
                          {e.venue_id ? " · Venue selected" : ""}
                          {e.tournament_id ? " · Tournament selected" : ""}
                        </div>
                        {locationTextForEvent(e) ? (
                          <div className={styles.eventMeta}>
                            {locationTextForEvent(e)}
                          </div>
                        ) : e.venue_id ? (
                          <div className={styles.eventMeta}>Selected venue</div>
                        ) : (
                          <div className={styles.eventMeta}>
                            <span className={styles.muted}>No location added yet.</span>
                          </div>
                        )}
                        {e.notes ? <div className={styles.eventMeta}>{e.notes}</div> : null}

                        <div className={styles.eventActions}>
                          {!isEditing ? (
                            <>
                              {!e.venue_id ? (
                                <button
                                  className={styles.secondaryBtn}
                                  onClick={() => beginEdit(e)}
                                  disabled={busy}
                                  title="Optional: match this event to a known venue"
                                >
                                  Find venue
                                </button>
                              ) : null}
                              {mapsUrlForEvent(e) ? (
                                <button className={styles.secondaryBtn} type="button" onClick={() => openMapForEvent(e)} disabled={busy}>
                                  Map
                                </button>
                              ) : null}
                              <button className={styles.secondaryBtn} onClick={() => beginEdit(e)} disabled={busy}>
                                Edit
                              </button>
                              <button className={styles.dangerBtn} onClick={() => onDelete(e)} disabled={busy}>
                                Delete
                              </button>
                            </>
                          ) : (
                            <>
                              <button className={styles.primaryBtn} onClick={onSaveEdit} disabled={busy}>
                                Save
                              </button>
                              <button className={styles.secondaryBtn} onClick={cancelEdit} disabled={busy}>
                                Cancel
                              </button>
                            </>
                          )}
                        </div>

                        {isEditing ? (
                          <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
                            <div>
                              <label className={styles.label}>Title *</label>
                              <input className={styles.input} value={editTitle} onChange={(ev) => setEditTitle(ev.target.value)} />
                            </div>
                            <div className={styles.row2}>
                              <div>
                                <label className={styles.label}>Type</label>
                                <select className={styles.select} value={editType} onChange={(ev) => setEditType(ev.target.value as PlannerEventType)}>
                                  {EVENT_TYPES.map((t) => (
                                    <option key={t.value} value={t.value}>
                                      {t.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            <div>
                              <label className={styles.label}>Venue</label>
                              <div className={styles.muted} style={{ marginTop: -6, marginBottom: 6 }}>
                                No venue needed — you can use this location as entered.
                              </div>
                              {editSelectedVenue ? (
                                <div className={styles.eventItem} style={{ padding: 10 }}>
                                  <div className={styles.eventTitle}>{editSelectedVenue.name || "Selected venue"}</div>
                                  <div className={styles.eventMeta}>
                                    {[editSelectedVenue.city, editSelectedVenue.state].filter(Boolean).join(", ")}
                                  </div>
                                    <div className={styles.eventActions}>
                                      <button
                                        className={styles.secondaryBtn}
                                        type="button"
                                        onClick={() => {
                                          setEditSelectedVenue(null);
                                          setEditVenueId("");
                                        }}
                                        disabled={busy}
                                      >
                                        Clear
                                      </button>
                                    </div>
                                  </div>
                                ) : editVenueId ? (
                                  <div className={styles.eventItem} style={{ padding: 10 }}>
                                    <div className={styles.eventTitle}>Venue selected</div>
                                    <div className={styles.eventMeta}>Selected venue is stored (name not loaded in MVP).</div>
                                    <div className={styles.eventActions}>
                                      <button
                                        className={styles.secondaryBtn}
                                        type="button"
                                        onClick={() => setEditVenueId("")}
                                        disabled={busy}
                                      >
                                        Clear
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <input
                                      className={styles.input}
                                      value={editVenueQuery}
                                      onChange={(ev) => setEditVenueQuery(ev.target.value)}
                                      placeholder="Search by venue name"
                                    />
                                    {editVenueSearching ? <div className={styles.muted}>Searching…</div> : null}
                                    {!editVenueSearching && editVenueQuery.trim().length >= 2 && editVenueResults.length === 0 ? (
                                      <div className={styles.muted}>No matches found.</div>
                                    ) : null}
                                    {editVenueResults.length > 0 ? (
                                      <div style={{ border: "1px solid rgba(15,23,42,0.12)", borderRadius: 10, overflow: "hidden" }}>
                                        {editVenueResults.map((v) => (
                                          <button
                                            key={v.id}
                                            type="button"
                                            className={styles.secondaryBtn}
                                            style={{ width: "100%", justifyContent: "space-between", borderRadius: 0 }}
                                            onClick={() => {
                                              setEditSelectedVenue(v);
                                              setEditVenueId(v.id);
                                              applyVenueToEditLocationIfEmpty(v);
                                              setEditVenueQuery("");
                                              setEditVenueResults([]);
                                            }}
                                            disabled={busy}
                                          >
                                            <span>{v.name || "Unnamed venue"}</span>
                                            <span className={styles.muted}>{[v.city, v.state].filter(Boolean).join(", ")}</span>
                                          </button>
                                        ))}
                                      </div>
                                    ) : null}
                                  </>
                                )}
                              </div>
                            </div>
                            <div>
                              <label className={styles.label}>Tournament</label>
                              {editSelectedTournament ? (
                                <div className={styles.eventItem} style={{ padding: 10 }}>
                                  <div className={styles.eventTitle}>{editSelectedTournament.name || "Selected tournament"}</div>
                                  <div className={styles.eventMeta}>
                                    {formatDateRangeLabel(editSelectedTournament.start_date, editSelectedTournament.end_date) || ""}
                                  </div>
                                  <div className={styles.eventActions}>
                                    <button
                                      className={styles.secondaryBtn}
                                      type="button"
                                      onClick={() => {
                                        setEditSelectedTournament(null);
                                        setEditTournamentId("");
                                      }}
                                      disabled={busy}
                                    >
                                      Clear
                                    </button>
                                  </div>
                                </div>
                              ) : editTournamentId ? (
                                <div className={styles.eventItem} style={{ padding: 10 }}>
                                  <div className={styles.eventTitle}>Tournament selected</div>
                                  <div className={styles.eventMeta}>Selected tournament is stored (name not loaded in MVP).</div>
                                  <div className={styles.eventActions}>
                                    <button
                                      className={styles.secondaryBtn}
                                      type="button"
                                      onClick={() => setEditTournamentId("")}
                                      disabled={busy}
                                    >
                                      Clear
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <input
                                    className={styles.input}
                                    value={editTournamentQuery}
                                    onChange={(ev) => setEditTournamentQuery(ev.target.value)}
                                    placeholder="Search by tournament name (optional)"
                                  />
                                  {editTournamentSearching ? <div className={styles.muted}>Searching…</div> : null}
                                  {!editTournamentSearching && editTournamentQuery.trim().length >= 2 && editTournamentResults.length === 0 ? (
                                    <div className={styles.muted}>No matches found.</div>
                                  ) : null}
                                  {editTournamentResults.length > 0 ? (
                                    <div style={{ border: "1px solid rgba(15,23,42,0.12)", borderRadius: 10, overflow: "hidden" }}>
                                      {editTournamentResults.map((t) => (
                                        <button
                                          key={t.id}
                                          type="button"
                                          className={styles.secondaryBtn}
                                          style={{ width: "100%", justifyContent: "space-between", borderRadius: 0 }}
                                          onClick={() => {
                                            setEditSelectedTournament(t);
                                            setEditTournamentId(t.id);
                                            setEditTournamentQuery("");
                                            setEditTournamentResults([]);
                                          }}
                                          disabled={busy}
                                        >
                                          <span>{t.name || "Unnamed tournament"}</span>
                                          <span className={styles.muted}>
                                            {formatDateRangeLabel(t.start_date, t.end_date) || ""}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                </>
                              )}
                              <div className={styles.muted}>Tournament is optional.</div>
                            </div>
                            <div className={styles.row2}>
                              <div>
                                <label className={styles.label}>Starts *</label>
                                <input className={styles.input} type="datetime-local" value={editStartsLocal} onChange={(ev) => setEditStartsLocal(ev.target.value)} />
                              </div>
                              <div>
                                <label className={styles.label}>Ends (optional)</label>
                                <input className={styles.input} type="datetime-local" value={editEndsLocal} onChange={(ev) => setEditEndsLocal(ev.target.value)} />
                              </div>
                            </div>
                            <div className={styles.row2}>
                              <div>
                                <label className={styles.label}>Address or location</label>
                                <input className={styles.input} value={editAddress} onChange={(ev) => setEditAddress(ev.target.value)} />
                              </div>
                              <div className={styles.row2}>
                                <div>
                                  <label className={styles.label}>City</label>
                                  <input className={styles.input} value={editCity} onChange={(ev) => setEditCity(ev.target.value)} />
                                </div>
                                <div>
                                  <label className={styles.label}>State</label>
                                  <input className={styles.input} value={editState} onChange={(ev) => setEditState(ev.target.value)} />
                                </div>
                              </div>
                            </div>
                            <div>
                              <label className={styles.label}>Notes (optional)</label>
                              <textarea className={styles.textarea} value={editNotes} onChange={(ev) => setEditNotes(ev.target.value)} />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
