"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormState } from "react-dom";

import {
  connectTeamSchedule,
  createChild,
  createTeam,
  recordScheduleConnectionInteractionAction,
  renameChild,
  removeChild,
  removeTeam,
  updateHouseholdOrigin,
  updateTeam,
  type FormState,
} from "@/app/actions";
import type { CorralioChildColor } from "@/lib/family";
import { getScheduleConnectionRecoveryCopy } from "@/lib/schedules/connectionRecovery";
import {
  getSchedulePlatform,
  getSchedulePlatformsForContext,
  type SchedulePlatformKey,
} from "@/lib/schedules/platforms";
import { CORRALIO_SPORTS, corralioSportLabel, type CorralioSport } from "@/lib/schedules/sport";
import { FormSubmitButton } from "./FormSubmitButton";
import { LifecycleConfirmation } from "./LifecycleConfirmation";
import { SchedulePlatformHelp } from "./SchedulePlatformHelp";

const INITIAL_FORM_STATE: FormState = { status: "idle", message: "" };
const TEAM_SCHEDULE_PLATFORMS = getSchedulePlatformsForContext("team");

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
  arrivalBufferMinutes: number | null;
};

function FormNotice({ state }: { state: FormState }) {
  return state.message ? <p className={`formNotice ${state.status}`} role="status">{state.message}</p> : null;
}

function HomeOriginForm({ originAddress }: { originAddress: string }) {
  const [state, action] = useFormState(updateHouseholdOrigin, INITIAL_FORM_STATE);
  return (
    <form className="homeOriginForm" action={action}>
      <div>
        <label htmlFor="household-origin-address">Home address <span>(optional)</span></label>
        <input
          id="household-origin-address"
          name="originAddress"
          defaultValue={originAddress}
          maxLength={100}
          autoComplete="street-address"
          placeholder="Street address, city, state ZIP"
        />
      </div>
      <p className="fieldHelp">Used privately to estimate when your household should leave. Clear the field and save to remove it.</p>
      <FormSubmitButton idle="Save home address" pending="Locating…" variant="secondary" />
      <FormNotice state={state} />
    </form>
  );
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
  const [schedulePlatform, setSchedulePlatform] = useState<SchedulePlatformKey | "">("");
  const [, startMeasurementTransition] = useTransition();
  const viewedInstructions = useRef(new Set<SchedulePlatformKey>());
  const scheduleFormRef = useRef<HTMLFormElement>(null);
  const selectedPlatform = schedulePlatform ? getSchedulePlatform(schedulePlatform) : null;
  const recoveryCopy = getScheduleConnectionRecoveryCopy(scheduleState.errorKind);

  useEffect(() => {
    if (scheduleState.status === "success") {
      scheduleFormRef.current?.reset();
      setSchedulePlatform("");
    }
  }, [scheduleState]);

  function chooseSchedulePlatform(nextPlatform: SchedulePlatformKey | "") {
    setSchedulePlatform(nextPlatform);
    if (!nextPlatform) return;
    startMeasurementTransition(() => {
      void recordScheduleConnectionInteractionAction({
        event: "platform_selected",
        platform: nextPlatform,
      });
    });
  }

  function recordInstructionsViewed(viewedPlatform: SchedulePlatformKey) {
    if (viewedInstructions.current.has(viewedPlatform)) return;
    viewedInstructions.current.add(viewedPlatform);
    startMeasurementTransition(() => {
      void recordScheduleConnectionInteractionAction({
        event: "instructions_viewed",
        platform: viewedPlatform,
      });
    });
  }

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
          <div>
            <label htmlFor={`team-arrival-${team.id}`}>Arrive before every event <span>(optional)</span></label>
            <select
              id={`team-arrival-${team.id}`}
              name="arrivalBufferMinutes"
              defaultValue={team.arrivalBufferMinutes === null ? "" : String(team.arrivalBufferMinutes)}
            >
              <option value="">Use Corralio’s 30-minute default</option>
              {Array.from({ length: 25 }, (_, index) => index * 5).map((minutes) => (
                <option value={minutes} key={minutes}>{minutes} {minutes === 1 ? "minute" : "minutes"} before</option>
              ))}
            </select>
            <p className="fieldHelp">Applies to every event for this team unless the connected schedule supplies an exact arrival time.</p>
          </div>
          <FormSubmitButton idle="Save team" pending="Saving…" variant="secondary" />
          <FormNotice state={state} />
        </form>
        <form className="familyTeamForm teamScheduleForm" action={scheduleAction} ref={scheduleFormRef}>
          <input type="hidden" name="teamId" value={team.id} />
          <div>
            <label htmlFor={`team-schedule-platform-${team.id}`}>Where does this team schedule live?</label>
            <select
              id={`team-schedule-platform-${team.id}`}
              name="platform"
              value={schedulePlatform}
              onChange={(event) => chooseSchedulePlatform(event.target.value as SchedulePlatformKey | "")}
              required
            >
              <option value="">Choose a schedule source</option>
              {TEAM_SCHEDULE_PLATFORMS.map((platform) => (
                <option value={platform.key} key={platform.key}>{platform.name}</option>
              ))}
            </select>
          </div>
          {selectedPlatform ? (
            <SchedulePlatformHelp
              key={selectedPlatform.key}
              platform={selectedPlatform}
              onInstructionsViewed={() => recordInstructionsViewed(selectedPlatform.key)}
            />
          ) : null}
          <div>
            <label htmlFor={`team-schedule-url-${team.id}`}>Paste calendar link</label>
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
          <p className="fieldHelp">It may be called an iCal, ICS, or calendar subscription link. New events will be assigned to this team automatically.</p>
          <FormSubmitButton idle="Connect team schedule" pending="Connecting…" variant="secondary" />
          <FormNotice state={scheduleState} />
          {scheduleState.status === "error" && recoveryCopy ? <p className="fieldHelp">{recoveryCopy}</p> : null}
        </form>
        <div className="familyLifecycleAction">
          <LifecycleConfirmation
            action={removeTeam}
            fieldName="teamId"
            fieldValue={team.id}
            triggerLabel="Remove team"
            title={`Remove ${team.displayName}?`}
            description="This team will leave your active family plan. Its schedules will stay connected and become unassigned."
            confirmLabel="Remove team"
            pendingLabel="Removing…"
          />
        </div>
      </details>
    </li>
  );
}

export function FamilySection({
  familyChildren,
  teams,
  originAddress,
}: {
  familyChildren: FamilyChild[];
  teams: FamilyTeam[];
  originAddress: string;
}) {
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

      <section className="homeOrigin" aria-labelledby="home-origin-heading">
        <div>
          <p className="eyebrow">Estimated leave-by</p>
          <h3 id="home-origin-heading">Where your family starts</h3>
          <p>Your address stays private to your household and is never used as venue evidence.</p>
        </div>
        <HomeOriginForm originAddress={originAddress} />
      </section>

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
                <div className="familyLifecycleAction">
                  <LifecycleConfirmation
                    action={removeChild}
                    fieldName="childId"
                    fieldValue={child.id}
                    triggerLabel="Remove child"
                    title={`Remove ${child.displayName} from the family plan?`}
                    description="This child and their active teams will leave your family plan. Their schedules will stay connected and become unassigned."
                    confirmLabel="Remove child"
                    pendingLabel="Removing…"
                  />
                </div>
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
