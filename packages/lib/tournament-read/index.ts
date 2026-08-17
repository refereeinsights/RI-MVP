export const TOURNAMENT_DIRECTORY_PAGE_SIZE = 50;
export const TOURNAMENT_DIRECTORY_QUERY_LIMIT = TOURNAMENT_DIRECTORY_PAGE_SIZE + 1;
export const TOURNAMENT_DIRECTORY_MAX_PAGE = 100;

const PUBLIC_TOURNAMENT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,238}[a-z0-9])?$/;

export function normalizePublicTournamentSlug(value: unknown): string | null {
  const slug = String(value ?? "").trim().toLowerCase();
  return PUBLIC_TOURNAMENT_SLUG_PATTERN.test(slug) ? slug : null;
}

export function normalizeTournamentDirectoryPage(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? "1"), 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), TOURNAMENT_DIRECTORY_MAX_PAGE) : 1;
}
