export const PREMIUM_PREVIEW_TOURNAMENT_SLUGS = new Set(["refereeinsights-demo-tournament"]);

export function isPremiumPreviewTournamentSlug(slug: string | null | undefined) {
  const normalized = (slug ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return PREMIUM_PREVIEW_TOURNAMENT_SLUGS.has(normalized);
}

