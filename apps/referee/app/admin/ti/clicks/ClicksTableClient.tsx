"use client";

import { useMemo, useState } from "react";

type ClickRow = {
  key: string;
  label: string;
  today: number;
  yesterday: number;
  last7d: number;
  last30d: number;
};

type SortKey = "today" | "yesterday" | "last7d" | "last30d";

const GROUPS: Array<{ label: string; match: (key: string) => boolean }> = [
  { label: "Discovery", match: (key) => ["map_viewed", "homepage_cta_clicked", "homepage_sport_chip_clicked", "venue_page_viewed", "weekend_page_opened"].includes(key) },
  { label: "Tournament Detail", match: (key) => key.startsWith("tournament_detail_") },
  { label: "Tournament Map", match: (key) => key.startsWith("tournament_map_") },
  { label: "Directory", match: (key) => key.startsWith("tournament_directory_") || key === "search_submitted" || key === "tournament_card_plan_weekend_clicked" },
  { label: "Venue Directory", match: (key) => key.startsWith("venue_directory_") },
  {
    label: "Venue Map",
    match: (key) =>
      key.startsWith("venue_map_") ||
      ["venue_page_viewed", "venue_select", "directions_click", "hotels_click", "venue_view_click", "nearest_airport_click", "venue_hotels_cta_clicked"].includes(key),
  },
  { label: "Weekend Share", match: (key) => key.startsWith("weekend_share_") || key === "weekend_share_clicked" },
  { label: "Weekend Planner", match: (key) => key.startsWith("weekend_planner_") },
  { label: "Conversion", match: (key) => key.startsWith("premium_") || key.startsWith("partner_") || key === "tier_gate_hit" },
  { label: "Owl's Eye", match: (key) => key.startsWith("owls_eye_") },
  { label: "Book Travel", match: (key) => key.startsWith("book_travel_") },
];

function groupLabelFor(key: string) {
  for (const g of GROUPS) if (g.match(key)) return g.label;
  return "Other";
}

function format(n: number) {
  return n.toLocaleString("en-US");
}

function trendArrow(yesterday: number, last7d: number): string {
  if (last7d === 0) return "";
  const avg = last7d / 7;
  if (yesterday > avg * 1.5) return "↑↑";
  if (yesterday > avg * 1.1) return "↑";
  if (yesterday < avg * 0.5 && yesterday > 0) return "↓↓";
  if (yesterday < avg * 0.9 && yesterday > 0) return "↓";
  return "→";
}

function trendColor(arrow: string): string {
  if (arrow === "↑↑" || arrow === "↑") return "#16a34a";
  if (arrow === "↓↓" || arrow === "↓") return "#b91c1c";
  return "#6b7280";
}

export default function ClicksTableClient(props: { rows: ClickRow[]; showOwlsEyeNotLiveBadge?: boolean }) {
  const [sortKey, setSortKey] = useState<SortKey>("last30d");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Anomaly: yesterday exceeds 2× the 7d daily average (not the 7d total sum)
  const hasAnomaly = useMemo(
    () => props.rows.some((r) => r.last7d > 0 && r.yesterday > (r.last7d / 7) * 2),
    [props.rows]
  );

  const grouped = useMemo(() => {
    const withGroup = props.rows.map((row) => ({ ...row, group: groupLabelFor(row.key) }));
    const sorted = withGroup.sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
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
          Possible anomaly: at least one event had Yesterday &gt; 2× its 7-day daily average.
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
                onClick={() => toggleSort("today")}
                style={{ textAlign: "right", fontSize: 12, color: "#6b7280", padding: "10px 8px", cursor: "pointer" }}
              >
                {sortLabel("today", "Today")}
              </th>
              <th
                role="button"
                tabIndex={0}
                onClick={() => toggleSort("yesterday")}
                style={{ textAlign: "right", fontSize: 12, color: "#6b7280", padding: "10px 8px", cursor: "pointer" }}
              >
                {sortLabel("yesterday", "Yesterday")}
              </th>
              <th style={{ textAlign: "right", fontSize: 12, color: "#6b7280", padding: "10px 8px" }}>Trend</th>
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
                      colSpan={6}
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
                  {rows.map((row) => {
                    const arrow = trendArrow(row.yesterday, row.last7d);
                    return (
                      <tr key={row.key} style={{ borderTop: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "10px 8px", fontWeight: 900, color: "#111", minWidth: 320 }}>
                          {row.label}{" "}
                          {props.showOwlsEyeNotLiveBadge && row.key.startsWith("owls_eye_") ? (
                            <span style={{ fontSize: 12, fontWeight: 900, color: "#64748b" }}>(not live)</span>
                          ) : null}
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 950, color: "#64748b" }}>{format(row.today)}</td>
                        <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 950 }}>{format(row.yesterday)}</td>
                        <td
                          style={{
                            padding: "10px 8px",
                            textAlign: "right",
                            fontWeight: 950,
                            fontSize: 14,
                            color: trendColor(arrow),
                          }}
                        >
                          {arrow}
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 950 }}>{format(row.last7d)}</td>
                        <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 950 }}>{format(row.last30d)}</td>
                      </tr>
                    );
                  })}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
