"use client";

import { useEffect, useId, useMemo, useState } from "react";
import VenueWeatherPlannerCard from "@/components/venues/VenueWeatherPlannerCard";

export default function TournamentWeatherPlannerAccordion({
  anchorId = "weather-planner",
  latitude,
  longitude,
  city,
  state,
  zip,
  tournamentStartDate,
  tournamentEndDate,
}: {
  anchorId?: string;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  tournamentStartDate?: string | null;
  tournamentEndDate?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  const locationLabel = useMemo(() => {
    const parts = [String(city ?? "").trim(), String(state ?? "").trim().toUpperCase()].filter(Boolean);
    const out = parts.join(", ");
    return out || null;
  }, [city, state]);

  const summary =
    locationLabel != null
      ? `10-day forecast for ${locationLabel}.`
      : "Check the forecast to plan clothing, hydration, shade, and sideline gear for this tournament.";

  useEffect(() => {
    const onHash = () => {
      const hash = String(window.location.hash ?? "");
      const id = hash.startsWith("#") ? hash.slice(1) : hash;
      if (id && id === anchorId) setOpen(true);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [anchorId]);

  return (
    <div style={{ marginTop: 12, width: "min(720px, 100%)", marginLeft: "auto", marginRight: "auto" }}>
      <details
        open={open}
        onToggle={(e) => {
          setOpen((e.currentTarget as HTMLDetailsElement).open);
        }}
        style={{
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.25)",
          background: "rgba(255,255,255,0.12)",
          padding: "10px 12px",
          textAlign: "left",
        }}
      >
        <summary
          aria-controls={contentId}
          style={{
            cursor: "pointer",
            listStyle: "none",
            display: "grid",
            gap: 4,
            justifyItems: "center",
            textAlign: "center",
            outline: "none",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "center", gap: 10 }}>
            <span style={{ fontWeight: 950 }}>10-Day Weather Planner</span>
            <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>{open ? "Hide forecast" : "View 10-day forecast"}</span>
          </div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>{summary}</div>
        </summary>

        <div id={contentId} style={{ marginTop: 10 }}>
          {open ? (
            <VenueWeatherPlannerCard
              showHeader={false}
              latitude={latitude ?? null}
              longitude={longitude ?? null}
              city={city ?? null}
              state={state ?? null}
              zip={zip ?? null}
              tournamentStartDate={tournamentStartDate ?? null}
              tournamentEndDate={tournamentEndDate ?? null}
            />
          ) : null}
        </div>
      </details>
    </div>
  );
}
