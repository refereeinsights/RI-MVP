"use client";

import { useId, useRef } from "react";
import { useFormState } from "react-dom";

import type { FormState } from "@/app/actions";
import { FormSubmitButton } from "./FormSubmitButton";

const INITIAL_FORM_STATE: FormState = { status: "idle", message: "" };

type LifecycleAction = (state: FormState, formData: FormData) => Promise<FormState>;

export function LifecycleConfirmation({
  action,
  fieldName,
  fieldValue,
  triggerLabel,
  title,
  description,
  confirmLabel,
  pendingLabel,
}: {
  action: LifecycleAction;
  fieldName: "sourceId" | "teamId" | "childId";
  fieldValue: string;
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction] = useFormState(action, INITIAL_FORM_STATE);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        className="lifecycleTrigger"
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        {triggerLabel}
      </button>
      <dialog
        className="lifecycleDialog"
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => {
          if (event.currentTarget === event.target) closeDialog();
        }}
      >
        <div className="lifecycleSheet">
          <p className="eyebrow">Confirm change</p>
          <h3 id={titleId}>{title}</h3>
          <p id={descriptionId}>{description}</p>
          <form action={formAction}>
            <input type="hidden" name={fieldName} value={fieldValue} />
            {state.status === "error" ? <p className="formNotice error" role="status">{state.message}</p> : null}
            <div className="lifecycleChoices">
              <button className="secondaryButton" type="button" onClick={closeDialog}>Cancel</button>
              <FormSubmitButton idle={confirmLabel} pending={pendingLabel} variant="destructive" />
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
