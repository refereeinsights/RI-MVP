"use client";

import { useState } from "react";

import type { AdminTournamentHotelProgramView } from "@/lib/hotelProgramAdmin";

type ProgramType = "standard" | "ti_revenue" | "tournament_support";
type ProgramStatus = "not_enrolled" | "pending" | "active" | "paused";
type RateCents = 500 | 1000;

export default function HotelProgramAdminSection({
  tournamentName,
  tournamentId,
  view,
  saveAction,
}: {
  tournamentName: string;
  tournamentId: string;
  view: AdminTournamentHotelProgramView;
  saveAction: (formData: FormData) => Promise<void>;
}) {
  const [programType, setProgramType] = useState<ProgramType>(view.stored?.programType ?? "standard");
  const [status, setStatus] = useState<ProgramStatus>(view.stored?.status ?? "not_enrolled");
  const [rateCents, setRateCents] = useState<RateCents>(view.stored?.rateCents ?? 500);
  const isStandard = programType === "standard";
  const configurationKey = isStandard ? null : `${programType}_${rateCents}` as keyof typeof view.availability;
  const feeTargetAvailable = configurationKey ? view.availability[configurationKey] : false;
  const proposedSummary = (() => {
    if (isStandard) return "Standard / no fee";
    if (status === "pending") return "Pending → Standard / no fee";
    if (status === "paused") return "Paused → Standard / no fee";
    if (!feeTargetAvailable) return "Missing fee configuration → Standard / no fee";
    const rate = `$${rateCents / 100}`;
    return programType === "ti_revenue"
      ? `TI Revenue / ${rate}`
      : `Tournament Support / ${rate} / ${tournamentName}`;
  })();

  return (
    <section
      aria-labelledby={`hotel-program-${tournamentId}`}
      style={{ border: "1px solid #bfdbfe", borderRadius: 12, padding: 14, background: "#eff6ff", display: "grid", gap: 12 }}
    >
      <div>
        <div id={`hotel-program-${tournamentId}`} style={{ fontSize: 14, fontWeight: 900 }}>
          Hotel program
        </div>
        <div style={{ color: "#475569", fontSize: 12, marginTop: 3 }}>
          Current effective routing: <strong>{view.effectiveSummary}</strong>
        </div>
      </div>

      <input
        type="hidden"
        name="expected_configuration_version"
        value={view.stored?.configurationVersion ?? ""}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
        <label style={{ fontSize: 12, fontWeight: 700 }}>
          Program
          <select
            name="hotel_program_type"
            value={programType}
            onChange={(event) => {
              const next = event.target.value as ProgramType;
              setProgramType(next);
              setStatus(next === "standard" ? "not_enrolled" : status === "not_enrolled" ? "pending" : status);
            }}
            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #94a3b8" }}
          >
            <option value="standard">Standard</option>
            <option value="ti_revenue">TI Revenue</option>
            <option value="tournament_support">Tournament Support</option>
          </select>
        </label>
        <label style={{ fontSize: 12, fontWeight: 700 }}>
          Status
          <select
            name="hotel_program_status"
            value={isStandard ? "not_enrolled" : status}
            disabled={isStandard}
            onChange={(event) => setStatus(event.target.value as ProgramStatus)}
            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #94a3b8" }}
          >
            {isStandard ? <option value="not_enrolled">Not enrolled</option> : null}
            {!isStandard ? <option value="pending">Pending</option> : null}
            {!isStandard ? <option value="active" disabled={!feeTargetAvailable}>Active</option> : null}
            {!isStandard ? <option value="paused">Paused</option> : null}
          </select>
          {isStandard ? <input type="hidden" name="hotel_program_status" value="not_enrolled" /> : null}
        </label>
        <label style={{ fontSize: 12, fontWeight: 700 }}>
          Rate
          <select
            name="hotel_program_rate_cents"
            value={rateCents}
            disabled={isStandard}
            onChange={(event) => setRateCents(Number(event.target.value) as RateCents)}
            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #94a3b8" }}
          >
            <option value={500}>$5</option>
            <option value={1000}>$10</option>
          </select>
        </label>
        <div style={{ fontSize: 12 }}>
          <div style={{ fontWeight: 700 }}>Beneficiary</div>
          <div style={{ marginTop: 8 }}>
            {programType === "tournament_support" ? tournamentName : programType === "ti_revenue" ? "TournamentInsights" : "None"}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Proposed effective routing: <strong>{proposedSummary}</strong>
        {!isStandard && !feeTargetAvailable ? (
          <span style={{ display: "block", color: "#b45309", marginTop: 3 }}>
            The trusted server-side configuration for this program and rate is unavailable; Active cannot be saved.
          </span>
        ) : null}
      </div>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, fontWeight: 700 }}>
        <input type="checkbox" name="confirm_economic_change" />
        Confirm an effective change to booking economics
      </label>
      <div>
        <button
          type="submit"
          formAction={saveAction}
          style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#1d4ed8", color: "#fff", fontWeight: 800 }}
        >
          Save hotel program
        </button>
      </div>
    </section>
  );
}
