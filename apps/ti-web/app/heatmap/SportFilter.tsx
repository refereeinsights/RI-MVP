"use client";

import * as React from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";

export default function SportFilter({
  value,
  options,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
}) {
  const lastValueRef = React.useRef(value);

  React.useEffect(() => {
    lastValueRef.current = value;
  }, [value]);

  return (
    <form method="get" style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#334155" }}>
        Sport
        <select
          name="sport"
          defaultValue={value}
          onChange={(e) => {
            const next = e.currentTarget.value;
            void trackTiEvent("map_filter_changed", {
              page_type: "heatmap",
              filter_name: "sport",
              old_value: lastValueRef.current,
              new_value: next,
            });
            e.currentTarget.form?.submit();
          }}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            background: "#ffffff",
            fontSize: 13,
          }}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <noscript>
        <button
          type="submit"
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            background: "#ffffff",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Apply
        </button>
      </noscript>
    </form>
  );
}
