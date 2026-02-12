import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MAX_LIMIT = 200;

function toBool(value: string | null) {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const sport = (searchParams.get("sport") ?? "").trim().toLowerCase();
  const month = (searchParams.get("month") ?? "").trim();
  const includePast = toBool(searchParams.get("includePast"));
  const limitRaw = Number(searchParams.get("limit") ?? "50");
  const offsetRaw = Number(searchParams.get("offset") ?? "0");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(MAX_LIMIT, limitRaw)) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;
  const stateParams = searchParams
    .getAll("state")
    .flatMap((v) => v.split(","))
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .filter((s) => s !== "__ALL__");

  let query = supabaseAdmin
    .from("tournaments_public" as any)
    .select(
      "id,slug,name,sport,level,state,city,zip,start_date,end_date,source_url,official_website_url,summary,referee_contact,tournament_director,venue,address,updated_at",
      { count: "exact" }
    )
    .order("start_date", { ascending: true });

  const today = new Date().toISOString().slice(0, 10);
  if (!includePast) {
    query = query.or(`start_date.gte.${today},end_date.gte.${today}`);
  }
  if (q) {
    query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%`);
  }
  if (sport) {
    query = query.ilike("sport", `%${sport}%`);
  }
  if (stateParams.length > 0) {
    query = query.in("state", stateParams);
  }
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    query = query
      .gte("start_date", start.toISOString().slice(0, 10))
      .lt("start_date", end.toISOString().slice(0, 10));
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) {
    return NextResponse.json({ error: error.message ?? "query_failed" }, { status: 500 });
  }

  return NextResponse.json({
    rows: data ?? [],
    count: count ?? 0,
    limit,
    offset,
  });
}
