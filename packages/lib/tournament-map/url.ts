import type { TournamentMapFilters } from "./types";

export function buildTournamentMapSearchParams(filters: TournamentMapFilters) {
  const params = new URLSearchParams();

  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.month?.trim()) params.set("month", filters.month.trim());
  if (filters.city?.trim()) params.set("city", filters.city.trim());
  if (filters.reviewed !== undefined) params.set("reviewed", filters.reviewed ? "true" : "false");
  if (filters.includePast !== undefined) params.set("includePast", filters.includePast ? "true" : "false");
  if (filters.sourcePage?.trim()) params.set("sourcePage", filters.sourcePage.trim());

  for (const state of filters.state ?? []) {
    const normalized = state.trim().toUpperCase();
    if (normalized) params.append("state", normalized);
  }

  for (const sport of filters.sports ?? []) {
    const normalized = sport.trim().toLowerCase();
    if (normalized) params.append("sports", normalized);
  }

  return params;
}

export function buildTournamentMapHref(basePath: string, filters: TournamentMapFilters) {
  const query = buildTournamentMapSearchParams(filters).toString();
  return query ? `${basePath}?${query}` : basePath;
}
