import { NextResponse } from "next/server";

type ForecastDay = {
  date: string; // YYYY-MM-DD
  temp_high_f: number | null;
  temp_low_f: number | null;
  precip_prob_pct: number | null;
  wind_mph: number | null;
  weather_code: number | null;
  condition: string | null;
};

function clampNumber(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function parseNum(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function conditionFromWeatherCode(code: number | null): string | null {
  if (code === null) return null;
  // Open-Meteo weather codes (WMO). Keep labels short and non-alarming.
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if ([51, 53, 55].includes(code)) return "Drizzle";
  if ([56, 57].includes(code)) return "Freezing drizzle";
  if ([61, 63, 65].includes(code)) return "Rain";
  if ([66, 67].includes(code)) return "Freezing rain";
  if ([71, 73, 75].includes(code)) return "Snow";
  if (code === 77) return "Snow grains";
  if ([80, 81, 82].includes(code)) return "Rain showers";
  if ([85, 86].includes(code)) return "Snow showers";
  if (code === 95) return "Thunderstorms";
  if ([96, 99].includes(code)) return "Thunderstorms";
  return "Mixed";
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number, revalidateSeconds: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: "force-cache",
      next: { revalidate: revalidateSeconds },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeLatLngFromCityState(params: { city: string; state: string; zip?: string | null }) {
  const zip = String(params.zip ?? "").trim();
  const zip5 = /^\d{5}$/.test(zip) ? zip : "";
  const q = `${params.city}, ${params.state}${zip5 ? ` ${zip5}` : ""}`.trim();
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", q);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  url.searchParams.set("country", "US");
  const json = await fetchJsonWithTimeout(url.toString(), 3500, 60 * 60 * 24);
  const first = Array.isArray(json?.results) ? json.results[0] : null;
  const lat = typeof first?.latitude === "number" ? first.latitude : null;
  const lng = typeof first?.longitude === "number" ? first.longitude : null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng, resolved_name: String(first?.name ?? "").trim() || null };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const latRaw = parseNum(searchParams.get("lat"));
  const lngRaw = parseNum(searchParams.get("lng"));
  const city = String(searchParams.get("city") ?? "").trim();
  const state = String(searchParams.get("state") ?? "").trim().toUpperCase();
  const zip = String(searchParams.get("zip") ?? "").trim();

  let latitude = latRaw;
  let longitude = lngRaw;
  let resolvedLocationLabel: string | null = null;

  if (latitude === null || longitude === null) {
    if (city && state) {
      try {
        const geo = await geocodeLatLngFromCityState({ city, state, zip });
        if (geo) {
          latitude = geo.latitude;
          longitude = geo.longitude;
          resolvedLocationLabel = geo.resolved_name ? `${geo.resolved_name}, ${state}` : `${city}, ${state}`;
        }
      } catch {
        // best-effort only
      }
    }
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json(
      { ok: false, error: "missing_location" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  const safeLat = clampNumber(Number(latitude), -90, 90);
  const safeLng = clampNumber(Number(longitude), -180, 180);

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(safeLat));
  forecastUrl.searchParams.set("longitude", String(safeLng));
  forecastUrl.searchParams.set("timezone", "auto");
  forecastUrl.searchParams.set("forecast_days", "10");
  forecastUrl.searchParams.set("temperature_unit", "fahrenheit");
  forecastUrl.searchParams.set("windspeed_unit", "mph");
  forecastUrl.searchParams.set(
    "daily",
    [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
      "windspeed_10m_max",
      "weathercode",
    ].join(",")
  );

  try {
    const json = await fetchJsonWithTimeout(forecastUrl.toString(), 3500, 60 * 30);
    const daily = json?.daily ?? null;
    const times: string[] = Array.isArray(daily?.time) ? daily.time : [];
    const highs: Array<number | null> = Array.isArray(daily?.temperature_2m_max) ? daily.temperature_2m_max : [];
    const lows: Array<number | null> = Array.isArray(daily?.temperature_2m_min) ? daily.temperature_2m_min : [];
    const precip: Array<number | null> = Array.isArray(daily?.precipitation_probability_max)
      ? daily.precipitation_probability_max
      : [];
    const wind: Array<number | null> = Array.isArray(daily?.windspeed_10m_max) ? daily.windspeed_10m_max : [];
    const codes: Array<number | null> = Array.isArray(daily?.weathercode) ? daily.weathercode : [];

    const days: ForecastDay[] = times.slice(0, 10).map((date, idx) => {
      const weatherCode = typeof codes[idx] === "number" ? codes[idx] : null;
      return {
        date,
        temp_high_f: typeof highs[idx] === "number" ? highs[idx] : null,
        temp_low_f: typeof lows[idx] === "number" ? lows[idx] : null,
        precip_prob_pct: typeof precip[idx] === "number" ? precip[idx] : null,
        wind_mph: typeof wind[idx] === "number" ? wind[idx] : null,
        weather_code: weatherCode,
        condition: conditionFromWeatherCode(weatherCode),
      };
    });

    return NextResponse.json(
      {
        ok: true,
        latitude: safeLat,
        longitude: safeLng,
        timezone: String(json?.timezone ?? "").trim() || null,
        resolved_location_label: resolvedLocationLabel,
        days,
      },
      {
        status: 200,
        headers: {
          // Keep this cacheable at the edge; the handler also uses fetch revalidation above.
          "Cache-Control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=86400",
        },
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "forecast_failed";
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
