export type TournamentRow = {
  name: string;
  slug: string;
  sport: string; // "soccer"
  level?: string | null;
  state: string;
  city?: string | null;
  venue?: string | null;
  address?: string | null;
  start_date?: string | null; // YYYY-MM-DD
  end_date?: string | null; // YYYY-MM-DD
  source_url: string;
  source_domain?: string | null;
  source_title?: string | null;
  source_last_seen_at?: string | null;
  summary?: string | null;
  notes?: string | null;
  status?: string;
  confidence?: number;
};
