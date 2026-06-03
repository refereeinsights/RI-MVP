import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 80;
const MAX_QUERY_TOKENS = 4;
const MAX_RESULTS = 10;
const MAX_CANDIDATES = 50;
const MAX_EXACT_NAME_CANDIDATES = 10;

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

function searchableVenueText(venue: { name?: string | null; address?: string | null; city?: string | null; state?: string | null }) {
  return [venue.name, venue.address, venue.city, venue.state]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
}

function dedupeVenues(venues: Array<{ id?: string | null; name?: string | null; address?: string | null; city?: string | null; state?: string | null }>) {
  const seen = new Set<string>();
  const out: typeof venues = [];
  for (const venue of venues) {
    const id = String(venue?.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(venue);
  }
  return out;
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

  const exactNameQuery = (supabase.from("venues_public" as any) as any)
    .select("id,name,address,city,state")
    .ilike("name", `%${q}%`)
    .order("name", { ascending: true })
    .limit(MAX_EXACT_NAME_CANDIDATES);

  const tokenQuery = (supabase.from("venues_public" as any) as any)
    .select("id,name,address,city,state")
    .or(filters.join(","))
    .order("name", { ascending: true })
    .limit(MAX_CANDIDATES);

  const [{ data: exactNameMatches, error: exactNameError }, { data, error }] = await Promise.all([exactNameQuery, tokenQuery]);

  if (exactNameError || error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });

  const tokenMatches = (data ?? []).filter((venue: any) => {
    const haystack = searchableVenueText(venue);
    return tokens.every((token) => haystack.includes(token));
  });

  const venues = dedupeVenues([...(exactNameMatches ?? []), ...tokenMatches]).slice(0, MAX_RESULTS);
  return NextResponse.json({ ok: true, venues });
}
