import { isAnalyticsUuid, makeAnalyticsUuid } from "@/lib/venueHotelFunnel";

export const LODGING_SESSION_STORAGE_KEY = "ti_venue_hotel_session_id";

export function readOrCreateLodgingSessionId() {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.sessionStorage.getItem(LODGING_SESSION_STORAGE_KEY);
    if (existing && isAnalyticsUuid(existing)) return existing;
    const created = makeAnalyticsUuid();
    window.sessionStorage.setItem(LODGING_SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return null;
  }
}
