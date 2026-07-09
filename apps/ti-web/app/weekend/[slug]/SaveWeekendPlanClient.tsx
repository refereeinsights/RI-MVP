"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";
import { saveWeekendPlanAction, type WeekendPlanSaveState } from "./actions";

type Props = {
  initialSaved: boolean;
  planExists: boolean;
  tournamentId: string;
  tournamentSlug: string;
  selectedVenueId: string | null;
  canSave: boolean;
  isAuthed: boolean;
  isUnverified: boolean;
  plannerHref: string;
};

const IDLE: WeekendPlanSaveState = { status: "idle" };
const SAVED: WeekendPlanSaveState = { status: "saved", saveMode: "update", selectedVenueIdPresent: true };

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
          Create a free Insider account to save this weekend plan.
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="secondaryLink" href={`/login?returnTo=${encodeURIComponent(props.plannerHref)}`}>
              Sign in →
            </Link>
            <Link className="secondaryLink" href={`/signup?returnTo=${encodeURIComponent(props.plannerHref)}`}>
              Create account →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (props.isUnverified || !props.canSave) {
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ color: "#475569", fontWeight: 700, fontSize: 13 }}>
          Verify your email to save this weekend plan.
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
    planExists: props.planExists,
    selectedVenueId: props.selectedVenueId,
  });

  // TypeScript note: `.bind()` inference for `useFormState` can be fragile in this codebase.
  // If needed, this cast is acceptable — do not fight inference for long.
  const [state, formAction] = useFormState(boundAction as any, props.initialSaved ? SAVED : IDLE);
  const saveAttemptRef = useRef(false);

  useEffect(() => {
    if (!saveAttemptRef.current) return;
    if (state.status === "saved") {
      saveAttemptRef.current = false;
      void trackTiEvent("weekend_plan_saved", {
        page_type: "weekend_plan",
        tournament_id: props.tournamentId,
        tournament_slug: props.tournamentSlug,
        selected_venue_id_present: state.selectedVenueIdPresent,
        save_mode: state.saveMode,
      });
      return;
    }
    if (state.status === "error") {
      saveAttemptRef.current = false;
    }
  }, [props.tournamentId, props.tournamentSlug, state]);

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
      <form
        action={formAction as any}
        style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}
        onSubmit={() => {
          saveAttemptRef.current = true;
          void trackTiEvent("weekend_plan_save_clicked", {
            page_type: "weekend_plan",
            tournament_id: props.tournamentId,
            tournament_slug: props.tournamentSlug,
            selected_venue_id_present: Boolean(props.selectedVenueId),
            save_mode: props.planExists ? "update" : "create",
          });
        }}
      >
        <SubmitButton isUpdate={props.planExists} />
        {state.status === "error" ? (
          <span style={{ color: "#b91c1c", fontWeight: 800, fontSize: 12 }}>{state.error ?? "Unable to save right now."}</span>
        ) : null}
      </form>
    </div>
  );
}
