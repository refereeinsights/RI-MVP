"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { saveWeekendPlanAction, type SavePlanState } from "./actions";

type Props = {
  initialSaved: boolean;
  planExists: boolean;
  tournamentId: string;
  selectedVenueId: string | null;
  canSave: boolean;
  isAuthed: boolean;
  isUnverified: boolean;
  plannerHref: string;
};

const IDLE: SavePlanState = { status: "idle" };
const SAVED: SavePlanState = { status: "saved" };

function SubmitButton(props: { isUpdate: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primaryLink" style={{ cursor: pending ? "default" : "pointer", opacity: pending ? 0.75 : 1 }} disabled={pending}>
      {pending ? "Saving..." : props.isUpdate ? "Update planning anchor" : "Add to planner"}
    </button>
  );
}

export default function SaveWeekendPlanClient(props: Props) {
  if (!props.isAuthed) {
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ color: "#475569", fontWeight: 700, fontSize: 13 }}>
          Sign in to save this weekend plan.
        </div>
        <div style={{ marginTop: 8 }}>
          <Link className="secondaryLink" href={`/signup?returnTo=${encodeURIComponent(props.plannerHref)}`}>
            Create account →
          </Link>
        </div>
      </div>
    );
  }

  if (props.isUnverified || !props.canSave) {
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ color: "#475569", fontWeight: 700, fontSize: 13 }}>
          Confirm your email to save weekend plans.
        </div>
        <div style={{ marginTop: 8 }}>
          <span className="secondaryLink" style={{ display: "inline-block" }}>
            Check your inbox →
          </span>
        </div>
      </div>
    );
  }

  const boundAction = saveWeekendPlanAction.bind(null, {
    tournamentId: props.tournamentId,
    selectedVenueId: props.selectedVenueId,
  });

  // TypeScript note: `.bind()` inference for `useFormState` can be fragile in this codebase.
  // If needed, this cast is acceptable — do not fight inference for long.
  const [state, formAction] = useFormState(boundAction as any, props.initialSaved ? SAVED : IDLE);

  if (state.status === "saved") {
    return (
      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ color: "#166534", fontWeight: 900, fontSize: 13 }}>Weekend plan saved</div>
        <Link className="secondaryLink" href={props.plannerHref}>
          View in Weekend Planner →
        </Link>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ color: "#475569", fontWeight: 700, fontSize: 13 }}>
        {props.planExists
          ? "Update your saved plan to use this venue as your planning anchor."
          : `Save this tournament${props.selectedVenueId ? " and planning venue" : ""} so you can come back to it later.`}
      </div>
      <form action={formAction} style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <SubmitButton isUpdate={props.planExists} />
        {state.status === "error" ? (
          <span style={{ color: "#b91c1c", fontWeight: 800, fontSize: 12 }}>{state.error ?? "Unable to save right now."}</span>
        ) : null}
      </form>
    </div>
  );
}
