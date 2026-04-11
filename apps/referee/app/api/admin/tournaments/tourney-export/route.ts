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

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

function parseCsvList(raw: string | null) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function fetchRows(params: {
  states: string[];
  sports: string[];
  venueId: string | null;
  includeInferred: boolean;
}) {
  const batchSize = 1000;
  const maxRows = 20000;

  const states = params.states.map((s) => s.toUpperCase()).filter((s) => s.length === 2);
  const sports = params.sports.map((s) => s.toLowerCase()).filter(Boolean);

  const select =
    "tournament_id,venue_id,is_inferred," +
    "tournaments!inner(id,name,sport,state,start_date,end_date,official_website_url,source_url)," +
    "venues!inner(id,name,address,address1,city,state,zip,venue_url)";

  const buildQuery = () => {
    let q = supabaseAdmin.from("tournament_venues" as any).select(select);
    if (!params.includeInferred) q = q.eq("is_inferred", false);
    if (states.length) q = q.in("tournaments.state", states);
    if (sports.length) q = q.in("tournaments.sport", sports);
    if (params.venueId) q = q.eq("venue_id", params.venueId);
    return q;
  };

  const out: any[] = [];
  for (let offset = 0; offset < maxRows; offset += batchSize) {
    const { data, error } = await buildQuery()
      .order("tournament_id", { ascending: true })
      .order("venue_id", { ascending: true })
      .range(offset, offset + batchSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as any[];
    out.push(...rows);
    if (rows.length < batchSize) break;
  }

  return out;
}

export async function GET(request: Request) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const states = parseCsvList(searchParams.get("states"));
  const sports = parseCsvList(searchParams.get("sports"));
  const venueIdRaw = (searchParams.get("venue_id") || "").trim();
  const venueId = venueIdRaw && isUuid(venueIdRaw) ? venueIdRaw : null;
  const includeInferred = searchParams.get("include_inferred") === "1";

  const rows = await fetchRows({ states, sports, venueId, includeInferred });

  const header = [
    "tournament_uuid",
    "tournament_name",
    "sport",
    "state",
    "start_date",
    "end_date",
    "tournament_url",
    "official_website_url",
    "source_url",
    "venue_uuid",
    "venue_name",
    "venue_street",
    "venue_city",
    "venue_state",
    "venue_zip",
    "venue_url",
  ];

  const csv = [
    header.join(","),
    ...rows.map((r: any) => {
      const t = (r as any)?.tournaments ?? {};
      const v = (r as any)?.venues ?? {};
      const tournamentUrl = (t.official_website_url || t.source_url || "").toString();
      const record: Record<string, any> = {
        tournament_uuid: t.id ?? r.tournament_id ?? "",
        tournament_name: t.name ?? "",
        sport: t.sport ?? "",
        state: t.state ?? "",
        start_date: t.start_date ?? "",
        end_date: t.end_date ?? "",
        tournament_url: tournamentUrl,
        official_website_url: t.official_website_url ?? "",
        source_url: t.source_url ?? "",
        venue_uuid: v.id ?? r.venue_id ?? "",
        venue_name: v.name ?? "",
        venue_street: v.address1 ?? v.address ?? "",
        venue_city: v.city ?? "",
        venue_state: v.state ?? "",
        venue_zip: v.zip ?? "",
        venue_url: v.venue_url ?? "",
      };
      return header.map((h) => csvCell(record[h])).join(",");
    }),
  ].join("\n");

  const filename = `tourney_export_${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

