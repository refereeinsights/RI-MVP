"use client";

import React, { useMemo, useState } from "react";

const SPORTS = [
  { key: "soccer", label: "Soccer", icon: "⚽" },
  { key: "basketball", label: "Basketball", icon: "🏀" },
  { key: "football", label: "Football", icon: "🏈" },
] as const;

export default function SportsPickerClient({
  name,
  defaultSelected,
}: {
  name: string;
  defaultSelected: string[];
}) {
  const initial = useMemo(() => new Set(defaultSelected), [defaultSelected]);
  const [selected, setSelected] = useState<Set<string>>(initial);

  const csv = Array.from(selected).join(",");

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div>
      <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 6, textAlign: "center" }}>
        Sports
      </div>

      <input type="hidden" name={name} value={csv} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {SPORTS.map((s) => {
          const isOn = selected.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #111",
                background: isOn ? "#111" : "#fff",
                color: isOn ? "#fff" : "#111",
                fontWeight: 900,
                cursor: "pointer",
                minWidth: 94,
                textAlign: "center",
              }}
              aria-pressed={isOn}
            >
              <span style={{ fontSize: 24, lineHeight: 1.1 }}>{s.icon}</span>
              <span style={{ fontSize: 13 }}>{s.label}</span>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
        Selected: {csv || "—"}
      </div>
    </div>
  );
}
