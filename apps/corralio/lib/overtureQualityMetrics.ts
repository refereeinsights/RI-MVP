export type OvertureVenueRelationship = {
  canonical_venue_id?: unknown;
  provisional_venue_id?: unknown;
};

export type OvertureRefreshSummary = {
  id?: unknown;
  status?: unknown;
  completed_at?: unknown;
};

export type OvertureRefreshScopeSummary = OvertureVenueRelationship & {
  refresh_id?: unknown;
  category?: unknown;
};

export function overtureVenueIdentityKey(row: OvertureVenueRelationship): string | null {
  if (typeof row.canonical_venue_id === "string") return `canonical:${row.canonical_venue_id}`;
  if (typeof row.provisional_venue_id === "string") return `provisional:${row.provisional_venue_id}`;
  return null;
}

export function currentOvertureEnrichmentIdentities(
  refreshes: readonly OvertureRefreshSummary[],
  scopes: readonly OvertureRefreshScopeSummary[],
): string[] {
  const activeRefreshes = new Map<string, { completedAt: number; stableId: string }>();
  for (const refresh of refreshes) {
    if (refresh.status !== "active" || typeof refresh.id !== "string" || typeof refresh.completed_at !== "string") {
      continue;
    }
    const completedAt = Date.parse(refresh.completed_at);
    if (!Number.isFinite(completedAt)) continue;
    activeRefreshes.set(refresh.id, { completedAt, stableId: refresh.id });
  }

  const latestByIdentityCategory = new Map<string, { completedAt: number; stableId: string; identity: string }>();
  for (const scope of scopes) {
    if (typeof scope.refresh_id !== "string" || (scope.category !== "food" && scope.category !== "coffee")) continue;
    const refresh = activeRefreshes.get(scope.refresh_id);
    const identity = overtureVenueIdentityKey(scope);
    if (!refresh || !identity) continue;
    const key = `${identity}:${scope.category}`;
    const prior = latestByIdentityCategory.get(key);
    if (
      !prior
      || refresh.completedAt > prior.completedAt
      || (refresh.completedAt === prior.completedAt && refresh.stableId > prior.stableId)
    ) {
      latestByIdentityCategory.set(key, { ...refresh, identity });
    }
  }

  return [...new Set([...latestByIdentityCategory.values()].map((value) => value.identity))].sort();
}
