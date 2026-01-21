import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type RegistryUpsertInput = {
  source_url: string;
  source_type?: string | null;
  sport?: string | null;
  state?: string | null;
  city?: string | null;
  notes?: string | null;
  is_active?: boolean | null;
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
  is_active?: boolean | null;
  review_status?: string | null;
  review_notes?: string | null;
  ignore_until?: string | null;
};

const IGNORED_STATUSES = new Set([
  "dead",
  "login_required",
  "paywalled",
  "js_only",
  "deprecated",
  "duplicate_source",
]);

export function normalizeSourceUrl(raw: string): { canonical: string; host: string } {
  const trimmed = raw.trim();
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProto);
  url.hash = "";
  const canonical = url.toString();
  const host = url.hostname.toLowerCase();
  return { canonical, host };
}

export async function upsertRegistry(input: RegistryUpsertInput) {
  const { canonical, host } = normalizeSourceUrl(input.source_url);
  const payload = {
    source_url: canonical,
    url: canonical,
    normalized_host: host,
    source_type: input.source_type ?? null,
    sport: input.sport ?? null,
    state: input.state ?? null,
    city: input.city ?? null,
    notes: input.notes ?? null,
    is_active: input.is_active ?? true,
    review_status: input.review_status ?? "untested",
    review_notes: input.review_notes ?? null,
    ignore_until: input.ignore_until ?? null,
    last_swept_at: null,
  };
  const { data, error } = (await supabaseAdmin
    .from("tournament_sources" as any)
    .upsert(payload, { onConflict: "url" })
    .select("id,source_url")
    .single()) as { data: { id: string } | null; error: any };

  if (error && (error as any)?.code === "23505") {
    const existing = (await supabaseAdmin
      .from("tournament_sources" as any)
      .select("id")
      .eq("url", canonical)
      .limit(1)
      .single()) as { data: { id: string } | null; error: any };
    if (existing.data?.id) return { registry_id: existing.data.id as string, canonical };
  }

  if (error || !data) throw error ?? new Error("registry_upsert_failed");
  return { registry_id: data.id, canonical };
}

export async function getRegistryRowByUrl(
  canonicalUrl: string
): Promise<{ row: RegistryRow | null; error: any }> {
  const { data, error } = await supabaseAdmin
    .from("tournament_sources" as any)
    .select("id,source_url,url,is_active,review_status,review_notes,ignore_until")
    .eq("url", canonicalUrl)
    .is("tournament_id", null)
    .limit(1)
    .maybeSingle();
  return { row: (data as RegistryRow | null) ?? null, error };
}

export async function ensureRegistryRow(
  source_url: string,
  defaults: Partial<RegistryUpsertInput> = {}
): Promise<{ canonical: string; row: RegistryRow }> {
  const { canonical, host } = normalizeSourceUrl(source_url);
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
  if (IGNORED_STATUSES.has(status)) {
    return `Marked ${status.replace("_", " ")}`;
  }
  if (status === "blocked_403") {
    if (row.ignore_until) {
      const until = new Date(row.ignore_until);
      if (until > new Date()) {
        return `Blocked until ${until.toLocaleDateString()}`;
      }
    }
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
  const payload = {
    source_url: input.source_url,
    url: input.url,
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
    .upsert(payload, { onConflict: "url" })
    .select("id")
    .single()) as { data: { id: string } | null; error: any };

  if (error && (error as any)?.code === "23505") {
    const existing = (await supabaseAdmin
      .from("tournament_sources" as any)
      .select("id")
      .eq("url", input.url)
      .limit(1)
      .single()) as { data: { id: string } | null; error: any };
    if (existing.data?.id) return existing.data.id as string;
  }

  if (error || !data) throw error ?? new Error("run_insert_failed");
  return data.id;
}

export async function updateRegistrySweep(registry_id: string, status: "ok" | "warn" | "error", summary: string) {
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

export async function updateRunExtractedJson(run_id: string, extracted_json: any) {
  await supabaseAdmin.from("tournament_sources" as any).update({ extracted_json }).eq("id", run_id);
}
