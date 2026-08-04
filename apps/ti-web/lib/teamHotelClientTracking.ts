"use client";

const ANONYMOUS_VISITOR_KEY = "ti_anonymous_visitor_id";
const TEAM_HOTEL_SESSION_KEY = "ti_team_hotel_session_id";
const LAST_CTA_INTERACTION_KEY = "ti_team_hotel_last_cta_interaction_id";
const LANDING_VIEW_PREFIX = "ti_team_hotel_landing_viewed:";
const PENDING_ENTRY_KEY = "ti_team_hotel_pending_entry";

type PendingTeamHotelEntry = {
  key: string;
  sourceSurface?: "global_header" | "team_hotel_booking_landing" | "team_hotel" | "travel" | "tournament" | "venue" | null;
  sourcePath?: string | null;
  ctaInteractionId?: string | null;
};

function randomId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `th_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function readStorage(kind: "local" | "session") {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function getOrCreateStorageId(kind: "local" | "session", key: string) {
  const storage = readStorage(kind);
  if (!storage) return null;
  const existing = storage.getItem(key);
  if (existing) return existing;
  const next = randomId();
  try {
    storage.setItem(key, next);
  } catch {
    // ignore
  }
  return next;
}

export function getAnonymousVisitorId() {
  return getOrCreateStorageId("local", ANONYMOUS_VISITOR_KEY);
}

export function getTeamHotelSessionId() {
  return getOrCreateStorageId("session", TEAM_HOTEL_SESSION_KEY);
}

export function createTeamHotelCtaInteractionId() {
  return randomId();
}

export function rememberLastTeamHotelCtaInteractionId(interactionId: string | null) {
  const storage = readStorage("session");
  if (!storage) return;
  if (!interactionId) {
    try {
      storage.removeItem(LAST_CTA_INTERACTION_KEY);
    } catch {
      // ignore
    }
    return;
  }
  try {
    storage.setItem(LAST_CTA_INTERACTION_KEY, interactionId);
  } catch {
    // ignore
  }
}

export function readLastTeamHotelCtaInteractionId() {
  const storage = readStorage("session");
  if (!storage) return null;
  return storage.getItem(LAST_CTA_INTERACTION_KEY);
}

export function currentPathWithSearch() {
  if (typeof window === "undefined") return null;
  return `${window.location.pathname}${window.location.search}`;
}

export function markTeamHotelLandingViewed(viewKey: string) {
  const storage = readStorage("session");
  if (!storage) return false;
  const key = `${LANDING_VIEW_PREFIX}${viewKey}`;
  if (storage.getItem(key) === "1") return false;
  try {
    storage.setItem(key, "1");
  } catch {
    // ignore
  }
  return true;
}

export function rememberPendingTeamHotelEntry(entry: PendingTeamHotelEntry) {
  const storage = readStorage("session");
  if (!storage) return;
  try {
    storage.setItem(PENDING_ENTRY_KEY, JSON.stringify(entry));
  } catch {
    // ignore
  }
}

export function consumePendingTeamHotelEntry() {
  const storage = readStorage("session");
  if (!storage) return null;
  const raw = storage.getItem(PENDING_ENTRY_KEY);
  if (!raw) return null;
  try {
    storage.removeItem(PENDING_ENTRY_KEY);
  } catch {
    // ignore
  }
  try {
    const parsed = JSON.parse(raw) as PendingTeamHotelEntry;
    if (!parsed || typeof parsed.key !== "string" || !parsed.key.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}
