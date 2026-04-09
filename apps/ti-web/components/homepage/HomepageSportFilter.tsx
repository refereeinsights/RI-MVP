"use client";

import * as React from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";

type Option = { value: string; label: string };

export default function HomepageSportFilter({
  value,
  options,
}: {
  value: string;
  options: Option[];
}) {
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const lastValueRef = React.useRef(value);

  React.useEffect(() => {
    lastValueRef.current = value;
  }, [value]);

  return (
    <form ref={formRef} action="/" method="get" aria-label="Map sport filter">
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#334155", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Sport
        </span>
        <select
          name="sport"
          defaultValue={value}
          onChange={(event) => {
            const next = event.currentTarget.value;
            void trackTiEvent("map_filter_changed", {
              page_type: "homepage",
              filter_name: "sport",
              old_value: lastValueRef.current,
              new_value: next,
            });
            formRef.current?.requestSubmit();
          }}
          style={{
            height: 42,
            borderRadius: 10,
            border: "1px solid rgba(15,23,42,0.14)",
            padding: "0 12px",
            fontSize: 14,
            background: "#fff",
          }}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}

