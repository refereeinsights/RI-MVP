"use client";

import { useEffect, useMemo, useState } from "react";

type ForecastDay = {
  date: string; // YYYY-MM-DD
  temp_high_f: number | null;
  temp_low_f: number | null;
  precip_prob_pct: number | null;
  wind_mph: number | null;
  weather_code: number | null;
  condition: string | null;
};

type ForecastResponse =
  | {
      ok: true;
      latitude: number;
      longitude: number;
      timezone: string | null;
      resolved_location_label: string | null;
      days: ForecastDay[];
    }
  | { ok: false; error?: string };

function formatDow(date: string) {
  try {
    const d = new Date(`${date}T00:00:00`);
    return d.toLocaleDateString(undefined, { weekday: "short" });
  } catch {
    return "";
  }
}

function formatMonDay(date: string) {
  try {
    const d = new Date(`${date}T00:00:00`);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return date;
  }
}

function buildTips(days: ForecastDay[]) {
  const tips: string[] = [];
  const maxPrecip = Math.max(...days.map((d) => (typeof d.precip_prob_pct === "number" ? d.precip_prob_pct : 0)));
  const maxHigh = Math.max(...days.map((d) => (typeof d.temp_high_f === "number" ? d.temp_high_f : -999)));
  const minLow = Math.min(...days.map((d) => (typeof d.temp_low_f === "number" ? d.temp_low_f : 999)));
  const maxWind = Math.max(...days.map((d) => (typeof d.wind_mph === "number" ? d.wind_mph : 0)));

  if (maxPrecip >= 50) tips.push("Rain expected: consider rain gear and extra socks.");
  if (maxHigh >= 88) tips.push("Hot days: plan extra water and shade.");
  if (minLow <= 45) tips.push("Cold mornings: pack layers for early games.");
  if (maxWind >= 20) tips.push("Windy days: secure tents and sideline gear.");

  return tips.slice(0, 3);
}

function isWithinRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

export default function VenueWeatherPlannerCard(props: {
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  state?: string | null;
  tournamentStartDate?: string | null; // YYYY-MM-DD
  tournamentEndDate?: string | null; // YYYY-MM-DD
}) {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const qp = useMemo(() => {
    const sp = new URLSearchParams();
    if (typeof props.latitude === "number" && typeof props.longitude === "number") {
      sp.set("lat", String(props.latitude));
      sp.set("lng", String(props.longitude));
    } else {
      const city = String(props.city ?? "").trim();
      const state = String(props.state ?? "").trim();
      if (city) sp.set("city", city);
      if (state) sp.set("state", state);
    }
    return sp.toString();
  }, [props.latitude, props.longitude, props.city, props.state]);

  useEffect(() => {
    let mounted = true;
    if (!qp) {
      setData({ ok: false, error: "missing_location" });
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/weather/ten-day?${qp}`, { signal: controller.signal })
      .then(async (res) => {
        const json = (await res.json()) as ForecastResponse;
        if (!mounted) return;
        setData(json);
      })
      .catch(() => {
        if (!mounted) return;
        setData({ ok: false, error: "fetch_failed" });
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [qp]);

  const days = data && data.ok ? data.days : [];
  const tips = useMemo(() => buildTips(days), [days]);
  const tournamentStart = (props.tournamentStartDate ?? "").trim();
  const tournamentEnd = (props.tournamentEndDate ?? "").trim();
  const canHighlight = tournamentStart.length === 10 && tournamentEnd.length === 10 && tournamentStart <= tournamentEnd;

  return (
    <div style={{ marginTop: 10, borderRadius: 14, border: "1px solid rgba(255,255,255,0.18)", padding: "10px 12px" }}>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontWeight: 950 }}>10-Day Weather Planner</div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>Forecast for tournament families planning around this venue.</div>
        <div style={{ fontSize: 12, opacity: 0.78, lineHeight: 1.35 }}>
          Use the 10-day forecast to plan clothing, shade, hydration, and sideline gear for games at this venue.
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>Loading forecast…</div>
      ) : data && data.ok ? (
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            {days.slice(0, 10).map((d) => {
              const highlight = canHighlight && isWithinRange(d.date, tournamentStart, tournamentEnd);
              return (
                <div
                  key={d.date}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "70px 1fr 110px",
                    gap: 10,
                    alignItems: "center",
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: highlight ? "1px solid rgba(247,215,116,0.55)" : "1px solid rgba(255,255,255,0.12)",
                    background: highlight ? "rgba(247,215,116,0.10)" : "rgba(255,255,255,0.04)",
                  }}
                >
                  <div style={{ display: "grid", lineHeight: 1.1 }}>
                    <div style={{ fontSize: 12, fontWeight: 900 }}>{formatDow(d.date)}</div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>{formatMonDay(d.date)}</div>
                  </div>

                  <div style={{ display: "grid", gap: 2 }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>
                      {typeof d.temp_high_f === "number" ? Math.round(d.temp_high_f) : "—"}° /{" "}
                      {typeof d.temp_low_f === "number" ? Math.round(d.temp_low_f) : "—"}°
                      <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, opacity: 0.9 }}>
                        {d.condition ?? ""}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                      {typeof d.precip_prob_pct === "number" ? `Precip ${Math.round(d.precip_prob_pct)}%` : "Precip —"}
                      {typeof d.wind_mph === "number" ? ` • Wind ${Math.round(d.wind_mph)} mph` : " • Wind —"}
                    </div>
                  </div>

                  <div style={{ justifySelf: "end", fontSize: 12, opacity: 0.78 }}>
                    {highlight ? "Tournament dates" : ""}
                  </div>
                </div>
              );
            })}
          </div>

          {tips.length ? (
            <div style={{ display: "grid", gap: 4, fontSize: 13, opacity: 0.92 }}>
              <div style={{ fontWeight: 900 }}>Planning notes</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 2 }}>
                {tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <div style={{ marginTop: 2, fontSize: 12, opacity: 0.75 }}>
                Forecasts can change with season, trees, buildings, tents, and game time.
              </div>
            </div>
          ) : (
            <div style={{ marginTop: -4, fontSize: 12, opacity: 0.75 }}>
              Forecasts can change with season, trees, buildings, tents, and game time.
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>Weather planner unavailable right now.</div>
      )}
    </div>
  );
}

