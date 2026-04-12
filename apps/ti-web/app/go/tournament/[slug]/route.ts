import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function isLocalHost(host: string | null) {
  const value = String(host ?? "").trim().toLowerCase();
  if (!value) return false;
  if (value.startsWith("localhost")) return true;
  if (value.startsWith("127.0.0.1")) return true;
  if (value.startsWith("[::1]")) return true;
  if (value.endsWith(".local")) return true;
  return false;
}

function looksLikeBot(userAgent: string | null) {
  const ua = String(userAgent ?? "").toLowerCase();
  if (!ua) return false;
  return /(bot|spider|crawler|facebookexternalhit|slackbot|discordbot|whatsapp|telegrambot|preview)/i.test(ua);
}

function safeExternalUrl(raw: string | null) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const url = value.startsWith("http://") || value.startsWith("https://") ? new URL(value) : new URL(`https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function appendUtm(url: URL, slug: string) {
  const out = new URL(url.toString());
  if (!out.searchParams.has("utm_source")) out.searchParams.set("utm_source", "tournamentinsights");
  if (!out.searchParams.has("utm_medium")) out.searchParams.set("utm_medium", "referral");
  if (!out.searchParams.has("utm_campaign")) out.searchParams.set("utm_campaign", "official_link");
  if (!out.searchParams.has("utm_content")) out.searchParams.set("utm_content", slug);
  return out;
}

function sourcePathFromReferer(referer: string | null) {
  const ref = String(referer ?? "").trim();
  if (!ref) return null;
  try {
    const url = new URL(ref);
    const host = url.hostname.toLowerCase();
    if (!host.endsWith("tournamentinsights.com")) return null;
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return null;
  }
}

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const slug = String(params.slug ?? "").trim();
  if (!slug) return NextResponse.redirect(new URL("/tournaments", "https://www.tournamentinsights.com"), 302);

  const { data: tournament } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("id,slug,official_website_url,source_url")
    .eq("slug", slug)
    .maybeSingle<{ id: string; slug: string; official_website_url: string | null; source_url: string | null }>();

  if (!tournament?.id || !tournament.slug) {
    return NextResponse.redirect(new URL("/tournaments", "https://www.tournamentinsights.com"), 302);
  }

  const target = tournament.official_website_url || tournament.source_url;
  const targetUrl = safeExternalUrl(target);
  if (!targetUrl) {
    return NextResponse.redirect(new URL(`/tournaments/${encodeURIComponent(tournament.slug)}`, "https://www.tournamentinsights.com"), 302);
  }

  const redirectUrl = appendUtm(targetUrl, tournament.slug);

  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").trim();
  const referer = request.headers.get("referer");
  const userAgent = request.headers.get("user-agent");
  const local = isLocalHost(host);
  const bot = looksLikeBot(userAgent);

  if (!local && !bot) {
    const sourcePath = sourcePathFromReferer(referer);
    try {
      await supabaseAdmin.from("ti_outbound_clicks" as any).insert({
        tournament_id: tournament.id,
        tournament_slug: tournament.slug,
        target_url: targetUrl.toString(),
        redirect_url: redirectUrl.toString(),
        source_path: sourcePath,
        referer,
        host,
        user_agent: userAgent?.slice(0, 300) ?? null,
        is_localhost: false,
      });
    } catch {
      // Don't block redirects on logging failures.
    }
  } else if (local) {
    // Optional: if you ever want to audit local usage, flip this on. For now keep it silent.
  }

  return NextResponse.redirect(redirectUrl, 302);
}
