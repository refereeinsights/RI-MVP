"use client";

import { useEffect, useMemo, useState } from "react";

type TournamentDirectoryFilterActionsClientProps = {
  formId: string;
  resetHref: string;
  resultCount: number;
};

function serializeFormData(form: HTMLFormElement) {
  const params = new URLSearchParams();
  const formData = new FormData(form);
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    params.append(key, value);
  }
  params.sort();
  return params.toString();
}

export default function TournamentDirectoryFilterActionsClient(props: TournamentDirectoryFilterActionsClientProps) {
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  useEffect(() => {
    const form = document.getElementById(props.formId) as HTMLFormElement | null;
    if (!form) return;

    const initialSerialized = serializeFormData(form);

    const updatePendingState = () => {
      setHasPendingChanges(serializeFormData(form) !== initialSerialized);
    };

    updatePendingState();

    form.addEventListener("input", updatePendingState);
    form.addEventListener("change", updatePendingState);

    return () => {
      form.removeEventListener("input", updatePendingState);
      form.removeEventListener("change", updatePendingState);
    };
  }, [props.formId]);

  const helperText = useMemo(() => {
    if (hasPendingChanges) return "Unsaved filter changes";
    const resultLabel = props.resultCount === 1 ? "tournament" : "tournaments";
    return `No changes to apply · Showing ${props.resultCount} ${resultLabel}`;
  }, [hasPendingChanges, props.resultCount]);

  return (
    <div className="actionsRow">
      <button type="submit" className="smallBtn" disabled={!hasPendingChanges} aria-disabled={!hasPendingChanges}>
        Apply filters
      </button>
      <a className="smallBtn" href={props.resetHref}>
        Reset
      </a>
      <div className="filtersStatus" aria-live="polite">
        {helperText}
      </div>
    </div>
  );
}
