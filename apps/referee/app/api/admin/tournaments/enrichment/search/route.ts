import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function ensureAdmin() {
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
  const admin = await ensureAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const zipRaw = (searchParams.get("zip") ?? "").trim();
  const zip = zipRaw.replace(/\D+/g, "").slice(0, 5);
  if (q.length < 2 && !zip) {
    return NextResponse.json({ results: [] });
  }

  let query = supabaseAdmin
    .from("tournaments" as any)
    .select("id,name,source_url,state,zip,city")
    .order("created_at", { ascending: false })
    .limit(50);

  if (q.length >= 2) {
    query = query.or(`name.ilike.%${q}%,state.ilike.%${q}%,city.ilike.%${q}%`);
  }
  if (zip) {
    query = query.eq("zip", zip);
  }

  const resp = await query;

  if (resp.error) {
    console.error("[enrichment] search failed", resp.error);
    return NextResponse.json({ error: "search_failed" }, { status: 500 });
  }

  const results =
    (resp.data ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
      state: t.state ?? null,
      url: t.source_url ?? null,
      zip: t.zip ?? null,
    })) ?? [];

  return NextResponse.json({ results });
}
