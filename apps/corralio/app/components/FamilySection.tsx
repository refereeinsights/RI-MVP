"use client";

import { useEffect, useRef } from "react";
import { useFormState } from "react-dom";

import {
  connectTeamSchedule,
  createChild,
  createTeam,
  renameChild,
  updateTeam,
  type FormState,
} from "@/app/actions";
import type { CorralioChildColor } from "@/lib/family";
import { CORRALIO_SPORTS, corralioSportLabel, type CorralioSport } from "@/lib/schedules/sport";
import { FormSubmitButton } from "./FormSubmitButton";

const INITIAL_FORM_STATE: FormState = { status: "idle", message: "" };

export type FamilyChild = {
  id: string;
  displayName: string;
  colorToken: CorralioChildColor;
};

export type FamilyTeam = {
  id: string;
  childId: string;
  displayName: string;
  sport: CorralioSport | null;
};

function FormNotice({ state }: { state: FormState }) {
  return state.message ? <p className={`formNotice ${state.status}`} role="status">{state.message}</p> : null;
}

function AddChildForm() {
  const [state, action] = useFormState(createChild, INITIAL_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form className="familyAddForm" action={action} ref={formRef}>
      <div>
        <label htmlFor="new-child-name">Child name</label>
        <input id="new-child-name" name="displayName" maxLength={80} autoComplete="off" required />
      </div>
      <FormSubmitButton idle="Add child" pending="Adding…" variant="secondary" />
      <FormNotice state={state} />
    </form>
  );
}

function RenameChildForm({ child }: { child: FamilyChild }) {
  const [state, action] = useFormState(renameChild, INITIAL_FORM_STATE);
  return (
    <form className="familyEditForm" action={action}>
      <input type="hidden" name="childId" value={child.id} />
      <label htmlFor={`child-name-${child.id}`}>Name</label>
      <input id={`child-name-${child.id}`} name="displayName" defaultValue={child.displayName} maxLength={80} required />
      <FormSubmitButton idle="Save name" pending="Saving…" variant="secondary" />
      <FormNotice state={state} />
    </form>
  );
}

function SportSelect({ id, defaultValue = "" }: { id: string; defaultValue?: CorralioSport | "" }) {
  return (
    <select id={id} name="sport" defaultValue={defaultValue}>
      <option value="">Sport not selected</option>
      {CORRALIO_SPORTS.map((sport) => <option key={sport} value={sport}>{corralioSportLabel(sport)}</option>)}
    </select>
  );
}

function AddTeamForm({ child }: { child: FamilyChild }) {
  const [state, action] = useFormState(createTeam, INITIAL_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form className="familyTeamForm" action={action} ref={formRef}>
      <input type="hidden" name="childId" value={child.id} />
      <div>
        <label htmlFor={`new-team-name-${child.id}`}>Team name</label>
        <input id={`new-team-name-${child.id}`} name="displayName" maxLength={100} autoComplete="off" required />
      </div>
      <div>
        <label htmlFor={`new-team-sport-${child.id}`}>Sport <span>(optional)</span></label>
        <SportSelect id={`new-team-sport-${child.id}`} />
      </div>
      <FormSubmitButton idle="Add team" pending="Adding…" variant="secondary" />
      <FormNotice state={state} />
    </form>
  );
}

function TeamEditor({ team }: { team: FamilyTeam }) {
  const [state, action] = useFormState(updateTeam, INITIAL_FORM_STATE);
  const [scheduleState, scheduleAction] = useFormState(connectTeamSchedule, INITIAL_FORM_STATE);
  const scheduleFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (scheduleState.status === "success") scheduleFormRef.current?.reset();
  }, [scheduleState]);

  return (
    <li className="familyTeamItem">
      <details className="familyTeamDetails">
        <summary className="familyTeamSummary" aria-label={`Edit team: ${team.displayName}`}>
          <span className="familyTeamName">{team.displayName}</span>
          <span className="familyTeamSport">{team.sport ? corralioSportLabel(team.sport) : "Sport not selected"}</span>
          <span className="familyTeamDisclosure" aria-hidden="true">›</span>
        </summary>
        <form className="familyTeamForm" action={action}>
          <input type="hidden" name="teamId" value={team.id} />
          <div>
            <label htmlFor={`team-name-${team.id}`}>Team name</label>
            <input id={`team-name-${team.id}`} name="displayName" defaultValue={team.displayName} maxLength={100} required />
          </div>
          <div>
            <label htmlFor={`team-sport-${team.id}`}>Sport <span>(optional)</span></label>
            <SportSelect id={`team-sport-${team.id}`} defaultValue={team.sport ?? ""} />
          </div>
          <FormSubmitButton idle="Save team" pending="Saving…" variant="secondary" />
          <FormNotice state={state} />
        </form>
        <form className="familyTeamForm teamScheduleForm" action={scheduleAction} ref={scheduleFormRef}>
          <input type="hidden" name="teamId" value={team.id} />
          <div>
            <label htmlFor={`team-schedule-url-${team.id}`}>Team iCal/ICS calendar URL</label>
            <input
              id={`team-schedule-url-${team.id}`}
              name="sourceUrl"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://…/schedule.ics"
              required
            />
          </div>
          <p className="fieldHelp">Paste the private subscription link. New events will be assigned to this team automatically.</p>
          <FormSubmitButton idle="Import team schedule" pending="Importing…" variant="secondary" />
          <FormNotice state={scheduleState} />
        </form>
      </details>
    </li>
  );
}

export function FamilySection({ familyChildren, teams }: { familyChildren: FamilyChild[]; teams: FamilyTeam[] }) {
  const teamsByChild = new Map<string, FamilyTeam[]>();
  for (const team of teams) {
    const childTeams = teamsByChild.get(team.childId) ?? [];
    childTeams.push(team);
    teamsByChild.set(team.childId, childTeams);
  }

  return (
    <section className="contentCard familyCard" aria-labelledby="family-heading">
      <p className="eyebrow">Every kid. Every team.</p>
      <h2 id="family-heading">Your family</h2>
      <p className="sectionIntro">Add the children and teams you plan for, then assign each connected schedule to the right person or team.</p>

      {familyChildren.length ? (
        <div className="familyList">
          {familyChildren.map((child) => {
            const childTeams = teamsByChild.get(child.id) ?? [];
            return (
              <article className="familyChild" key={child.id}>
                <div className="familyChildHeading">
                  <span className={`childColor childColor-${child.colorToken}`} aria-hidden="true" />
                  <div><h3>{child.displayName}</h3><p>{childTeams.length} {childTeams.length === 1 ? "team" : "teams"}</p></div>
                </div>
                <details className="familyChildEdit">
                  <summary>Edit child name</summary>
                  <RenameChildForm child={child} />
                </details>
                {childTeams.length ? <ul className="familyTeams">{childTeams.map((team) => <TeamEditor team={team} key={team.id} />)}</ul> : <p className="familyEmpty">No teams added yet.</p>}
                <details className="familyAddTeam">
                  <summary>Add a team for {child.displayName}</summary>
                  <AddTeamForm child={child} />
                </details>
              </article>
            );
          })}
        </div>
      ) : <p className="familyEmpty">Add your first child to start organizing your family’s teams.</p>}

      <details className="familyAddChild" open={!familyChildren.length}>
        <summary>Add a child</summary>
        <AddChildForm />
      </details>
    </section>
  );
}
