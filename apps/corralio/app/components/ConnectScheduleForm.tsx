"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormState } from "react-dom";

import {
  connectSchedule,
  recordScheduleConnectionInteractionAction,
  type FormState,
} from "@/app/actions";
import { SCHEDULE_PLATFORMS, type SchedulePlatformKey } from "@/lib/schedules/platforms";
import { CORRALIO_SPORTS, corralioSportLabel } from "@/lib/schedules/sport";
import { FormSubmitButton } from "./FormSubmitButton";

const INITIAL_FORM_STATE: FormState = { status: "idle", message: "" };

const RECOVERY_COPY: Partial<Record<NonNullable<FormState["errorKind"]>, string>> = {
  invalid_url: "Copy the calendar subscription link from your team app and try again.",
  unsupported_protocol: "Use the full public http, https, or webcal subscription link.",
  private_url: "Choose the app’s public calendar subscription link rather than a device or local-network address.",
  fetch_failed: "Confirm the subscription is still active, then copy the link again.",
  not_ics: "Look for Subscribe, Export calendar, iCal, ICS, or webcal in your team app.",
  too_large: "Try a team or season calendar instead of an organization-wide calendar.",
  no_events: "Confirm the calendar contains upcoming events and that its subscription is active.",
  already_connected: "Use the connected-schedule controls below if you need to change its family assignment.",
  needs_replacement: "Use Replace calendar link on the connected schedule below.",
};

export function ConnectScheduleForm() {
  const [state, action] = useFormState(connectSchedule, INITIAL_FORM_STATE);
  const [platform, setPlatform] = useState<SchedulePlatformKey | null>(null);
  const [successDismissed, setSuccessDismissed] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [, startMeasurementTransition] = useTransition();
  const viewedInstructions = useRef(new Set<SchedulePlatformKey>());
  const platformPickerRef = useRef<HTMLFieldSetElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const sourceUrlRef = useRef<HTMLInputElement>(null);
  const selectedPlatform = SCHEDULE_PLATFORMS.find((candidate) => candidate.key === platform) ?? null;

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      setSuccessDismissed(false);
    }
    if (state.status === "error") setErrorDismissed(false);
  }, [state]);

  useEffect(() => {
    if (!platform || viewedInstructions.current.has(platform)) return;
    viewedInstructions.current.add(platform);
    startMeasurementTransition(() => {
      void recordScheduleConnectionInteractionAction({ event: "instructions_viewed", platform });
    });
  }, [platform]);

  function choosePlatform(nextPlatform: SchedulePlatformKey) {
    setPlatform(nextPlatform);
    setSuccessDismissed(true);
    setErrorDismissed(true);
    startMeasurementTransition(() => {
      void recordScheduleConnectionInteractionAction({ event: "platform_selected", platform: nextPlatform });
    });
  }

  function connectAnotherSchedule() {
    setSuccessDismissed(true);
    formRef.current?.reset();
    sourceUrlRef.current?.focus();
  }

  function chooseAnotherScheduleSource() {
    setPlatform(null);
    setSuccessDismissed(true);
    setErrorDismissed(true);
    platformPickerRef.current?.scrollIntoView({ block: "start" });
    platformPickerRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }

  return (
    <div className="scheduleConnectionFlow">
      <fieldset className="schedulePlatformPicker" ref={platformPickerRef}>
        <legend>Where does this schedule live?</legend>
        <div className="schedulePlatformOptions">
          {SCHEDULE_PLATFORMS.map((candidate) => (
            <button
              className={`schedulePlatformOption${platform === candidate.key ? " selected" : ""}`}
              type="button"
              key={candidate.key}
              aria-pressed={platform === candidate.key}
              onClick={() => choosePlatform(candidate.key)}
            >
              <strong>{candidate.name}</strong>
              {candidate.recognition ? <span>{candidate.recognition}</span> : null}
            </button>
          ))}
        </div>
      </fieldset>

      {selectedPlatform ? (
        <form className="stackForm" action={action} ref={formRef}>
          <input type="hidden" name="platform" value={selectedPlatform.key} />
          <section className="schedulePlatformInstructions" aria-live="polite">
            <p className="eyebrow">Connect from {selectedPlatform.name}</p>
            <ol>
              {selectedPlatform.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
            </ol>
            {selectedPlatform.caveat ? <p className="fieldHelp">{selectedPlatform.caveat}</p> : null}
          </section>
          <label htmlFor="displayName">Schedule name <span>(optional)</span></label>
          <input id="displayName" name="displayName" maxLength={100} placeholder="Emma’s soccer team" />
          <label htmlFor="sport">Sport <span>(optional)</span></label>
          <select id="sport" name="sport" defaultValue="">
            <option value="">Choose a sport</option>
            {CORRALIO_SPORTS.map((sport) => <option value={sport} key={sport}>{corralioSportLabel(sport)}</option>)}
          </select>
          <label htmlFor="sourceUrl">Calendar subscription link</label>
          <input
            id="sourceUrl"
            name="sourceUrl"
            type="url"
            inputMode="url"
            autoComplete="url"
            required
            placeholder="https://…/schedule.ics"
            ref={sourceUrlRef}
          />
          <p className="fieldHelp">Your private calendar link stays on the server and is never shown after it connects.</p>
          <FormSubmitButton idle="Connect schedule" pending="Connecting…" />
          {state.status === "error" && state.message && !errorDismissed ? (
            <div className="connectionRecovery">
              <div role="alert">
                <p className="formNotice error">{state.message}</p>
                {state.errorKind && RECOVERY_COPY[state.errorKind] ? <p>{RECOVERY_COPY[state.errorKind]}</p> : null}
              </div>
              <button className="secondaryButton" type="button" onClick={chooseAnotherScheduleSource}>
                Choose another schedule source
              </button>
            </div>
          ) : null}
        </form>
      ) : (
        <p className="fieldHelp">Choose your team app to see the shortest path to its calendar link.</p>
      )}

      {state.status === "success" && !successDismissed ? (
        <section className="scheduleConnectionSuccess" role="status">
          <p className="formNotice success">{state.message}</p>
          <div className="scheduleConnectionSuccessActions">
            <button className="secondaryButton" type="button" onClick={connectAnotherSchedule}>Connect another schedule</button>
            <a className="primaryLinkButton" href="/">See This Weekend</a>
          </div>
        </section>
      ) : null}
    </div>
  );
}
