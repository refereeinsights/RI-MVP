import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type RegistryUpsertInput = {
  source_url: string;
  source_type?: string | null;
  sport?: string | null;
  state?: string | null;
  city?: string | null;
  notes?: string | null;
  is_active?: boolean | null;
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
    last_swept_at: null,
  };
  const { data, error } = await supabaseAdmin
    .from("tournament_sources" as any)
    .upsert(payload, { onConflict: "source_url" })
    .select("id,source_url")
    .single();
  if (error) throw error;
  return { registry_id: data.id as string, canonical };
}

export async function insertRun(input: RunInsertInput) {
  const { data, error } = await supabaseAdmin
    .from("tournament_sources" as any)
    .insert({
      source_url: input.source_url,
      url: input.url,
      tournament_id: null,
      fetched_at: new Date().toISOString(),
      http_status: input.http_status ?? null,
      domain: input.domain ?? null,
      title: input.title ?? null,
      content_hash: input.content_hash ?? null,
      extracted_json: input.extracted_json ?? null,
      extract_confidence: input.extract_confidence ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateRegistrySweep(registry_id: string, status: "ok" | "warn" | "error", summary: string) {
  await supabaseAdmin
    .from("tournament_sources" as any)
    .update({ last_swept_at: new Date().toISOString(), last_sweep_status: status, last_sweep_summary: summary })
    .eq("id", registry_id);
}

export async function updateRunExtractedJson(run_id: string, extracted_json: any) {
  await supabaseAdmin.from("tournament_sources" as any).update({ extracted_json }).eq("id", run_id);
}
