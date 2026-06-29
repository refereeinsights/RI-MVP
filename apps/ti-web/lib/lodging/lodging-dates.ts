export const LODGING_DATE_FORMAT = "MM/DD/YYYY" as const;

export type VenueDateInput = string | Date | null | undefined;

export type NormalizedVenueDates = {
  checkIn: string;
  checkOut: string;
};

export type InvalidDateInput = {
  dateStart: string | null;
  dateEnd: string | null;
};

function normalizeDateInput(value: VenueDateInput): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())) : null;
  }
  const raw = String(value).trim();
  if (!raw) return null;

  // Accept both YYYY-MM-DD and ISO-like inputs and coerce to date-only UTC.
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/;
  const m = raw.match(isoMatch);
  if (m) {
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === `${m[1]}-${m[2]}-${m[3]}` ? parsed : null;
  }

  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime())
    ? new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
    : null;
}

export function formatDateToMmDdYyyy(value: Date): string {
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const year = value.getUTCFullYear();
  return `${month}/${day}/${year}`;
}

export function inferLodgingStayWindow(input: { startDate?: VenueDateInput; endDate?: VenueDateInput }): NormalizedVenueDates | null {
  const start = normalizeDateInput(input.startDate);
  if (!start) return null;

  const endRaw = normalizeDateInput(input.endDate);
  const end = endRaw && endRaw > start ? endRaw : null;
  const checkIn = new Date(start);
  checkIn.setUTCDate(checkIn.getUTCDate() - 1);

  const checkOut = end ?? new Date(start);
  if (!end) checkOut.setUTCDate(checkOut.getUTCDate() + 1);

  if (checkOut <= checkIn) return null;

  return {
    checkIn: formatDateToMmDdYyyy(checkIn),
    checkOut: formatDateToMmDdYyyy(checkOut),
  };
}

export function describeMissingDateFallback(input: { startDate?: VenueDateInput; endDate?: VenueDateInput }): InvalidDateInput {
  const start = normalizeDateInput(input.startDate);
  const end = normalizeDateInput(input.endDate);
  return {
    dateStart: start ? null : "no_dates",
    dateEnd: start && !end ? "no_dates" : null,
  } as InvalidDateInput;
}
