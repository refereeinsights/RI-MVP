export type HotelBookingAttributionRow = {
  status: string | null;
  custom3: string | null;
};

export type HotelBookingSummaryRow = HotelBookingAttributionRow & {
  total_usd: number | null;
  expected_commission_usd: number | null;
  custom2: string | null;
};

export type HotelBookingReconciliation = {
  status: "available" | "unavailable";
  matchedCount: number | null;
  orphanedValidTokenCount: number | null;
  missingTokenCount: number;
  invalidTokenCount: number;
};

const ATTRIBUTION_TOKEN_RE = /^attr:([a-f0-9]{32})$/i;

export function parseHotelPlannerAttributionId(custom3: string | null): string | null {
  if (!custom3) return null;
  const match = custom3.match(ATTRIBUTION_TOKEN_RE);
  return match ? match[1].toLowerCase() : null;
}

export function collectConfirmedBookingAttributionIds(rows: HotelBookingAttributionRow[]) {
  return Array.from(
    new Set(
      rows
        .filter((row) => (row.status ?? "").toLowerCase() === "confirmed")
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
    if ((row.status ?? "").toLowerCase() !== "confirmed") continue;

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
      missingTokenCount,
      invalidTokenCount,
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
  let pendingCount = 0;
  let totalBookingValueUsd = 0;
  let expectedCommissionUsd = 0;
  const slugCounts = new Map<string, number>();

  for (const row of rows) {
    const status = (row.status ?? "").toLowerCase();
    if (status === "confirmed") confirmedCount += 1;
    else if (status.includes("cancel")) cancelledCount += 1;
    else pendingCount += 1;

    totalBookingValueUsd += Number(row.total_usd ?? 0);
    expectedCommissionUsd += Number(row.expected_commission_usd ?? 0);

    const slug = (row.custom2 ?? "").trim();
    if (slug) slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
  }

  return {
    confirmedCount,
    cancelledCount,
    pendingCount,
    totalBookingValueUsd,
    expectedCommissionUsd,
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
