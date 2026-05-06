import crypto from "node:crypto";

import { normalizeStateAbbr } from "@/lib/usStates";
import { TI_SPORTS } from "@/lib/tiSports";

export type DiscoverySearchType = "metro" | "venue" | "organizer" | "long_tail";
export type DedupeStatus = "unreviewed" | "exact" | "likely" | "possible" | "none";
export type ImportStatus = "queued" | "rejected" | "imported";
export type ConfidenceLabel = "high" | "medium" | "low";

export const TI_SPORT_SET = new Set<string>(TI_SPORTS as unknown as string[]);

export function todayUtcDateIso() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeSearchKeyPart(value: unknown) {
  const raw = typeof value === "string" ? value : value == null ? "" : String(value);
  return normalizeWhitespace(raw).toLowerCase();
}

export function computeSearchKey(input: {
  sport: string;
  state: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  searchType: DiscoverySearchType;
  metro?: string | null;
  venueId?: string | null;
  organizer?: string | null;
}) {
  const parts = [
    input.sport,
    input.state,
    input.dateRangeStart,
    input.dateRangeEnd,
    input.searchType,
    input.metro ?? "",
    input.venueId ?? "",
    input.organizer ?? "",
  ].map(normalizeSearchKeyPart);
  return parts.join("|");
}

export function hashPrompt(prompt: string) {
  const normalized = prompt.trim();
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export function normalizeSport(raw: string) {
  const normalized = normalizeWhitespace(raw).toLowerCase().replace(/[^\w\s-]/g, "");
  const compact = normalized.replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    vb: "volleyball",
    "ice hockey": "hockey",
    bball: "basketball",
    "soft ball": "softball",
  };
  const mapped = aliases[compact] ?? compact;
  return TI_SPORT_SET.has(mapped) ? mapped : null;
}

export function normalizeStateUsps(raw: string) {
  const normalized = normalizeStateAbbr(raw);
  return normalized ? normalized.toUpperCase() : null;
}

export function isHttpUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return false;
  return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

export function tryNormalizeHttpUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

export function hostFromUrl(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function normalizeNameForDedupe(name: string) {
  const lowered = normalizeWhitespace(name).toLowerCase();
  // Remove punctuation but keep meaningful words; no suffix stripping.
  return lowered.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim();
}

export function tokenizeNormalizedName(normalizedName: string) {
  return normalizedName.split(/\s+/g).filter(Boolean);
}

export function dateDiffDays(aIso: string, bIso: string) {
  const a = new Date(`${aIso}T00:00:00Z`).getTime();
  const b = new Date(`${bIso}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round(Math.abs(a - b) / (24 * 60 * 60 * 1000));
}

export function classifyCandidateConfidence(params: {
  officialWebsiteUrl: string | null;
  sourceUrl: string;
  venueRaw: string | null;
  organizer: string | null;
}) : ConfidenceLabel {
  const officialOk = Boolean(params.officialWebsiteUrl && isHttpUrl(params.officialWebsiteUrl));
  const hasContext = Boolean((params.venueRaw ?? "").trim() || (params.organizer ?? "").trim());
  if (officialOk && hasContext) return "high";
  return "medium";
}

export type DiscoveryPromptInput = {
  sport: string;
  state: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  metro?: string | null;
  venueName?: string | null;
  venueCity?: string | null;
  venueState?: string | null;
  organizer?: string | null;
};

export function buildDiscoveryPrompt(input: DiscoveryPromptInput) {
  const todayUtc = todayUtcDateIso();
  const sport = input.sport;
  const state = input.state;
  const start = input.dateRangeStart;
  const end = input.dateRangeEnd;
  const metro = (input.metro ?? "").trim();
  const organizer = (input.organizer ?? "").trim();
  const venueName = (input.venueName ?? "").trim();
  const venueCity = (input.venueCity ?? "").trim();
  const venueState = (input.venueState ?? "").trim();

  const globalRules = [
    "Return ONLY a JSON array (no markdown, no explanation).",
    "Max 25 results.",
    `Only future tournaments (start_date >= ${todayUtc}).`,
    "No leagues / recurring weekly play.",
    "No duplicates.",
    "Every result must include a valid source_url (http/https).",
    "source_url must clearly support the stated tournament dates.",
    "",
    "STRICT JSON schema for each item:",
    '{ "name": string, "sport": string, "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "city": string, "state": string, "venue": string|null, "organizer": string|null, "official_website_url": string|null, "source_url": string }',
  ].join("\n");

  let body: string;
  if (venueName) {
    const loc = [venueCity, venueState || state].filter(Boolean).join(", ");
    body = [
      `Find future youth ${sport} tournaments at or primarily using:`,
      `"${venueName}" in ${loc}`,
      `Date range: ${start} to ${end}`,
      "",
      "Rules:",
      "- Prioritize official event calendars or organizer/platform pages",
      "- Only include real tournaments (not leagues)",
      "- Ensure source_url clearly supports dates",
      "- Return JSON array only",
    ].join("\n");
  } else if (organizer) {
    body = [
      `Find ${organizer} youth ${sport} tournaments in ${state}.`,
      `Date range: ${start} to ${end}`,
      "Return JSON only.",
    ].join("\n");
  } else if (metro) {
    body = [
      `Find future youth ${sport} tournaments in/near ${metro}, ${state}.`,
      `Date range: ${start} to ${end}`,
      "",
      "Rules:",
      "- Within ~60 miles",
      "- Prefer verified events with explicit dates",
      "- Return JSON only",
    ].join("\n");
  } else {
    body = [
      `Find smaller/local youth ${sport} tournaments in ${state}.`,
      `Date range: ${start} to ${end}`,
      "Return JSON only.",
    ].join("\n");
  }

  return `${body}\n\n${globalRules}`;
}

export function slugifyTournamentName(value: string) {
  return value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}
