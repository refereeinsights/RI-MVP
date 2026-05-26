"use client";

import { useMemo, useState } from "react";
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
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "UTC",
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
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timeZone || "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function formatTimeRange(params: { startIso: string; endIso?: string | null; timeZone: string | null }) {
  const start = new Date(params.startIso);
  if (Number.isNaN(start.getTime())) return "";
  const fmt = new Intl.DateTimeFormat(undefined, { timeZone: params.timeZone || "UTC", hour: "numeric", minute: "2-digit" });
  const startText = fmt.format(start);
  if (!params.endIso) return startText;
  const end = new Date(params.endIso);
  if (Number.isNaN(end.getTime())) return startText;
  const endText = fmt.format(end);
  return `${startText} – ${endText}`;
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [createTitle, setCreateTitle] = useState("");
  const [createType, setCreateType] = useState<PlannerEventType>("game");
  const [createStartsLocal, setCreateStartsLocal] = useState("");
  const [createEndsLocal, setCreateEndsLocal] = useState("");
  const [createVenueId, setCreateVenueId] = useState("");
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
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editState, setEditState] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const effectiveTimeZoneForEvent = (e: PlannerEventRow) => e.timezone || tz || "UTC";

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
    setCreateAddress("");
    setCreateCity("");
    setCreateState("");
    setCreateNotes("");
  }

  function beginEdit(e: PlannerEventRow) {
    setEditingId(e.id);
    setEditTitle(e.title ?? "");
    setEditType((e.event_type as PlannerEventType) || "game");
    setEditStartsLocal(toDateTimeLocalValue(e.starts_at));
    setEditEndsLocal(toDateTimeLocalValue(e.ends_at));
    setEditVenueId(e.venue_id ?? "");
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

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Planner</h1>
          <p className={styles.subtitle}>Add your schedule, travel, and hotel details for tournament weekend.</p>
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
              <label className={styles.label}>Venue ID (optional)</label>
              <input className={styles.input} value={createVenueId} onChange={(e) => setCreateVenueId(e.target.value)} placeholder="UUID" />
            </div>
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
              <label className={styles.label}>Address (optional)</label>
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
                        </div>
                        <div className={styles.eventMeta}>
                          {formatTimeRange({ startIso: e.starts_at, endIso: e.ends_at, timeZone: eTz })}
                          {e.venue_id ? ` · venue ${e.venue_id}` : ""}
                        </div>
                        {e.address_text || e.city || e.state ? (
                          <div className={styles.eventMeta}>
                            {[e.address_text, e.city, e.state].filter(Boolean).join(", ")}
                          </div>
                        ) : null}
                        {e.notes ? <div className={styles.eventMeta}>{e.notes}</div> : null}

                        <div className={styles.eventActions}>
                          {!isEditing ? (
                            <>
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
                                <label className={styles.label}>Venue ID (optional)</label>
                                <input className={styles.input} value={editVenueId} onChange={(ev) => setEditVenueId(ev.target.value)} placeholder="UUID" />
                              </div>
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
                                <label className={styles.label}>Address (optional)</label>
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
