"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";

import {
  replaceScheduleLink,
  updateScheduleSport,
  type FormState,
} from "@/app/actions";
import {
  CORRALIO_SPORTS,
  corralioSportIcon,
  corralioSportLabel,
  type CorralioSport,
} from "@/lib/schedules/sport";
import { FormSubmitButton } from "./FormSubmitButton";

const INITIAL_FORM_STATE: FormState = { status: "idle", message: "" };

export type ConnectedSchedule = {
  id: string;
  displayName: string;
  sport: CorralioSport | null;
  syncStatus: "pending" | "success" | "error";
};

function statusLabel(status: ConnectedSchedule["syncStatus"]) {
  if (status === "success") return "Connected";
  if (status === "error") return "Needs attention";
  return "Connecting";
}

function ConnectedScheduleCard({ source }: { source: ConnectedSchedule }) {
  const [editingSport, setEditingSport] = useState(false);
  const [replacingLink, setReplacingLink] = useState(false);
  const [sportState, sportAction] = useFormState(updateScheduleSport, INITIAL_FORM_STATE);
  const [replaceState, replaceAction] = useFormState(replaceScheduleLink, INITIAL_FORM_STATE);
  const replaceFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (sportState.status === "success") setEditingSport(false);
  }, [sportState]);

  useEffect(() => {
    if (replaceState.status === "success") {
      replaceFormRef.current?.reset();
      setReplacingLink(false);
    }
  }, [replaceState]);

  return (
    <li className="sourceCard">
      <div className="sourceSummary">
        <div>
          <strong>{source.displayName}</strong>
          <span className="sourceSport">
            {source.sport ? `${corralioSportIcon(source.sport)} ${corralioSportLabel(source.sport)}` : "Sport not selected"}
          </span>
        </div>
        <span className={`status ${source.syncStatus}`}><span aria-hidden="true">{source.syncStatus === "success" ? "✓" : "•"}</span> {statusLabel(source.syncStatus)}</span>
      </div>

      <div className="sourceActions">
        <button className="secondaryButton" type="button" onClick={() => setEditingSport((open) => !open)} aria-expanded={editingSport}>
          Edit sport
        </button>
        <button className="secondaryButton" type="button" onClick={() => setReplacingLink((open) => !open)} aria-expanded={replacingLink}>
          Replace calendar link
        </button>
      </div>

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

      {replacingLink ? (
        <form className="inlineSourceForm" action={replaceAction} ref={replaceFormRef}>
          <input type="hidden" name="sourceId" value={source.id} />
          <label htmlFor={`replacement-url-${source.id}`}>New iCal/ICS calendar URL</label>
          <input
            id={`replacement-url-${source.id}`}
            name="sourceUrl"
            type="url"
            inputMode="url"
            autoComplete="off"
            required
            placeholder="https://…/schedule.ics"
          />
          <p className="fieldHelp">Your current connection stays active unless the replacement imports successfully.</p>
          <FormSubmitButton idle="Validate and replace" pending="Validating…" variant="secondary" />
          {replaceState.message ? <p className={`formNotice ${replaceState.status}`} role="status">{replaceState.message}</p> : null}
        </form>
      ) : null}
    </li>
  );
}

export function ConnectedScheduleList({ sources }: { sources: ConnectedSchedule[] }) {
  return (
    <ul className="sourceList" aria-label="Connected schedules">
      {sources.map((source) => <ConnectedScheduleCard source={source} key={source.id} />)}
    </ul>
  );
}
