export type TeamHotelBookingLinkContext = {
  destination?: string | null;
  city?: string | null;
  state?: string | null;
  checkin?: string | null;
  checkout?: string | null;
  rooms?: number | string | null;
  tournamentId?: string | null;
  tournamentSlug?: string | null;
  tournamentName?: string | null;
  venueId?: string | null;
  venueName?: string | null;
  sport?: string | null;
  entrySource?: string | null;
  entryPageType?: string | null;
  entryPath?: string | null;
  entryPlacement?: string | null;
};

function cleanText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function cleanIsoDate(value: string | null | undefined) {
  const text = cleanText(value);
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function normalizeStayDates(checkinValue: string | null, checkoutValue: string | null) {
  const checkin = cleanIsoDate(checkinValue);
  let checkout = cleanIsoDate(checkoutValue);

  if (checkin && checkout && checkout <= checkin) {
    checkout = addDays(checkin, 1);
  }

  return { checkin, checkout };
}

export function buildTeamHotelBookingDestination(context: Pick<TeamHotelBookingLinkContext, "destination" | "venueName" | "city" | "state">) {
  const explicitDestination = cleanText(context.destination);
  if (explicitDestination) return explicitDestination;

  const venueName = cleanText(context.venueName);
  const city = cleanText(context.city);
  const state = cleanText(context.state);
  const locality = [city, state].filter(Boolean).join(", ");

  if (venueName && locality) return `${venueName}, ${locality}`;
  if (venueName) return venueName;
  if (locality) return locality;
  return null;
}

export function buildTeamHotelBookingHref(context: TeamHotelBookingLinkContext = {}) {
  const params = new URLSearchParams();

  const destination = buildTeamHotelBookingDestination(context);
  const { checkin, checkout } = normalizeStayDates(context.checkin ?? null, context.checkout ?? null);
  const tournamentId = cleanText(context.tournamentId);
  const tournamentSlug = cleanText(context.tournamentSlug);
  const tournamentName = cleanText(context.tournamentName);
  const venueId = cleanText(context.venueId);
  const venueName = cleanText(context.venueName);
  const city = cleanText(context.city);
  const state = cleanText(context.state);
  const sport = cleanText(context.sport);
  const entrySource = cleanText(context.entrySource);
  const entryPageType = cleanText(context.entryPageType);
  const entryPath = cleanText(context.entryPath);
  const entryPlacement = cleanText(context.entryPlacement);

  if (destination) params.set("destination", destination);
  if (checkin) params.set("checkin", checkin);
  if (checkout) params.set("checkout", checkout);
  if (tournamentId) params.set("tournament_id", tournamentId);
  if (tournamentSlug) params.set("tournament_slug", tournamentSlug);
  if (tournamentName) params.set("tournament_name", tournamentName);
  if (venueId) params.set("venue_id", venueId);
  if (venueName) params.set("venue_name", venueName);
  if (city) params.set("city", city);
  if (state) params.set("state", state);
  if (sport) params.set("sport", sport);
  if (entrySource) params.set("entry_source", entrySource);
  if (entryPageType) params.set("entry_page_type", entryPageType);
  if (entryPath) params.set("entry_path", entryPath);
  if (entryPlacement) params.set("entry_placement", entryPlacement);

  const roomsRaw = context.rooms;
  const rooms = typeof roomsRaw === "number" ? roomsRaw : Number.parseInt(String(roomsRaw ?? ""), 10);
  if (Number.isFinite(rooms) && rooms >= 5) params.set("rooms", String(rooms));

  const query = params.toString();
  return query ? `/team-hotel-booking?${query}` : "/team-hotel-booking";
}
