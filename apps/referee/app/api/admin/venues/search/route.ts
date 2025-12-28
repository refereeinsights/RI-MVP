import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type VenueSearchResult = {
  venue_id: string;
  name: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  sport: string | null;
};

type VenueSearchResponse = { results: VenueSearchResult[] } | { error: string };

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
  const adminUser = await ensureAdminRequest();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q") ?? "";
  const query = rawQuery.trim();

  if (query.length < 2) {
    return NextResponse.json({ error: "query_too_short" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("venues" as any)
    .select("id,name,address1,city,state,zip,sport")
    .or(
      [
        `name.ilike.%${query}%`,
        `address1.ilike.%${query}%`,
        `city.ilike.%${query}%`,
        `state.ilike.%${query}%`,
      ].join(",")
    )
    .limit(10);

  if (error) {
    console.error("Venue search failed", error);
    return NextResponse.json<VenueSearchResponse>({ error: "search_failed" }, { status: 500 });
  }

  const results: VenueSearchResult[] = (data ?? []).map((row: any) => ({
    venue_id: row.id,
    name: row.name ?? null,
    street: row.address1 ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    zip: row.zip ?? null,
    sport: row.sport ?? null,
  }));

  return NextResponse.json<VenueSearchResponse>({ results });
}
