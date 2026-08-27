export const TI_HOTEL_SEARCH_MAX_ADVANCE_DAYS = 730;
export const HOTEL_DATE_HORIZON_REASON = "unsupported_date_horizon" as const;
export const HOTEL_DATE_HORIZON_HEADING = "Hotels aren’t available this far in advance yet.";
export const HOTEL_DATE_HORIZON_BODY = "Check back closer to your trip.";

const UTC_DAY_MS = 86_400_000;

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function parseCalendarDate(value: string | null | undefined): Date | null {
  const raw = String(value ?? "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const us = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : us
      ? { year: Number(us[3]), month: Number(us[1]), day: Number(us[2]) }
      : null;
  if (!parts) return null;

  const parsed = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    parsed.getUTCFullYear() !== parts.year ||
    parsed.getUTCMonth() !== parts.month - 1 ||
    parsed.getUTCDate() !== parts.day
  ) {
    return null;
  }
  return parsed;
}

export function hotelSearchMaxDateIso(now = new Date()) {
  const max = new Date(startOfUtcDay(now).getTime() + TI_HOTEL_SEARCH_MAX_ADVANCE_DAYS * UTC_DAY_MS);
  return max.toISOString().slice(0, 10);
}

export function evaluateHotelSearchDateHorizon(input: {
  checkIn: string | null | undefined;
  checkOut: string | null | undefined;
  now?: Date;
}) {
  const checkIn = parseCalendarDate(input.checkIn);
  const checkOut = parseCalendarDate(input.checkOut);
  const maxDateIso = hotelSearchMaxDateIso(input.now);
  if (!checkIn || !checkOut) {
    return { status: "invalid" as const, maxDateIso };
  }

  const max = parseCalendarDate(maxDateIso)!;
  if (checkIn > max || checkOut > max) {
    return { status: "unsupported" as const, reason: HOTEL_DATE_HORIZON_REASON, maxDateIso };
  }
  return { status: "supported" as const, maxDateIso };
}
