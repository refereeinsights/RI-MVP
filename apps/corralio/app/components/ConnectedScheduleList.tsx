"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";

import {
  disconnectSchedule,
  refreshScheduleNow,
  replaceScheduleLink,
  updateScheduleAssignment,
  updateScheduleSport,
  type FormState,
} from "@/app/actions";
import { sourceFreshnessLabel } from "@/lib/schedules/freshness";
import {
  CORRALIO_SPORTS,
  corralioSportIcon,
  corralioSportLabel,
  type CorralioSport,
} from "@/lib/schedules/sport";
import { FormSubmitButton } from "./FormSubmitButton";
import { LifecycleConfirmation } from "./LifecycleConfirmation";
import type { FamilyChild, FamilyTeam } from "./FamilySection";

const INITIAL_FORM_STATE: FormState = { status: "idle", message: "" };

export type ConnectedSchedule = {
  id: string;
  displayName: string;
  sport: CorralioSport | null;
  syncStatus: "pending" | "success" | "error";
  lastSyncedAt: string | null;
  refreshPausedAt: string | null;
  childId: string | null;
  teamId: string | null;
  assignmentLabel: string;
  assignmentUnavailable: boolean;
};

function statusLabel(source: ConnectedSchedule) {
  if (source.syncStatus === "success") return "Connected";
  if (source.syncStatus === "error" && source.refreshPausedAt) return "Schedule needs attention";
  if (source.syncStatus === "error") return "Refresh delayed";
  return "Connecting";
}

function ConnectedScheduleCard({
  source,
  familyChildren,
  teams,
  freshnessNow,
}: {
  source: ConnectedSchedule;
  familyChildren: FamilyChild[];
  teams: FamilyTeam[];
  freshnessNow: string;
}) {
  const [editingSport, setEditingSport] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(false);
  const [replacingLink, setReplacingLink] = useState(false);
  const currentTeam = source.teamId ? teams.find((team) => team.id === source.teamId) : null;
  const currentChildCandidate = source.childId ?? currentTeam?.childId ?? "";
  const currentChildId = familyChildren.some((child) => child.id === currentChildCandidate)
    ? currentChildCandidate
    : "";
  const currentTeamId = currentTeam && currentTeam.childId === currentChildId
    ? currentTeam.id
    : "";
  const [selectedChildId, setSelectedChildId] = useState(currentChildId);
  const [selectedTeamId, setSelectedTeamId] = useState(currentTeamId);
  const [sportState, sportAction] = useFormState(updateScheduleSport, INITIAL_FORM_STATE);
  const [assignmentState, assignmentAction] = useFormState(updateScheduleAssignment, INITIAL_FORM_STATE);
  const [replaceState, replaceAction] = useFormState(replaceScheduleLink, INITIAL_FORM_STATE);
  const [refreshState, refreshAction] = useFormState(refreshScheduleNow, INITIAL_FORM_STATE);
  const [cooldownActive, setCooldownActive] = useState(false);
  const replaceFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (sportState.status === "success") setEditingSport(false);
  }, [sportState]);

  useEffect(() => {
    setSelectedChildId(currentChildId);
    setSelectedTeamId(currentTeamId);
  }, [currentChildId, currentTeamId]);

  useEffect(() => {
    if (assignmentState.status === "success") setEditingAssignment(false);
  }, [assignmentState]);

  useEffect(() => {
    if (replaceState.status === "success") {
      replaceFormRef.current?.reset();
      setReplacingLink(false);
    }
  }, [replaceState]);

  useEffect(() => {
    const retryAt = refreshState.retryAt ? Date.parse(refreshState.retryAt) : Number.NaN;
    if (!Number.isFinite(retryAt) || retryAt <= Date.now()) {
      setCooldownActive(false);
      return;
    }
    setCooldownActive(true);
    const timeout = window.setTimeout(() => setCooldownActive(false), retryAt - Date.now());
    return () => window.clearTimeout(timeout);
  }, [refreshState.retryAt]);

  const refreshPaused = source.syncStatus === "error" && Boolean(source.refreshPausedAt);
  const refreshDelayed = source.syncStatus === "error" && !source.refreshPausedAt;
  const statusTone = refreshPaused ? "attention" : source.syncStatus;
  const selectedChild = familyChildren.find((child) => child.id === selectedChildId) ?? null;
  const selectableTeams = selectedChildId ? teams.filter((team) => team.childId === selectedChildId) : [];

  return (
    <li className="sourceCard">
      <div className="sourceSummary">
        <div>
          <strong>{source.displayName}</strong>
          <span className="sourceSport">
            {source.sport ? `${corralioSportIcon(source.sport)} ${corralioSportLabel(source.sport)}` : "Sport not selected"}
          </span>
          <span className={`sourceAssignment${source.assignmentUnavailable ? " unavailable" : ""}`}>
            {source.assignmentLabel}
          </span>
        </div>
        <span className={`status ${statusTone}`}><span aria-hidden="true">{source.syncStatus === "success" ? "✓" : "•"}</span> {statusLabel(source)}</span>
      </div>

      <p className={`sourceFreshness${source.syncStatus === "error" ? " attention" : ""}`}>
        {sourceFreshnessLabel(source, Date.parse(freshnessNow))}
      </p>

      {refreshDelayed ? <p className="sourceStatusHelp">We’ll try this schedule again automatically. Your existing events are still available.</p> : null}
      {refreshPaused ? <p className="sourceStatusHelp attention">Corralio couldn’t refresh this schedule. Your existing events are still available. Replace the calendar link to reconnect updates.</p> : null}

      <div className="sourceActions">
        <form className="sourceActionForm" action={refreshAction}>
          <input type="hidden" name="sourceId" value={source.id} />
          <FormSubmitButton idle={cooldownActive ? "Refresh available shortly" : "Refresh now"} pending="Checking…" variant="secondary" disabled={cooldownActive || refreshPaused} />
        </form>
        <button className="secondaryButton" type="button" onClick={() => setEditingSport((open) => !open)} aria-expanded={editingSport}>
          Edit sport
        </button>
        <button
          className="secondaryButton"
          type="button"
          onClick={() => setEditingAssignment((open) => !open)}
          aria-expanded={editingAssignment}
          aria-controls={`source-assignment-form-${source.id}`}
        >
          Change assignment
        </button>
        <button className="secondaryButton" type="button" onClick={() => setReplacingLink((open) => !open)} aria-expanded={replacingLink}>
          Replace calendar link
        </button>
        <LifecycleConfirmation
          action={disconnectSchedule}
          fieldName="sourceId"
          fieldValue={source.id}
          triggerLabel="Disconnect schedule"
          title={`Disconnect ${source.displayName}?`}
          description="Corralio will stop updating this schedule, and its imported events will leave your active family plan. The saved schedule and event history are not permanently erased."
          confirmLabel="Disconnect schedule"
          pendingLabel="Disconnecting…"
        />
      </div>
      {refreshState.message ? <p className={`formNotice ${refreshState.status}`} role="status">{refreshState.message}</p> : null}

      {editingSport ? (
        <form className="inlineSourceForm" action={sportAction}>
          <input type="hidden" name="sourceId" value={source.id} />
          <label htmlFor={`source-sport-${source.id}`}>Sport</label>
          <select id={`source-sport-${source.id}`} name="sport" defaultValue={source.sport ?? ""}>
            <option value="">Not selected</option>
            {CORRALIO_SPORTS.map((sport) => <option value={sport} key={sport}>{corralioSportLabel(sport)}</option>)}
          </select>
          <FormSubmitButton idle="Save sport" pending="Saving…" variant="secondary" />
          {sportState.message ? <p className={`formNotice ${sportState.status}`} role="status">{sportState.message}</p> : null}
        </form>
      ) : null}

      {editingAssignment ? (
        <form className="inlineSourceForm" id={`source-assignment-form-${source.id}`} action={assignmentAction}>
          <input type="hidden" name="sourceId" value={source.id} />
          <label htmlFor={`source-child-${source.id}`}>Family assignment</label>
          <select
            id={`source-child-${source.id}`}
            name="childId"
            value={selectedChildId}
            onChange={(event) => {
              setSelectedChildId(event.target.value);
              setSelectedTeamId("");
            }}
          >
            <option value="">No assignment</option>
            {familyChildren.map((child) => <option value={child.id} key={child.id}>{child.displayName}</option>)}
          </select>
          <label htmlFor={`source-team-${source.id}`}>Team <span>(optional)</span></label>
          <select
            id={`source-team-${source.id}`}
            name="teamId"
            value={selectedTeamId}
            disabled={!selectedChild}
            onChange={(event) => setSelectedTeamId(event.target.value)}
          >
            <option value="">{selectedChild ? `Assign directly to ${selectedChild.displayName}` : "Select a child first"}</option>
            {selectableTeams.map((team) => <option value={team.id} key={team.id}>{team.displayName}</option>)}
          </select>
          {source.assignmentUnavailable ? <p className="fieldHelp">Choose a new assignment or select No assignment.</p> : null}
          <FormSubmitButton idle="Save assignment" pending="Saving…" variant="secondary" />
          {assignmentState.message ? <p className={`formNotice ${assignmentState.status}`} role="status">{assignmentState.message}</p> : null}
        </form>
      ) : null}

      {replacingLink ? (
        <form className="inlineSourceForm" action={replaceAction} ref={replaceFormRef}>
          <input type="hidden" name="sourceId" value={source.id} />
          <label htmlFor={`replacement-url-${source.id}`}>New calendar link</label>
          <input
            id={`replacement-url-${source.id}`}
            name="sourceUrl"
            type="url"
            inputMode="url"
            autoComplete="off"
            required
            placeholder="https://…/schedule.ics"
          />
          <p className="fieldHelp">Paste the new iCal or ICS subscription link. Your current connection stays active unless the replacement imports successfully.</p>
          <FormSubmitButton idle="Validate and replace" pending="Validating…" variant="secondary" />
          {replaceState.message ? <p className={`formNotice ${replaceState.status}`} role="status">{replaceState.message}</p> : null}
        </form>
      ) : null}
    </li>
  );
}

export function ConnectedScheduleList({
  sources,
  familyChildren,
  teams,
  freshnessNow,
}: {
  sources: ConnectedSchedule[];
  familyChildren: FamilyChild[];
  teams: FamilyTeam[];
  freshnessNow: string;
}) {
  return (
    <ul className="sourceList" aria-label="Connected schedules">
      {sources.map((source) => (
        <ConnectedScheduleCard source={source} familyChildren={familyChildren} teams={teams} freshnessNow={freshnessNow} key={source.id} />
      ))}
    </ul>
  );
}
