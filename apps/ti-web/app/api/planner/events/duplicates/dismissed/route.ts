import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { data, error } = await (supabase.from("planner_event_duplicate_dismissals" as any) as any)
    .select("pair_key_a,pair_key_b,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true, dismissed: data ?? [] });
}

