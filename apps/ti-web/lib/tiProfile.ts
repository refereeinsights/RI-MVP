import { TI_SPORTS, type TiSport } from "@/lib/tiSports";

export const SPORT_INTEREST_OPTIONS = TI_SPORTS;

export type SportInterest = TiSport;

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
export const ZIP_PATTERN = /^\d{5}(?:-\d{4})?$/;

const SPORT_INTEREST_LOOKUP = new Map<string, SportInterest>(
  SPORT_INTEREST_OPTIONS.map((value) => [value.toLowerCase(), value])
);

export type NormalizedSignupProfile = {
  displayName: string | null;
  username: string;
  zipCode: string;
  sportsInterests: SportInterest[];
};

export function normalizeDisplayName(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized || null;
}

export function normalizeUsername(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

export function normalizeZipCode(value: string | null | undefined) {
  return (value ?? "").trim();
}

export function normalizeSportsInterests(values: Iterable<string>) {
  const result: SportInterest[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = SPORT_INTEREST_LOOKUP.get((value ?? "").trim().toLowerCase());
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function validateSignupProfile(input: {
  name: string;
  username: string;
  zip: string;
  sportsInterests: string[];
}) {
  const displayName = normalizeDisplayName(input.name);
  const username = normalizeUsername(input.username);
  const zipCode = normalizeZipCode(input.zip);
  const sportsInterests = normalizeSportsInterests(input.sportsInterests);

  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false as const,
      field: "username" as const,
      message: "Username must be 3-20 characters using letters, numbers, or underscores.",
    };
  }

  if (!zipCode) {
    return {
      ok: false as const,
      field: "zip" as const,
      message: "ZIP code is required.",
    };
  }

  if (!ZIP_PATTERN.test(zipCode)) {
    return {
      ok: false as const,
      field: "zip" as const,
      message: "Enter a valid ZIP code (e.g., 99216).",
    };
  }

  if (sportsInterests.length === 0) {
    return {
      ok: false as const,
      field: "sportsInterests" as const,
      message: "Pick at least one sport interest.",
    };
  }

  return {
    ok: true as const,
    value: {
      displayName,
      username,
      zipCode,
      sportsInterests,
    } satisfies NormalizedSignupProfile,
  };
}

export function extractProfileFromMetadata(metadata: Record<string, unknown>) {
  const displayName = normalizeDisplayName(
    typeof metadata.display_name === "string" ? metadata.display_name : null
  );
  const username = normalizeUsername(
    typeof metadata.username === "string"
      ? metadata.username
      : typeof metadata.handle === "string"
        ? metadata.handle
        : null
  );
  const zipCode = normalizeZipCode(
    typeof metadata.zip_code === "string" ? metadata.zip_code : null
  );
  const sportsRaw = Array.isArray(metadata.sports_interests)
    ? metadata.sports_interests.filter((value): value is string => typeof value === "string")
    : [];

  return {
    displayName,
    username: USERNAME_PATTERN.test(username) ? username : null,
    zipCode: ZIP_PATTERN.test(zipCode) ? zipCode : null,
    sportsInterests: normalizeSportsInterests(sportsRaw),
  };
}
