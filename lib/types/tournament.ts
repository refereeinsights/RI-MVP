export type TournamentStatus = "draft" | "published" | "stale" | "archived";

export type TournamentSource =
  | "us_club_soccer"
  | "cal_south"
  | "gotsoccer"
  | "soccerwire";

/**
 * Canonical tournament row (Phase-1 MVP)
 * This maps cleanly to the `tournaments` table.
 */
export interface TournamentRow {
  name: string;
  slug: string;
  sport: "soccer";
  level?: string | null;

  state?: string | null;
  city?: string | null;
  venue?: string | null;
  address?: string | null;

  start_date?: string | null;
  end_date?: string | null;

  summary?: string | null;
  status: TournamentStatus;
  confidence?: number;

  // --- Source identity ---
  source: TournamentSource;
  source_event_id: string;
  source_url: string;
  source_domain: string;

  // --- Traceability ---
  raw?: unknown;
}
