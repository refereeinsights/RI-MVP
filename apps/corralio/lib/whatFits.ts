import type {
  CorralioCandidateOperatingStatus,
  OvertureFoodTag,
  OvertureIntentCategory,
  OverturePoolCategory,
} from "./overtureNearby";
import {
  CORRALIO_DEFAULT_ARRIVAL_MINUTES,
  resolveRequiredArrival,
  type RequiredArrivalSource,
} from "./requiredArrival";

export const WHAT_FITS_POLICY_VERSION = "corralio-what-fits-v1";
export const WHAT_FITS_MINIMUM_GAP_MINUTES = 45;
export const WHAT_FITS_DEFAULT_ARRIVAL_MINUTES = CORRALIO_DEFAULT_ARRIVAL_MINUTES;
export const WHAT_FITS_MAX_RESULTS = 10;
export const WHAT_FITS_ROUTED_CANDIDATES_PER_MODE = 6;
export const WHAT_FITS_ROUTE_CONCURRENCY = 3;
export const WHAT_FITS_MAX_ROUTE_CALLS_PER_GAP = WHAT_FITS_ROUTED_CANDIDATES_PER_MODE * 2;

export const WHAT_FITS_DWELL_MINUTES = Object.freeze({
  coffee: 15,
  quick_service: 25,
  sandwiches: 25,
  pizza: 30,
  brewery: 45,
  other_food: 45,
} satisfies Record<OvertureIntentCategory, number>);

export type WhatFitsArrivalSource = RequiredArrivalSource;
export type WhatFitsMode = OverturePoolCategory;
export type WhatFitsSuppressionReason =
  | "below_minimum_gap"
  | "household_conflict"
  | "missing_end"
  | "missing_venue"
  | "no_candidate_pool"
  | "routing_unavailable"
  | "quota_exhausted";

export type WhatFitsEvent = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string | null;
  teamId: string | null;
  scheduleArrivalAt: string | null;
  sourceArrivalMinutes: number | null;
  teamArrivalMinutes: number | null;
  latitude: number | null;
  longitude: number | null;
};

export type WhatFitsGap = {
  currentEvent: WhatFitsEvent;
  nextEvent: WhatFitsEvent;
  gapStartsAt: string;
  requiredArrivalAt: string;
  rawGapMinutes: number;
  arrivalSource: WhatFitsArrivalSource;
  arrivalMinutes: number;
};

export type WhatFitsCandidateInput = {
  id: string;
  mode: WhatFitsMode;
  intentCategory: OvertureIntentCategory;
  operatingStatus: CorralioCandidateOperatingStatus;
  active: boolean;
  qualityRuleVersion: string;
  dedupeRuleVersion: string;
  distanceMeters: number;
  existenceConfidence: number;
  name: string;
  latitude: number;
  longitude: number;
  foodTags: readonly OvertureFoodTag[];
};

export type WhatFitsCandidateRoutes = {
  outboundMinutes: number;
  outboundDistanceMeters: number;
  inboundMinutes: number;
  inboundDistanceMeters: number;
};

export type WhatFitsRecommendation = WhatFitsCandidateInput & WhatFitsCandidateRoutes & {
  dwellMinutes: number;
  fitMarginMinutes: number;
  leaveCandidateAt: string;
  totalDriveMinutes: number;
};

export type WhatFitsGapResult =
  | { kind: "eligible"; gap: WhatFitsGap }
  | { kind: "suppressed"; reason: WhatFitsSuppressionReason };

const QUALITY_RULE = "corralio-overture-candidate-quality-v2";
const DEDUPE_RULE = "corralio-overture-dedupe-v2";

function validTime(value: string | null) {
  const milliseconds = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function localDateKey(iso: string, timezone: string | null) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  if (!timezone) return date.toISOString().slice(0, 10);
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return null;
  }
}

export function resolveWhatFitsRequiredArrival(event: WhatFitsEvent): {
  requiredArrivalAt: string;
  source: WhatFitsArrivalSource;
  minutes: number;
} | null {
  return resolveRequiredArrival(event);
}

function hasHouseholdConflict(
  events: readonly WhatFitsEvent[],
  currentEventId: string,
  nextEventId: string,
  intervalStart: number,
  intervalEnd: number,
) {
  return events.some((event) => {
    if (event.id === currentEventId || event.id === nextEventId) return false;
    const startsAt = validTime(event.startsAt);
    const endsAt = validTime(event.endsAt);
    if (startsAt === null || endsAt === null || endsAt <= startsAt) return true;
    return startsAt < intervalEnd && endsAt > intervalStart;
  });
}

export function selectWhatFitsGap(
  events: readonly WhatFitsEvent[],
  candidateLimitReached = false,
): WhatFitsGapResult {
  if (candidateLimitReached) return { kind: "suppressed", reason: "household_conflict" };
  const sorted = events
    .filter((event) => validTime(event.startsAt) !== null)
    .toSorted((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt) || left.id.localeCompare(right.id));
  let sawMissingEnd = false;
  let sawShortGap = false;
  let sawConflict = false;

  for (let index = 0; index + 1 < sorted.length; index += 1) {
    const currentEvent = sorted[index];
    const nextEvent = sorted[index + 1];
    if (!currentEvent || !nextEvent) continue;
    const gapStartsAt = validTime(currentEvent.endsAt);
    if (gapStartsAt === null || gapStartsAt <= Date.parse(currentEvent.startsAt)) {
      sawMissingEnd = true;
      continue;
    }
    if (localDateKey(currentEvent.endsAt as string, currentEvent.timezone) !== localDateKey(nextEvent.startsAt, nextEvent.timezone)) {
      continue;
    }
    const arrival = resolveWhatFitsRequiredArrival(nextEvent);
    if (!arrival) continue;
    const deadline = Date.parse(arrival.requiredArrivalAt);
    const rawGapMinutes = Math.floor((deadline - gapStartsAt) / 60_000);
    if (rawGapMinutes < WHAT_FITS_MINIMUM_GAP_MINUTES) {
      sawShortGap = true;
      continue;
    }
    if (hasHouseholdConflict(events, currentEvent.id, nextEvent.id, gapStartsAt, deadline)) {
      sawConflict = true;
      continue;
    }
    if (
      currentEvent.latitude === null || currentEvent.longitude === null
      || nextEvent.latitude === null || nextEvent.longitude === null
    ) return { kind: "suppressed", reason: "missing_venue" };
    return {
      kind: "eligible",
      gap: {
        currentEvent,
        nextEvent,
        gapStartsAt: new Date(gapStartsAt).toISOString(),
        requiredArrivalAt: arrival.requiredArrivalAt,
        rawGapMinutes,
        arrivalSource: arrival.source,
        arrivalMinutes: arrival.minutes,
      },
    };
  }
  for (let leftIndex = 0; leftIndex + 2 < sorted.length; leftIndex += 1) {
    const currentEvent = sorted[leftIndex];
    if (!currentEvent?.endsAt) continue;
    const intervalStart = validTime(currentEvent.endsAt);
    if (intervalStart === null) continue;
    for (let rightIndex = leftIndex + 2; rightIndex < sorted.length; rightIndex += 1) {
      const nextEvent = sorted[rightIndex];
      if (!nextEvent || localDateKey(currentEvent.endsAt, currentEvent.timezone) !== localDateKey(nextEvent.startsAt, nextEvent.timezone)) continue;
      const arrival = resolveWhatFitsRequiredArrival(nextEvent);
      if (!arrival) continue;
      const intervalEnd = Date.parse(arrival.requiredArrivalAt);
      if ((intervalEnd - intervalStart) / 60_000 < WHAT_FITS_MINIMUM_GAP_MINUTES) continue;
      if (hasHouseholdConflict(events, currentEvent.id, nextEvent.id, intervalStart, intervalEnd)) {
        sawConflict = true;
        break;
      }
    }
    if (sawConflict) break;
  }
  if (sawConflict) return { kind: "suppressed", reason: "household_conflict" };
  if (sawShortGap) return { kind: "suppressed", reason: "below_minimum_gap" };
  if (sawMissingEnd) return { kind: "suppressed", reason: "missing_end" };
  return { kind: "suppressed", reason: "below_minimum_gap" };
}

function intentPrefilterOrder(intent: OvertureIntentCategory) {
  if (intent === "quick_service" || intent === "sandwiches" || intent === "coffee") return 0;
  if (intent === "pizza") return 1;
  if (intent === "other_food") return 2;
  return 3;
}

export function prefilterWhatFitsCandidates(
  candidates: readonly WhatFitsCandidateInput[],
  mode: WhatFitsMode,
  limit = WHAT_FITS_ROUTED_CANDIDATES_PER_MODE,
) {
  return candidates
    .filter((candidate) =>
      candidate.active
      && candidate.mode === mode
      && candidate.operatingStatus !== "confirmed_closed"
      && candidate.qualityRuleVersion === QUALITY_RULE
      && candidate.dedupeRuleVersion === DEDUPE_RULE
      && (mode === "coffee" ? candidate.intentCategory === "coffee" : candidate.intentCategory !== "coffee"))
    .toSorted((left, right) =>
      (left.operatingStatus === "confirmed_open" ? 0 : 1) - (right.operatingStatus === "confirmed_open" ? 0 : 1)
      || intentPrefilterOrder(left.intentCategory) - intentPrefilterOrder(right.intentCategory)
      || left.distanceMeters - right.distanceMeters
      || right.existenceConfidence - left.existenceConfidence
      || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, Math.min(limit, WHAT_FITS_MAX_RESULTS)));
}

function breweryTieBreak(intent: OvertureIntentCategory) {
  return intent === "brewery" ? 1 : 0;
}

export function qualifyAndRankWhatFitsCandidates(
  gap: WhatFitsGap,
  candidates: readonly WhatFitsCandidateInput[],
  routes: ReadonlyMap<string, WhatFitsCandidateRoutes>,
) {
  const gapStart = Date.parse(gap.gapStartsAt);
  const deadline = Date.parse(gap.requiredArrivalAt);
  return candidates.flatMap((candidate): WhatFitsRecommendation[] => {
    const route = routes.get(candidate.id);
    if (!route) return [];
    const dwellMinutes = WHAT_FITS_DWELL_MINUTES[candidate.intentCategory];
    const totalDriveMinutes = route.outboundMinutes + route.inboundMinutes;
    const finishAt = gapStart + (totalDriveMinutes + dwellMinutes) * 60_000;
    const fitMarginMinutes = Math.floor((deadline - finishAt) / 60_000);
    if (fitMarginMinutes < 0) return [];
    return [{
      ...candidate,
      ...route,
      dwellMinutes,
      fitMarginMinutes,
      totalDriveMinutes,
      leaveCandidateAt: new Date(deadline - route.inboundMinutes * 60_000).toISOString(),
    }];
  }).toSorted((left, right) =>
    (left.operatingStatus === "confirmed_open" ? 0 : 1) - (right.operatingStatus === "confirmed_open" ? 0 : 1)
    || right.fitMarginMinutes - left.fitMarginMinutes
    || left.totalDriveMinutes - right.totalDriveMinutes
    || left.dwellMinutes - right.dwellMinutes
    || breweryTieBreak(left.intentCategory) - breweryTieBreak(right.intentCategory)
    || left.distanceMeters - right.distanceMeters
    || right.existenceConfidence - left.existenceConfidence
    || left.id.localeCompare(right.id)).slice(0, WHAT_FITS_MAX_RESULTS);
}

export const WHAT_FITS_ANALYTICS_EVENTS = Object.freeze([
  "eligible_gap_identified",
  "what_fits_surfaced",
  "what_fits_viewed",
  "mode_selected",
  "candidate_shown",
  "candidate_selected",
  "directions_started",
  "see_more_opened",
  "no_fit",
  "what_fits_suppressed",
  "arrival_setting_changed",
] as const);

export type WhatFitsAnalyticsEvent = (typeof WHAT_FITS_ANALYTICS_EVENTS)[number];
export type WhatFitsAnalyticsPayload = {
  event: WhatFitsAnalyticsEvent;
  mode?: WhatFitsMode | null;
  reason?: WhatFitsSuppressionReason | "no_candidate_fit" | null;
  arrivalSource?: WhatFitsArrivalSource | null;
  resultCount?: number | null;
  candidatePosition?: number | null;
};

export function sanitizeWhatFitsAnalytics(input: unknown): WhatFitsAnalyticsPayload | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (!WHAT_FITS_ANALYTICS_EVENTS.includes(value.event as WhatFitsAnalyticsEvent)) return null;
  const mode = value.mode === "food" || value.mode === "coffee" ? value.mode : null;
  const reasons = [
    "below_minimum_gap", "household_conflict", "missing_end", "missing_venue",
    "no_candidate_pool", "routing_unavailable", "quota_exhausted", "no_candidate_fit",
  ] as const;
  const reason = reasons.includes(value.reason as (typeof reasons)[number])
    ? value.reason as (typeof reasons)[number]
    : null;
  // Slice 3.6B adds resolver provenance, not analytics vocabulary. Until a
  // separately authorized migration exists, source preference is intentionally
  // recorded as null rather than widening the closed Slice 4.6 schema.
  const sources: readonly WhatFitsArrivalSource[] = ["ics_explicit", "team_preference", "corralio_default"];
  const arrivalSource = sources.includes(value.arrivalSource as WhatFitsArrivalSource)
    ? value.arrivalSource as WhatFitsArrivalSource
    : null;
  const resultCount = Number.isInteger(value.resultCount) && (value.resultCount as number) >= 0 && (value.resultCount as number) <= 10
    ? value.resultCount as number
    : null;
  const candidatePosition = Number.isInteger(value.candidatePosition) && (value.candidatePosition as number) >= 1 && (value.candidatePosition as number) <= 10
    ? value.candidatePosition as number
    : null;
  return { event: value.event as WhatFitsAnalyticsEvent, mode, reason, arrivalSource, resultCount, candidatePosition };
}
