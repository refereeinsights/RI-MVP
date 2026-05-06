import { EXTERNAL_API, EXTERNAL_API_SURFACE, trackExternalCall } from "@/lib/trackExternalCall";

const TIMEZONE_URL = "https://maps.googleapis.com/maps/api/timezone/json";
const TIMEZONEDB_URL = "https://api.timezonedb.com/v2.1/get-time-zone";

export async function timezoneFromCoordinates(
  lat: number,
  lng: number,
  apiKey: string,
  timestampSeconds: number = Math.floor(Date.now() / 1000)
): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const tzdbKey = String(process.env.TIMEZONEDB_API_KEY ?? "").trim();

  if (tzdbKey) {
    const url = `${TIMEZONEDB_URL}?key=${encodeURIComponent(tzdbKey)}&format=json&by=position&lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`;
    const resp = await trackExternalCall(EXTERNAL_API.timezonedb, "timezone", EXTERNAL_API_SURFACE.venue_timezone, () =>
      fetch(url, { method: "GET" })
    );
    if (!resp.ok) {
      console.error("[timezone] timezonedb request failed", resp.status, await resp.text());
      return null;
    }
    const json = (await resp.json()) as { status?: string; zoneName?: string; message?: string };
    if (json.status !== "OK" || !json.zoneName) {
      console.warn("[timezone] timezonedb no result", json.status, json.message ?? "");
      return null;
    }
    return json.zoneName;
  }

  // Back-compat fallback: keep existing Google behavior when TIMEZONEDB_API_KEY isn't configured.
  if (!apiKey) return null;
  const url = `${TIMEZONE_URL}?location=${encodeURIComponent(`${lat},${lng}`)}&timestamp=${timestampSeconds}&key=${apiKey}`;
  const resp = await trackExternalCall(EXTERNAL_API.google_places, "timezone", EXTERNAL_API_SURFACE.venue_timezone, () =>
    fetch(url, { method: "GET" })
  );
  if (!resp.ok) {
    console.error("[timezone] google request failed", resp.status, await resp.text());
    return null;
  }

  const json = (await resp.json()) as { status?: string; timeZoneId?: string; errorMessage?: string };
  if (json.status !== "OK" || !json.timeZoneId) {
    console.warn("[timezone] google no result", json.status, json.errorMessage ?? "");
    return null;
  }
  return json.timeZoneId;
}

export default timezoneFromCoordinates;
