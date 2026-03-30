import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function ensureAdminRequest() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") return null;
  return data.user;
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET() {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Keep this aligned with the tournament uploads approval queue (draft uploads).
  const { data, error } = await supabaseAdmin
    .from("tournaments" as any)
    .select(
      "id,name,slug,sport,level,state,city,zip,start_date,end_date,venue,address,official_website_url,source_url,tournament_director_email,updated_at"
    )
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const header = [
    "tournament_uuid",
    "tournament_name",
    "tournament_slug",
    "sport",
    "level",
    "city",
    "state",
    "zip",
    "start_date",
    "end_date",
    "venue",
    "address",
    "tournament_url",
    "official_website_url",
    "source_url",
    "tournament_director_email",
  ];

  const csv = [
    header.join(","),
    ...rows.map((r: any) => {
      const tournamentUrl = (r.official_website_url || r.source_url || "").toString();
      const record = {
        tournament_uuid: r.id,
        tournament_name: r.name ?? "",
        tournament_slug: r.slug ?? "",
        sport: r.sport ?? "",
        level: r.level ?? "",
        city: r.city ?? "",
        state: r.state ?? "",
        zip: r.zip ?? "",
        start_date: r.start_date ?? "",
        end_date: r.end_date ?? "",
        venue: r.venue ?? "",
        address: r.address ?? "",
        tournament_url: tournamentUrl,
        official_website_url: r.official_website_url ?? "",
        source_url: r.source_url ?? "",
        tournament_director_email: r.tournament_director_email ?? "",
      };
      return header.map((h) => csvCell((record as any)[h])).join(",");
    }),
  ].join("\n");

  const filename = `tournament_uploads_${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

