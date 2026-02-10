import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeSourceUrl } from "@/lib/normalizeSourceUrl";

export { normalizeSourceUrl };

export type RegistryUpsertInput = {
  source_url: string;
  source_type?: string | null;
  sport?: string | null;
  state?: string | null;
  city?: string | null;
  notes?: string | null;
  is_active?: boolean | null;
  is_custom_source?: boolean | null;
  review_status?: string | null;
  review_notes?: string | null;
  ignore_until?: string | null;
};

export type RunInsertInput = {
  registry_id: string;
  source_url: string;
  url: string;
  http_status?: number | null;
  title?: string | null;
  domain?: string | null;
  content_hash?: string | null;
  extracted_json?: any;
  extract_confidence?: number | null;
};

export type RegistryRow = {
  id: string;
  source_url: string;
  url?: string | null;
  normalized_url?: string | null;
  is_active?: boolean | null;
  review_status?: string | null;
  review_notes?: string | null;
  ignore_until?: string | null;
};

export const TERMINAL_REVIEW_STATUSES = new Set([
  "dead",
  "blocked_403",
  "login_required",
  "paywalled",
  "js_only",
  "deprecated",
  "duplicate_source",
]);

const CUSTOM_CRAWLER_HOSTS = new Set(["usclubsoccer.org", "azsoccerassociation.org"]);

export async function upsertRegistry(input: RegistryUpsertInput) {
  const { canonical, host, normalized } = normalizeSourceUrl(input.source_url);
  const isCustomSource =
    input.is_custom_source !== undefined && input.is_custom_source !== null
      ? input.is_custom_source
      : CUSTOM_CRAWLER_HOSTS.has(host);
  const payload = {
    source_url: canonical,
    url: canonical,
    normalized_url: normalized,
    normalized_host: host,
    source_type: input.source_type ?? null,
    sport: input.sport ?? null,
    state: input.state ?? null,
    city: input.city ?? null,
    notes: input.notes ?? null,
    is_active: input.is_active ?? true,
    is_custom_source: isCustomSource,
    review_status: input.review_status ?? "untested",
    review_notes: input.review_notes ?? null,
    ignore_until: input.ignore_until ?? null,
    last_swept_at: null,
  };
  const existing = await getRegistryRowByUrl(canonical);
  if (existing.row?.id) {
    const updates: any = {
      source_url: canonical,
      url: canonical,
      normalized_url: normalized,
      normalized_host: host,
    };
    if (input.source_type !== undefined) updates.source_type = input.source_type ?? null;
    if (input.sport !== undefined) updates.sport = input.sport ?? null;
    if (input.state !== undefined) updates.state = input.state ?? null;
    if (input.city !== undefined) updates.city = input.city ?? null;
    if (input.notes !== undefined) updates.notes = input.notes ?? null;
    if (input.is_custom_source !== undefined) updates.is_custom_source = input.is_custom_source;
    if (input.is_custom_source === undefined && CUSTOM_CRAWLER_HOSTS.has(host)) {
      updates.is_custom_source = true;
    }
    // Do not overwrite review_status/is_active/ignore_until on existing rows.
    const { error } = await supabaseAdmin
      .from("tournament_sources" as any)
      .update(updates)
      .eq("id", existing.row.id);
    if (error) throw error;
    return { registry_id: existing.row.id as string, canonical };
  }

  const { data, error } = (await supabaseAdmin
    .from("tournament_sources" as any)
    .insert(payload)
    .select("id,source_url")
    .single()) as { data: { id: string } | null; error: any };

  if (error || !data) throw error ?? new Error("registry_insert_failed");
  return { registry_id: data.id, canonical };
}

export async function getRegistryRowByUrl(
  rawUrl: string
): Promise<{ row: RegistryRow | null; error: any }> {
  const { canonical, normalized } = normalizeSourceUrl(rawUrl);
  const { data, error } = await supabaseAdmin
    .from("tournament_sources" as any)
    .select("id,source_url,url,normalized_url,is_active,review_status,review_notes,ignore_until")
    .or(`normalized_url.eq.${normalized},url.eq.${canonical}`)
    .is("tournament_id", null)
    .limit(1)
    .maybeSingle();
  return { row: (data as RegistryRow | null) ?? null, error };
}

export async function ensureRegistryRow(
  source_url: string,
  defaults: Partial<RegistryUpsertInput> = {}
): Promise<{ canonical: string; row: RegistryRow }> {
  const { canonical, host, normalized } = normalizeSourceUrl(source_url);
  const existing = await getRegistryRowByUrl(canonical);
  if (existing.row) {
    return { canonical, row: existing.row };
  }
  const createDefaults: RegistryUpsertInput = {
    source_url: canonical,
    source_type: defaults.source_type ?? null,
    sport: defaults.sport ?? null,
    state: defaults.state ?? null,
    city: defaults.city ?? null,
    notes: defaults.notes ?? null,
    is_active: defaults.is_active ?? true,
    is_custom_source: defaults.is_custom_source ?? CUSTOM_CRAWLER_HOSTS.has(host),
    review_status: defaults.review_status ?? "untested",
    review_notes: defaults.review_notes ?? null,
    ignore_until: defaults.ignore_until ?? null,
  };
  const { registry_id } = await upsertRegistry(createDefaults);
  return {
    canonical,
    row: {
      id: registry_id,
      source_url: canonical,
      url: canonical,
      normalized_url: normalized,
      is_active: createDefaults.is_active ?? true,
      review_status: createDefaults.review_status ?? "untested",
      review_notes: createDefaults.review_notes ?? null,
      ignore_until: createDefaults.ignore_until ?? null,
    },
  };
}

export function getSkipReason(row: RegistryRow | null): string | null {
  if (!row) return null;
  if (row.is_active === false) return "Inactive source";
  const status = (row.review_status || "").trim();
  if (TERMINAL_REVIEW_STATUSES.has(status)) {
    if (status === "blocked_403" && row.ignore_until) {
      const until = new Date(row.ignore_until);
      return `Blocked until ${until.toLocaleDateString()}`;
    }
    return `Marked ${status.replace("_", " ")}`;
  }
  if (row.ignore_until) {
    const until = new Date(row.ignore_until);
    if (until > new Date()) {
      return `Ignored until ${until.toLocaleDateString()}`;
    }
  }
  return null;
}

export async function insertRun(input: RunInsertInput) {
  const conf =
    input.extract_confidence === undefined || input.extract_confidence === null
      ? null
      : Math.round(input.extract_confidence * 100);
  const normalized = normalizeSourceUrl(input.url).normalized;
  const payload = {
    source_url: input.source_url,
    url: input.url,
    normalized_url: normalized,
    tournament_id: null,
    fetched_at: new Date().toISOString(),
    http_status: input.http_status ?? null,
    domain: input.domain ?? null,
    title: input.title ?? null,
    content_hash: input.content_hash ?? null,
    extracted_json: input.extracted_json ?? null,
    extract_confidence: conf,
  };

  // Upsert by url; on duplicate fallback to fetch existing id.
  const { data, error } = (await supabaseAdmin
    .from("tournament_sources" as any)
    .upsert(payload, { onConflict: "normalized_url" })
    .select("id")
    .single()) as { data: { id: string } | null; error: any };

  if (error && (error as any)?.code === "23505") {
    const existing = (await supabaseAdmin
      .from("tournament_sources" as any)
      .select("id")
      .or(`normalized_url.eq.${normalized},url.eq.${input.url}`)
      .limit(1)
      .single()) as { data: { id: string } | null; error: any };
    if (existing.data?.id) return existing.data.id as string;
  }

  if (error || !data) throw error ?? new Error("run_insert_failed");
  return data.id;
}

export async function updateRegistrySweep(registry_id: string, status: string, summary: string) {
  await supabaseAdmin
    .from("tournament_sources" as any)
    .update({
      last_swept_at: new Date().toISOString(),
      last_tested_at: new Date().toISOString(),
      last_sweep_status: status,
      last_sweep_summary: summary,
    })
    .eq("id", registry_id);
}

export async function insertSourceLog(input: {
  source_id: string;
  action: "sweep" | "test_fetch" | "discover";
  level: "info" | "warn" | "error";
  payload: any;
}): Promise<string> {
  const { data, error } = (await supabaseAdmin
    .from("tournament_source_logs" as any)
    .insert({
      source_id: input.source_id,
      action: input.action,
      level: input.level,
      payload: input.payload,
    })
    .select("id")
    .single()) as { data: { id: string } | null; error: any };
  if (error || !data?.id) throw error ?? new Error("log_insert_failed");
  return data.id;
}

export async function ensureDiscoveryLogSourceId(): Promise<string> {
  const DISCOVERY_URL = "https://atlas.discover";
  const existing = await getRegistryRowByUrl(DISCOVERY_URL);
  if (existing.row?.id) return existing.row.id;
  const { registry_id } = await upsertRegistry({
    source_url: DISCOVERY_URL,
    source_type: null,
    sport: null,
    state: null,
    city: null,
    notes: "system discovery log source",
    is_active: false,
    review_status: "duplicate_source",
  });
  return registry_id;
}

export async function updateRunExtractedJson(run_id: string, extracted_json: any) {
  await supabaseAdmin.from("tournament_sources" as any).update({ extracted_json }).eq("id", run_id);
}
