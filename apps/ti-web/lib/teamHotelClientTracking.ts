"use client";

const ANONYMOUS_VISITOR_KEY = "ti_anonymous_visitor_id";
const TEAM_HOTEL_SESSION_KEY = "ti_team_hotel_session_id";
const LAST_CTA_INTERACTION_KEY = "ti_team_hotel_last_cta_interaction_id";

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
