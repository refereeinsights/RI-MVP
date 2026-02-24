"use client";

import { useEffect, useState } from "react";

const LABEL_WIDTH_KEY = "ri_event_label_width_in";
const LABEL_HEIGHT_KEY = "ri_event_label_height_in";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function LabelPrintSettings() {
  const [width, setWidth] = useState("1.5");
  const [height, setHeight] = useState("0.75");

  useEffect(() => {
    try {
      const storedWidth = window.localStorage.getItem(LABEL_WIDTH_KEY);
      const storedHeight = window.localStorage.getItem(LABEL_HEIGHT_KEY);
      if (storedWidth) setWidth(storedWidth);
      if (storedHeight) setHeight(storedHeight);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      const w = clamp(Number(width || "1.5"), 0.5, 4);
      if (Number.isFinite(w)) window.localStorage.setItem(LABEL_WIDTH_KEY, String(w));
    } catch {
      // ignore storage errors
    }
  }, [width]);

  useEffect(() => {
    try {
      const h = clamp(Number(height || "0.75"), 0.5, 2);
      if (Number.isFinite(h)) window.localStorage.setItem(LABEL_HEIGHT_KEY, String(h));
    } catch {
      // ignore storage errors
    }
  }, [height]);

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "end",
        flexWrap: "wrap",
        marginBottom: 10,
        padding: "8px 10px",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        background: "#fafafa",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", minWidth: 180 }}>Label print size (inches)</div>
      <label style={{ display: "grid", gap: 3, fontSize: 12 }}>
        Width
        <input
          type="number"
          min={0.5}
          max={4}
          step={0.05}
          value={width}
          onChange={(e) => setWidth(e.target.value)}
          style={{ width: 96, padding: 6 }}
        />
      </label>
      <label style={{ display: "grid", gap: 3, fontSize: 12 }}>
        Height
        <input
          type="number"
          min={0.5}
          max={2}
          step={0.05}
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          style={{ width: 96, padding: 6 }}
        />
      </label>
      <div style={{ fontSize: 12, color: "#64748b" }}>Saved in this browser and reused for all Print label actions.</div>
    </div>
  );
}

