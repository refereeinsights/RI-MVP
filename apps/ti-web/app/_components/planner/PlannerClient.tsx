"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { WEEKEND_PRO_FOUNDING_SHORT_COPY } from "@/lib/weekendProPricing";
import {
  computeDuplicateCandidates,
  type PlannerDuplicateCandidate,
  type PlannerDuplicateReason,
} from "@/lib/planner/duplicates";
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

type PlannerLens = "weekend" | "season";
type SeasonRangePreset = "30d" | "6mo" | "12mo";
type SeasonFilter = "all" | "games" | "practices" | "travel" | "other";

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

type DuplicateDismissedRow = { pair_key_a: string; pair_key_b: string; created_at?: string | null };

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

function parseOffsetMinutes(value: string) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  if (v === "GMT" || v === "UTC") return 0;
  const m = v.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
  if (!m) return null;
  const sign = m[1].startsWith("-") ? -1 : 1;
  const hh = Math.abs(Number(m[1]));
  const mm = m[2] ? Number(m[2]) : 0;
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return sign * (hh * 60 + mm);
}

function offsetMinutesForUtcInstant(timeZone: string, utcInstant: Date) {
  const tz = safeTimeZone(timeZone) || "UTC";
  if (tz === "UTC") return 0;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(utcInstant);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  return parseOffsetMinutes(tzName);
}

function utcIsoToZonedParts(iso: string | null | undefined, timeZone: string | null) {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const tz = safeTimeZone(timeZone) || "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  return { date: year && month && day ? `${year}-${month}-${day}` : "", time: hour && minute ? `${hour}:${minute}` : "" };
}

function zonedPartsToUtcIso(params: { date: string; time: string; timeZone: string | null }) {
  const date = String(params.date ?? "").trim();
  const time = String(params.time ?? "").trim();
  const tz = safeTimeZone(params.timeZone) || "UTC";
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = time.match(/^(\d{2}):(\d{2})$/);
  if (!m || !t) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(t[1]);
  const minute = Number(t[2]);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const guessUtc = new Date(guessUtcMs);
  const off1 = offsetMinutesForUtcInstant(tz, guessUtc);
  if (off1 == null) return null;
  let utcMs = guessUtcMs - off1 * 60_000;
  const off2 = offsetMinutesForUtcInstant(tz, new Date(utcMs));
  if (off2 == null) return null;
  utcMs = guessUtcMs - off2 * 60_000;
  return new Date(utcMs).toISOString();
}

function addMinutesToTime(value: string, minutes: number) {
  const m = String(value ?? "").trim().match(/^(\d{2}):(\d{2})$/);
  if (!m) return "";
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "";
  let total = hh * 60 + mm + minutes;
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const outH = String(Math.floor(total / 60)).padStart(2, "0");
  const outM = String(total % 60).padStart(2, "0");
  return `${outH}:${outM}`;
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
  // dayIso is YYYY-MM-DD.
  // Use a midday UTC anchor to avoid shifting the visible calendar day when formatting
  // into a negative UTC offset (e.g. America/Los_Angeles would render UTC midnight as prior-day).
  const d = new Date(`${dayIso}T12:00:00Z`);
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

function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDaysLocal(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function addMonthsLocal(d: Date, months: number) {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

function computeWeekendRangeLocal(now: Date) {
  const day = now.getDay(); // 0=Sun..6=Sat
  const todayStart = startOfDayLocal(now);
  let fridayStart: Date;
  if (day === 5) fridayStart = todayStart;
  else if (day === 6) fridayStart = addDaysLocal(todayStart, -1);
  else if (day === 0) fridayStart = addDaysLocal(todayStart, -2);
  else fridayStart = addDaysLocal(todayStart, (5 - day + 7) % 7);
  const mondayStart = addDaysLocal(fridayStart, 3); // exclusive end
  return { from: fridayStart.toISOString(), to: mondayStart.toISOString(), fridayStart, mondayStart };
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
  const [eventsTruncated, setEventsTruncated] = useState(false);
  const [eventsLimit, setEventsLimit] = useState(200);
  const [eventsHasMore, setEventsHasMore] = useState(false);
  const [eventsNextCursor, setEventsNextCursor] = useState<{ starts_at: string; id: string } | null>(null);
  const [eventsPagingBusy, setEventsPagingBusy] = useState(false);
  const lastEventsQueryRef = useRef<{ from: string | null; to: string | null; types: string[] | null; limit: number } | null>(null);
  const [sources, setSources] = useState<PlannerSourceRow[]>([]);
  const [dismissedPairs, setDismissedPairs] = useState<DuplicateDismissedRow[]>([]);
  const [dismissingPairs, setDismissingPairs] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sourcesBusy, setSourcesBusy] = useState(false);

  const [lens, setLens] = useState<PlannerLens>("weekend");
  const [seasonRange, setSeasonRange] = useState<SeasonRangePreset>("6mo");
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>("all");

  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importSourceName, setImportSourceName] = useState("");
  const [importTeamName, setImportTeamName] = useState("");
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeAnchorEventId, setMergeAnchorEventId] = useState<string | null>(null);
  const [mergeCandidateEventId, setMergeCandidateEventId] = useState<string | null>(null);
  const [mergeSelections, setMergeSelections] = useState<Record<string, "primary" | "candidate" | "combine">>({});
  const [mergeBusy, setMergeBusy] = useState(false);
  const mergeRestoreFocusRef = useRef<HTMLElement | null>(null);
  const mergePanelRef = useRef<HTMLDivElement | null>(null);
  const lastCreateVenueLocationRef = useRef<{ address: string; city: string; state: string } | null>(null);
  const lastEditVenueLocationRef = useRef<{ address: string; city: string; state: string } | null>(null);

  function closeMergeModal() {
    setMergeOpen(false);
    setMergeBusy(false);
    setMergeAnchorEventId(null);
    setMergeCandidateEventId(null);
    setMergeSelections({});
    const el = mergeRestoreFocusRef.current;
    mergeRestoreFocusRef.current = null;
    try {
      el?.focus?.();
    } catch {
      // ignore
    }
  }

  function openMergeModal(args: { anchorEventId: string; candidateEventId: string }) {
    mergeRestoreFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    setMergeAnchorEventId(args.anchorEventId);
    setMergeCandidateEventId(args.candidateEventId);
    setMergeSelections({});
    setMergeOpen(true);
  }

  useEffect(() => {
    if (!mergeOpen) return;
    const t = setTimeout(() => {
      try {
        mergePanelRef.current?.focus?.();
      } catch {
        // ignore
      }
    }, 0);
    return () => clearTimeout(t);
  }, [mergeOpen]);

  function mergeModalKeyDown(e: any) {
    if (!mergeOpen) return;
    if (e.key === "Escape") {
      if (mergeBusy) return;
      e.preventDefault();
      closeMergeModal();
      return;
    }
    if (e.key !== "Tab") return;
    const panel = mergePanelRef.current;
    if (!panel) return;
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    if (!focusables.length) return;
    const active = document.activeElement as HTMLElement | null;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey) {
      if (!active || active === first || !panel.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function formatSourceStatusLabel(s: { sync_status: string | null; last_synced_at: string | null }) {
    const status = String(s.sync_status ?? "").toLowerCase();
    if (!s.last_synced_at) return "Never synced";
    if (status === "error") return "Needs attention";
    if (status === "success") return "Synced";
    if (status === "pending") return "Never synced";
    return status ? status : "Synced";
  }

  function staleLabel(lastSyncedAt: string | null) {
    if (!lastSyncedAt) return null;
    const t = new Date(lastSyncedAt).getTime();
    if (!Number.isFinite(t)) return null;
    const ageMs = Date.now() - t;
    const dayMs = 24 * 60 * 60 * 1000;
    if (ageMs >= 7 * dayMs) return "This calendar has not refreshed in over a week.";
    if (ageMs >= dayMs) return "Last synced over a day ago.";
    return null;
  }

  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [mapPickerQuery, setMapPickerQuery] = useState<string>("");

  const [createTitle, setCreateTitle] = useState("");
  const [createType, setCreateType] = useState<PlannerEventType>("game");
  const [createStartDate, setCreateStartDate] = useState("");
  const [createStartTime, setCreateStartTime] = useState("");
  const [createEndDate, setCreateEndDate] = useState("");
  const [createEndTime, setCreateEndTime] = useState("");
  const [createEndWasAuto, setCreateEndWasAuto] = useState(true);
  const [createTimeZone, setCreateTimeZone] = useState<string>(() => safeTimeZone(browserTimeZone()) || "UTC");
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
  const [editStartDate, setEditStartDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editEndWasAuto, setEditEndWasAuto] = useState(true);
  const [editTimeZone, setEditTimeZone] = useState<string>(() => safeTimeZone(browserTimeZone()) || "UTC");
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
    lastCreateVenueLocationRef.current = { address, city, state };
    if (!createAddress.trim() && address) setCreateAddress(address);
    if (!createCity.trim() && city) setCreateCity(city);
    if (!createState.trim() && state) setCreateState(state);
  };

  const applyVenueToEditLocationIfEmpty = (v: VenueSearchResult) => {
    const address = String(v.address ?? "").trim();
    const city = String(v.city ?? "").trim();
    const state = String(v.state ?? "").trim();
    lastEditVenueLocationRef.current = { address, city, state };
    if (!editAddress.trim() && address) setEditAddress(address);
    if (!editCity.trim() && city) setEditCity(city);
    if (!editState.trim() && state) setEditState(state);
  };

  function clearCreateVenueSelection() {
    setCreateSelectedVenue(null);
    setCreateVenueId("");
    const last = lastCreateVenueLocationRef.current;
    // If location fields appear to have been derived from the venue selection, clear them so the
    // user can choose a new venue without stale address/city/state sticking around.
    if (
      !last ||
      (createAddress.trim() === (last.address || "") &&
        createCity.trim() === (last.city || "") &&
        createState.trim() === (last.state || ""))
    ) {
      setCreateAddress("");
      setCreateCity("");
      setCreateState("");
    }
    lastCreateVenueLocationRef.current = null;
  }

  function clearEditVenueSelection() {
    setEditSelectedVenue(null);
    setEditVenueId("");
    const last = lastEditVenueLocationRef.current;
    if (
      !last ||
      (editAddress.trim() === (last.address || "") && editCity.trim() === (last.city || "") && editState.trim() === (last.state || ""))
    ) {
      setEditAddress("");
      setEditCity("");
      setEditState("");
    }
    lastEditVenueLocationRef.current = null;
  }

  // Smart end defaults (create)
  useEffect(() => {
    if (!createStartDate || !createStartTime) return;
    const endEmpty = !createEndDate && !createEndTime;
    const shouldAuto = createEndWasAuto || endEmpty;
    if (!shouldAuto) return;
    const nextDate = createStartDate;
    const nextTime = addMinutesToTime(createStartTime, 60);
    if (!nextTime) return;
    if (createEndDate !== nextDate) setCreateEndDate(nextDate);
    if (createEndTime !== nextTime) setCreateEndTime(nextTime);
    if (!createEndWasAuto) setCreateEndWasAuto(true);
  }, [createStartDate, createStartTime, createEndDate, createEndTime, createEndWasAuto]);

  // Smart end defaults (edit)
  useEffect(() => {
    if (!editingId) return;
    if (!editStartDate || !editStartTime) return;
    const endEmpty = !editEndDate && !editEndTime;
    const shouldAuto = editEndWasAuto || endEmpty;
    if (!shouldAuto) return;
    const nextDate = editStartDate;
    const nextTime = addMinutesToTime(editStartTime, 60);
    if (!nextTime) return;
    if (editEndDate !== nextDate) setEditEndDate(nextDate);
    if (editEndTime !== nextTime) setEditEndTime(nextTime);
    if (!editEndWasAuto) setEditEndWasAuto(true);
  }, [editingId, editStartDate, editStartTime, editEndDate, editEndTime, editEndWasAuto]);

  // Resolve timezone for manual create/edit based on selected venue/tournament (server-side).
  useEffect(() => {
    let cancelled = false;
    const venueId = createVenueId.trim();
    const tournamentId = createTournamentId.trim();
    if (!venueId && !tournamentId) {
      setCreateTimeZone(safeTimeZone(tz) || "UTC");
      return;
    }
    const qs = venueId ? `venue_id=${encodeURIComponent(venueId)}` : `tournament_id=${encodeURIComponent(tournamentId)}`;
    void jsonFetch<{ ok: true; timezone: string | null }>(`/api/planner/timezone?${qs}`, { method: "GET" })
      .then((res) => {
        if (cancelled) return;
        setCreateTimeZone(safeTimeZone(res.timezone) || safeTimeZone(tz) || "UTC");
      })
      .catch(() => {
        if (cancelled) return;
        setCreateTimeZone(safeTimeZone(tz) || "UTC");
      });
    return () => {
      cancelled = true;
    };
  }, [createVenueId, createTournamentId, tz]);

  useEffect(() => {
    let cancelled = false;
    if (!editingId) return;
    const venueId = editVenueId.trim();
    const tournamentId = editTournamentId.trim();
    if (!venueId && !tournamentId) return;
    const qs = venueId ? `venue_id=${encodeURIComponent(venueId)}` : `tournament_id=${encodeURIComponent(tournamentId)}`;
    void jsonFetch<{ ok: true; timezone: string | null }>(`/api/planner/timezone?${qs}`, { method: "GET" })
      .then((res) => {
        if (cancelled) return;
        setEditTimeZone(safeTimeZone(res.timezone) || safeTimeZone(tz) || "UTC");
      })
      .catch(() => {
        if (cancelled) return;
      });
    return () => {
      cancelled = true;
    };
  }, [editingId, editVenueId, editTournamentId, tz]);

  async function loadEvents() {
    setEventsPagingBusy(true);
    const now = new Date();
    const limit = 200;

    let from: string | null = null;
    let to: string | null = null;
    let types: string[] | null = null;

    if (lens === "weekend") {
      const range = computeWeekendRangeLocal(now);
      from = range.from;
      to = range.to;
    } else {
      const fromDate = startOfDayLocal(now);
      const toDate =
        seasonRange === "30d"
          ? addDaysLocal(fromDate, 30)
          : seasonRange === "12mo"
            ? addMonthsLocal(fromDate, 12)
            : addMonthsLocal(fromDate, 6);
      from = fromDate.toISOString();
      to = toDate.toISOString();

      if (seasonFilter === "games") types = ["game"];
      else if (seasonFilter === "practices") types = ["practice"];
      else if (seasonFilter === "travel") types = ["travel", "hotel", "meal", "check_in"];
      else if (seasonFilter === "other") types = ["other", "referee_assignment"];
    }

    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (types?.length) qs.set("types", types.join(","));
    qs.set("limit", String(limit));
    qs.set("includePast", "false");

    try {
      const res = await jsonFetch<{
        ok: true;
        events: PlannerEventRow[];
        truncated?: boolean;
        limit: number;
        hasMore?: boolean;
        nextCursor?: { starts_at: string; id: string } | null;
      }>(`/api/planner/events?${qs.toString()}`, { method: "GET" });

      lastEventsQueryRef.current = { from, to, types, limit };
      const hasMore = Boolean((res as any).hasMore ?? res.truncated);
      setEventsTruncated(hasMore);
      setEventsHasMore(hasMore);
      setEventsNextCursor((res as any).nextCursor ?? null);
      setEventsLimit(Number.isFinite(Number(res.limit)) ? Number(res.limit) : limit);
      setEvents(
        (res.events ?? [])
          .slice()
          .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)) || String(a.id).localeCompare(String(b.id)))
      );
    } finally {
      setEventsPagingBusy(false);
    }
  }

  async function loadMoreEvents() {
    const q = lastEventsQueryRef.current;
    if (!q) return;
    if (!eventsHasMore || !eventsNextCursor) return;
    setEventsPagingBusy(true);
    try {
      const qs = new URLSearchParams();
      if (q.from) qs.set("from", q.from);
      if (q.to) qs.set("to", q.to);
      if (q.types?.length) qs.set("types", q.types.join(","));
      qs.set("limit", String(q.limit));
      qs.set("includePast", "false");
      qs.set("cursor_starts_at", eventsNextCursor.starts_at);
      qs.set("cursor_id", eventsNextCursor.id);

      const res = await jsonFetch<{
        ok: true;
        events: PlannerEventRow[];
        truncated?: boolean;
        limit: number;
        hasMore?: boolean;
        nextCursor?: { starts_at: string; id: string } | null;
      }>(`/api/planner/events?${qs.toString()}`, { method: "GET" });

      const hasMore = Boolean((res as any).hasMore ?? res.truncated);
      setEventsTruncated(hasMore);
      setEventsHasMore(hasMore);
      setEventsNextCursor((res as any).nextCursor ?? null);

      setEvents((prev) => {
        const byId = new Map<string, PlannerEventRow>();
        for (const e of prev) byId.set(String(e.id), e);
        for (const e of res.events ?? []) byId.set(String(e.id), e);
        return Array.from(byId.values()).sort(
          (a, b) => String(a.starts_at).localeCompare(String(b.starts_at)) || String(a.id).localeCompare(String(b.id))
        );
      });
    } finally {
      setEventsPagingBusy(false);
    }
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

  async function loadDismissedPairs() {
    try {
      const res = await jsonFetch<{ ok: true; dismissed: DuplicateDismissedRow[] }>("/api/planner/events/duplicates/dismissed", {
        method: "GET",
      });
      setDismissedPairs(res.dismissed ?? []);
    } catch {
      // ignore
      setDismissedPairs([]);
    }
  }

  // Best-effort initial load of sources (planner page is authed; no sensitive URL returned).
  useEffect(() => {
    void loadSources().catch(() => {});
    void loadDismissedPairs().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Authoritative ranged fetch for the active lens/range/filter (replaces any SSR preload).
  useEffect(() => {
    void loadEvents().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens, seasonRange, seasonFilter]);

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

  const sourcesById = useMemo(() => {
    const m = new Map<string, PlannerSourceRow>();
    for (const s of sources) m.set(String(s.id), s);
    return m;
  }, [sources]);

  const duplicateCandidates = useMemo(() => {
    return computeDuplicateCandidates({
      events,
      dismissedPairs: dismissedPairs ?? [],
      timeZoneFallback: tz ?? undefined,
    });
  }, [events, dismissedPairs, tz]);

  const dupesByEventId = useMemo(() => {
    const m = new Map<string, PlannerDuplicateCandidate[]>();
    for (const c of duplicateCandidates) {
      const list = m.get(c.eventId) ?? [];
      list.push(c);
      m.set(c.eventId, list);
    }
    for (const [k, list] of m.entries()) {
      m.set(
        k,
        list.slice().sort((a, b) => {
          if (a.confidence !== b.confidence) return a.confidence === "high" ? -1 : 1;
          return b.score - a.score;
        })
      );
    }
    return m;
  }, [duplicateCandidates]);

  function candidateLabelForSource(e: PlannerEventRow) {
    if (String(e.source_type ?? "") === "ics") {
      const sid = String(e.source_id ?? "").trim();
      const s = sid ? sourcesById.get(sid) : null;
      return s?.source_name || s?.team_name || "Imported calendar";
    }
    return "Manual event";
  }

  function formatDuplicateReasons(reasons: PlannerDuplicateReason[]) {
    const unique = Array.from(new Set(reasons));
    const label = (r: PlannerDuplicateReason) =>
      r === "time" ? "time" : r === "title" ? "title" : r === "location" ? "location" : r === "team" ? "team" : "timezone";
    return unique.map(label).join(", ");
  }

  async function onKeepSeparate(eventId: string, candidateEventId: string) {
    const key = `${eventId}:${candidateEventId}`;
    setDismissingPairs((prev) => new Set(prev).add(key));
    setError(null);
    try {
      await jsonFetch<{ ok: true }>("/api/planner/events/duplicates/dismiss", {
        method: "POST",
        body: JSON.stringify({ event_id: eventId, candidate_event_id: candidateEventId }),
      });
      // Refresh dismissals list so suggestions disappear deterministically.
      await loadDismissedPairs();
    } catch (e: any) {
      setError(e?.message || "Failed to keep separate.");
    } finally {
      setDismissingPairs((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  function combineNotes(primaryNotes: string | null, candidateNotes: string | null) {
    const a = String(primaryNotes ?? "").trim();
    const b = String(candidateNotes ?? "").trim();
    if (!a && !b) return null;
    if (a && !b) return a;
    if (!a && b) return b;
    if (a === b) return a;
    // Preserve both note bodies; avoid duplicate identical blocks.
    return [a, b].join("\n\n---\n\n");
  }

  async function onConfirmMerge() {
    if (!mergeAnchorEventId || !mergeCandidateEventId) return;
    const primary = events.find((e) => e.id === mergeAnchorEventId) ?? null;
    const candidate = events.find((e) => e.id === mergeCandidateEventId) ?? null;
    if (!primary || !candidate) {
      setError("That merge target could not be found. Try refreshing.");
      closeMergeModal();
      return;
    }

    const selection = (key: string) => mergeSelections[key] || "primary";
    const winners: Record<string, any> = {};

    if (selection("title") === "candidate") winners.title = candidate.title ?? null;
    if (selection("time") === "candidate") {
      winners.starts_at = candidate.starts_at;
      winners.ends_at = candidate.ends_at ?? null;
    }
    if (selection("timezone") === "candidate") winners.timezone = candidate.timezone ?? null;
    if (selection("address_text") === "candidate") winners.address_text = candidate.address_text ?? null;
    if (selection("city") === "candidate") winners.city = candidate.city ?? null;
    if (selection("state") === "candidate") winners.state = candidate.state ?? null;
    if (selection("team_name") === "candidate") winners.team_name = candidate.team_name ?? null;
    if (selection("opponent_name") === "candidate") winners.opponent_name = candidate.opponent_name ?? null;
    if (selection("field_label") === "candidate") winners.field_label = candidate.field_label ?? null;

    const notesSel = selection("notes");
    if (notesSel === "candidate") winners.notes = candidate.notes ?? null;
    else if (notesSel === "combine") winners.notes = combineNotes(primary.notes ?? null, candidate.notes ?? null);

    setMergeBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await jsonFetch<{
        ok: true;
        event: PlannerEventRow;
        suppressed: any[];
        warnings: Array<{ field?: string; message: string }>;
      }>("/api/planner/events/merge", {
        method: "POST",
        body: JSON.stringify({
          primary_event_id: primary.id,
          merge_event_ids: [candidate.id],
          field_winners: Object.keys(winners).length ? winners : undefined,
        }),
      });

      const warningText = (res.warnings ?? []).map((w) => String(w?.message ?? "").trim()).filter(Boolean);
      setNotice(warningText.length ? `Merged duplicate events into a new manual event. ${warningText.join(" ")}` : "Merged duplicate events into a new manual event.");
      closeMergeModal();
      await loadEvents();
      await loadDismissedPairs();
    } catch (e: any) {
      setError(e?.message || "Merge failed.");
      setMergeBusy(false);
    }
  }

  function resetCreateForm() {
    setCreateTitle("");
    setCreateType("game");
    setCreateStartDate("");
    setCreateStartTime("");
    setCreateEndDate("");
    setCreateEndTime("");
    setCreateEndWasAuto(true);
    setCreateTimeZone(safeTimeZone(tz) || "UTC");
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
    setImportError(null);
  }

  function beginEdit(e: PlannerEventRow) {
    const tzForEdit = effectiveTimeZoneForEvent(e);
    const startParts = utcIsoToZonedParts(e.starts_at, tzForEdit);
    const endParts = utcIsoToZonedParts(e.ends_at, tzForEdit);
    setEditingId(e.id);
    setEditTitle(e.title ?? "");
    setEditType((e.event_type as PlannerEventType) || "game");
    setEditTimeZone(tzForEdit);
    setEditStartDate(startParts.date);
    setEditStartTime(startParts.time);
    setEditEndDate(endParts.date);
    setEditEndTime(endParts.time);
    setEditEndWasAuto(!endParts.date && !endParts.time);
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
    if (!createStartDate || !createStartTime) {
      setError("Start time is required.");
      return;
    }

    const startsIso = zonedPartsToUtcIso({ date: createStartDate, time: createStartTime, timeZone: createTimeZone });
    if (!startsIso) {
      setError("Start time is invalid.");
      return;
    }

    const endEmpty = !createEndDate && !createEndTime;
    if (!endEmpty && (!createEndDate || !createEndTime)) {
      setError("End time is incomplete.");
      return;
    }
    const endsIso = endEmpty ? null : zonedPartsToUtcIso({ date: createEndDate, time: createEndTime, timeZone: createTimeZone });
    if (!endEmpty && !endsIso) {
      setError("End time is invalid.");
      return;
    }

    const body: PlannerEventCreateBody = {
      title: createTitle.trim(),
      event_type: createType,
      starts_at: startsIso,
      ends_at: endsIso,
      timezone: safeTimeZone(createTimeZone) || safeTimeZone(tz) || "UTC",
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
    if (!editStartDate || !editStartTime) {
      setError("Start time is required.");
      return;
    }

    const startsIso = zonedPartsToUtcIso({ date: editStartDate, time: editStartTime, timeZone: editTimeZone });
    if (!startsIso) {
      setError("Start time is invalid.");
      return;
    }

    const endEmpty = !editEndDate && !editEndTime;
    if (!endEmpty && (!editEndDate || !editEndTime)) {
      setError("End time is incomplete.");
      return;
    }
    const endsIso = endEmpty ? null : zonedPartsToUtcIso({ date: editEndDate, time: editEndTime, timeZone: editTimeZone });
    if (!endEmpty && !endsIso) {
      setError("End time is invalid.");
      return;
    }

    const body: PlannerEventUpdateBody = {
      title: editTitle.trim(),
      event_type: editType,
      starts_at: startsIso,
      ends_at: endsIso,
      timezone: safeTimeZone(editTimeZone) || safeTimeZone(tz) || "UTC",
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
    setImportError(null);
    setImportResult(null);
    const url = importUrl.trim();
    if (!url) {
      setImportError("Enter a valid iCal/ICS calendar URL.");
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
      setImportError(null);
      await Promise.all([loadEvents(), loadSources()]);
    } catch (e: any) {
      setImportError(e?.message || "Import failed.");
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
        changed: number;
        skipped: number;
        changedEvents: { id: string; title: string; changes: ("time" | "location" | "title" | "team" | "timezone")[] }[];
      }>(`/api/planner/sources/${encodeURIComponent(sourceId)}/refresh`, { method: "POST" });
      const parts = [`+${res.imported} new`, `${res.updated} updated`];
      if (res.changed) parts.push(`${res.changed} changes`);
      if (res.skipped) parts.push(`${res.skipped} skipped`);
      setNotice(`Schedule refreshed · ${parts.join(" · ")}`);
      await Promise.all([loadEvents(), loadSources()]);
    } catch (e: any) {
      setError(e?.message || "Refresh failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onDuplicate(e: PlannerEventRow) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await jsonFetch<{ ok: true; event: PlannerEventRow }>(`/api/planner/events/${encodeURIComponent(e.id)}/duplicate`, {
        method: "POST",
      });
      const created = res.event;
      setEvents((prev) =>
        prev
          .concat(created)
          .slice()
          .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
      );
      beginEdit(created);
      // Force user to pick a new date/time for the duplicate.
      setEditStartDate("");
      setEditStartTime("");
      setEditEndDate("");
      setEditEndTime("");
      setEditEndWasAuto(true);
      setNotice("Duplicated. Set a new date/time and save.");
    } catch (err: any) {
      setError(err?.message || "Failed to duplicate event.");
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
      {mergeOpen ? (
        (() => {
          const primary = mergeAnchorEventId ? events.find((e) => e.id === mergeAnchorEventId) ?? null : null;
          const candidate = mergeCandidateEventId ? events.find((e) => e.id === mergeCandidateEventId) ?? null : null;
          if (!primary || !candidate) return null;

          const primaryTz = effectiveTimeZoneForEvent(primary);
          const candTz = effectiveTimeZoneForEvent(candidate);

          const pick = (key: string) => mergeSelections[key] || "primary";
          const setPick = (key: string, value: "primary" | "candidate" | "combine") =>
            setMergeSelections((prev) => ({ ...prev, [key]: value }));

          const fieldRow = (args: {
            key: string;
            label: string;
            primaryValue: string;
            candidateValue: string;
            allowCombine?: boolean;
          }) => {
            const selected = pick(args.key);
            return (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 900 }}>{args.label}</div>
                <div style={{ display: "grid", gap: 8 }}>
                  <button
                    type="button"
                    className={selected === "primary" ? styles.primaryBtn : styles.secondaryBtn}
                    onClick={() => setPick(args.key, "primary")}
                    disabled={mergeBusy}
                    style={{ justifyContent: "flex-start" }}
                  >
                    Primary: {args.primaryValue || "—"}
                  </button>
                  <button
                    type="button"
                    className={selected === "candidate" ? styles.primaryBtn : styles.secondaryBtn}
                    onClick={() => setPick(args.key, "candidate")}
                    disabled={mergeBusy}
                    style={{ justifyContent: "flex-start" }}
                  >
                    Duplicate: {args.candidateValue || "—"}
                  </button>
                  {args.allowCombine ? (
                    <button
                      type="button"
                      className={selected === "combine" ? styles.primaryBtn : styles.secondaryBtn}
                      onClick={() => setPick(args.key, "combine")}
                      disabled={mergeBusy}
                      style={{ justifyContent: "flex-start" }}
                    >
                      Combine both
                    </button>
                  ) : null}
                </div>
              </div>
            );
          };

          const conflicts: Array<JSX.Element> = [];

          const titleA = String(primary.title ?? "").trim();
          const titleB = String(candidate.title ?? "").trim();
          if (titleA !== titleB) {
            conflicts.push(fieldRow({ key: "title", label: "Title", primaryValue: titleA, candidateValue: titleB }));
          }

          const timeA = formatTimeRange({ startIso: primary.starts_at, endIso: primary.ends_at, timeZone: primaryTz });
          const timeB = formatTimeRange({ startIso: candidate.starts_at, endIso: candidate.ends_at, timeZone: candTz });
          if (timeA !== timeB) {
            conflicts.push(fieldRow({ key: "time", label: "Time", primaryValue: timeA, candidateValue: timeB }));
          }

          const tzA = String(primary.timezone ?? "").trim();
          const tzB = String(candidate.timezone ?? "").trim();
          if (tzA !== tzB) {
            conflicts.push(fieldRow({ key: "timezone", label: "Timezone", primaryValue: tzA || "—", candidateValue: tzB || "—" }));
          }

          const addrA = String(primary.address_text ?? "").trim();
          const addrB = String(candidate.address_text ?? "").trim();
          if (addrA !== addrB) {
            conflicts.push(fieldRow({ key: "address_text", label: "Address / location", primaryValue: addrA, candidateValue: addrB }));
          }

          const cityA = String(primary.city ?? "").trim();
          const cityB = String(candidate.city ?? "").trim();
          if (cityA !== cityB) {
            conflicts.push(fieldRow({ key: "city", label: "City", primaryValue: cityA, candidateValue: cityB }));
          }

          const stateA = String(primary.state ?? "").trim();
          const stateB = String(candidate.state ?? "").trim();
          if (stateA !== stateB) {
            conflicts.push(fieldRow({ key: "state", label: "State", primaryValue: stateA, candidateValue: stateB }));
          }

          const teamA = String(primary.team_name ?? "").trim();
          const teamB = String(candidate.team_name ?? "").trim();
          if (teamA !== teamB) {
            conflicts.push(fieldRow({ key: "team_name", label: "Team", primaryValue: teamA, candidateValue: teamB }));
          }

          const oppA = String(primary.opponent_name ?? "").trim();
          const oppB = String(candidate.opponent_name ?? "").trim();
          if (oppA !== oppB) {
            conflicts.push(fieldRow({ key: "opponent_name", label: "Opponent", primaryValue: oppA, candidateValue: oppB }));
          }

          const fieldA = String(primary.field_label ?? "").trim();
          const fieldB = String(candidate.field_label ?? "").trim();
          if (fieldA !== fieldB) {
            conflicts.push(fieldRow({ key: "field_label", label: "Field label", primaryValue: fieldA, candidateValue: fieldB }));
          }

          const notesA = String(primary.notes ?? "").trim();
          const notesB = String(candidate.notes ?? "").trim();
          if (notesA !== notesB) {
            conflicts.push(
              fieldRow({
                key: "notes",
                label: "Notes",
                primaryValue: notesA || "—",
                candidateValue: notesB || "—",
                allowCombine: Boolean(notesA) && Boolean(notesB),
              })
            );
          }

          return (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="merge-modal-title"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 23, 42, 0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
                zIndex: 60,
              }}
              onKeyDown={mergeModalKeyDown}
              onClick={() => {
                if (mergeBusy) return;
                closeMergeModal();
              }}
            >
              <div
                ref={mergePanelRef}
                tabIndex={-1}
                className={styles.card}
                style={{ width: "100%", maxWidth: 720, marginTop: 0, outline: "none" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.cardTitle} id="merge-modal-title">
                  Review duplicate merge
                </div>
                <div className={styles.muted} style={{ marginBottom: 10 }}>
                  This will create a new manual event and hide eligible imported duplicates. Original imported events are not deleted.
                </div>
                {eventsTruncated ? (
                  <div className={styles.muted} style={{ fontWeight: 900, marginBottom: 10 }}>
                    This merge is based on currently loaded events only.
                  </div>
                ) : null}

                <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                  <div className={styles.eventItem} style={{ padding: 10 }}>
                    <div style={{ fontWeight: 950 }}>Primary event</div>
                    <div className={styles.eventTitle}>{primary.title}</div>
                    <div className={styles.eventMeta}>
                      {formatTimeRange({ startIso: primary.starts_at, endIso: primary.ends_at, timeZone: primaryTz })} · {candidateLabelForSource(primary)}
                    </div>
                    {locationTextForEvent(primary) ? <div className={styles.eventMeta}>{locationTextForEvent(primary)}</div> : null}
                  </div>

                  <div className={styles.eventItem} style={{ padding: 10 }}>
                    <div style={{ fontWeight: 950 }}>Duplicate event</div>
                    <div className={styles.eventTitle}>{candidate.title}</div>
                    <div className={styles.eventMeta}>
                      {formatTimeRange({ startIso: candidate.starts_at, endIso: candidate.ends_at, timeZone: candTz })} · {candidateLabelForSource(candidate)}
                    </div>
                    {locationTextForEvent(candidate) ? <div className={styles.eventMeta}>{locationTextForEvent(candidate)}</div> : null}
                  </div>
                </div>

                {conflicts.length ? (
                  <div style={{ display: "grid", gap: 12, marginBottom: 12 }}>
                    <div style={{ fontWeight: 950 }}>Choose field winners</div>
                    <div style={{ display: "grid", gap: 12 }}>{conflicts}</div>
                  </div>
                ) : (
                  <div className={styles.muted} style={{ marginBottom: 12 }}>
                    No conflicts detected. Primary event values will be used by default.
                  </div>
                )}

                <div className={styles.eventActions}>
                  <button className={styles.secondaryBtn} type="button" onClick={closeMergeModal} disabled={mergeBusy}>
                    Cancel
                  </button>
                  <button className={styles.primaryBtn} type="button" onClick={() => void onConfirmMerge()} disabled={mergeBusy}>
                    {mergeBusy ? "Merging…" : "Create merged event"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      ) : null}

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
        (() => {
          const importSucceeded = Boolean(importResult);
          return (
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

            <details style={{ marginBottom: 10 }}>
              <summary style={{ cursor: "pointer", fontWeight: 900 }}>Where do I find my calendar link?</summary>
              <div className={styles.muted} style={{ marginTop: 8, display: "grid", gap: 8 }}>
                <div>
                  Most team platforms provide an iCal or calendar subscription link. Paste that link here and Weekend Planner can import and refresh your schedule.
                </div>
                <div>
                  <b>TeamSnap</b>: Look for the team schedule calendar subscription or export option, then copy the iCal/calendar link.
                </div>
                <div>
                  <b>SportsEngine</b>: Look for the iCal feed or subscribe option on your team calendar or schedule page.
                </div>
                <div>
                  <b>GameChanger</b>: Use the schedule sync or calendar export option from your team settings or schedule area.
                </div>
                <div>
                  <b>GotSport</b>: Use the schedule export or calendar subscription option when available for your event or team schedule.
                </div>
                <div>
                  <b>Sports Connect / Blue Sombrero / Stack Sports</b>: Use the Calendar Sync option from your team or league schedule, then copy the iCal/calendar URL.
                </div>
                <div>
                  <b>Generic</b>: Any public iCal/ICS calendar URL that starts with http:// or https:// can be imported.
                </div>
                <div>
                  Availability varies by platform, team, league, and permissions. Weekend Planner supports refreshable calendar feeds, not direct login integrations at this stage.
                </div>
              </div>
            </details>

            {importError ? (
              <div className={styles.muted} style={{ color: "#b91c1c", fontWeight: 800, marginBottom: 10 }}>
                {importError}
              </div>
            ) : null}

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
                  disabled={busy || importSucceeded}
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
                    disabled={busy || importSucceeded}
                  />
                </div>
                <div>
                  <label className={styles.label}>Team name (optional)</label>
                  <input
                    className={styles.input}
                    value={importTeamName}
                    onChange={(e) => setImportTeamName(e.target.value)}
                    placeholder="12U Tigers"
                    disabled={busy || importSucceeded}
                  />
                </div>
              </div>
              <div className={styles.actionsRow}>
                <button className={styles.primaryBtn} onClick={onImportIcs} disabled={busy || importSucceeded}>
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
                  {importSucceeded ? "Done" : "Cancel"}
                </button>
              </div>
              <div className={styles.muted}>
                Calendar import works best with public iCal links. If your platform only offers a private calendar, Weekend Planner may not be able to refresh it.
              </div>
            </div>
          </div>
        </div>
          );
        })()
      ) : null}

      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Planner</h1>
          <p className={styles.subtitle}>Add your schedule, travel, and hotel details for tournament weekend.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className={styles.secondaryBtn}
            onClick={() => {
              setImportOpen(true);
              setImportResult(null);
              setImportError(null);
            }}
            disabled={busy}
          >
            Import calendar link
          </button>
        </div>
      </div>

      {!props.isPaid ? (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Weekend Pro</div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>
              See hotels, food, and parking near every venue. Owl&apos;s Eye™ venue intelligence for your tournament weekends.
            </div>
            <div className={styles.muted}>{WEEKEND_PRO_FOUNDING_SHORT_COPY}</div>
            <div style={{ maxWidth: 420 }}>
              <Link href="/premium" className={styles.primaryBtn} style={{ display: "inline-flex", justifyContent: "center" }}>
                Upgrade to Weekend Pro
              </Link>
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
	                        clearCreateVenueSelection();
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
              <div className={styles.row2}>
                <input className={styles.input} type="date" value={createStartDate} onChange={(e) => setCreateStartDate(e.target.value)} />
                <input className={styles.input} type="time" value={createStartTime} onChange={(e) => setCreateStartTime(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={styles.label}>Ends (optional)</label>
              <div className={styles.row2}>
                <input
                  className={styles.input}
                  type="date"
                  value={createEndDate}
                  onChange={(e) => {
                    setCreateEndWasAuto(false);
                    setCreateEndDate(e.target.value);
                  }}
                />
                <input
                  className={styles.input}
                  type="time"
                  value={createEndTime}
                  onChange={(e) => {
                    setCreateEndWasAuto(false);
                    setCreateEndTime(e.target.value);
                  }}
                />
              </div>
            </div>
          </div>
          <div className={styles.muted}>Timezone: {safeTimeZone(createTimeZone) || safeTimeZone(tz) || "UTC"}</div>

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
	              Timezone: {safeTimeZone(createTimeZone) || safeTimeZone(tz) || "UTC"}
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
                  {formatSourceStatusLabel(s)}
                  {s.last_synced_at ? ` · Last synced ${new Date(s.last_synced_at).toLocaleString()}` : ""}
                </div>
                {staleLabel(s.last_synced_at) && String(s.sync_status || "").toLowerCase() !== "error" ? (
                  <div className={styles.eventMeta} style={{ fontWeight: 800 }}>
                    {staleLabel(s.last_synced_at)} Refresh schedule to check for updates.
                  </div>
                ) : null}
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

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <button
            className={lens === "weekend" ? styles.primaryBtn : styles.secondaryBtn}
            type="button"
            onClick={() => setLens("weekend")}
            disabled={busy}
          >
            This Weekend
          </button>
          <button
            className={lens === "season" ? styles.primaryBtn : styles.secondaryBtn}
            type="button"
            onClick={() => setLens("season")}
            disabled={busy}
          >
            Season
          </button>

          {lens === "season" ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select className={styles.select} value={seasonRange} onChange={(e) => setSeasonRange(e.target.value as SeasonRangePreset)} disabled={busy}>
                <option value="30d">Next 30 days</option>
                <option value="6mo">Next 6 months</option>
                <option value="12mo">Next 12 months</option>
              </select>
              <select className={styles.select} value={seasonFilter} onChange={(e) => setSeasonFilter(e.target.value as SeasonFilter)} disabled={busy}>
                <option value="all">All</option>
                <option value="games">Games</option>
                <option value="practices">Practices</option>
                <option value="travel">Travel</option>
                <option value="other">Other</option>
              </select>
            </div>
          ) : (
            <div className={styles.muted}>
              {(() => {
                const r = computeWeekendRangeLocal(new Date());
                const label = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
                return `Fri–Sun · ${label.format(r.fridayStart)} – ${label.format(addDaysLocal(r.fridayStart, 2))}`;
              })()}
            </div>
          )}
        </div>

        {lens === "season" ? (
          eventsHasMore ? (
            <div className={styles.muted} style={{ fontWeight: 800, marginBottom: 10 }}>
              Showing {events.length} loaded events in this range. Duplicate suggestions only consider loaded events. Load more to check additional events.
            </div>
          ) : events.length ? (
            <div className={styles.muted} style={{ fontWeight: 800, marginBottom: 10 }}>
              All events in this range are loaded. Duplicate suggestions consider all events in this range.
            </div>
          ) : null
        ) : null}

        {events.length === 0 ? (
          lens === "weekend" ? (
            <div className={styles.muted}>
              No events this weekend. Switch to <b>Season</b> to see upcoming events.
            </div>
          ) : (
            <div className={styles.muted}>
              Build your season schedule. Add games, practices, or import a calendar link to keep your team logistics in one place.
            </div>
          )
        ) : (
          <>
            {grouped.map((g) => {
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

                        {dupesByEventId.get(e.id)?.length ? (
                          <div className={styles.eventMeta} style={{ marginTop: 8 }}>
                            <div style={{ fontWeight: 900 }}>Possible duplicate from another calendar</div>
                            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                              {dupesByEventId.get(e.id)!.slice(0, 3).map((c) => {
                                const cand = events.find((x) => x.id === c.candidateEventId) ?? null;
                                if (!cand) return null;
                                const candTz = effectiveTimeZoneForEvent(cand);
                                const dismissKey = `${e.id}:${cand.id}`;
                                const isDismissing = dismissingPairs.has(dismissKey);
                                const mergeLabel = c.confidence === "high" ? "Merge (Recommended)" : "Review merge…";
                                return (
                                  <div key={`${c.eventId}:${c.candidateEventId}`} className={styles.eventItem} style={{ padding: 10 }}>
                                    <div className={styles.eventTitle}>{cand.title}</div>
                                    <div className={styles.eventMeta}>
                                      {formatTimeRange({ startIso: cand.starts_at, endIso: cand.ends_at, timeZone: candTz })}
                                      {" · "}
                                      {candidateLabelForSource(cand)}
                                    </div>
                                    <div className={styles.eventMeta}>
                                      Match signals: {formatDuplicateReasons(c.reasons)}
                                    </div>
                                    <div className={styles.eventActions}>
                                      <button
                                        className={styles.secondaryBtn}
                                        type="button"
                                        onClick={() => openMergeModal({ anchorEventId: e.id, candidateEventId: cand.id })}
                                        disabled={busy}
                                      >
                                        {mergeLabel}
                                      </button>
                                      <button
                                        className={styles.secondaryBtn}
                                        type="button"
                                        onClick={() => void onKeepSeparate(e.id, cand.id)}
                                        disabled={busy || isDismissing}
                                      >
                                        Keep separate
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

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
                              {String(e.source_type || "") === "manual" ? (
                                <button className={styles.secondaryBtn} onClick={() => void onDuplicate(e)} disabled={busy}>
                                  Duplicate
                                </button>
                              ) : null}
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
	                                          clearEditVenueSelection();
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
	                                        onClick={() => clearEditVenueSelection()}
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
                                <div className={styles.row2}>
                                  <input className={styles.input} type="date" value={editStartDate} onChange={(ev) => setEditStartDate(ev.target.value)} />
                                  <input className={styles.input} type="time" value={editStartTime} onChange={(ev) => setEditStartTime(ev.target.value)} />
                                </div>
                              </div>
                              <div>
                                <label className={styles.label}>Ends (optional)</label>
                                <div className={styles.row2}>
                                  <input
                                    className={styles.input}
                                    type="date"
                                    value={editEndDate}
                                    onChange={(ev) => {
                                      setEditEndWasAuto(false);
                                      setEditEndDate(ev.target.value);
                                    }}
                                  />
                                  <input
                                    className={styles.input}
                                    type="time"
                                    value={editEndTime}
                                    onChange={(ev) => {
                                      setEditEndWasAuto(false);
                                      setEditEndTime(ev.target.value);
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                            <div className={styles.muted}>Timezone: {safeTimeZone(editTimeZone) || safeTimeZone(tz) || "UTC"}</div>
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
          })}
            {lens === "season" && eventsHasMore ? (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                <button className={styles.secondaryBtn} onClick={() => void loadMoreEvents()} disabled={eventsPagingBusy}>
                  {eventsPagingBusy ? "Loading more events…" : "Load more events"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
