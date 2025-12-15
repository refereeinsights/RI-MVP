import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("RI tournament cron running");

  const newTournaments = [
    {
      name: "RI Test Tournament",
      slug: "ri-test-tournament-seattle-wa-2026-03-01",
      sport: "soccer",
      level: "youth",
      state: "WA",
      city: "Seattle",
      venue: null,
      address: null,
      start_date: "2026-03-01",
      end_date: "2026-03-02",
      source_url: "https://example.com",
      source_domain: "example.com",
      summary: "Test tournament to validate cron ingestion.",
      status: "published",
      confidence: 95,
    },
  ];

  const { data, error } = await supabase
    .from("tournaments")
    .upsert(newTournaments, {
      onConflict: "slug",
    })
    .select("id, slug");

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    upserted: data?.length ?? 0,
    rows: data ?? [],
  });
}
