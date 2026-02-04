export type SweepErrorCode =
  | "fetch_failed"
  | `http_error_${number}`
  | "redirect_blocked"
  | "non_html_response"
  | "empty_html"
  | "html_received_no_events"
  | "extractor_error"
  | "unsupported_layout";

export type SweepDiagnostics = {
  status?: number;
  content_type?: string | null;
  bytes?: number;
  final_url?: string | null;
  redirect_count?: number;
  redirect_chain?: { status: number; location: string }[];
  location_header?: string | null;
  provider?: string | null;
};

export class SweepError extends Error {
  code: SweepErrorCode;
  diagnostics: SweepDiagnostics;

  constructor(code: SweepErrorCode, message: string, diagnostics: SweepDiagnostics = {}) {
    super(message);
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export function httpErrorCode(status: number): SweepErrorCode {
  return `http_error_${status}`;
}

export function classifyHtmlPayload(contentType: string | null, bytes: number, minBytes = 2048): SweepErrorCode | null {
  const normalized = (contentType || "").toLowerCase();
  if (!normalized.includes("text/html") && !normalized.includes("application/json")) {
    return "non_html_response";
  }
  if (bytes < minBytes) return "empty_html";
  return null;
}

export function buildSweepSummary(
  code: SweepErrorCode | null,
  message: string,
  diagnostics: SweepDiagnostics,
  extras: Record<string, any> = {}
) {
  return JSON.stringify({ error_code: code, message, ...diagnostics, ...extras });
}
