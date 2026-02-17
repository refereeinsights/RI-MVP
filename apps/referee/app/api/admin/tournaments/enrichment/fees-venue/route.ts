import { NextResponse } from "next/server";
import { headers } from "next/headers";
import * as cheerio from "cheerio";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

async function ensureAdmin() {
  const headerToken = headers().get("x-admin-secret");
  const envToken = process.env.ADMIN_SECRET;
  if (headerToken && envToken && headerToken === envToken) return true;

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") return null;
  return true;
}

function extractFee(text: string): string | null {
  const m = text.match(/\$\s*([0-9]{2,5}(?:\.[0-9]{2})?)/);
  return m ? m[0].replace(/\s+/g, "") : null;
}

function extractGames(text: string): string | null {
  const m = text.match(/(\d+)\s*(?:game|gms)\s+guarantee/i);
  return m ? m[1] : null;
}

function extractAddress(text: string): string | null {
  const m = text.match(/\d{1,5}[\w\s\.\-]+,\s*[A-Za-z\.\s]+,\s*[A-Z]{2}\s*\d{5}/);
  return m ? m[0].trim() : null;
}

function extractVenueUrl($: cheerio.CheerioAPI): string | null {
  const anchors = $("a[href]");
  for (const el of anchors) {
    const href = $(el).attr("href") || "";
    if (/google\.com\/maps|maps\.apple|waze\.com/i.test(href)) {
      return href;
    }
  }
  return null;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { method: "GET", redirect: "follow", cache: "no-cache" });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const isAdmin = await ensureAdmin();
  if (!isAdmin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "10");
  const cappedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 50)) : 10;

  const { data: tournaments, error } = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,name,official_website_url,source_url")
    .or("team_fee.is.null,games_guaranteed.is.null,venue.is.null,address.is.null,venue_url.is.null")
    .limit(cappedLimit);

  if (error) {
    return NextResponse.json({ error: "fetch_tournaments_failed", detail: error.message }, { status: 500 });
  }

  const candidates: Array<{ tournament_id: string; attribute_key: string; attribute_value: string; source_url: string | null }> = [];
  const summary: Array<{ tournament_id: string; name: string | null; found: string[] }> = [];
  let attempted = 0;

  for (const t of (tournaments as any[] | null) ?? []) {
    const url = (t as any).official_website_url || (t as any).source_url;
    if (!url) continue;
    attempted += 1;
    const html = await fetchHtml(url);
    if (!html) continue;
    const $ = cheerio.load(html);
    const text = $.text().replace(/\s+/g, " ");
    const found: string[] = [];

    const fee = extractFee(text);
    if (fee) {
      candidates.push({ tournament_id: t.id, attribute_key: "team_fee", attribute_value: fee, source_url: url });
      found.push("team_fee");
    }

    const games = extractGames(text);
    if (games) {
      candidates.push({
        tournament_id: t.id,
        attribute_key: "games_guaranteed",
        attribute_value: games,
        source_url: url,
      });
      found.push("games_guaranteed");
    }

    const address = extractAddress(text);
    if (address) {
      candidates.push({ tournament_id: t.id, attribute_key: "address", attribute_value: address, source_url: url });
      found.push("address");
    }

    const venueUrl = extractVenueUrl($);
    if (venueUrl) {
      candidates.push({ tournament_id: t.id, attribute_key: "venue_url", attribute_value: venueUrl, source_url: url });
      found.push("venue_url");
    }

    if (found.length) {
      summary.push({ tournament_id: t.id, name: t.name, found });
    }
  }

  if (candidates.length) {
    await supabaseAdmin.from("tournament_attribute_candidates" as any).insert(candidates);
  }

  return NextResponse.json({ ok: true, inserted: candidates.length, attempted, summary });
}
