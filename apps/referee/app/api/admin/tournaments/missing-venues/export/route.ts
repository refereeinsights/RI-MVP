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

function clean(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : "";
}

export async function GET(req: Request) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const state = clean(url.searchParams.get("state") ?? "").toUpperCase();
  const q = clean(url.searchParams.get("q") ?? "");
  const statusRaw = clean(url.searchParams.get("status") ?? "").toLowerCase();
  const tournamentStatus = statusRaw === "draft" ? "draft" : "published";

  let limit = Number(url.searchParams.get("limit") ?? "5000");
  if (!Number.isFinite(limit)) limit = 5000;
  limit = Math.max(1, Math.min(20000, Math.floor(limit)));

  // Use the same server-side definition as the Missing Venues admin page and then hydrate association fields from `tournaments`.
  const pageSize = Math.min(1000, limit);
  const missingIds: string[] = [];

  for (let offset = 0; offset < limit; offset += pageSize) {
    const resp = await (supabaseAdmin as any).rpc("list_missing_venue_link_tournaments_v2", {
      p_limit: pageSize,
      p_offset: offset,
      p_state: state || null,
      p_q: q || null,
      p_status: tournamentStatus,
    });
    if (resp.error) {
      const msg = String(resp.error.message ?? "");
      const looksLikeRpcV2Missing =
        /list_missing_venue_link_tournaments_v2/i.test(msg) && /schema cache/i.test(msg) && /could not find the function/i.test(msg);
      if (looksLikeRpcV2Missing && tournamentStatus === "published") {
        const fallback = await (supabaseAdmin as any).rpc("list_missing_venue_link_tournaments", {
          p_limit: pageSize,
          p_offset: offset,
          p_state: state || null,
          p_q: q || null,
        });
        if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
        const batch = (fallback.data ?? []) as Array<{ id?: string | null }>;
        const ids = batch.map((r) => r?.id ?? null).filter(Boolean) as string[];
        if (!ids.length) break;
        missingIds.push(...ids);
        if (ids.length < pageSize) break;
        continue;
      }
      return NextResponse.json({ error: resp.error.message }, { status: 500 });
    }
    const batch = (resp.data ?? []) as Array<{ id?: string | null }>;
    const ids = batch.map((r) => r?.id ?? null).filter(Boolean) as string[];
    if (!ids.length) break;
    missingIds.push(...ids);
    if (ids.length < pageSize) break;
  }

  if (!missingIds.length) {
    const header = [
      "tournament_name",
      "tournament_url",
      "city",
      "state",
      "association",
      "source_url",
      "venue_name",
      "venue_address",
    ];
    const csv = header.join(",") + "\n";
    const suffix = state ? `_${state}` : "";
    const filename = `missing_venues${suffix}_${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const { data: tournaments, error: tournamentError } = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,name,city,state,tournament_association,source_url,official_website_url")
    .in("id", Array.from(new Set(missingIds)))
    .limit(limit);

  if (tournamentError) {
    return NextResponse.json({ error: tournamentError.message }, { status: 500 });
  }

  const rows = tournaments ?? [];
  const header = [
    "tournament_name",
    "tournament_url",
    "city",
    "state",
    "association",
    "source_url",
    "venue_name",
    "venue_address",
  ];

  const csv = [
    header.join(","),
    ...rows.map((r: any) => {
      const tournamentUrl = (r.official_website_url || r.source_url || "").toString();
      const record = {
        tournament_name: r.name ?? "",
        tournament_url: tournamentUrl,
        city: r.city ?? "",
        state: r.state ?? "",
        association: r.tournament_association ?? "",
        source_url: r.source_url ?? "",
        venue_name: "",
        venue_address: "",
      };
      return header.map((h) => csvCell((record as any)[h])).join(",");
    }),
  ].join("\n");

  const suffix = state ? `_${state}` : "";
  const filename = `missing_venues${suffix}_${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
