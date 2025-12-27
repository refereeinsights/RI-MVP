import { getAdminSupabase } from "../supabase/admin";

type Sport = "soccer" | "basketball";

export type OwlseyeReport = {
  venue_id: string;
  sport: Sport;
  computed_at?: string;
  expires_at?: string;
  report_json?: any;
  google_place_id?: string | null;
  address_fingerprint?: string | null;
};

const DEFAULT_TTL_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function asDateOrNow(value?: string | null) {
  if (value) {
    const parsed = new Date(value);
    if (!isNaN(parsed.valueOf())) return parsed;
  }
  return new Date();
}

export async function persistOwlseyeReport(
  report: OwlseyeReport,
  ttlDays: number = DEFAULT_TTL_DAYS
): Promise<void> {
  const supabase = getAdminSupabase();

  const computedAtDate = asDateOrNow(report.computed_at);
  const computed_at = computedAtDate.toISOString();
  const expiresAtDate = report.expires_at
    ? asDateOrNow(report.expires_at)
    : new Date(computedAtDate.getTime() + ttlDays * MS_PER_DAY);
  const expires_at = expiresAtDate.toISOString();

  const payload = {
    ...report,
    computed_at,
    expires_at,
  };

  try {
    const { error } = await supabase.from("owl_reports" as any).upsert(payload, {
      onConflict: "venue_id,sport",
    });

    if (error) {
      if (error.code === "42P01" || error.code === "42703") {
        console.warn(
          "[owlseye] owl_reports table or columns missing; skipping persist until schema is ready."
        );
        return;
      }
      throw error;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("relation") || message.includes("column")) {
      console.warn(
        "[owlseye] owl_reports table or columns missing; skipping persist until schema is ready."
      );
      return;
    }
    throw err;
  }
}
