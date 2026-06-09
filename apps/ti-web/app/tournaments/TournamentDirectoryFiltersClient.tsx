"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import StateMultiSelect from "./StateMultiSelect";

type MonthOption = {
  value: string;
  label: string;
};

type SportOption = {
  sport: string;
  count: number;
};

type PendingFilterState = {
  q: string;
  zip: string;
  radius: string;
  month: string;
  sports: string[];
  states: string[];
  includePast: boolean;
  aysoOnly: boolean;
};

type TournamentDirectoryFiltersClientProps = {
  formId: string;
  resultCount: number;
  availableStates: string[];
  stateCounts: Record<string, number>;
  totalCount: number;
  months: MonthOption[];
  sports: SportOption[];
  sportLabels: Record<string, string>;
  initialState: PendingFilterState;
  resetHref: string;
};

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

function parseBool(value: string | null) {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseAppliedFilterState(searchParams: URLSearchParams, fallback: PendingFilterState): PendingFilterState {
  const q = searchParams.get("q") ?? fallback.q;
  const zip = searchParams.get("zip") ?? fallback.zip;
  const radius = searchParams.get("radius") ?? fallback.radius;
  const month = searchParams.get("month") ?? fallback.month;
  const rawSports = searchParams.getAll("sports");
  const rawStates = searchParams.getAll("state").filter((value) => value !== "__ALL__");

  return {
    q,
    zip,
    radius,
    month,
    sports: rawSports.length > 0 ? uniqueSorted(rawSports.map((value) => value.toLowerCase())) : fallback.sports,
    states: rawStates.length > 0 ? uniqueSorted(rawStates.map((value) => value.toUpperCase())) : searchParams.has("state") ? [] : fallback.states,
    includePast: searchParams.has("includePast") ? parseBool(searchParams.get("includePast")) : fallback.includePast,
    aysoOnly: searchParams.has("aysoOnly") ? parseBool(searchParams.get("aysoOnly")) : fallback.aysoOnly,
  };
}

function filterStatesEqual(left: PendingFilterState, right: PendingFilterState) {
  return (
    left.q === right.q &&
    left.zip === right.zip &&
    left.radius === right.radius &&
    left.month === right.month &&
    left.includePast === right.includePast &&
    left.aysoOnly === right.aysoOnly &&
    left.sports.length === right.sports.length &&
    left.states.length === right.states.length &&
    left.sports.every((value, index) => value === right.sports[index]) &&
    left.states.every((value, index) => value === right.states[index])
  );
}

function summaryLabelForStates(states: string[]) {
  if (states.length === 0) return "All states";
  if (states.length <= 3) return states.join(", ");
  return `${states.length} states`;
}

export default function TournamentDirectoryFiltersClient(props: TournamentDirectoryFiltersClientProps) {
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams?.toString() ?? "";
  const stateLabelId = `${props.formId}-state-label`;
  const liveRegionId = `${props.formId}-status`;

  const appliedState = useMemo(
    () => parseAppliedFilterState(new URLSearchParams(searchParamsKey), props.initialState),
    [props.initialState, searchParamsKey]
  );

  const defaultState = useMemo<PendingFilterState>(
    () => ({
      q: "",
      zip: "",
      radius: "50",
      month: "",
      sports: [],
      states: [],
      includePast: false,
      aysoOnly: false,
    }),
    []
  );

  const [pendingState, setPendingState] = useState<PendingFilterState>(appliedState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<"neutral" | "info">("neutral");

  useEffect(() => {
    setPendingState(appliedState);
    setIsSubmitting(false);
  }, [appliedState]);

  const hasPendingChanges = useMemo(
    () => !filterStatesEqual(pendingState, appliedState),
    [appliedState, pendingState]
  );

  const canReset = useMemo(
    () => !filterStatesEqual(pendingState, defaultState),
    [defaultState, pendingState]
  );

  useEffect(() => {
    if (hasPendingChanges || isSubmitting) return;
    setFeedbackMessage("");
    setFeedbackTone("neutral");
  }, [hasPendingChanges, isSubmitting]);

  const helperText = useMemo(() => {
    if (isSubmitting) return "Applying filters…";
    if (feedbackMessage) return feedbackMessage;
    if (hasPendingChanges) return "Unsaved filter changes";
    const resultLabel = props.resultCount === 1 ? "tournament" : "tournaments";
    return `Showing ${props.resultCount} ${resultLabel}`;
  }, [feedbackMessage, hasPendingChanges, isSubmitting, props.resultCount]);

  const stateSummaryLabel = useMemo(
    () => summaryLabelForStates(pendingState.states),
    [pendingState.states]
  );

  function handleApplySubmit(event: React.FormEvent<HTMLFormElement>) {
    if (isSubmitting) {
      event.preventDefault();
      return;
    }
    if (!hasPendingChanges) {
      event.preventDefault();
      setFeedbackTone("info");
      setFeedbackMessage("Filters already applied.");
      return;
    }
    setIsSubmitting(true);
    setFeedbackTone("neutral");
    setFeedbackMessage("Applying filters…");
  }

  function handleResetClick() {
    if (!canReset) {
      setFeedbackTone("info");
      setFeedbackMessage("Filters already cleared.");
      return;
    }
    setIsSubmitting(true);
    window.location.assign(props.resetHref);
  }

  return (
    <form id={props.formId} className="filters" method="GET" action="/tournaments" onSubmit={handleApplySubmit}>
      <div>
        <label className="label" htmlFor="q">
          Search
        </label>
        <input
          id="q"
          name="q"
          className="input"
          placeholder="Search tournaments..."
          value={pendingState.q}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setPendingState((current) => ({ ...current, q: value }));
          }}
        />
      </div>

      <div>
        <span className="label" id={stateLabelId}>
          State
        </span>
        <StateMultiSelect
          availableStates={props.availableStates}
          stateSelections={pendingState.states}
          isAllStates={pendingState.states.length === 0}
          allStatesValue="__ALL__"
          summaryLabel={stateSummaryLabel}
          stateCounts={props.stateCounts}
          totalCount={props.totalCount}
          selectedStates={pendingState.states}
          allStatesSelected={pendingState.states.length === 0}
          triggerLabelId={stateLabelId}
          onSelectionChange={(nextStates) =>
            setPendingState((current) => ({
              ...current,
              states: uniqueSorted(nextStates.map((value) => value.toUpperCase())),
            }))
          }
        />
      </div>

      <div>
        <label className="label" htmlFor="zip">
          ZIP + radius
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            id="zip"
            name="zip"
            className="input"
            placeholder="ZIP (e.g. 02139)"
            inputMode="numeric"
            pattern="\\d{5}"
            maxLength={5}
            value={pendingState.zip}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setPendingState((current) => ({ ...current, zip: value }));
            }}
            style={{ flex: 1, minWidth: 0 }}
          />
          <select
            id="radius"
            name="radius"
            className="select"
            value={pendingState.radius}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setPendingState((current) => ({ ...current, radius: value }));
            }}
            style={{ width: 120 }}
          >
            {[10, 25, 50, 75, 100, 150, 200, 300].map((miles) => (
              <option key={miles} value={String(miles)}>
                {miles} mi
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="month">
          Month
        </label>
        <select
          id="month"
          name="month"
          className="select"
          value={pendingState.month}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setPendingState((current) => ({ ...current, month: value }));
          }}
        >
          <option value="">Any</option>
          {props.months.map((month) => (
            <option key={month.value} value={month.value}>
              {month.label}
            </option>
          ))}
        </select>
      </div>

      <div className="actionsRow">
        <div className="filterActions" role="group" aria-label="Tournament filter actions">
          <button
            type="submit"
            className="smallBtn smallBtn--primary"
            disabled={isSubmitting}
            aria-describedby={liveRegionId}
          >
            {isSubmitting ? "Applying…" : "Apply filters"}
          </button>
          <button
            type="button"
            className={`smallBtn smallBtn--secondary${!canReset ? " smallBtn--muted" : ""}`}
            onClick={handleResetClick}
            disabled={isSubmitting}
            aria-describedby={liveRegionId}
          >
            Reset
          </button>
        </div>
      </div>
      <div
        id={liveRegionId}
        className={`filtersStatus${feedbackTone === "info" ? " filtersStatus--info" : ""}`}
        aria-live="polite"
        role="status"
      >
        {helperText}
      </div>

      <div className="sportsRow" aria-label="Sports filters">
        {props.sports.map(({ sport, count }) => {
          const checked = pendingState.sports.includes(sport);
          return (
            <label key={sport} className="sportToggle">
              <input
                type="checkbox"
                name="sports"
                value={sport}
                checked={checked}
                onChange={(event) => {
                  const isChecked = event.currentTarget.checked;
                  setPendingState((current) => ({
                    ...current,
                    sports: isChecked
                      ? uniqueSorted([...current.sports, sport])
                      : current.sports.filter((value) => value !== sport),
                  }));
                }}
              />
              <span>
                {props.sportLabels[sport] || sport} ({count})
              </span>
            </label>
          );
        })}
        <label className="sportToggle">
          <input
            type="checkbox"
            name="includePast"
            value="true"
            checked={pendingState.includePast}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setPendingState((current) => ({ ...current, includePast: checked }));
            }}
          />
          <span>Include past events</span>
        </label>
        <label className="sportToggle">
          <input
            type="checkbox"
            name="aysoOnly"
            value="true"
            checked={pendingState.aysoOnly}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setPendingState((current) => ({ ...current, aysoOnly: checked }));
            }}
          />
          <span>AYSO only</span>
        </label>
      </div>
    </form>
  );
}
