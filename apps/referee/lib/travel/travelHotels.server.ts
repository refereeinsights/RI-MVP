import "server-only";

import {
  MAX_TRAVEL_RESULTS,
  normalizeTravelHotel,
  RI_TRAVEL_CUSTOM8,
  RI_TRAVEL_PAGE_TYPE,
  RI_TRAVEL_SOURCE,
  type ValidTravelSearch,
} from "./travelContracts";

export function getTiTravelOrigin() {
  const configured = String(process.env.NEXT_PUBLIC_TI_SITE_URL ?? "").trim().replace(/\/+$/, "");
  return configured || (process.env.NODE_ENV === "production" ? "https://www.tournamentinsights.com" : "http://localhost:3001");
}

export async function searchTravelHotels(search: ValidTravelSearch, fetchImpl: typeof fetch = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchImpl(`${getTiTravelOrigin()}/api/lodging/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(search.venueId ? { venueId: search.venueId } : { destination: search.destination }),
        checkin: search.checkin,
        checkout: search.checkout,
        source: RI_TRAVEL_SOURCE,
        request_source: RI_TRAVEL_SOURCE,
        page_type: RI_TRAVEL_PAGE_TYPE,
        current_page_type: RI_TRAVEL_PAGE_TYPE,
        page_url: "/travel",
        current_page_path: "/travel",
        cta_placement: "ri_travel_search",
        flow_type: RI_TRAVEL_SOURCE,
        custom8: RI_TRAVEL_CUSTOM8,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      return {
        ok: false as const,
        status: response.status === 429 ? 429 : response.status === 422 ? 422 : 503,
        error: response.status === 429
          ? "Too many searches. Please wait a moment and try again."
          : response.status === 422
            ? "Those dates are outside the supported booking window."
            : "Hotel results are temporarily unavailable. Please try again.",
      };
    }
    const hotels = (Array.isArray(payload?.hotels) ? payload.hotels : [])
      .map(normalizeTravelHotel)
      .filter((hotel): hotel is NonNullable<typeof hotel> => Boolean(hotel))
      .slice(0, MAX_TRAVEL_RESULTS);
    return {
      ok: true as const,
      hotels,
      sessionId: typeof payload?.sessionId === "string" ? payload.sessionId : null,
      checkin: typeof payload?.resolvedCheckIn === "string" ? payload.resolvedCheckIn : search.checkin,
      checkout: typeof payload?.resolvedCheckOut === "string" ? payload.resolvedCheckOut : search.checkout,
    };
  } catch {
    return { ok: false as const, status: 503, error: "Hotel results are temporarily unavailable. Please try again." };
  } finally {
    clearTimeout(timeout);
  }
}
