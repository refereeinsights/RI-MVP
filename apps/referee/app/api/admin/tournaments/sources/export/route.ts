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

export async function GET() {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("tournament_sources" as any)
    .select(
      "source_url,normalized_host,source_type,sport,state,city,review_status,review_notes,is_active,ignore_until,last_tested_at,last_swept_at,last_sweep_status,last_sweep_summary"
    )
    .is("tournament_id", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const header = [
    "source_url",
    "normalized_host",
    "source_type",
    "sport",
    "state",
    "city",
    "review_status",
    "review_notes",
    "is_active",
    "ignore_until",
    "last_tested_at",
    "last_swept_at",
    "last_sweep_status",
    "last_sweep_summary",
  ];
  const csv = [
    header.join(","),
    ...rows.map((r: any) =>
      header
        .map((h) => {
          const val = r[h];
          if (val === null || val === undefined) return "";
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        })
        .join(",")
    ),
  ].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv",
      "content-disposition": 'attachment; filename="sources.csv"',
    },
  });
}
