import { getAdminSupabase } from "../supabase/admin";

type Sport = "soccer" | "basketball";

export type OwlReportRow = {
  id?: string;
  venue_id: string;
  sport: string;
  computed_at: string;
  expires_at: string;
  report_json?: any;
};

export async function getLatestOwlReport(args: {
  venue_id: string;
  sport: Sport;
}): Promise<OwlReportRow | null> {
  const supabase = getAdminSupabase();

  try {
    const { data, error } = await supabase
      .from("owl_reports" as any)
      .select("id, venue_id, sport, computed_at, expires_at, report_json")
      .eq("venue_id", args.venue_id)
      .eq("sport", args.sport)
      .order("computed_at", { ascending: false })
      .limit(1);

    if (error) {
      if (error.code === "42P01" || error.code === "42703") {
        // Table or column missing; treat as no report yet.
        return null;
      }
      throw error;
    }

    if (!data || data.length === 0) {
      return null;
    }

    return data[0] as OwlReportRow;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("relation") || message.includes("column")) {
      // Table or column missing; treat as no existing report.
      return null;
    }
    throw err;
  }
}
