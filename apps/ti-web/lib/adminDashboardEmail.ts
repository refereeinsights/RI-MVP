import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const VALID_US_STATES_PLUS_DC = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
]);

export type TiAdminDashboardEmailSettings = {
  key: string;
  recipients: string[];
  include_tiles?: boolean;
  include_sport_tiles?: boolean;
  include_outreach: boolean;
  include_ri_summary: boolean;
  include_lowest_states: boolean;
};

export type RiSummaryCounts = {
  published_canonical: number;
  draft: number;
  missing_venues: number;
  missing_urls: number;
  missing_dates: number;
  missing_director_email: number;
};

export type LowestStatesRow = { state: string; count: number };

export type AdminDashboardEmailTiles = {
  window?: { today_start_utc?: string; yesterday_start_utc?: string };
  canonical?: {
    total?: number;
    new_yesterday?: number;
    by_sport?: Array<{ sport: string; total: number; new_yesterday: number }>;
  };
  missing_venues?: { total?: number; new_yesterday?: number };
  owls_eye?: { venues_reviewed_total?: number; venues_reviewed_new_yesterday?: number };
  venue_check?: { submissions_total?: number; submissions_new_yesterday?: number };
  ti_users?: {
    insider_total?: number;
    insider_new_yesterday?: number;
    weekend_pro_total?: number;
    weekend_pro_new_yesterday?: number;
  };
};

export function parseRecipients(raw: string | undefined | null) {
  const normalized = String(raw ?? "")
    .split(/[,\n]/g)
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

export function resolveTiBaseUrl() {
  return (
    (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3001")
  );
}

export async function loadTiAdminDashboardEmailSettings(): Promise<TiAdminDashboardEmailSettings | null> {
  const { data, error } = await supabaseAdmin
    .from("ti_admin_dashboard_email_settings" as any)
    .select("key,recipients,include_tiles,include_sport_tiles,include_outreach,include_ri_summary,include_lowest_states")
    .eq("key", "default")
    .maybeSingle();

  if (error) {
    console.warn("[admin_dashboard_email] Failed to load settings; falling back to env defaults.", error.message);
    return null;
  }

  if (!data?.key) return null;

  return {
    key: String(data.key),
    recipients: Array.isArray((data as any).recipients) ? (data as any).recipients.map(String).filter(Boolean) : [],
    include_tiles: typeof (data as any).include_tiles === "boolean" ? (data as any).include_tiles : true,
    include_sport_tiles: typeof (data as any).include_sport_tiles === "boolean" ? (data as any).include_sport_tiles : true,
    include_outreach: Boolean((data as any).include_outreach ?? true),
    include_ri_summary: Boolean((data as any).include_ri_summary ?? true),
    include_lowest_states: Boolean((data as any).include_lowest_states ?? true),
  };
}

export async function upsertTiAdminDashboardEmailSettings(patch: Partial<TiAdminDashboardEmailSettings>) {
  const payload = {
    key: "default",
    recipients: Array.isArray(patch.recipients) ? patch.recipients : undefined,
    include_tiles: typeof patch.include_tiles === "boolean" ? patch.include_tiles : undefined,
    include_sport_tiles: typeof patch.include_sport_tiles === "boolean" ? patch.include_sport_tiles : undefined,
    include_outreach: typeof patch.include_outreach === "boolean" ? patch.include_outreach : undefined,
    include_ri_summary: typeof patch.include_ri_summary === "boolean" ? patch.include_ri_summary : undefined,
    include_lowest_states: typeof patch.include_lowest_states === "boolean" ? patch.include_lowest_states : undefined,
  };

  const { error } = await supabaseAdmin.from("ti_admin_dashboard_email_settings" as any).upsert([payload], { onConflict: "key" });
  if (error) throw error;
}

export function getEffectiveRecipients(settings: TiAdminDashboardEmailSettings | null) {
  const fromSettings = settings?.recipients ?? [];
  if (fromSettings.length > 0) return fromSettings;
  return parseRecipients(process.env.TI_ADMIN_DASHBOARD_EMAILS);
}

export async function loadRiSummaryCounts(): Promise<RiSummaryCounts> {
  const [
    publishedCountRes,
    draftCountRes,
    missingVenueCountRes,
    missingUrlCountRes,
    missingDateCountRes,
    missingDirectorEmailCountRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("tournaments" as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("is_canonical", true),
    supabaseAdmin
      .from("tournaments" as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "draft"),
    (async () => {
      const res = await (supabaseAdmin as any).rpc("list_missing_venue_link_tournaments", {
        p_limit: 1,
        p_offset: 0,
        p_state: null,
        p_q: null,
      });
      if (res.error) throw res.error;
      const rows = (res.data ?? []) as Array<{ total_count?: number | null }>;
      return { count: Number(rows[0]?.total_count ?? 0) || 0 };
    })(),
    supabaseAdmin
      .from("tournaments" as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("is_canonical", true)
      .is("official_website_url", null),
    supabaseAdmin
      .from("tournaments" as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("is_canonical", true)
      .is("start_date", null)
      .is("end_date", null),
    supabaseAdmin
      .from("tournaments" as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("is_canonical", true)
      .or("tournament_director_email.is.null,tournament_director_email.eq."),
  ]);

  return {
    published_canonical: publishedCountRes.count ?? 0,
    draft: draftCountRes.count ?? 0,
    missing_venues: missingVenueCountRes.count ?? 0,
    missing_urls: missingUrlCountRes.count ?? 0,
    missing_dates: missingDateCountRes.count ?? 0,
    missing_director_email: missingDirectorEmailCountRes.count ?? 0,
  };
}

export async function loadLowestStates(limit = 5): Promise<LowestStatesRow[]> {
  const counts = new Map<string, number>();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabaseAdmin
      .from("tournaments" as any)
      .select("state")
      .eq("status", "published")
      .eq("is_canonical", true)
      .range(from, to);
    if (error) throw error;

    const rows = (data ?? []) as Array<{ state?: string | null }>;
    for (const row of rows) {
      const raw = String(row.state ?? "").trim().toUpperCase();
      if (!VALID_US_STATES_PLUS_DC.has(raw)) continue;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return [...counts.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, limit))
    .map(([state, count]) => ({ state, count }));
}

export async function loadAdminDashboardEmailTiles(): Promise<AdminDashboardEmailTiles> {
  const { data, error } = await (supabaseAdmin as any).rpc("get_admin_dashboard_email_tiles", {});
  if (error) throw error;
  return (data ?? {}) as AdminDashboardEmailTiles;
}
