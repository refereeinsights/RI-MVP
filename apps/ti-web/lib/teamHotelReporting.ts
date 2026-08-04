export type TeamHotelAcceptedRequestRow = {
  status?: string | null;
  group_request_id?: string | null;
  outbound_attribution_id?: string | null;
  search_query?: {
    destination?: unknown;
    checkIn?: unknown;
    checkOut?: unknown;
    rooms?: unknown;
  } | null;
  tournament_id?: string | null;
  venue_id?: string | null;
};

function asText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asPositiveInt(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseMmDdYyyy(value: string | null) {
  if (!value || !/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return null;
  const [month, day, year] = value.split("/").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

export function isQualifiedTeamHotelAcceptedRequest(
  row: TeamHotelAcceptedRequestRow,
  today = new Date()
) {
  if (row.status !== "succeeded") return false;
  if (!asText(row.group_request_id)) return false;
  if (!asText(row.outbound_attribution_id)) return false;

  const rooms = asPositiveInt(row.search_query?.rooms);
  if (rooms === null || rooms < 5) return false;

  const checkIn = parseMmDdYyyy(asText(row.search_query?.checkIn));
  const checkOut = parseMmDdYyyy(asText(row.search_query?.checkOut));
  if (!checkIn || !checkOut || checkOut <= checkIn) return false;

  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (checkIn < todayUtc) return false;

  const hasUsableContext =
    Boolean(asText(row.search_query?.destination)) ||
    Boolean(asText(row.tournament_id)) ||
    Boolean(asText(row.venue_id));

  return hasUsableContext;
}
