const TIMEZONE_URL = "https://maps.googleapis.com/maps/api/timezone/json";

export async function timezoneFromCoordinates(
  lat: number,
  lng: number,
  apiKey: string,
  timestampSeconds: number = Math.floor(Date.now() / 1000)
): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const url = `${TIMEZONE_URL}?location=${encodeURIComponent(`${lat},${lng}`)}&timestamp=${timestampSeconds}&key=${apiKey}`;
  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) {
    console.error("[timezone] request failed", resp.status, await resp.text());
    return null;
  }

  const json = (await resp.json()) as {
    status?: string;
    timeZoneId?: string;
    errorMessage?: string;
  };

  if (json.status !== "OK" || !json.timeZoneId) {
    console.warn("[timezone] no result", json.status, json.errorMessage ?? "");
    return null;
  }

  return json.timeZoneId;
}

export default timezoneFromCoordinates;
