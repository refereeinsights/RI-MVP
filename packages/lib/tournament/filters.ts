export const ALL_STATES_VALUE = "__ALL__";

export type MonthOption = {
  value: string;
  label: string;
};

export type StateSelectionState = {
  selections: string[];
  selectionsRaw: string[];
  isAllStates: boolean;
  summaryLabel: string;
};

function toTitleCase(value: string) {
  return value.replace(/\b\w/g, (match) => match.toUpperCase());
}

export function normalizeSportParam(sport: string) {
  return sport.trim().toLowerCase().replace(/-/g, " ");
}

export function sportLabelFromParam(sport: string) {
  return toTitleCase(normalizeSportParam(sport));
}

export function parseToggle(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[value.length - 1] : value;
  const normalized = String(raw ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

export function parseMultiValueParam(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value : value ? [value] : []).map((entry) => entry.trim()).filter(Boolean);
}

export function parseStateSelections(
  value: string | string[] | undefined,
  allStatesValue = ALL_STATES_VALUE
): StateSelectionState {
  const selectionsRaw = parseMultiValueParam(value).map((entry) => entry.toUpperCase());
  const selections = selectionsRaw.filter((entry) => entry !== allStatesValue);
  const isAllStates = selections.length === 0 || selectionsRaw.includes(allStatesValue);

  return {
    selections,
    selectionsRaw,
    isAllStates,
    summaryLabel: buildStateSummaryLabel(selections, isAllStates),
  };
}

export function buildStateSummaryLabel(selections: string[], isAllStates: boolean) {
  if (isAllStates) return "All states";
  if (selections.length <= 3) return selections.join(", ");
  return `${selections.length} states`;
}

export function buildMonthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));

  return {
    startISO: start.toISOString().slice(0, 10),
    endISO: end.toISOString().slice(0, 10),
  };
}

export function monthOptions(count = 9, fromDate = new Date()): MonthOption[] {
  const options: MonthOption[] = [];
  for (let index = 0; index < count; index += 1) {
    const current = new Date(fromDate.getFullYear(), fromDate.getMonth() + index, 1);
    options.push({
      value: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`,
      label: current.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    });
  }
  return options;
}

