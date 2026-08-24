"use client";

import { useEffect, useRef } from "react";
import { useFormState } from "react-dom";

import { connectSchedule, type FormState } from "@/app/actions";
import { CORRALIO_SPORTS, corralioSportLabel } from "@/lib/schedules/sport";
import { FormSubmitButton } from "./FormSubmitButton";

const INITIAL_FORM_STATE: FormState = { status: "idle", message: "" };

export function ConnectScheduleForm() {
  const [state, action] = useFormState(connectSchedule, INITIAL_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form className="stackForm" action={action} ref={formRef}>
      <label htmlFor="displayName">Schedule name <span>(optional)</span></label>
      <input id="displayName" name="displayName" maxLength={100} placeholder="Emma’s soccer team" />
      <label htmlFor="sport">Sport <span>(optional)</span></label>
      <select id="sport" name="sport" defaultValue="">
        <option value="">Choose a sport</option>
        {CORRALIO_SPORTS.map((sport) => <option value={sport} key={sport}>{corralioSportLabel(sport)}</option>)}
      </select>
      <label htmlFor="sourceUrl">Calendar link</label>
      <input
        id="sourceUrl"
        name="sourceUrl"
        type="url"
        inputMode="url"
        autoComplete="url"
        required
        placeholder="https://…/schedule.ics"
      />
      <p className="fieldHelp">Paste the calendar link provided by your team app. It may be called an iCal or ICS subscription link.</p>
      <FormSubmitButton idle="Connect schedule" pending="Connecting…" />
      {state.message ? <p className={`formNotice ${state.status}`} role="status">{state.message}</p> : null}
    </form>
  );
}
