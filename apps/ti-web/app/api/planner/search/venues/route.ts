import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 80;
const MAX_QUERY_TOKENS = 4;
const MAX_RESULTS = 10;

function clampQuery(value: string) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  return v.length > MAX_QUERY_LENGTH ? v.slice(0, MAX_QUERY_LENGTH) : v;
}

function tokenizeQuery(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= MIN_QUERY_LENGTH)
    )
  ).slice(0, MAX_QUERY_TOKENS);
}

export async function GET(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = clampQuery(url.searchParams.get("q") ?? "");
  if (q.length < MIN_QUERY_LENGTH) return NextResponse.json({ ok: true, venues: [] });
  const tokens = tokenizeQuery(q);
  if (!tokens.length) return NextResponse.json({ ok: true, venues: [] });

  const filters = tokens.flatMap((token) => [
    `name.ilike.%${token}%`,
    `address.ilike.%${token}%`,
    `city.ilike.%${token}%`,
    `state.ilike.%${token}%`,
  ]);

  const { data, error } = await (supabase.from("venues_public" as any) as any)
    .select("id,name,address,city,state")
    .or(filters.join(","))
    .order("name", { ascending: true })
    .limit(MAX_RESULTS);

  if (error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true, venues: data ?? [] });
}
