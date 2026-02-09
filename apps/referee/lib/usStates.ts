const STATES: Array<{ abbr: string; name: string }> = [
  { abbr: "AL", name: "Alabama" },
  { abbr: "AK", name: "Alaska" },
  { abbr: "AZ", name: "Arizona" },
  { abbr: "AR", name: "Arkansas" },
  { abbr: "CA", name: "California" },
  { abbr: "CO", name: "Colorado" },
  { abbr: "CT", name: "Connecticut" },
  { abbr: "DE", name: "Delaware" },
  { abbr: "DC", name: "District of Columbia" },
  { abbr: "FL", name: "Florida" },
  { abbr: "GA", name: "Georgia" },
  { abbr: "HI", name: "Hawaii" },
  { abbr: "ID", name: "Idaho" },
  { abbr: "IL", name: "Illinois" },
  { abbr: "IN", name: "Indiana" },
  { abbr: "IA", name: "Iowa" },
  { abbr: "KS", name: "Kansas" },
  { abbr: "KY", name: "Kentucky" },
  { abbr: "LA", name: "Louisiana" },
  { abbr: "ME", name: "Maine" },
  { abbr: "MD", name: "Maryland" },
  { abbr: "MA", name: "Massachusetts" },
  { abbr: "MI", name: "Michigan" },
  { abbr: "MN", name: "Minnesota" },
  { abbr: "MS", name: "Mississippi" },
  { abbr: "MO", name: "Missouri" },
  { abbr: "MT", name: "Montana" },
  { abbr: "NE", name: "Nebraska" },
  { abbr: "NV", name: "Nevada" },
  { abbr: "NH", name: "New Hampshire" },
  { abbr: "NJ", name: "New Jersey" },
  { abbr: "NM", name: "New Mexico" },
  { abbr: "NY", name: "New York" },
  { abbr: "NC", name: "North Carolina" },
  { abbr: "ND", name: "North Dakota" },
  { abbr: "OH", name: "Ohio" },
  { abbr: "OK", name: "Oklahoma" },
  { abbr: "OR", name: "Oregon" },
  { abbr: "PA", name: "Pennsylvania" },
  { abbr: "RI", name: "Rhode Island" },
  { abbr: "SC", name: "South Carolina" },
  { abbr: "SD", name: "South Dakota" },
  { abbr: "TN", name: "Tennessee" },
  { abbr: "TX", name: "Texas" },
  { abbr: "UT", name: "Utah" },
  { abbr: "VT", name: "Vermont" },
  { abbr: "VA", name: "Virginia" },
  { abbr: "WA", name: "Washington" },
  { abbr: "WV", name: "West Virginia" },
  { abbr: "WI", name: "Wisconsin" },
  { abbr: "WY", name: "Wyoming" },
];

const NAME_TO_ABBR = new Map<string, string>(
  STATES.map((state) => [state.name.toLowerCase(), state.abbr])
);
const ABBR_TO_NAME = new Map<string, string>(
  STATES.map((state) => [state.abbr, state.name])
);

export function normalizeStateDisplay(value?: string | null) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  if (ABBR_TO_NAME.has(upper)) return ABBR_TO_NAME.get(upper)!;
  const lower = trimmed.toLowerCase();
  if (NAME_TO_ABBR.has(lower)) return trimmed
    .toLowerCase()
    .split(" ")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");
  return upper;
}

export function normalizeStateAbbr(value?: string | null) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (ABBR_TO_NAME.has(upper)) return upper;
  const lower = trimmed.toLowerCase();
  if (NAME_TO_ABBR.has(lower)) return NAME_TO_ABBR.get(lower)!;
  return null;
}

export function stateAliases(value?: string | null) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return [];
  const upper = trimmed.toUpperCase();
  if (ABBR_TO_NAME.has(upper)) {
    return [upper, ABBR_TO_NAME.get(upper)!];
  }
  const lower = trimmed.toLowerCase();
  if (NAME_TO_ABBR.has(lower)) {
    const abbr = NAME_TO_ABBR.get(lower)!;
    return [abbr, normalizeStateDisplay(trimmed)];
  }
  return [trimmed];
}

export function listStateNames() {
  return STATES.map((state) => state.name);
}
