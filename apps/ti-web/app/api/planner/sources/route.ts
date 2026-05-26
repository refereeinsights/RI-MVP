import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { data, error } = await (supabase.from("planner_event_sources" as any) as any)
    .select("id,source_type,source_name,team_name,last_synced_at,sync_status,sync_error,created_at,updated_at")
    .eq("user_id", user.id)
    .eq("source_type", "ics")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, sources: data ?? [] });
}

