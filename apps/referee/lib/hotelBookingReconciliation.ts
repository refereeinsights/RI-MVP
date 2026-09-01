export type HotelBookingAttributionRow = {
  status: string | null;
  source: string | null;
  custom3: string | null;
};

export type HotelBookingSummaryRow = HotelBookingAttributionRow & {
  total_usd: number | null;
  expected_commission_usd: number | null;
  paid_commission_usd: number | null;
  custom2: string | null;
};

export type HotelBookingReconciliation = {
  status: "available" | "unavailable";
  matchedCount: number | null;
  orphanedValidTokenCount: number | null;
  missingTokenCount: number | null;
  invalidTokenCount: number | null;
};

const ATTRIBUTION_TOKEN_RE = /^attr:([a-f0-9]{32})$/i;

export type HotelBookingStatusClass = "confirmed" | "cancelled" | "other" | "unknown";

export function normalizeHotelPlannerSource(source: string | null) {
  return (source ?? "").trim().toLowerCase();
}

export function isTournamentInsightsSource(source: string | null) {
  return normalizeHotelPlannerSource(source) === "tournamentinsights";
}

export function classifyHotelPlannerStatus(status: string | null): HotelBookingStatusClass {
  const normalized = (status ?? "").trim().toLowerCase();
  if (!normalized) return "unknown";
  if (normalized === "confirmed") return "confirmed";
  if (normalized === "cancelled") return "cancelled";
  return "other";
}

function isConfirmedTiBooking(row: HotelBookingAttributionRow) {
  return isTournamentInsightsSource(row.source) && classifyHotelPlannerStatus(row.status) === "confirmed";
}

export function parseHotelPlannerAttributionId(custom3: string | null): string | null {
  if (!custom3) return null;
  const match = custom3.match(ATTRIBUTION_TOKEN_RE);
  return match ? match[1].toLowerCase() : null;
}

export function collectConfirmedBookingAttributionIds(rows: HotelBookingAttributionRow[]) {
  return Array.from(
    new Set(
      rows
        .filter(isConfirmedTiBooking)
        .map((row) => parseHotelPlannerAttributionId(row.custom3))
        .filter((value): value is string => Boolean(value))
    )
  );
}

export function reconcileConfirmedBookingAttribution(
  rows: HotelBookingAttributionRow[],
  matchedOutboundAttributionIds: ReadonlySet<string> | null
): HotelBookingReconciliation {
  let matchedCount = 0;
  let orphanedValidTokenCount = 0;
  let missingTokenCount = 0;
  let invalidTokenCount = 0;

  for (const row of rows) {
    if (!isConfirmedTiBooking(row)) continue;

    if (!row.custom3) {
      missingTokenCount += 1;
      continue;
    }

    const attributionId = parseHotelPlannerAttributionId(row.custom3);
    if (!attributionId) {
      invalidTokenCount += 1;
      continue;
    }

    if (!matchedOutboundAttributionIds) continue;
    if (matchedOutboundAttributionIds.has(attributionId)) matchedCount += 1;
    else orphanedValidTokenCount += 1;
  }

  if (!matchedOutboundAttributionIds) {
    return {
      status: "unavailable",
      matchedCount: null,
      orphanedValidTokenCount: null,
      missingTokenCount: null,
      invalidTokenCount: null,
    };
  }

  return {
    status: "available",
    matchedCount,
    orphanedValidTokenCount,
    missingTokenCount,
    invalidTokenCount,
  };
}

export function summarizeHotelBookingRows(rows: HotelBookingSummaryRow[]) {
  let confirmedCount = 0;
  let cancelledCount = 0;
  let otherCount = 0;
  let unknownCount = 0;
  let confirmedBookingValueUsd = 0;
  let confirmedExpectedCommissionUsd = 0;
  let providerReportedPaidCommissionUsd = 0;
  let otherSourceCount = 0;
  const slugCounts = new Map<string, number>();

  for (const row of rows) {
    if (!isTournamentInsightsSource(row.source)) {
      otherSourceCount += 1;
      continue;
    }
    const status = classifyHotelPlannerStatus(row.status);
    if (status === "confirmed") {
      confirmedCount += 1;
      confirmedBookingValueUsd += Number(row.total_usd ?? 0);
      confirmedExpectedCommissionUsd += Number(row.expected_commission_usd ?? 0);
    } else if (status === "cancelled") cancelledCount += 1;
    else if (status === "other") otherCount += 1;
    else unknownCount += 1;
    providerReportedPaidCommissionUsd += Number(row.paid_commission_usd ?? 0);

    if (status === "confirmed") {
      const slug = (row.custom2 ?? "").trim();
      if (slug) slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
    }
  }

  return {
    confirmedCount,
    cancelledCount,
    otherCount,
    unknownCount,
    confirmedBookingValueUsd,
    confirmedExpectedCommissionUsd,
    providerReportedPaidCommissionUsd,
    otherSourceCount,
    topTournamentSlugs: Array.from(slugCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([slug, count]) => ({ slug, count })),
  };
}

export function calculateMatchedBookingConversion(args: {
  reconciliationStatus: HotelBookingReconciliation["status"];
  matchedCount: number | null;
  handoffCount: number;
}) {
  if (args.reconciliationStatus !== "available" || args.handoffCount <= 0) return null;
  return Math.round(((args.matchedCount ?? 0) / args.handoffCount) * 100);
}

export function calculateAttributionCoverage(args: {
  reconciliationStatus: HotelBookingReconciliation["status"];
  matchedCount: number | null;
  confirmedTiSourceCount: number;
}) {
  if (args.reconciliationStatus !== "available" || args.confirmedTiSourceCount <= 0) return null;
  return Math.round(((args.matchedCount ?? 0) / args.confirmedTiSourceCount) * 100);
}
