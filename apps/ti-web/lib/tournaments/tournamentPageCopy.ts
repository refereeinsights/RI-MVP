type TournamentCopyInput = {
  name: string;
  sport: string | null;
  level: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  state: string | null;
  official_website_url?: string | null;
};

type NearbyCounts = { coffee: number; food: number; hotels: number; quick_eats: number; hangouts: number; sporting_goods: number };

function formatDateLabel(startIso: string | null, endIso: string | null) {
  const fmt = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };
  const start = startIso ? fmt(startIso) : null;
  const end = endIso ? fmt(endIso) : null;
  if (start && end && start !== end) return `${start} – ${end}`;
  return start || end || null;
}

function formatLocationLabel(city: string | null, state: string | null) {
  const parts = [city, state].map((v) => String(v ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function formatSportLabel(sport: string | null) {
  const s = String(sport ?? "").trim();
  return s ? s.toLowerCase() : "tournament";
}

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function buildTournamentOverviewCopy(args: {
  tournament: TournamentCopyInput;
  venueCount: number;
  primaryVenueName: string | null;
}) {
  const name = String(args.tournament.name ?? "").trim();
  if (!name) return null;

  const dateLabel = formatDateLabel(args.tournament.start_date, args.tournament.end_date);
  const locationLabel = formatLocationLabel(args.tournament.city ?? null, args.tournament.state ?? null);

  const venueCount = Number.isFinite(args.venueCount) ? Math.max(0, Math.floor(args.venueCount)) : 0;
  const primaryVenueName = String(args.primaryVenueName ?? "").trim() || null;
  const sportLabel = formatSportLabel(args.tournament.sport ?? null);

  if (!locationLabel && !dateLabel) {
    return `This ${sportLabel} listing is missing confirmed dates and location. Details can change, so families should confirm schedules and field assignments with the organizer before traveling.`;
  }

  if (!dateLabel && locationLabel) {
    return `This ${sportLabel} is listed in ${locationLabel}. Dates are still being confirmed.`;
  }

  if (dateLabel && !locationLabel) {
    return `${name} is scheduled for ${dateLabel}. Location is still being confirmed.`;
  }

  // Both date + location exist.
  const firstSentence = `${name} is scheduled for ${dateLabel ?? "Dates TBA"} in ${locationLabel ?? "Location TBA"}.`;
  const venueSentence =
    venueCount === 0
      ? "Venue details have not been added yet."
      : venueCount === 1 && primaryVenueName
        ? `This event is currently listed with 1 venue: ${primaryVenueName}.`
        : `This event is currently listed with ${pluralize(venueCount, "venue")}.`;

  return `${firstSentence} ${venueSentence}`;
}

export function buildVenuePlanningCopy(args: {
  venueCount: number;
  primaryVenueName: string | null;
  primaryVenueLocationLabel: string | null;
  mapHref: string;
}) {
  const venueCount = Number.isFinite(args.venueCount) ? Math.max(0, Math.floor(args.venueCount)) : 0;
  const venueName = String(args.primaryVenueName ?? "").trim() || null;
  const venueLoc = String(args.primaryVenueLocationLabel ?? "").trim() || null;
  const hasVenue = venueCount > 0;
  if (!hasVenue) return null;

  if (venueCount === 1) {
    const place = venueName ? ` ${venueName}` : " the listed venue";
    const loc = venueLoc ? ` in ${venueLoc}` : "";
    return `Games are currently linked to${place}${loc}. Open the interactive venue map to orient your team before arriving.`;
  }

  return `This tournament uses multiple venues. Open the interactive venue map and check each venue before game day so your team knows where games are scheduled.`;
}

export function buildTravelPlanningCopy(args: { counts: NearbyCounts | null; venueCount: number }) {
  const counts = args.counts;
  if (!counts) return null;
  const coffee = Number.isFinite(counts.coffee) ? Math.max(0, Math.floor(counts.coffee)) : 0;
  const food = Number.isFinite(counts.food) ? Math.max(0, Math.floor(counts.food)) : 0;
  const hotels = Number.isFinite(counts.hotels) ? Math.max(0, Math.floor(counts.hotels)) : 0;
  const quickEats = Number.isFinite(counts.quick_eats) ? Math.max(0, Math.floor(counts.quick_eats)) : 0;
  const hangouts = Number.isFinite(counts.hangouts) ? Math.max(0, Math.floor(counts.hangouts)) : 0;
  const gear = Number.isFinite(counts.sporting_goods) ? Math.max(0, Math.floor(counts.sporting_goods)) : 0;
  if (coffee + food + hotels + quickEats + hangouts + gear <= 0) return null;

  const parts: string[] = [];
  if (coffee > 0) parts.push(`${coffee} coffee option${coffee === 1 ? "" : "s"}`);
  if (food > 0) parts.push(`${food} food option${food === 1 ? "" : "s"}`);
  if (hotels > 0) parts.push(`${hotels} hotel${hotels === 1 ? "" : "s"}`);
  if (quickEats > 0) parts.push(`${quickEats} quick eat${quickEats === 1 ? "" : "s"}`);
  if (hangouts > 0) parts.push(`${hangouts} hangout${hangouts === 1 ? "" : "s"}`);
  if (gear > 0) parts.push(`${gear} sporting goods option${gear === 1 ? "" : "s"}`);
  const list = parts.length === 1 ? parts[0] : parts.length === 2 ? `${parts[0]} and ${parts[1]}` : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;

  const venueCount = Number.isFinite(args.venueCount) ? Math.max(0, Math.floor(args.venueCount)) : 0;
  const venuePhrase = venueCount === 1 ? "the listed venue" : "the listed venues";
  return `TournamentInsights currently shows ${list} near ${venuePhrase}. These options are intended to help families plan between games.`;
}

export function buildVerificationCopy(args: { official_website_url: string | null; isDemoTournament?: boolean }) {
  const hasOfficial = Boolean(String(args.official_website_url ?? "").trim()) && !args.isDemoTournament;
  return hasOfficial
    ? "Details can change — always verify schedules and field assignments on the official tournament site before traveling."
    : "Details can change — always verify schedules and field assignments with the organizer before traveling.";
}

export function buildTournamentFaqs(_args: {
  tournament: TournamentCopyInput;
  venueCount: number;
  primaryVenueName: string | null;
  primaryVenueLocationLabel: string | null;
  counts: NearbyCounts | null;
  mapHref: string;
}) {
  // V1: prepared for future use; do not render or emit JSON-LD yet.
  return [] as Array<{ question: string; answer: string }>;
}
