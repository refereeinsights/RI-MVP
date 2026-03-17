"use client";

import * as React from "react";

type TopTournamentRow = {
  tournamentId: string | null;
  startedCount: number;
  tournamentName: string | null;
  tournamentSlug: string | null;
  tournamentSport: string | null;
  tournamentState: string | null;
};

type TournamentQuickCheckRollup = {
  tournamentId: string;
  submissions: number;
  venuesTouched: number;
  restroomCleanlinessLabel: string | null;
  shadeLabel: string | null;
  parkingDistanceTop: string | null;
  restroomTypeTop: string | null;
  bringChairsYesPct: number | null;
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  fontSize: 12,
  whiteSpace: "nowrap",
};

function Pill({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span style={pillStyle}>
      <span style={{ color: "#64748b", fontWeight: 800 }}>{label}</span>
      <span style={{ fontWeight: 900 }}>{value}</span>
    </span>
  );
}

export default function TopTournamentsByStartedTable({
  rows,
  tiAdminBaseUrl,
  rollupByTournamentId,
}: {
  rows: TopTournamentRow[];
  tiAdminBaseUrl: string;
  rollupByTournamentId: Record<string, TournamentQuickCheckRollup | undefined>;
}) {
  const [openIds, setOpenIds] = React.useState<Record<string, boolean>>({});

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>Tournament</th>
            <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>Sport</th>
            <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>State</th>
            <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>Started</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = row.tournamentId ?? row.tournamentSlug ?? row.tournamentName ?? String(row.startedCount);
            const tournamentId = row.tournamentId ?? "";
            const isOpen = tournamentId ? Boolean(openIds[tournamentId]) : false;
            const label = row.tournamentName || row.tournamentId || "Unknown";
            const href = row.tournamentSlug ? `${tiAdminBaseUrl}/tournaments/${row.tournamentSlug}` : null;
            const rollup = tournamentId ? rollupByTournamentId[tournamentId] : undefined;

            return (
              <React.Fragment key={key}>
                <tr style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 800 }}>
                    {tournamentId ? (
                      <button
                        type="button"
                        onClick={() => setOpenIds((s) => ({ ...s, [tournamentId]: !s[tournamentId] }))}
                        aria-expanded={isOpen}
                        title={isOpen ? "Collapse quick view" : "Expand quick view"}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                          background: "#f8fafc",
                          cursor: "pointer",
                          marginRight: 10,
                          fontWeight: 900,
                          color: "#334155",
                        }}
                      >
                        {isOpen ? "▾" : "▸"}
                      </button>
                    ) : null}
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", textDecoration: "none" }}>
                        {label}
                      </a>
                    ) : (
                      label
                    )}
                  </td>
                  <td style={{ padding: "10px 12px" }}>{row.tournamentSport ?? "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{row.tournamentState ?? "—"}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 900 }}>{row.startedCount}</td>
                </tr>

                {isOpen ? (
                  <tr style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td colSpan={4} style={{ padding: "10px 12px", background: "#f8fafc" }}>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          overflowX: "auto",
                          paddingBottom: 2,
                          alignItems: "center",
                        }}
                      >
                        <Pill label="Submissions" value={rollup?.submissions ?? 0} />
                        <Pill label="Venues" value={rollup?.venuesTouched ?? 0} />
                        <Pill label="Cleanliness" value={rollup?.restroomCleanlinessLabel ?? "—"} />
                        <Pill label="Shade" value={rollup?.shadeLabel ?? "—"} />
                        <Pill label="Parking" value={rollup?.parkingDistanceTop ?? "—"} />
                        <Pill label="Restrooms" value={rollup?.restroomTypeTop ?? "—"} />
                        <Pill
                          label="Bring chairs"
                          value={rollup?.bringChairsYesPct != null ? `${rollup.bringChairsYesPct}%` : "—"}
                        />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

