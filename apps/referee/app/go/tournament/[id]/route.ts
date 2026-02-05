import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeSourceUrl } from "@/lib/normalizeSourceUrl";

export const runtime = "nodejs";

function sanitizeDestination(raw: string) {
  const { canonical } = normalizeSourceUrl(raw);
  const url = new URL(canonical);
  const destination_domain = url.hostname;
  const destination_path = url.pathname || "/";
  const destination_url = `${url.origin}${destination_path}`;
  return {
    redirect_url: url.toString(),
    destination_domain,
    destination_path,
    destination_url,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const tournamentId = params?.id;
  if (!tournamentId) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,official_website_url,source_url,sport,discovery_source_id")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const destinationRaw = data.official_website_url || data.source_url;
  if (!destinationRaw) {
    return NextResponse.json({ error: "no_destination" }, { status: 404 });
  }

  let destination;
  try {
    destination = sanitizeDestination(destinationRaw);
  } catch {
    return NextResponse.json({ error: "invalid_destination" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id ?? null;

  try {
    await supabaseAdmin.from("outbound_clicks").insert({
      user_id: userId,
      tournament_id: data.id,
      source_id: data.discovery_source_id ?? null,
      destination_url: destination.destination_url,
      destination_domain: destination.destination_domain,
      destination_path: destination.destination_path,
      sport: data.sport ?? null,
      ua_hash: null,
      ip_hash: null,
    });
  } catch (err) {
    console.error("[outbound_clicks] insert failed", err);
  }

  const response = NextResponse.redirect(destination.redirect_url, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}
