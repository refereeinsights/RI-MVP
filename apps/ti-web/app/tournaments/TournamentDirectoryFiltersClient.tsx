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

  const appliedState = useMemo(
    () => parseAppliedFilterState(new URLSearchParams(searchParamsKey), props.initialState),
    [props.initialState, searchParamsKey]
  );

  const [pendingState, setPendingState] = useState<PendingFilterState>(appliedState);

  useEffect(() => {
    setPendingState(appliedState);
  }, [appliedState]);

  const hasPendingChanges = useMemo(
    () => !filterStatesEqual(pendingState, appliedState),
    [appliedState, pendingState]
  );

  const helperText = useMemo(() => {
    if (hasPendingChanges) return "Unsaved filter changes";
    const resultLabel = props.resultCount === 1 ? "tournament" : "tournaments";
    return `No changes to apply · Showing ${props.resultCount} ${resultLabel}`;
  }, [hasPendingChanges, props.resultCount]);

  const stateSummaryLabel = useMemo(
    () => summaryLabelForStates(pendingState.states),
    [pendingState.states]
  );

  return (
    <form id={props.formId} className="filters" method="GET" action="/tournaments">
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
        <span className="label">State</span>
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
        <button type="submit" className="smallBtn" disabled={!hasPendingChanges}>
          Apply filters
        </button>
        <a className="smallBtn" href={props.resetHref}>
          Reset
        </a>
        <div className="filtersStatus" aria-live="polite">
          {helperText}
        </div>
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
