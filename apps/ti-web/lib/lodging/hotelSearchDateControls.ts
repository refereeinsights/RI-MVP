const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MM_DD_YYYY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function parseIsoDate(value: string) {
  const match = value.trim().match(ISO_DATE_RE);
  if (!match) return null;
  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function hotelPlannerDateToIso(value: string | null | undefined) {
  const match = String(value ?? "").trim().match(MM_DD_YYYY_RE);
  if (!match) return "";
  const [, monthRaw, dayRaw, yearRaw] = match;
  const iso = `${yearRaw}-${monthRaw.padStart(2, "0")}-${dayRaw.padStart(2, "0")}`;
  return parseIsoDate(iso) ? iso : "";
}

export function validateHotelSearchDateRange(checkIn: string, checkOut: string) {
  const normalizedCheckIn = checkIn.trim();
  const normalizedCheckOut = checkOut.trim();
  const parsedCheckIn = parseIsoDate(normalizedCheckIn);
  const parsedCheckOut = parseIsoDate(normalizedCheckOut);

  if (!parsedCheckIn || !parsedCheckOut) {
    return {
      ok: false as const,
      error: "Choose valid check-in and check-out dates.",
    };
  }
  if (parsedCheckOut <= parsedCheckIn) {
    return {
      ok: false as const,
      error: "Check-out must be after check-in.",
    };
  }

  return {
    ok: true as const,
    checkIn: normalizedCheckIn,
    checkOut: normalizedCheckOut,
  };
}

export function formatHotelSearchDateRange(checkIn: string | null, checkOut: string | null) {
  const checkInIso = hotelPlannerDateToIso(checkIn);
  const checkOutIso = hotelPlannerDateToIso(checkOut);
  const parsedCheckIn = checkInIso ? parseIsoDate(checkInIso) : null;
  const parsedCheckOut = checkOutIso ? parseIsoDate(checkOutIso) : null;
  if (!parsedCheckIn || !parsedCheckOut) return null;

  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(parsedCheckIn)} – ${formatter.format(parsedCheckOut)}`;
}
