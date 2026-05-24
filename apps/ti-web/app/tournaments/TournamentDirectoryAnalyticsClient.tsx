"use client";

import { useEffect, useRef } from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";

type TournamentDirectoryAnalyticsClientProps = {
  formId: string;
  resultCount: number;
};

function asText(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export default function TournamentDirectoryAnalyticsClient(props: TournamentDirectoryAnalyticsClientProps) {
  const firedViewRef = useRef(false);

  useEffect(() => {
    if (firedViewRef.current) return;
    firedViewRef.current = true;
    void trackTiEvent("tournament_directory_page_viewed", {
      page_type: "tournaments_index",
      result_count: props.resultCount,
    });
  }, [props.resultCount]);

  useEffect(() => {
    const form = document.getElementById(props.formId) as HTMLFormElement | null;
    if (!form) return;

    const onSubmit = () => {
      try {
        const fd = new FormData(form);
        const sports = (fd.getAll("sports") as Array<FormDataEntryValue>)
          .map((v) => asText(v))
          .filter(Boolean) as string[];
        const states = (fd.getAll("state") as Array<FormDataEntryValue>)
          .map((v) => asText(v))
          .filter(Boolean) as string[];

        const sport = sports.length === 1 ? sports[0] : null;
        const state = states.length === 1 ? states[0].toUpperCase() : null;
        const month = asText(fd.get("month"));
        const dateRangeSet = Boolean(month);

        void trackTiEvent("search_submitted", {
          page_type: "tournaments_index",
          sport,
          state,
          date_range_set: dateRangeSet,
          result_count: props.resultCount,
        });
      } catch {
        // ignore
      }
    };

    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [props.formId, props.resultCount]);

  return null;
}

