"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { archiveWeekendPlanAction, updateWeekendPlanNotesAction } from "./actions";
import type { SavePlanState } from "@/app/weekend/[slug]/actions";

function isValidIsoDate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [y, m, d] = raw.split("-").map((n) => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!Number.isFinite(dt.getTime())) return false;
  return dt.toISOString().slice(0, 10) === raw;
}

export default function WeekendPlanActionsClient(props: {
  planId: string;
  tournamentSlug: string;
  selectedVenueId: string | null;
  notes: string | null;
  tournamentCity: string | null;
  tournamentState: string | null;
  tournamentStartDate: string | null;
  tournamentEndDate: string | null;
}) {
  const planId = String(props.planId ?? "").trim();
  const slug = String(props.tournamentSlug ?? "").trim();
  if (!planId || !slug) return null;

  const continueHref = props.selectedVenueId
    ? `/weekend/${encodeURIComponent(slug)}?venue=${encodeURIComponent(props.selectedVenueId)}`
    : `/weekend/${encodeURIComponent(slug)}`;
  const venueMapHref = `/tournaments/${encodeURIComponent(slug)}/map`;

  const travelHref = (() => {
    const qp = new URLSearchParams();
    const city = String(props.tournamentCity ?? "").trim();
    const state = String(props.tournamentState ?? "").trim();
    if (city) qp.set("city", city);
    if (state) qp.set("state", state);
    if (isValidIsoDate(props.tournamentStartDate)) qp.set("checkin", String(props.tournamentStartDate));
    if (isValidIsoDate(props.tournamentEndDate)) qp.set("checkout", String(props.tournamentEndDate));
    const qs = qp.toString();
    return qs ? `/book-travel?${qs}` : "/book-travel";
  })();

  const initialNotes = useMemo(() => String(props.notes ?? ""), [props.notes]);
  const [expanded, setExpanded] = useState<"none" | "notes" | "remove">("none");
  const [notesValue, setNotesValue] = useState<string>(initialNotes);

  useEffect(() => {
    if (expanded !== "notes") setNotesValue(initialNotes);
  }, [expanded, initialNotes]);

  const notesAction = useMemo(() => {
    const bound = updateWeekendPlanNotesAction.bind(null, { planId });
    return bound as any;
  }, [planId]);
  const archiveAction = useMemo(() => {
    const bound = archiveWeekendPlanAction.bind(null, { planId });
    return bound as any;
  }, [planId]);

  const [notesState, notesDispatch] = useFormState<SavePlanState>(notesAction, { status: "idle" });
  const [archiveState, archiveDispatch] = useFormState<SavePlanState>(archiveAction, { status: "idle" });

  return (
    <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
      <Link className="primaryLink" href={continueHref}>
        Continue plan →
      </Link>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Link className="secondaryLink" href={venueMapHref}>
          Venue map →
        </Link>
        <Link className="secondaryLink" href={travelHref}>
          Travel →
        </Link>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <button
          type="button"
          className="secondaryLink"
          onClick={() => setExpanded((v) => (v === "notes" ? "none" : "notes"))}
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
        >
          Edit notes
        </button>
        <button
          type="button"
          className="secondaryLink"
          onClick={() => setExpanded((v) => (v === "remove" ? "none" : "remove"))}
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
        >
          Remove plan
        </button>
      </div>

      {expanded === "notes" ? (
        <form action={notesDispatch} style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#0b1f14" }}>Planning notes</div>
          <textarea
            name="notes"
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            placeholder="Add hotel details, arrival notes, packing reminders, or family logistics."
            rows={4}
            style={{
              width: "100%",
              resize: "vertical",
              borderRadius: 10,
              border: "1px solid rgba(15, 61, 46, 0.18)",
              padding: "10px 10px",
              fontSize: 13,
              fontWeight: 650,
              lineHeight: 1.4,
            }}
          />
          {notesState.status === "error" && notesState.error ? (
            <div style={{ color: "#7a1b1b", fontWeight: 750, fontSize: 12 }}>{notesState.error}</div>
          ) : notesState.status === "saved" ? (
            <div style={{ color: "rgba(16, 34, 19, 0.78)", fontWeight: 750, fontSize: 12 }}>Saved.</div>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button type="submit" className="primaryLink" style={{ border: "none", cursor: "pointer" }}>
              Save notes
            </button>
            <button
              type="button"
              className="secondaryLink"
              onClick={() => setExpanded("none")}
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {expanded === "remove" ? (
        <form action={archiveDispatch} style={{ display: "grid", gap: 8 }}>
          <div style={{ color: "rgba(16, 34, 19, 0.85)", fontWeight: 650, fontSize: 12, lineHeight: 1.4 }}>
            Remove weekend plan? This removes the active plan from your Weekend Planner. Your saved tournament bookmark is not affected.
          </div>
          {archiveState.status === "error" && archiveState.error ? (
            <div style={{ color: "#7a1b1b", fontWeight: 750, fontSize: 12 }}>{archiveState.error}</div>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button type="submit" className="primaryLink" style={{ border: "none", cursor: "pointer" }}>
              Confirm remove
            </button>
            <button
              type="button"
              className="secondaryLink"
              onClick={() => setExpanded("none")}
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
