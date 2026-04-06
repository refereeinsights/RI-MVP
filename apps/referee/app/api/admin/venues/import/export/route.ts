import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function csvEscape(value: unknown) {
  const v = String(value ?? "");
  if (v.includes('"') || v.includes(",") || v.includes("\n") || v.includes("\r")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

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

export async function GET(request: Request) {
  const admin = await ensureAdminRequest();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const runId = String(searchParams.get("run_id") || "").trim();
  if (!runId) return NextResponse.json({ error: "run_id_required" }, { status: 400 });

  const { data: rows, error } = await supabaseAdmin
    .from("venue_import_run_rows" as any)
    .select(
      "row_number,venue_name,venue_address,city,state,zip,sport,venue_url,source_url,organization,confidence,notes,action,matched_venue_id,reason"
    )
    .eq("run_id", runId)
    .order("row_number", { ascending: true })
    .limit(10000);

  if (error) return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 500 });

  const header = [
    "row_number",
    "venue_name",
    "venue_address",
    "city",
    "state",
    "zip",
    "sport",
    "venue_url",
    "source_url",
    "organization",
    "confidence",
    "notes",
    "action",
    "matched_venue_id",
    "reason",
  ];

  const lines = [
    header.join(","),
    ...((rows ?? []) as any[]).map((r) =>
      header
        .map((k) => csvEscape((r as any)[k]))
        .join(",")
    ),
  ];
  const csv = `${lines.join("\n")}\n`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="venue_import_results_${runId}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

