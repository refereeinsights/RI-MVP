export type SportType = "soccer" | "basketball" | "football";

export interface CrawlSeed {
  url: string;
  sport: SportType;
  level?: string | null;
  notes?: string | null;
}

export interface DryRunSeedResult {
  seed_url: string;
  detail_links_found: number;
  detail_links_sample: string[];
  blocked: boolean;
}

export interface RunContext {
  dryRun: boolean;
  runId: string;
  runDir: string;
  timestampLabel: string;
  logLines: string[];
  slugRegistry: Set<string>;
}

export interface TournamentRecord {
  name: string;
  slug: string;
  sport: SportType;
  level?: string | null;
  state?: string | null;
  city?: string | null;
  venue?: string | null;
  address?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  referee_pay?: string | null;
  referee_contact?: string | null;
  source_url: string;
  source_domain: string;
  summary?: string | null;
  status: "confirmed" | "unconfirmed";
  confidence?: number | null;
  run_id?: string;
  updated_at?: string;
}

export interface AdapterResult {
  dryRun: boolean;
  dryRunResult?: DryRunSeedResult;
  confirmed: TournamentRecord[];
  unconfirmed: TournamentRecord[];
}
