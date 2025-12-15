import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // keep secrets server-side

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type TournamentRow = {
  name: string;
  slug: string;
  sport: "soccer";
  level?: string | null;
  state: string;
  city: string;
  venue?: string | null;
  address?: string | null;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  source_url: string;
  source_domain: string;
  summary: string;
  status: "published";
  confidence: number;
};

export async function GET(req: Request) {
  // (Optional) simple auth so only Vercel cron can call it
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1) Fetch newly discovered tournaments from YOUR pipeline
  // Replace this stub with your weekly discovery output
  const newTournaments: TournamentRow[] = []; // <- fill from scraper/AI

  if (!newTournaments.length) {
    return NextResponse.json({ inserted: 0, message: "No new tournaments" });
  }

  // 2) Upsert to prevent duplicates
  // If you used composite unique index, you can set onConflict to those fields
  const { error, data } = await supabase
    .from("tournaments")
    .upsert(newTournaments, {
      onConflict: "name,city,state,start_date",
      ignoreDuplicates: false,
    })
    .select("id, slug");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    upserted: data?.length ?? 0,
    rows: data ?? [],
  });
}
