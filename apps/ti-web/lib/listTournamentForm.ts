import { TI_SPORTS, TI_SPORT_LABELS, type TiSport } from "@/lib/tiSports";

export const TI_TOURNAMENT_SPORTS = TI_SPORTS;
export const LODGING_OPTIONS = ["hotel", "stipend"] as const;
export const RESTROOM_OPTIONS = ["Portable", "Building", "Both"] as const;
export const YES_NO_OPTIONS = ["yes", "no"] as const;
export const TOURNAMENT_SPONSOR_CATEGORY_OPTIONS = ["food", "coffee", "hotel", "apparel", "other"] as const;
export const MAX_TOURNAMENT_SPONSORS = 4;

export type YesNoValue = (typeof YES_NO_OPTIONS)[number] | "";
export type LodgingValue = (typeof LODGING_OPTIONS)[number] | "";
export type RestroomValue = (typeof RESTROOM_OPTIONS)[number] | "";
export type TournamentSponsorCategoryValue = (typeof TOURNAMENT_SPONSOR_CATEGORY_OPTIONS)[number] | "";

export type TournamentDetailsInput = {
  name: string;
  sport: string;
  startDate: string;
  endDate: string;
  officialWebsiteUrl: string;
  teamFee: string;
  ageGroup: string;
  tournamentDirector: string;
  tournamentDirectorEmail: string;
  refereeContact: string;
  refereeEmail: string;
  refereePay: string;
  refCashTournament: YesNoValue;
  refMentors: YesNoValue;
  travelLodging: LodgingValue;
};

export type VenueInput = {
  id?: string;
  name: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  venueUrl: string;
  restrooms: RestroomValue;
  bringFieldChairs: YesNoValue;
};

export type TournamentSubmissionInput = {
  verifyTargetTournamentId?: string | null;
  tournament: TournamentDetailsInput;
  sponsors?: SponsorInput[];
  venues: VenueInput[];
};

export type TournamentFieldErrors = Partial<Record<keyof TournamentDetailsInput, string>>;
export type VenueFieldErrors = Partial<Record<keyof VenueInput, string>>;

export type SubmissionErrors = {
  form?: string;
  tournament: TournamentFieldErrors;
  sponsors: SponsorFieldErrors[];
  venues: VenueFieldErrors[];
};

export type SanitizedTournamentDetails = {
  name: string;
  sport: TiSport;
  startDate: string;
  endDate: string;
  officialWebsiteUrl: string;
  teamFee: string | null;
  ageGroup: string | null;
  tournamentDirector: string;
  tournamentDirectorEmail: string;
  refereeContact: string | null;
  refereeEmail: string | null;
  refereePay: string | null;
  refCashTournament: boolean;
  refMentors: "yes" | "no" | null;
  travelLodging: "hotel" | "stipend" | null;
};

export type SanitizedVenue = {
  name: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  venueUrl: string | null;
  restrooms: "Portable" | "Building" | "Both";
  bringFieldChairs: boolean;
};

export type SanitizedTournamentSubmission = {
  tournament: SanitizedTournamentDetails;
  sponsors: SanitizedSponsor[];
  venues: SanitizedVenue[];
};

export type SponsorInput = {
  id?: string;
  name: string;
  address: string;
  websiteUrl: string;
  category: TournamentSponsorCategoryValue;
  otherCategory: string;
};

export type SponsorFieldErrors = Partial<Record<keyof SponsorInput, string>>;

export type SanitizedSponsor = {
  id?: string;
  name: string;
  address: string;
  websiteUrl: string;
  category: string;
};

export type TournamentDuplicateVenue = {
  id: string | null;
  name: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  venueUrl: string | null;
  restrooms: RestroomValue;
  bringFieldChairs: YesNoValue;
};

export type TournamentDuplicateMatch = {
  id: string;
  slug: string | null;
  name: string;
  sport: string | null;
  city: string | null;
  state: string | null;
  startDate: string | null;
  endDate: string | null;
  officialWebsiteUrl: string | null;
  teamFee: string | null;
  ageGroup: string | null;
  tournamentDirector: string | null;
  tournamentDirectorEmail: string | null;
  refereeContact: string | null;
  refereeEmail: string | null;
  refereePay: string | null;
  refCashTournament: boolean | null;
  refMentors: "yes" | "no" | null;
  travelLodging: "hotel" | "stipend" | null;
  sponsors: Array<{
    id: string | null;
    name: string;
    address: string;
    websiteUrl: string | null;
    category: string | null;
    categoryOption: TournamentSponsorCategoryValue;
    otherCategory: string;
  }>;
  venues: TournamentDuplicateVenue[];
};

export function createEmptySponsor(): SponsorInput {
  return {
    id: undefined,
    name: "",
    address: "",
    websiteUrl: "",
    category: "",
    otherCategory: "",
  };
}

export function createEmptyVenue(): VenueInput {
  return {
    id: undefined,
    name: "",
    address1: "",
    city: "",
    state: "",
    zip: "",
    venueUrl: "",
    restrooms: "",
    bringFieldChairs: "",
  };
}

export function createInitialTournamentDetails(): TournamentDetailsInput {
  return {
    name: "",
    sport: "",
    startDate: "",
    endDate: "",
    officialWebsiteUrl: "",
    teamFee: "",
    ageGroup: "",
    tournamentDirector: "",
    tournamentDirectorEmail: "",
    refereeContact: "",
    refereeEmail: "",
    refereePay: "",
    refCashTournament: "",
    refMentors: "",
    travelLodging: "",
  };
}

export function createInitialSubmission(): TournamentSubmissionInput {
  return {
    verifyTargetTournamentId: null,
    tournament: createInitialTournamentDetails(),
    sponsors: [],
    venues: [createEmptyVenue()],
  };
}

export function createEmptyErrors(venueCount: number): SubmissionErrors {
  return {
    tournament: {},
    sponsors: [],
    venues: Array.from({ length: venueCount }, () => ({})),
  };
}

export function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).toString();
  } catch {
    try {
      return new URL(`https://${trimmed}`).toString();
    } catch {
      return "";
    }
  }
}

export function buildTournamentSlug(input: { name: string; city?: string | null; state?: string | null }) {
  const raw = [input.name, input.city, input.state]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return raw || `submission-${Date.now()}`;
}

function normalizeYesNo(value: string): YesNoValue {
  const normalized = value.trim().toLowerCase();
  return normalized === "yes" || normalized === "no" ? normalized : "";
}

function normalizeRestrooms(value: string): RestroomValue {
  const normalized = value.trim().toLowerCase();
  if (normalized === "portable") return "Portable";
  if (normalized === "building") return "Building";
  if (normalized === "both") return "Both";
  return "";
}

function normalizeSport(value: string): TiSport | null {
  const normalized = value.trim().toLowerCase();
  return TI_TOURNAMENT_SPORTS.includes(normalized as TiSport) ? (normalized as TiSport) : null;
}

function normalizeSponsorCategorySlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function getSponsorCategoryFormState(value: string | null | undefined): {
  categoryOption: TournamentSponsorCategoryValue;
  otherCategory: string;
} {
  const normalized = normalizeSponsorCategorySlug(value ?? "");
  if (!normalized) return { categoryOption: "", otherCategory: "" };
  if (
    normalized === "food" ||
    normalized === "coffee" ||
    normalized === "hotel" ||
    normalized === "apparel"
  ) {
    return { categoryOption: normalized, otherCategory: "" };
  }
  return { categoryOption: "other", otherCategory: normalized };
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isState(value: string) {
  return /^[A-Z]{2}$/.test(value);
}

function isZip(value: string) {
  return /^\d{5}$/.test(value);
}

export function validateTournamentSubmission(
  input: TournamentSubmissionInput
):
  | { ok: true; value: SanitizedTournamentSubmission }
  | { ok: false; errors: SubmissionErrors } {
  const errors = createEmptyErrors(Math.max(input.venues.length, 1));
  const tournament = input.tournament;
  const sponsorInputs = (input.sponsors ?? []).slice(0, MAX_TOURNAMENT_SPONSORS);
  const sanitizedSport = normalizeSport(tournament.sport);
  const officialWebsiteUrl = normalizeUrl(tournament.officialWebsiteUrl);
  const directorEmail = tournament.tournamentDirectorEmail.trim().toLowerCase();
  const refereeEmail = tournament.refereeEmail.trim().toLowerCase();
  const refCashTournament = normalizeYesNo(tournament.refCashTournament);
  const refMentors = normalizeYesNo(tournament.refMentors);
  const travelLodging = tournament.travelLodging.trim().toLowerCase();

  if (!tournament.name.trim()) errors.tournament.name = "Tournament name is required.";
  if (!sanitizedSport) errors.tournament.sport = "Choose a sport.";
  if (!tournament.startDate.trim()) errors.tournament.startDate = "Start date is required.";
  if (!tournament.endDate.trim()) errors.tournament.endDate = "End date is required.";
  if (tournament.startDate && tournament.endDate && tournament.endDate < tournament.startDate) {
    errors.tournament.endDate = "End date must be on or after the start date.";
  }
  if (!tournament.officialWebsiteUrl.trim()) {
    errors.tournament.officialWebsiteUrl = "Official website URL is required.";
  } else if (!officialWebsiteUrl) {
    errors.tournament.officialWebsiteUrl = "Enter a valid URL.";
  }
  if (!tournament.tournamentDirector.trim()) {
    errors.tournament.tournamentDirector = "Tournament director contact is required.";
  }
  if (!directorEmail) {
    errors.tournament.tournamentDirectorEmail = "Tournament director email is required.";
  } else if (!isEmail(directorEmail)) {
    errors.tournament.tournamentDirectorEmail = "Enter a valid email address.";
  }
  if (refereeEmail && !isEmail(refereeEmail)) {
    errors.tournament.refereeEmail = "Enter a valid email address.";
  }
  if (!refCashTournament) {
    errors.tournament.refCashTournament = "Choose Yes or No.";
  }
  if (travelLodging && !LODGING_OPTIONS.includes(travelLodging as (typeof LODGING_OPTIONS)[number])) {
    errors.tournament.travelLodging = "Choose Hotel or Stipend.";
  }
  if (input.venues.length === 0) {
    errors.form = "Add at least one venue.";
  }

  const sanitizedSponsors: SanitizedSponsor[] = sponsorInputs.flatMap((sponsor, index) => {
    const fieldErrors: SponsorFieldErrors = {};
    const normalizedWebsiteUrl = normalizeUrl(sponsor.websiteUrl);
    const hasAnyValue = Boolean(
      sponsor.name.trim() ||
        sponsor.address.trim() ||
        sponsor.websiteUrl.trim() ||
        sponsor.category.trim() ||
        sponsor.otherCategory.trim()
    );
    if (!hasAnyValue) {
      errors.sponsors[index] = fieldErrors;
      return [];
    }

    if (!sponsor.name.trim()) fieldErrors.name = "Sponsor name is required.";
    if (!sponsor.address.trim()) fieldErrors.address = "Address is required.";
    if (!sponsor.websiteUrl.trim()) {
      fieldErrors.websiteUrl = "Website URL is required.";
    } else if (!normalizedWebsiteUrl) {
      fieldErrors.websiteUrl = "Enter a valid URL.";
    }
    if (!sponsor.category) {
      fieldErrors.category = "Choose a category.";
    }

    let normalizedCategory = "";
    if (sponsor.category === "other") {
      normalizedCategory = normalizeSponsorCategorySlug(sponsor.otherCategory);
      if (!sponsor.otherCategory.trim()) {
        fieldErrors.otherCategory = "Enter the sponsor type.";
      } else if (!normalizedCategory) {
        fieldErrors.otherCategory = "Enter a valid sponsor type.";
      }
    } else {
      normalizedCategory = sponsor.category;
    }

    errors.sponsors[index] = fieldErrors;

    if (Object.keys(fieldErrors).length > 0 || !normalizedWebsiteUrl || !normalizedCategory) {
      return [];
    }

    return [
      {
        id: sponsor.id,
        name: sponsor.name.trim(),
        address: sponsor.address.trim(),
        websiteUrl: normalizedWebsiteUrl,
        category: normalizedCategory,
      },
    ];
  });

  const sanitizedVenues: SanitizedVenue[] = input.venues.map((venue, index) => {
    const fieldErrors = errors.venues[index] ?? {};
    const venueUrl = normalizeUrl(venue.venueUrl);
    const restrooms = normalizeRestrooms(venue.restrooms);
    const bringFieldChairs = normalizeYesNo(venue.bringFieldChairs);
    const state = venue.state.trim().toUpperCase();
    const zip = venue.zip.trim();

    if (!venue.name.trim()) fieldErrors.name = "Venue name is required.";
    if (!venue.address1.trim()) fieldErrors.address1 = "Street address is required.";
    if (!venue.city.trim()) fieldErrors.city = "City is required.";
    if (!state) {
      fieldErrors.state = "State is required.";
    } else if (!isState(state)) {
      fieldErrors.state = "Use a 2-letter state code.";
    }
    if (!zip) {
      fieldErrors.zip = "ZIP code is required.";
    } else if (!isZip(zip)) {
      fieldErrors.zip = "Enter a 5-digit ZIP code.";
    }
    if (venue.venueUrl.trim() && !venueUrl) {
      fieldErrors.venueUrl = "Enter a valid URL.";
    }
    if (!restrooms) fieldErrors.restrooms = "Choose a restroom type.";
    if (!bringFieldChairs) fieldErrors.bringFieldChairs = "Choose Yes or No.";

    errors.venues[index] = fieldErrors;

    return {
      name: venue.name.trim(),
      address1: venue.address1.trim(),
      city: venue.city.trim(),
      state,
      zip,
      venueUrl: venueUrl || null,
      restrooms: (restrooms || "Portable") as SanitizedVenue["restrooms"],
      bringFieldChairs: bringFieldChairs === "yes",
    };
  });

  const hasErrors =
    Boolean(errors.form) ||
    Object.keys(errors.tournament).length > 0 ||
    errors.sponsors.some((entry) => Object.keys(entry).length > 0) ||
    errors.venues.some((entry) => Object.keys(entry).length > 0);

  if (hasErrors || !sanitizedSport || !officialWebsiteUrl || !directorEmail || !refCashTournament) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      tournament: {
        name: tournament.name.trim(),
        sport: sanitizedSport,
        startDate: tournament.startDate.trim(),
        endDate: tournament.endDate.trim(),
        officialWebsiteUrl,
        teamFee: tournament.teamFee.trim() || null,
        ageGroup: tournament.ageGroup.trim() || null,
        tournamentDirector: tournament.tournamentDirector.trim(),
        tournamentDirectorEmail: directorEmail,
        refereeContact: tournament.refereeContact.trim() || null,
        refereeEmail: refereeEmail || null,
        refereePay: tournament.refereePay.trim() || null,
        refCashTournament: refCashTournament === "yes",
        refMentors: refMentors || null,
        travelLodging: (travelLodging as "hotel" | "stipend" | "") || null,
      },
      sponsors: sanitizedSponsors,
      venues: sanitizedVenues,
    },
  };
}

export function sportLabel(value: string) {
  const key = value.trim().toLowerCase() as TiSport;
  return TI_SPORT_LABELS[key] ?? value;
}

export function applyDuplicateMatchToForm(
  current: TournamentSubmissionInput,
  match: TournamentDuplicateMatch
): TournamentSubmissionInput {
  const matchedVenues = match.venues.length > 0 ? match.venues : [];
  const matchedSponsors = match.sponsors.length > 0 ? match.sponsors : [];
  const venueCount = Math.max(current.venues.length, matchedVenues.length || 1);

  return {
    verifyTargetTournamentId: current.verifyTargetTournamentId || match.id,
    tournament: {
      ...current.tournament,
      sport: current.tournament.sport || match.sport || "",
      startDate: current.tournament.startDate || match.startDate || "",
      endDate: current.tournament.endDate || match.endDate || "",
      officialWebsiteUrl:
        current.tournament.officialWebsiteUrl || match.officialWebsiteUrl || "",
      teamFee: current.tournament.teamFee || match.teamFee || "",
      ageGroup: current.tournament.ageGroup || match.ageGroup || "",
      tournamentDirector:
        current.tournament.tournamentDirector || match.tournamentDirector || "",
      tournamentDirectorEmail:
        current.tournament.tournamentDirectorEmail || match.tournamentDirectorEmail || "",
      refereeContact: current.tournament.refereeContact || match.refereeContact || "",
      refereeEmail: current.tournament.refereeEmail || match.refereeEmail || "",
      refereePay: current.tournament.refereePay || match.refereePay || "",
      refCashTournament:
        current.tournament.refCashTournament ||
        (match.refCashTournament === true ? "yes" : match.refCashTournament === false ? "no" : ""),
      refMentors: current.tournament.refMentors || match.refMentors || "",
      travelLodging: current.tournament.travelLodging || match.travelLodging || "",
    },
    sponsors:
      matchedSponsors.length > 0
        ? matchedSponsors.slice(0, MAX_TOURNAMENT_SPONSORS).map((sponsor, index) => {
            const currentSponsor = current.sponsors?.[index] ?? createEmptySponsor();
            return {
              ...currentSponsor,
              id: currentSponsor.id || sponsor.id || undefined,
              name: currentSponsor.name || sponsor.name || "",
              address: currentSponsor.address || sponsor.address || "",
              websiteUrl: currentSponsor.websiteUrl || sponsor.websiteUrl || "",
              category: currentSponsor.category || sponsor.categoryOption || "",
              otherCategory: currentSponsor.otherCategory || sponsor.otherCategory || "",
            };
          })
        : (current.sponsors ?? []).slice(0, MAX_TOURNAMENT_SPONSORS),
    venues: Array.from({ length: venueCount }, (_, index) => {
      const venue = current.venues[index] ?? createEmptyVenue();
      const matchedVenue = matchedVenues[index] ?? null;
      if (!matchedVenue) return venue;
      return {
        ...venue,
        id: venue.id || matchedVenue.id || undefined,
        name: venue.name || matchedVenue.name || "",
        address1: venue.address1 || matchedVenue.address1 || "",
        city: venue.city || matchedVenue.city || "",
        state: venue.state || matchedVenue.state || "",
        zip: venue.zip || matchedVenue.zip || "",
        venueUrl: venue.venueUrl || matchedVenue.venueUrl || "",
        restrooms: venue.restrooms || matchedVenue.restrooms || "",
        bringFieldChairs: venue.bringFieldChairs || matchedVenue.bringFieldChairs || "",
      };
    }),
  };
}
