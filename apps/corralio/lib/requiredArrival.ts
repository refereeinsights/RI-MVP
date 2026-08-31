export const CORRALIO_DEFAULT_ARRIVAL_MINUTES = 30;

export type RequiredArrivalSource =
  | "ics_explicit"
  | "source_preference"
  | "team_preference"
  | "corralio_default";

export type RequiredArrivalInput = {
  startsAt: string;
  scheduleArrivalAt: string | null;
  sourceArrivalMinutes: number | null;
  teamArrivalMinutes: number | null;
};

export type RequiredArrivalResult = {
  requiredArrivalAt: string;
  source: RequiredArrivalSource;
  minutes: number;
};

function validInstant(value: string | null) {
  const milliseconds = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function validPreference(value: number | null): value is number {
  return Number.isInteger(value)
    && (value as number) >= 0
    && (value as number) <= 120
    && (value as number) % 5 === 0;
}

export function parseArrivalPreferenceInput(input: unknown):
  | { ok: true; value: number | null }
  | { ok: false } {
  if (typeof input !== "string") return { ok: false };
  const normalized = input.trim();
  if (!normalized) return { ok: true, value: null };
  const value = Number(normalized);
  return validPreference(value) ? { ok: true, value } : { ok: false };
}

export function resolveRequiredArrival(input: RequiredArrivalInput): RequiredArrivalResult | null {
  const startsAt = validInstant(input.startsAt);
  if (startsAt === null) return null;

  const explicitAt = validInstant(input.scheduleArrivalAt);
  if (explicitAt !== null) {
    const minutes = (startsAt - explicitAt) / 60_000;
    if (Number.isInteger(minutes) && minutes >= 0 && minutes <= 180) {
      return {
        requiredArrivalAt: new Date(explicitAt).toISOString(),
        source: "ics_explicit",
        minutes,
      };
    }
  }

  if (validPreference(input.sourceArrivalMinutes)) {
    return {
      requiredArrivalAt: new Date(startsAt - input.sourceArrivalMinutes * 60_000).toISOString(),
      source: "source_preference",
      minutes: input.sourceArrivalMinutes,
    };
  }

  if (validPreference(input.teamArrivalMinutes)) {
    return {
      requiredArrivalAt: new Date(startsAt - input.teamArrivalMinutes * 60_000).toISOString(),
      source: "team_preference",
      minutes: input.teamArrivalMinutes,
    };
  }

  return {
    requiredArrivalAt: new Date(startsAt - CORRALIO_DEFAULT_ARRIVAL_MINUTES * 60_000).toISOString(),
    source: "corralio_default",
    minutes: CORRALIO_DEFAULT_ARRIVAL_MINUTES,
  };
}
