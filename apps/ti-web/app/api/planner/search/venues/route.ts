import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function clampQuery(value: string) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  return v.length > 80 ? v.slice(0, 80) : v;
}

export async function GET(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = clampQuery(url.searchParams.get("q") ?? "");
  if (q.length < 2) return NextResponse.json({ ok: true, venues: [] });

  const { data, error } = await (supabase.from("venues_public" as any) as any)
    .select("id,name,address,city,state")
    .ilike("name", `%${q}%`)
    .order("name", { ascending: true })
    .limit(10);

  if (error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true, venues: data ?? [] });
}

