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
    const existing = await supabaseAdmin
      .from("tournament_sources" as any)
      .select("id")
      .eq("url", canonical)
      .limit(1)
      .single();
    if (existing.data?.id) return { registry_id: existing.data.id as string, canonical };
  }

  if (error || !data) throw error ?? new Error("registry_upsert_failed");
  return { registry_id: data.id, canonical };
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
    const existing = await supabaseAdmin
      .from("tournament_sources" as any)
      .select("id")
      .eq("url", input.url)
      .limit(1)
      .single();
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
