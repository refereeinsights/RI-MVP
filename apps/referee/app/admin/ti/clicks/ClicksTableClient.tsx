"use client";

import { useMemo, useState } from "react";

type ClickRow = {
  key: string;
  label: string;
  yesterday: number;
  last7d: number;
  last30d: number;
};

type SortKey = "yesterday" | "last7d" | "last30d";

const GROUPS: Array<{ label: string; match: (key: string) => boolean }> = [
  { label: "Tournament Detail", match: (key) => key.startsWith("tournament_detail_") },
  { label: "Tournament Map", match: (key) => key.startsWith("tournament_map_") },
  { label: "Directory", match: (key) => key.startsWith("tournament_directory_") },
  // Safety tweak: don't group all `venue_*` events; keep this tight to map + page view.
  { label: "Venue Map", match: (key) => key.startsWith("venue_map_") || key === "venue_page_viewed" },
  { label: "Weekend Share", match: (key) => key.startsWith("weekend_share_") || key === "weekend_share_clicked" },
  { label: "Weekend Planner", match: (key) => key.startsWith("weekend_planner_") },
  { label: "Conversion", match: (key) => key.startsWith("premium_") || key.startsWith("partner_") },
  { label: "Owl's Eye", match: (key) => key.startsWith("owls_eye_") },
];

function groupLabelFor(key: string) {
  for (const g of GROUPS) if (g.match(key)) return g.label;
  return "Other";
}

function format(n: number) {
  return n.toLocaleString("en-US");
}

export default function ClicksTableClient(props: { rows: ClickRow[]; showOwlsEyeNotLiveBadge?: boolean }) {
  const [sortKey, setSortKey] = useState<SortKey>("last30d");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const hasAnomaly = useMemo(() => props.rows.some((r) => r.yesterday > r.last7d), [props.rows]);

  const grouped = useMemo(() => {
    const withGroup = props.rows.map((row) => ({ ...row, group: groupLabelFor(row.key) }));
    const sorted = withGroup.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      const diff = aVal - bVal;
      return sortDir === "asc" ? diff : -diff;
    });

    const order = [...GROUPS.map((g) => g.label), "Other"];
    const buckets = new Map<string, typeof sorted>();
    for (const label of order) buckets.set(label, []);
    for (const row of sorted) buckets.get(row.group)?.push(row);

    return { buckets, order };
  }, [props.rows, sortDir, sortKey]);

  function toggleSort(next: SortKey) {
    if (sortKey !== next) {
      setSortKey(next);
      setSortDir("desc");
      return;
    }
    setSortDir((d) => (d === "desc" ? "asc" : "desc"));
  }

  const sortLabel = (key: SortKey, label: string) => {
    const active = sortKey === key;
    const arrow = active ? (sortDir === "desc" ? " ▼" : " ▲") : "";
    return `${label}${arrow}`;
  };

  return (
    <>
      {hasAnomaly ? (
        <div
          style={{
            border: "1px solid #f59e0b",
            background: "#fffbeb",
            color: "#7c2d12",
            borderRadius: 12,
            padding: "10px 12px",
            marginBottom: 12,
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          Possible anomaly detected: at least one event has Yesterday &gt; Last 7d.
        </div>
      ) : null}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Event</th>
              <th
                role="button"
                tabIndex={0}
                onClick={() => toggleSort("yesterday")}
                style={{ textAlign: "right", fontSize: 12, color: "#6b7280", padding: "10px 8px", cursor: "pointer" }}
              >
                {sortLabel("yesterday", "Yesterday")}
              </th>
              <th
                role="button"
                tabIndex={0}
                onClick={() => toggleSort("last7d")}
                style={{ textAlign: "right", fontSize: 12, color: "#6b7280", padding: "10px 8px", cursor: "pointer" }}
              >
                {sortLabel("last7d", "Last 7d")}
              </th>
              <th
                role="button"
                tabIndex={0}
                onClick={() => toggleSort("last30d")}
                style={{ textAlign: "right", fontSize: 12, color: "#6b7280", padding: "10px 8px", cursor: "pointer" }}
              >
                {sortLabel("last30d", "Last 30d")}
              </th>
            </tr>
          </thead>
          <tbody>
            {grouped.order.map((label) => {
              const rows = grouped.buckets.get(label) ?? [];
              if (!rows.length) return null;
              return (
                <>
                  <tr key={`group-${label}`}>
                    <td
                      colSpan={4}
                      style={{
                        padding: "10px 8px",
                        fontSize: 12,
                        fontWeight: 950,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "#334155",
                        background: "#f8fafc",
                        borderTop: "1px solid #e5e7eb",
                      }}
                    >
                      {label}
                    </td>
                  </tr>
                  {rows.map((row) => (
                    <tr key={row.key} style={{ borderTop: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 8px", fontWeight: 900, color: "#111", minWidth: 320 }}>
                        {row.label}{" "}
                        {props.showOwlsEyeNotLiveBadge && row.key.startsWith("owls_eye_") ? (
                          <span style={{ fontSize: 12, fontWeight: 900, color: "#64748b" }}>(not live)</span>
                        ) : null}
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 950 }}>{format(row.yesterday)}</td>
                      <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 950 }}>{format(row.last7d)}</td>
                      <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 950 }}>{format(row.last30d)}</td>
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

