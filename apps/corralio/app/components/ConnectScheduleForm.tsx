"use client";

import { useFormState } from "react-dom";

import { connectSchedule, type FormState } from "@/app/actions";
import { FormSubmitButton } from "./FormSubmitButton";

const INITIAL_FORM_STATE: FormState = { status: "idle", message: "" };

export function ConnectScheduleForm() {
  const [state, action] = useFormState(connectSchedule, INITIAL_FORM_STATE);
  return (
    <form className="stackForm" action={action}>
      <label htmlFor="displayName">Schedule name <span>(optional)</span></label>
      <input id="displayName" name="displayName" maxLength={100} placeholder="Emma’s soccer team" />
      <label htmlFor="sourceUrl">iCal/ICS calendar URL</label>
      <input
        id="sourceUrl"
        name="sourceUrl"
        type="url"
        inputMode="url"
        autoComplete="url"
        required
        placeholder="https://…/schedule.ics"
      />
      <p className="fieldHelp">Paste the private calendar subscription link from your team schedule.</p>
      <FormSubmitButton idle="Import schedule" pending="Importing…" />
      {state.message ? <p className={`formNotice ${state.status}`} role="status">{state.message}</p> : null}
    </form>
  );
}
