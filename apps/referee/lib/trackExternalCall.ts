import { supabaseAdmin } from "./supabaseAdmin";

export const EXTERNAL_API = {
  google_places: "google_places",
  mapbox: "mapbox",
  resend: "resend",
  open_meteo: "open_meteo",
} as const;
export type ExternalApi = (typeof EXTERNAL_API)[keyof typeof EXTERNAL_API];

export const EXTERNAL_API_SURFACE = {
  owls_eye_batch: "owls_eye_batch",
  owls_eye_gear: "owls_eye_gear",
  venue_geocode: "venue_geocode",
  venue_timezone: "venue_timezone",
  venue_places_lookup: "venue_places_lookup",
  venue_address_verify: "venue_address_verify",
  tournament_enrichment: "tournament_enrichment",
  email_alert: "email_alert",
  email_digest: "email_digest",
  email_transactional: "email_transactional",
} as const;
export type ExternalApiSurface = (typeof EXTERNAL_API_SURFACE)[keyof typeof EXTERNAL_API_SURFACE];

function insertApiCall(
  api: string,
  operation: string,
  surface: string,
  status: string,
  latencyMs: number,
  error: string | null
) {
  void supabaseAdmin
    .from("external_api_calls" as any)
    .insert({ api, operation, surface, status, latency_ms: latencyMs, error })
    .then(() => {/* fire-and-forget */});
}

export async function trackExternalCall<T>(
  api: string,
  operation: string,
  surface: string,
  fn: () => Promise<T>
): Promise<T> {
  if (process.env.NODE_ENV === "development") return fn();
  const t0 = Date.now();
  let status = "ok";
  let errorMsg: string | null = null;
  try {
    return await fn();
  } catch (err) {
    status = "error";
    errorMsg = String((err as any)?.message ?? err ?? "unknown").slice(0, 240);
    throw err;
  } finally {
    insertApiCall(api, operation, surface, status, Date.now() - t0, errorMsg);
  }
}
